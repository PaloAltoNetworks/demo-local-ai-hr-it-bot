import { createContext, useContext } from 'react';
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

  return (
    <ChatContext.Provider value={chat}>
      {children}
    </ChatContext.Provider>
  );
}
