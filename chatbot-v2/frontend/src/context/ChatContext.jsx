import { createContext, useContext, useRef, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

const ChatContext = createContext();

export const useChatContext = () => useContext(ChatContext);

// Shared refs so the transport always reads the latest values
const bodyRef = { model: '', phase: '' };

const transport = new DefaultChatTransport({
  api: '/api/chat',
  body: () => ({ model: bodyRef.model, phase: bodyRef.phase }),
});

export function ChatProvider({ model, phase, children }) {
  bodyRef.model = model;
  bodyRef.phase = phase;

  const chat = useChat({ transport });
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

  const value = {
    ...chat,
    sendMessage: wrappedSendMessage,
    phaseMap: phaseMapRef.current,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}
