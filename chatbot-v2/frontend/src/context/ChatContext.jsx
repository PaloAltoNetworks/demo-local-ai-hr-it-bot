import { createContext, useContext, useCallback, useMemo } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

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
