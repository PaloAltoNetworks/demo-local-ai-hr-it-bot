import { createContext, useContext, useCallback, useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';

const ChatContext = createContext();

export const useChatContext = () => useContext(ChatContext);

// Unique thread ID per browser session — links all requests in LiteLLM logs
const threadId = crypto.randomUUID();

// Refs for values that change per-render but must be captured at request time
const dynamicRef = { model: '', phase: '' };

const transport = new DefaultChatTransport({
  api: '/api/chat',
  prepareSendMessagesRequest: ({ messages, trigger, messageId }) => ({
    body: {
      messages,
      model: dynamicRef.model,
      phase: dynamicRef.phase,
      threadId,
      trigger,
      messageId,
    },
  }),
});

export function ChatProvider({ model, phase, children }) {
  dynamicRef.model = model;
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
      if (message.metadata?.empty) console.warn('[chat] Model returned empty response');
    },
  });

  // Derive phase for each message: user messages carry their phase in metadata,
  // assistant messages inherit the phase of the preceding user message.
  const phaseMap = useMemo(() => {
    const map = {};
    let currentPhase = 'phase1';
    for (const msg of chat.messages) {
      if (msg.role === 'user') {
        currentPhase = msg.metadata?.phase || 'phase1';
      }
      map[msg.id] = currentPhase;
    }
    return map;
  }, [chat.messages]);

  // Parse the error string from the SSE stream into a structured object once.
  // Downstream components receive a typed object, never a raw string.
  const lastRawError = useRef(null);
  const lastParsedError = useRef(null);
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

    // 2. Plain text guardrail blocks: "Prompt blocked by X ..." or "Response blocked by X ..."
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

    // 3. Generic error (API errors, network failures, etc.)
    lastParsedError.current = { type: 'error', message: msg };
    return lastParsedError.current;
  }, [chat.error]);

  const wrappedSendMessage = useCallback((opts) => {
    return chat.sendMessage({ ...opts, metadata: { phase } });
  }, [chat.sendMessage, phase]);

  const sessionUsage = useMemo(() =>
    chat.messages
      .filter(m => m.role === 'assistant' && m.metadata?.usage)
      .reduce((acc, m) => ({
        inputTokens: acc.inputTokens + (m.metadata.usage.inputTokens || 0),
        outputTokens: acc.outputTokens + (m.metadata.usage.outputTokens || 0),
        totalTokens: acc.totalTokens + (m.metadata.usage.totalTokens || 0),
      }), { inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
    [chat.messages]
  );

  const value = {
    ...chat,
    error: parsedError,
    sendMessage: wrappedSendMessage,
    phaseMap,
    sessionUsage,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}
