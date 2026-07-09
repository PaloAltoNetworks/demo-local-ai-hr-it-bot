import { createContext, useContext, useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';

const ChatContext = createContext<any>(null);

export const useChatContext = () => useContext(ChatContext);

// Unique thread ID per browser session — links all requests in Portkey logs
const threadId = crypto.randomUUID();

// Refs for values that change per-render but must be captured at request time
const dynamicRef = { provider: '', phase: '' };

const transport = new DefaultChatTransport({
  api: '/api/chat',
  prepareSendMessagesRequest: ({ messages, trigger, messageId }) => ({
    body: {
      messages,
      provider: dynamicRef.provider,
      phase: dynamicRef.phase,
      threadId,
      trigger,
      messageId,
    },
  }),
});

interface FeedbackArgs {
  traceId: string;
  value: number;
  weight: number;
  toolsUsed?: string[];
  comment?: string;
}

export function ChatProvider({ provider, phase, children }: { provider: string; phase: string; children: ReactNode }) {
  dynamicRef.provider = provider;
  dynamicRef.phase = phase;

  const chat = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onError: (error) => {
      console.error('[chat] Stream error:', error.message);
    },
    onFinish: ({ message, isAbort, isError }) => {
      if (isAbort) console.info('[chat] Response aborted');
      if (isError) console.warn('[chat] Response finished with error');
      if ((message.metadata as any)?.empty) console.warn('[chat] Model returned empty response');
    },
  });

  // Derive phase for each message: user messages carry their phase in metadata,
  // assistant messages inherit the phase of the preceding user message.
  const phaseMap = useMemo(() => {
    const map: Record<string, string> = {};
    let currentPhase = 'phase1';
    for (const msg of chat.messages) {
      if (msg.role === 'user') {
        currentPhase = (msg.metadata as any)?.phase || 'phase1';
      }
      map[msg.id] = currentPhase;
    }
    return map;
  }, [chat.messages]);

  // Parse the error string from the SSE stream into a structured object once.
  const lastRawError = useRef<any>(null);
  const lastParsedError = useRef<any>(null);
  const parsedError = useMemo(() => {
    if (!chat.error) return null;
    if (chat.error === lastRawError.current) return lastParsedError.current;
    lastRawError.current = chat.error;
    const msg = chat.error.message || String(chat.error);

    // 1. Embedded JSON — guardrail detail lives in provider_specific_fields.error
    try {
      const json = JSON.parse(msg.replace(/'/g, '"').replace(/True/g, 'true').replace(/False/g, 'false'));
      const outer = json.error || json;
      const data = outer.provider_specific_fields?.error || outer;
      if (!data.tr_id) data.tr_id = threadId;
      if (!data.message) data.message = outer.message;
      if (outer.guardrail_mode) data.guardrail_mode = outer.guardrail_mode;
      lastParsedError.current = data;
      return lastParsedError.current;
    } catch { /* not JSON */ }

    // 2. Plain text guardrail blocks
    const gr = msg.match(/(Prompt|Response) blocked by (\S+) .+?\(Category:\s*(\w+)\)/);
    if (gr) {
      const isResponse = gr[1] === 'Response';
      const category = gr[3].toLowerCase();
      lastParsedError.current = {
        type: 'guardrail_violation',
        guardrail: gr[2],
        category,
        message: msg,
        tr_id: threadId,
        isResponseBlock: isResponse,
        detected: { [category]: true },
      };
      return lastParsedError.current;
    }

    // 3. Generic error
    lastParsedError.current = { type: 'error', message: msg };
    return lastParsedError.current;
  }, [chat.error]);

  const wrappedSendMessage = useCallback((opts: any) => {
    return chat.sendMessage({ ...opts, metadata: { phase } });
  }, [chat.sendMessage, phase]);

  // Send thumbs up/down to Portkey (keyed by the assistant turn's trace-id).
  const sendFeedback = useCallback(async ({ traceId, value, weight, toolsUsed, comment }: FeedbackArgs) => {
    const resp = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ traceId, value, weight, toolsUsed, comment }),
    });
    if (!resp.ok) throw new Error('feedback request failed');
    return resp.json();
  }, []);

  const sessionUsage = useMemo(() =>
    chat.messages
      .filter(m => m.role === 'assistant' && (m.metadata as any)?.usage)
      .reduce((acc, m) => {
        const meta = m.metadata as any;
        const u = meta.usage;
        return {
          inputTokens: acc.inputTokens + (u.inputTokens || 0),
          outputTokens: acc.outputTokens + (u.outputTokens || 0),
          totalTokens: acc.totalTokens + (u.totalTokens || 0),
          cost: acc.cost + (meta.cost?.total || 0),
          costInput: acc.costInput + (meta.cost?.input || 0),
          costOutput: acc.costOutput + (meta.cost?.output || 0),
        };
      }, { inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0, costInput: 0, costOutput: 0 }),
    [chat.messages]
  );

  const value = {
    ...chat,
    error: parsedError,
    sendMessage: wrappedSendMessage,
    sendFeedback,
    phaseMap,
    sessionUsage,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}
