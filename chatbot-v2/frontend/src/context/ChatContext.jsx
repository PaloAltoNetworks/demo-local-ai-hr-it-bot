import { createContext, useContext, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

const ChatContext = createContext();

export const useChatContext = () => useContext(ChatContext);

// Shared ref so the transport always reads the latest model
const modelRef = { current: '' };

const transport = new DefaultChatTransport({
  api: '/api/chat',
  body: () => ({ model: modelRef.current }),
});

export function ChatProvider({ model, children }) {
  modelRef.current = model;

  const chat = useChat({ transport });

  return (
    <ChatContext.Provider value={chat}>
      {children}
    </ChatContext.Provider>
  );
}
