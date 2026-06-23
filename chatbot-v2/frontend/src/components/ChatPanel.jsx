import { useState, useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
  // key: msgId → { start, end } for whole-generation latency
  const [msgTimings, setMsgTimings] = useState({});
  const streamingMsgIdRef = useRef(null);
  // key: `${msgId}:${phase}` → start timestamp, set when placeholder renders
  const phaseStarts = useRef({});
  // tick every 100ms while streaming to update live elapsed display
  const [tick, setTick] = useState(0);

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
    if (!isStreaming) return;
    const id = setInterval(() => setTick(t => t + 1), 100);
    return () => clearInterval(id);
  }, [isStreaming]);

  const prevIsStreamingRef = useRef(false);

  // Track whole-generation latency per assistant message
  useEffect(() => {
    if (!isStreaming) {
      // Streaming stopped — close any open timing
      if (streamingMsgIdRef.current) {
        const id = streamingMsgIdRef.current;
        streamingMsgIdRef.current = null;
        setMsgTimings(prev => {
          if (!prev[id] || prev[id].end) return prev;
          return { ...prev, [id]: { ...prev[id], end: Date.now() } };
        });
      }
      prevIsStreamingRef.current = false;
      return;
    }
    // Streaming just started — clear stale ref so placeholder shows in global slot
    if (!prevIsStreamingRef.current) {
      streamingMsgIdRef.current = null;
      prevIsStreamingRef.current = true;
    }
    // Streaming started — find the latest assistant message
    const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
    if (lastAssistant && lastAssistant.id !== streamingMsgIdRef.current) {
      streamingMsgIdRef.current = lastAssistant.id;
      setMsgTimings(prev => {
        if (prev[lastAssistant.id]) return prev;
        return { ...prev, [lastAssistant.id]: { start: Date.now() } };
      });
    }
  }, [isStreaming, messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status, error]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    phaseStarts.current = {};
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
                      : <div key={i} className="message-text"><Markdown remarkPlugins={[remarkGfm]}>{part.text}</Markdown></div>;
                  }
                  if (part.type === 'dynamic-tool' || part.type.startsWith('tool-')) {
                    // AI SDK v6: static tools → type is 'tool-${toolName}', dynamic → 'dynamic-tool'
                    const toolName = part.type === 'dynamic-tool' ? part.toolName : part.type.slice(5);
                    const toolState = part.state;
                    const toolArgs = part.input;
                    const approval = part.approval;

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

                    // Only known reflect tools — block hallucinated variants (reflect_respond, etc.)
                    const KNOWN_REFLECT = new Set(['reflect', 'reflect_reason', 'reflect_observe', 'reflect_decide']);
                    if (toolName?.startsWith('reflect_') && !KNOWN_REFLECT.has(toolName)) return null;
                    const isReflect = KNOWN_REFLECT.has(toolName) || toolName?.endsWith('-reflect');
                    if (isReflect) {
                      const REACT_PHASE_ICON = { observe: 'search_insights', reason: 'psychology', decide: 'task_alt' };
                      const REACT_PHASE_LABEL = { observe: 'Observe', reason: 'Reason', decide: 'Decide' };
                      // Phase-locked tools: trust tool name (authoritative).
                      // Legacy unified 'reflect' tool: read toolArgs.phase.
                      // Model may inject extra fields into phase-locked tool args — ignore them.
                      const phase = toolName.startsWith('reflect_')
                        ? toolName.split('_')[1]
                        : (toolArgs?.phase || 'reason');
                      const icon = REACT_PHASE_ICON[phase] || 'psychology';
                      const label = REACT_PHASE_LABEL[phase] || phase;
                      const isStepStreaming = toolState === 'input-streaming';
                      const isDone = toolState === 'output-available';

                      // Per-step latency: inherit from placeholder, freeze on done
                      const phaseKey = `${msg.id}:${phase}`;
                      if (!phaseStarts.current[phaseKey]) {
                        const inherited = phaseStarts.current[`global:${phase}`];
                        phaseStarts.current[phaseKey] = { start: inherited?.start ?? inherited ?? Date.now() };
                      }
                      const timing = phaseStarts.current[phaseKey];
                      if (isDone && !timing.end) timing.end = Date.now();
                      const elapsed = timing.end
                        ? ((timing.end - timing.start) / 1000).toFixed(1)
                        : ((Date.now() - timing.start) / 1000).toFixed(1);

                      return (
                        <div key={i} className={`react-step react-${phase} ${isStepStreaming ? 'streaming' : ''}`}>
                          <div className="react-step-header">
                            <span className="material-symbols react-step-icon">{icon}</span>
                            <span className="react-step-label">{label}</span>
                            {isStepStreaming && <span className="react-step-streaming-dot" />}
                            {elapsed && <span className="react-step-latency">{elapsed}s</span>}
                          </div>
                          {toolArgs?.observation && (
                            <div className="react-step-observation">{toolArgs.observation}</div>
                          )}
                          {toolArgs?.next_action && isDone && (
                            <div className="react-step-next">→ {toolArgs.next_action}</div>
                          )}
                        </div>
                      );
                    }

                    const isRunning = toolState === 'input-streaming' || toolState === 'input-available';
                    const isDone = toolState === 'output-available';
                    const isError = toolState === 'output-error';

                    // Strip server prefix (e.g. "hr_tools_mcp_server-get_employee" → "get_employee")
                    const shortName = toolName.includes('-') ? toolName.split('-').slice(1).join('-') : toolName;
                    // Show first key arg as hint (e.g. identifier: EMP-034)
                    const argHint = toolArgs && Object.keys(toolArgs).length > 0
                      ? `${Object.keys(toolArgs)[0]}: ${String(Object.values(toolArgs)[0]).slice(0, 40)}`
                      : '';
                    // Extract output text — MCP tools return {content:[{type:'text',text:'...'}]}
                    const toolOutput = part.output;
                    const outputText = isDone && toolOutput
                      ? (() => {
                          if (toolOutput?.content?.[0]?.text) {
                            try {
                              const parsed = JSON.parse(toolOutput.content[0].text);
                              // Show a compact summary — first 2 top-level keys
                              const fmtVal = (v) => {
                                if (Array.isArray(v)) return `${v.length} items`;
                                if (v !== null && typeof v === 'object') return JSON.stringify(v).slice(0, 40);
                                return String(v).slice(0, 40);
                              };
                              return Object.entries(parsed)
                                .filter(([k]) => !['id','bank_account','salary'].includes(k))
                                .slice(0, 3)
                                .map(([k, v]) => `${k}: ${fmtVal(v)}`)
                                .join(' · ');
                            } catch {
                              return toolOutput.content[0].text.slice(0, 120);
                            }
                          }
                          if (typeof toolOutput === 'string') return toolOutput.slice(0, 120);
                          if (typeof toolOutput === 'object') return JSON.stringify(toolOutput).slice(0, 120);
                          return '';
                        })()
                      : '';

                    const stateClass = isDone ? 'result' : isError ? 'error' : 'streaming';
                    const toolTimingKey = `${msg.id}:tool:${i}`;
                    if (!phaseStarts.current[toolTimingKey]) phaseStarts.current[toolTimingKey] = { start: Date.now() };
                    const toolTiming = phaseStarts.current[toolTimingKey];
                    if (isDone && !toolTiming.end) toolTiming.end = Date.now();
                    const toolElapsed = toolTiming.end
                      ? ((toolTiming.end - toolTiming.start) / 1000).toFixed(1)
                      : ((Date.now() - toolTiming.start) / 1000).toFixed(1);

                    return (
                      <div key={i} className={`tool-call ${stateClass}`}>
                        <div className="react-step-header">
                          <span className="material-symbols react-step-icon">build</span>
                          <span className="react-step-label">Tool</span>
                          {!isDone && !isError && <span className="react-step-streaming-dot" />}
                          {isError && <span className="tool-state error" style={{marginLeft:'auto'}}>error</span>}
                          {toolElapsed && <span className="react-step-latency">{toolElapsed}s</span>}
                        </div>
                        <div className="tool-call-detail">
                          <span className="tool-name">{shortName}</span>
                          {argHint && <span className="tool-args">{argHint}</span>}
                        </div>
                        {outputText && (
                          <div className="react-step-next">→ {outputText}</div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })}
                {/* Placeholder card shown during inter-step gap — appears after existing parts */}
                {msg.role === 'assistant' && isStreaming && msg.id === streamingMsgIdRef.current && (() => {
                  const parts = msg.parts || [];
                  const hasActiveStream = parts.some(p => (p.type === 'dynamic-tool' || p.type?.startsWith('tool-')) && p.state === 'input-streaming');
                  if (hasActiveStream) return null;
                  const KNOWN_REFLECT = ['reflect_reason', 'reflect_observe', 'reflect_decide'];
                  const ranPhases = new Set(parts
                    .filter(p => { const n = p.type === 'dynamic-tool' ? p.toolName : p.type?.slice(5); return KNOWN_REFLECT.includes(n); })
                    .map(p => (p.type === 'dynamic-tool' ? p.toolName : p.type?.slice(5))?.split('_')[1]));
                  const ranDataTools = parts.some(p => {
                    const n = p.type === 'dynamic-tool' ? p.toolName : p.type?.slice(5);
                    return n && !KNOWN_REFLECT.includes(n) && (p.type === 'dynamic-tool' || p.type?.startsWith('tool-'));
                  });
                  let nextPhase;
                  if (!ranPhases.has('reason')) nextPhase = 'reason';
                  else if (!ranDataTools) nextPhase = null;
                  else if (!ranPhases.has('observe')) nextPhase = 'observe';
                  else nextPhase = null;
                  if (!nextPhase) return null;
                  const REACT_PHASE_ICON = { reason: 'psychology', observe: 'search_insights' };
                  const REACT_PHASE_LABEL = { reason: 'Reason', observe: 'Observe' };
                  const phaseKey = `${msg.id}:${nextPhase}`;
                  if (!phaseStarts.current[phaseKey]) phaseStarts.current[phaseKey] = { start: Date.now() };
                  const liveElapsed = ((Date.now() - phaseStarts.current[phaseKey].start) / 1000).toFixed(1);
                  return (
                    <div key="pending-step" className={`react-step react-${nextPhase} streaming`}>
                      <div className="react-step-header">
                        <span className="material-symbols react-step-icon">{REACT_PHASE_ICON[nextPhase]}</span>
                        <span className="react-step-label">{REACT_PHASE_LABEL[nextPhase]}...</span>
                        <span className="react-step-streaming-dot" />
                        <span className="react-step-latency">{liveElapsed}s</span>
                      </div>
                    </div>
                  );
                })()}
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
                    {msgTimings[msg.id]?.end && (
                      <>
                        <span className="usage-sep">·</span>
                        <span className="material-symbols">acute</span>
                        {((msgTimings[msg.id].end - msgTimings[msg.id].start) / 1000).toFixed(1)}s
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Global streaming placeholder — shown when streaming but no assistant message yet,
            or when the last message has no active tool stream (first step = Reason) */}
        {isStreaming && (() => {
          if (streamingMsgIdRef.current) return null; // placeholder lives inside the message
          const phaseKey = `global:reason`;
          if (!phaseStarts.current[phaseKey]) phaseStarts.current[phaseKey] = { start: Date.now() };
          const liveElapsed = ((Date.now() - phaseStarts.current[phaseKey].start) / 1000).toFixed(1);
          return (
            <div className="message bot">
              <div className="message-avatar"><i className="otter-icon" /></div>
              <div className="message-body">
                <div className="react-step react-reason streaming">
                  <div className="react-step-header">
                    <span className="material-symbols react-step-icon">psychology</span>
                    <span className="react-step-label">Reason...</span>
                    <span className="react-step-streaming-dot" />
                    <span className="react-step-latency">{liveElapsed}s</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

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
          {isStreaming ? (
            <button type="button" className="send-btn send-btn--stop" onClick={() => stop()}>
              <span className="material-symbols">stop</span>
            </button>
          ) : (
            <button type="submit" className="send-btn" disabled={!input.trim()}>
              <span className="material-symbols">send</span>
            </button>
          )}
        </form>
        {sessionUsage.totalTokens > 0 && (
          <div className="session-usage">
            <span className="material-symbols">savings</span>
            <span>{sessionUsage.totalTokens.toLocaleString()} tokens</span>
            <span className="usage-detail">({sessionUsage.inputTokens.toLocaleString()} in / {sessionUsage.outputTokens.toLocaleString()} out)</span>
            {(() => {
              const lastLatency = [...messages]
                .reverse()
                .find(m => m.role === 'assistant' && msgTimings[m.id]?.end);
              if (!lastLatency) return null;
              const t = msgTimings[lastLatency.id];
              return (
                <>
                  <span className="usage-sep">·</span>
                  <span className="material-symbols">acute</span>
                  <span>{((t.end - t.start) / 1000).toFixed(1)}s last</span>
                </>
              );
            })()}
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
