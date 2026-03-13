import { createContext, useContext } from 'react';
import { useChat } from '@ai-sdk/react';

const ChatContext = createContext();

export const useChatContext = () => useContext(ChatContext);

export function ChatProvider({ children }) {
  const chat = useChat({ api: '/api/chat' });

  return (
    <ChatContext.Provider value={chat}>
      {children}
    </ChatContext.Provider>
  );
}
