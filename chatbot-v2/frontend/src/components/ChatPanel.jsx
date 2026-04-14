import { useState, useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useChatContext } from '../context/ChatContext.jsx';
import { useAirsConfig, buildReportUrl } from '../hooks/useAirsConfig.js';

export default function ChatPanel() {
  const { t } = useLanguage();
  const { messages, sendMessage, regenerate, stop, addToolApprovalResponse, status, error, phaseMap, sessionUsage } = useChatContext();
  const airsConfig = useAirsConfig();
  const [input, setInput] = useState('');
  const [stickyErrors, setStickyErrors] = useState([]);
  const messagesEndRef = useRef(null);
  const lastErrorRef = useRef(null);

  // Persist errors into the chat flow so they survive new message sends
  useEffect(() => {
    if (status === 'error' && error && error !== lastErrorRef.current) {
      lastErrorRef.current = error;
      const afterId = messages[messages.length - 1]?.id || 'none';
      setStickyErrors(prev => [...prev, { error, afterId, key: `err-${Date.now()}` }]);
    }
  }, [status, error, messages]);

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

  // Build render list with phase dividers and sticky errors
  const renderItems = [];
  let prevPhase = null;
  for (const msg of messages) {
    const msgPhase = phaseMap[msg.id] || 'phase1';
    if (msg.role === 'user' && msgPhase !== prevPhase) {
      renderItems.push({ type: 'divider', phase: msgPhase, key: `divider-${msg.id}` });
    }
    renderItems.push({ type: 'message', msg, phase: msgPhase, key: msg.id });
    // Insert any sticky errors that were captured after this message
    for (const se of stickyErrors) {
      if (se.afterId === msg.id) {
        renderItems.push({ type: 'error', error: se.error, key: se.key });
      }
    }
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
          if (item.type === 'error') {
            return <StreamError key={item.key} error={item.error} airsConfig={airsConfig} t={t} />;
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
                  if (part.type === 'tool-invocation' || part.type === 'dynamic-tool') {
                    const toolName = part.type === 'tool-invocation' ? part.toolInvocation.toolName : part.toolName;
                    const toolState = part.type === 'tool-invocation' ? part.toolInvocation.state : part.state;
                    const toolArgs = part.type === 'tool-invocation' ? part.toolInvocation.args : part.args;
                    const approval = part.type === 'tool-invocation' ? part.toolInvocation.approval : part.approval;

                    if (toolState === 'approval-requested') {
                      return (
                        <div key={i} className="tool-approval">
                          <div className="tool-approval-header">
                            <span className="material-symbols">verified_user</span>
                            <span className="tool-approval-title">{t('tools.approvalRequired')}</span>
                          </div>
                          <div className="tool-approval-detail">
                            <span className="tool-name">{toolName}</span>
                            {toolArgs && (
                              <pre className="tool-approval-args">{JSON.stringify(toolArgs, null, 2)}</pre>
                            )}
                          </div>
                          <div className="tool-approval-actions">
                            <button
                              className="tool-approve-btn"
                              onClick={() => addToolApprovalResponse({ id: approval.id, approved: true })}
                            >
                              <span className="material-symbols">check_circle</span>
                              {t('tools.approve')}
                            </button>
                            <button
                              className="tool-deny-btn"
                              onClick={() => addToolApprovalResponse({ id: approval.id, approved: false })}
                            >
                              <span className="material-symbols">cancel</span>
                              {t('tools.deny')}
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={i} className="tool-call">
                        <span className="material-symbols">build</span>
                        <span className="tool-name">{toolName}</span>
                        <span className={`tool-state ${toolState}`}>
                          {toolState === 'result' ? 'done' : toolState}
                        </span>
                      </div>
                    );
                  }
                  return null;
                })}
                {msg.role === 'assistant' && msg.metadata?.empty && (
                  <div className="message-text empty-response">
                    <span className="material-symbols">warning</span>
                    {t('chat.emptyResponse')}
                    <button className="retry-btn" onClick={() => regenerate({ messageId: msg.id })}>
                      <span className="material-symbols">refresh</span>
                      {t('buttons.regenerate')}
                    </button>
                  </div>
                )}
                {msg.role === 'assistant' && msg.metadata?.usage?.totalTokens > 0 && (
                  <div className="message-usage">
                    <span className="material-symbols">savings</span>
                    {msg.metadata.usage.totalTokens.toLocaleString()} tokens
                    <span className="usage-detail">({(msg.metadata.usage.inputTokens || 0).toLocaleString()} in / {(msg.metadata.usage.outputTokens || 0).toLocaleString()} out)</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Streaming indicator with stop button */}
        {isStreaming && (
          <div className="thinking-indicator">
            <span className="thinking-dots"><span /><span /><span /></span>
            <button className="stop-btn" onClick={() => stop()}>
              <span className="material-symbols">stop_circle</span>
              {t('chat.stop')}
            </button>
          </div>
        )}

        {/* Native error display — hidden once captured as a sticky error */}
        {status === 'error' && error && !stickyErrors.some(se => se.error === error) && (
          <StreamError error={error} airsConfig={airsConfig} t={t} onRetry={() => regenerate()} />
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
        {sessionUsage.totalTokens > 0 && (
          <div className="session-usage">
            <span className="material-symbols">savings</span>
            <span>{sessionUsage.totalTokens.toLocaleString()} tokens</span>
            <span className="usage-detail">({sessionUsage.inputTokens.toLocaleString()} in / {sessionUsage.outputTokens.toLocaleString()} out)</span>
          </div>
        )}
      </div>
    </section>
  );
}

function StreamError({ error, airsConfig, t, onRetry }) {
  const type = error?.type || '';
  const isGuardrail = type === 'guardrail_violation' || type === 'guardrail_scan_error';
  const isGuardrailConfig = type === 'guardrail_config_error';
  const reportUrl = isGuardrail ? buildReportUrl(airsConfig, { trId: error.tr_id, scanId: error.scan_id }) : null;

  // Guardrail config error (AIRS unreachable)
  if (isGuardrailConfig) {
    return (
      <div className="message bot">
        <div className="message-avatar"><span className="material-symbols guardrail-icon">security</span></div>
        <div className="message-body">
          <div className="message-text guardrail-block">
            <p>{t('guardrail.configError')}</p>
          </div>
        </div>
      </div>
    );
  }

  // Guardrail violation — personalized i18n message
  if (isGuardrail) {
    const detected = error.prompt_detected || error.response_detected || error.detected;
    const isResponse = error.isResponseBlock || !!error.response_detected;
    const flags = detected
      ? Object.entries(detected).filter(([, v]) => v).map(([k]) => k.replace(/_/g, ' '))
      : [];
    const issues = flags.join(', ');

    return (
      <div className="message bot">
        <div className="message-avatar"><span className="material-symbols guardrail-icon">security</span></div>
        <div className="message-body">
          <div className="message-text guardrail-block">
            <p>
              {isResponse ? t('guardrail.cannotProvideResponse') : t('guardrail.cannotProcessRequest')}
              {' '}
              {issues ? t('guardrail.containsIssues', { issues }) : t('guardrail.policyViolation')}
            </p>
            <p>{isResponse ? t('guardrail.helpWithElse') : t('guardrail.rephraseRequest')}</p>
          </div>
          {reportUrl && isResponse && (
            <div className="message-usage">
              <a href={reportUrl} target="_blank" rel="noopener noreferrer" className="guardrail-report-inline">
                <span className="material-symbols">open_in_new</span>
                {t('guardrail.viewReport')}
              </a>
            </div>
          )}
          {reportUrl && !isResponse && (
            <a href={reportUrl} target="_blank" rel="noopener noreferrer" className="guardrail-report-link">
              <span className="material-symbols">open_in_new</span>
              {t('guardrail.viewReport')}
            </a>
          )}
        </div>
      </div>
    );
  }

  // Generic error (API errors, network, auth, rate limit, etc.)
  return (
    <div className="message bot">
      <div className="message-avatar"><span className="material-symbols error-icon">error</span></div>
      <div className="message-body">
        <div className="message-text error-block">
          <p>{error?.message || t('guardrail.error')}</p>
          {onRetry && (
            <button className="retry-btn" onClick={onRetry}>
              <span className="material-symbols">refresh</span>
              {t('buttons.regenerate')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
