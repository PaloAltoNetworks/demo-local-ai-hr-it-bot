import { useState, useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useChatContext } from '../context/ChatContext.jsx';
import { useAirsConfig, buildReportUrl } from '../hooks/useAirsConfig.js';

export default function ChatPanel() {
  const { t } = useLanguage();
  const { messages, sendMessage, status, error, phaseMap } = useChatContext();
  const airsConfig = useAirsConfig();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  const isStreaming = status === 'streaming' || status === 'submitted';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status, error]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    sendMessage({ text: input });
    setInput('');
  };

  // Build render list with phase dividers
  const renderItems = [];
  let prevPhase = null;
  for (const msg of messages) {
    const msgPhase = phaseMap[msg.id] || 'phase1';
    if (msg.role === 'user' && msgPhase !== prevPhase) {
      renderItems.push({ type: 'divider', phase: msgPhase, key: `divider-${msg.id}` });
    }
    renderItems.push({ type: 'message', msg, phase: msgPhase, key: msg.id });
    prevPhase = msgPhase;
  }

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

        {renderItems.map(item => {
          if (item.type === 'divider') {
            return (
              <div key={item.key} className={`phase-divider ${item.phase}`}>
                <span className="phase-divider-dot" />
                <span className="phase-divider-label">{t(`phases.${item.phase}.label`)}</span>
                <span className="phase-divider-line" />
              </div>
            );
          }
          const { msg, phase: msgPhase } = item;
          return (
            <div key={msg.id} className={`message ${msg.role === 'user' ? 'user' : 'bot'} ${msgPhase}`}>
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
          );
        })}

        {/* Guardrail / error display */}
        {error && <GuardrailError error={error} airsConfig={airsConfig} t={t} />}

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

function parseGuardrailError(errorMessage) {
  try {
    const jsonStr = errorMessage.replace(/'/g, '"').replace(/True/g, 'true').replace(/False/g, 'false');
    const parsed = JSON.parse(jsonStr);
    const err = parsed.error || parsed;
    return {
      isGuardrail: err.type === 'guardrail_violation',
      guardrail: err.guardrail,
      category: err.category,
      profileName: err.profile_name,
      scanId: err.scan_id,
      trId: err.tr_id,
      message: err.message,
      detected: err.prompt_detected || err.response_detected,
    };
  } catch {
    return { isGuardrail: false, message: errorMessage };
  }
}

function GuardrailError({ error, airsConfig, t }) {
  const errorText = error?.message || String(error);
  const info = parseGuardrailError(errorText);

  if (info.isGuardrail) {
    const reportUrl = buildReportUrl(airsConfig, { trId: info.trId, scanId: info.scanId });
    const detectedFlags = info.detected
      ? Object.entries(info.detected).filter(([, v]) => v).map(([k]) => k.replace(/_/g, ' '))
      : [];

    return (
      <div className="message bot">
        <div className="message-avatar">
          <span className="material-symbols guardrail-icon">security</span>
        </div>
        <div className="message-body">
          <div className="message-text guardrail-block">
            <p>{t('guardrail.blocked')}</p>
            {detectedFlags.length > 0 && (
              <p className="guardrail-flags">
                {detectedFlags.map(f => <span key={f} className="guardrail-flag">{f}</span>)}
              </p>
            )}
            {reportUrl && (
              <a href={reportUrl} target="_blank" rel="noopener noreferrer" className="guardrail-report-link">
                <span className="material-symbols">open_in_new</span>
                {t('guardrail.viewReport')}
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="message bot">
      <div className="message-avatar">
        <span className="material-symbols error-icon">error</span>
      </div>
      <div className="message-body">
        <div className="message-text error-block">
          {t('guardrail.error')}
        </div>
      </div>
    </div>
  );
}
