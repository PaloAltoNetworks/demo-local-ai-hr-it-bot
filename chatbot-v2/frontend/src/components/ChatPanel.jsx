import { useState, useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useChatContext } from '../context/ChatContext.jsx';

export default function ChatPanel() {
  const { t } = useLanguage();
  const { messages, sendMessage, status } = useChatContext();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  const isStreaming = status === 'streaming' || status === 'submitted';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    sendMessage({ text: input });
    setInput('');
  };

  return (
    <section className="chat">
      <div className="chat-messages">
        {/* Welcome message */}
        {messages.length === 0 && (
          <div className="message bot">
            <div className="message-avatar"><i className="otter-icon" /></div>
            <div className="message-body">
              <div className="message-text">
                {t('chat.greeting', { name: t('userProfile.name') })}
              </div>
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`message ${msg.role === 'user' ? 'user' : 'bot'}`}>
            <div className="message-avatar">
              {msg.role === 'user'
                ? <span className="material-symbols">person</span>
                : <i className="otter-icon" />}
            </div>
            <div className="message-body">
              {msg.parts?.map((part, i) => {
                if (part.type === 'text' && part.text) {
                  return msg.role === 'user'
                    ? <div key={i} className="message-text">{part.text}</div>
                    : <div key={i} className="message-text"><Markdown>{part.text}</Markdown></div>;
                }
                if (part.type === 'tool-invocation') {
                  return (
                    <div key={i} className="tool-call">
                      <span className="material-symbols">build</span>
                      <span className="tool-name">{part.toolInvocation.toolName}</span>
                      <span className={`tool-state ${part.toolInvocation.state}`}>
                        {part.toolInvocation.state === 'result' ? 'done' : part.toolInvocation.state}
                      </span>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {/* Streaming indicator */}
        {isStreaming && (
          <div className="thinking-indicator">
            <span className="thinking-dots"><span /><span /><span /></span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <form className="chat-form" onSubmit={handleSubmit}>
          <input
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('chat.placeholder')}
            disabled={isStreaming}
            autoComplete="off"
            maxLength={2000}
          />
          <button type="submit" className="send-btn" disabled={isStreaming || !input.trim()}>
            <span className="material-symbols">send</span>
          </button>
        </form>
      </div>
    </section>
  );
}
