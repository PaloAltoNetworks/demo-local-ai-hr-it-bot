import { createContext, useContext, useRef, useCallback, useMemo } from 'react';
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
  });

  const phaseMapRef = useRef({});
  const sendPhaseRef = useRef(phase);

  // Tag new messages synchronously during render (not in useEffect)
  // so phase colors are available on the very first render of each message.
  let lastUserPhase = sendPhaseRef.current;
  for (const msg of chat.messages) {
    if (phaseMapRef.current[msg.id]) {
      if (msg.role === 'user') lastUserPhase = phaseMapRef.current[msg.id];
      continue;
    }
    if (msg.role === 'user') {
      phaseMapRef.current[msg.id] = sendPhaseRef.current;
      lastUserPhase = sendPhaseRef.current;
    } else {
      phaseMapRef.current[msg.id] = lastUserPhase;
    }
  }

  const wrappedSendMessage = useCallback((opts) => {
    sendPhaseRef.current = phase;
    return chat.sendMessage(opts);
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
    phaseMap: phaseMapRef.current,
    sessionUsage,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}
