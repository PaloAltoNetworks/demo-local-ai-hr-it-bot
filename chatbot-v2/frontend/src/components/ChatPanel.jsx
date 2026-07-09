import { useState, useEffect, useRef, Fragment } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useChatContext } from '../context/ChatContext.jsx';
import { useAirsConfig, buildReportUrl } from '../hooks/useAirsConfig.js';

export default function ChatPanel() {
  const { t } = useLanguage();
  const { messages, sendMessage, sendFeedback, regenerate, stop, addToolApprovalResponse, status, error, phaseMap, sessionUsage } = useChatContext();
  const airsConfig = useAirsConfig();
  const [input, setInput] = useState('');
  // msgId → 'up' | 'down' (which thumb the user picked for that answer)
  const [feedback, setFeedback] = useState({});
  const [stickyErrors, setStickyErrors] = useState([]);
  const messagesEndRef = useRef(null);
  const lastErrorRef = useRef(null);
  // key: msgId → { start, end } for whole-generation latency
  const [msgTimings, setMsgTimings] = useState({});
  const streamingMsgIdRef = useRef(null);
  // Timestamp when the current generation started (captures pre-message time too),
  // used for the single global live timer.
  const globalStartRef = useRef(null);
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
    // Streaming just started — clear stale ref + mark the global start time.
    if (!prevIsStreamingRef.current) {
      streamingMsgIdRef.current = null;
      prevIsStreamingRef.current = true;
      globalStartRef.current = Date.now();
    }
    // Streaming started — adopt the assistant message for THIS turn only
    // (one that appears after the last user message). Until it exists, keep the
    // ref null so the global placeholder renders at the bottom instead of
    // attaching to the previous turn's assistant message.
    const lastUserIdx = messages.map(m => m.role).lastIndexOf('user');
    const turnAssistant = messages.slice(lastUserIdx + 1).find(m => m.role === 'assistant');
    if (turnAssistant && turnAssistant.id !== streamingMsgIdRef.current) {
      streamingMsgIdRef.current = turnAssistant.id;
      setMsgTimings(prev => {
        if (prev[turnAssistant.id]) return prev;
        return { ...prev, [turnAssistant.id]: { start: globalStartRef.current ?? Date.now() } };
      });
    }
  }, [isStreaming, messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status, error]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    sendMessage({ text: input });
    setInput('');
  };

  const handleFeedback = (msg, value) => {
    const traceId = msg.metadata?.traceId;
    if (!traceId) return;
    const pick = value > 0 ? 'up' : 'down';
    // Toggle off if the same thumb is clicked again.
    const next = feedback[msg.id] === pick ? undefined : pick;
    setFeedback(prev => ({ ...prev, [msg.id]: next }));
    if (!next) return;
    sendFeedback({ traceId, value }).catch(err => {
      console.error('[feedback]', err.message);
      setFeedback(prev => ({ ...prev, [msg.id]: undefined }));
    });
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
                    if (msg.role === 'user') {
                      return <div key={i} className="message-text">{part.text}</div>;
                    }
                    // Assistant final answer. If this message ran ReAct steps, prepend a
                    // Decide card above the answer to mark the final phase (no per-step timer;
                    // the single global timer tracks total elapsed).
                    const allParts = msg.parts || [];
                    const hasSteps = allParts.some(p => p.type === 'dynamic-tool' || p.type?.startsWith('tool-'));
                    const firstTextIdx = allParts.findIndex(p => p.type === 'text' && p.text);
                    const decideCard = (hasSteps && i === firstTextIdx) ? (
                      <div key="decide" className="react-step react-decide">
                        <div className="react-step-header">
                          <span className="material-symbols react-step-icon">task_alt</span>
                          <span className="react-step-label">Decide</span>
                        </div>
                      </div>
                    ) : null;
                    return (
                      <Fragment key={i}>
                        {decideCard}
                        <div className="message-text"><Markdown remarkPlugins={[remarkGfm]}>{part.text}</Markdown></div>
                      </Fragment>
                    );
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
                            {toolArgs && Object.keys(toolArgs).length > 0 && (
                              <table className="tool-approval-table">
                                <tbody>
                                  {Object.entries(toolArgs).map(([k, v]) => (
                                    <tr key={k}>
                                      <th>{k.replace(/_/g, ' ')}</th>
                                      <td>{v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
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
                    // reflect_conclude = no-data shortcut: model decided it can answer without
                    // fetching tools. Render it as a Reason card so its rationale persists above
                    // the final answer (same as the data path's reason/observe cards).
                    const KNOWN_REFLECT = new Set(['reflect', 'reflect_reason', 'reflect_observe', 'reflect_decide', 'reflect_conclude']);
                    if (toolName?.startsWith('reflect_') && !KNOWN_REFLECT.has(toolName)) return null;
                    const isReflect = KNOWN_REFLECT.has(toolName) || toolName?.endsWith('-reflect');
                    if (isReflect) {
                      const REACT_PHASE_ICON = { observe: 'search_insights', reason: 'psychology', decide: 'task_alt', conclude: 'psychology' };
                      const REACT_PHASE_LABEL = { observe: 'Observe', reason: 'Reason', decide: 'Decide', conclude: 'Reason' };
                      // Phase-locked tools: trust tool name (authoritative).
                      // Legacy unified 'reflect' tool: read toolArgs.phase.
                      // Model may inject extra fields into phase-locked tool args — ignore them.
                      const phase = toolName.startsWith('reflect_')
                        ? toolName.split('_')[1]
                        : (toolArgs?.phase || 'reason');
                      const icon = REACT_PHASE_ICON[phase] || 'psychology';
                      const label = REACT_PHASE_LABEL[phase] || phase;
                      const cssPhase = phase === 'conclude' ? 'reason' : phase;
                      const isStepStreaming = toolState === 'input-streaming';
                      const isDone = toolState === 'output-available';
                      // reflect_reason/observe carry the plan in `observation`; reflect_conclude in `reason`.
                      // This streamed text is the model's live reasoning for the step.
                      const stepText = toolArgs?.observation || toolArgs?.reason;

                      return (
                        <div key={i} className={`react-step react-${cssPhase} ${isStepStreaming ? 'streaming' : ''}`}>
                          <div className="react-step-header">
                            <span className="material-symbols react-step-icon">{icon}</span>
                            <span className="react-step-label">{label}</span>
                          </div>
                          {stepText && (
                            <div className="react-step-observation">{stepText}</div>
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

                    return (
                      <div key={i} className={`tool-call ${stateClass}`}>
                        <div className="react-step-header">
                          <span className="material-symbols react-step-icon">build</span>
                          <span className="react-step-label">Tool</span>
                          {isError && <span className="tool-state error" style={{marginLeft:'auto'}}>error</span>}
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
                  // No-data shortcut (reflect_conclude) or the answer text already
                  // streaming → the reasoning card is done; don't show a stray "Reason...".
                  const ranConclude = parts.some(p => (p.type === 'dynamic-tool' ? p.toolName : p.type?.slice(5)) === 'reflect_conclude');
                  const hasText = parts.some(p => p.type === 'text' && p.text);
                  if (ranConclude || hasText) return null;
                  // Only ever preview the FIRST step (Reason). Never predict Observe —
                  // the Observe card must appear only when reflect_observe actually
                  // streams, not speculatively during the inter-step gap.
                  const ranReason = parts.some(p => {
                    const n = p.type === 'dynamic-tool' ? p.toolName : p.type?.slice(5);
                    return n === 'reflect_reason';
                  });
                  if (ranReason) return null;
                  return (
                    <div key="pending-step" className="react-step react-reason streaming">
                      <div className="react-step-header">
                        <span className="material-symbols react-step-icon">psychology</span>
                        <span className="react-step-label">Reason...</span>
                      </div>
                    </div>
                  );
                })()}
                {/* Single global live timer — total elapsed for the active generation */}
                {msg.role === 'assistant' && isStreaming && msg.id === streamingMsgIdRef.current && globalStartRef.current && (
                  <div className="react-global-timer">
                    <span className="material-symbols">acute</span>
                    {((Date.now() - globalStartRef.current) / 1000).toFixed(1)}s
                  </div>
                )}
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
                {msg.role === 'assistant' && msg.metadata?.traceId && !isStreaming
                  && msg.parts?.some(p => p.type === 'text' && p.text) && (
                  <div className="message-feedback">
                    <button
                      className={`feedback-btn ${feedback[msg.id] === 'up' ? 'active up' : ''}`}
                      title={t('feedback.helpful')}
                      aria-label={t('feedback.helpful')}
                      onClick={() => handleFeedback(msg, 1)}
                    >
                      <span className="material-symbols">thumb_up</span>
                    </button>
                    <button
                      className={`feedback-btn ${feedback[msg.id] === 'down' ? 'active down' : ''}`}
                      title={t('feedback.notHelpful')}
                      aria-label={t('feedback.notHelpful')}
                      onClick={() => handleFeedback(msg, -1)}
                    >
                      <span className="material-symbols">thumb_down</span>
                    </button>
                    {feedback[msg.id] && (
                      <span className="feedback-thanks">{t('feedback.thanks')}</span>
                    )}
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
          const liveElapsed = globalStartRef.current
            ? ((Date.now() - globalStartRef.current) / 1000).toFixed(1)
            : '0.0';
          return (
            <div className="message bot">
              <div className="message-avatar"><i className="otter-icon" /></div>
              <div className="message-body">
                <div className="react-step react-reason streaming">
                  <div className="react-step-header">
                    <span className="material-symbols react-step-icon">psychology</span>
                    <span className="react-step-label">Reason...</span>
                  </div>
                </div>
                <div className="react-global-timer">
                  <span className="material-symbols">acute</span>
                  {liveElapsed}s
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
