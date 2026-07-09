import { useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { useLanguage } from '../context/LanguageContext';
import type { Translate } from '../context/LanguageContext';
import { useChatContext } from '../context/ChatContext';
import { useAirsConfig, buildReportUrl } from '../hooks/useAirsConfig';
import type { AirsConfig } from '../hooks/useAirsConfig';
import { Button } from '@/components/ui/button';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from '@/components/ai-elements/message';
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements/tool';
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
} from '@/components/ai-elements/chain-of-thought';
import {
  Context,
  ContextTrigger,
  ContextContent,
  ContextContentHeader,
  ContextContentBody,
  ContextContentFooter,
  ContextInputUsage,
  ContextOutputUsage,
} from '@/components/ai-elements/context';
import { Persona } from '@/components/ai-elements/persona';
import type { Provider } from '../hooks/useProviders';
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from '@/components/ai-elements/model-selector';
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import {
  Brain,
  Search,
  Wrench,
  CircleCheck,
  ThumbsUp,
  ThumbsDown,
  Copy,
  ShieldCheck,
  ShieldAlert,
  Check,
  X,
  RefreshCw,
  TriangleAlert,
  ExternalLink,
} from 'lucide-react';

// Estimated model context window — drives the Context usage ring (Claude-class).
const CONTEXT_WINDOW = 200_000;

// Portkey trace deep-link. Org/workspace are stable per Portkey workspace (not secrets — they
// live in the dashboard URL). traceId comes from finish metadata; the app sets it = threadId.
const PORTKEY_ORG = '8ce8561b-633e-49f4-8029-20b2021c3e7f';
const PORTKEY_WORKSPACE = '991814d2-3517-4328-9af9-32ad1e2c0498';
const buildTraceUrl = (traceId: string, createdAt?: number) => {
  const q = new URLSearchParams({
    workspaceId: PORTKEY_WORKSPACE,
    traceView: 'true',
    selectedTraceId: traceId,
    logLogStoreFilePathFormat: 'v1',
  });
  if (createdAt) q.set('logCreatedAt', new Date(createdAt).toISOString());
  return `https://app.portkey.ai/organisation/${PORTKEY_ORG}/logs?${q.toString()}`;
};

const KNOWN_REFLECT = new Set(['reflect', 'reflect_reason', 'reflect_observe', 'reflect_decide', 'reflect_conclude']);
const REFLECT_META: Record<string, { icon: typeof Brain; label: string }> = {
  reason: { icon: Brain, label: 'Reason' },
  observe: { icon: Search, label: 'Observe' },
  decide: { icon: CircleCheck, label: 'Decide' },
  conclude: { icon: Brain, label: 'Reason' },
};

// MCP tool results arrive wrapped as { content: [{ type: 'text', text: '<json>' }] }.
// Passing that wrapper straight to ToolOutput → JSON.stringify double-escapes the inner
// JSON, so the card fills with literal \n and \" (unreadable). Unwrap the text and parse it
// back to an object so CodeBlock pretty-prints clean JSON.
const unwrapMcpOutput = (output: any): any => {
  if (!output || typeof output !== 'object' || !Array.isArray(output.content)) return output;
  const text = output.content.filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('\n');
  if (!text) return output;
  try { return JSON.parse(text); } catch { return text; }
};

const partToolName = (part: any): string =>
  part.type === 'dynamic-tool' ? part.toolName : String(part.type).slice(5);
const isToolPart = (part: any) => part.type === 'dynamic-tool' || String(part.type || '').startsWith('tool-');
const isReflect = (name: string) => KNOWN_REFLECT.has(name) || name?.endsWith('-reflect');
// Strip the MCP server prefix: "hr_tools_mcp_server-get_employee" → "get_employee"
const shortToolName = (name: string) => (name.includes('-') ? name.split('-').slice(1).join('-') : name);

interface ChatPanelProps {
  providers: Provider[];
  provider: string;
  setProvider: (p: string) => void;
  phase: string;
}

// Brand hex per phase — mirrors .phaseN-active { --primary } in index.css. Used to tint
// the halo persona (Rive dynamic color takes a hex, not a CSS var).
const PHASE_COLOR: Record<string, string> = {
  phase1: '#00CC66',
  phase2: '#C84727',
  phase3: '#00C0E8',
};

export default function ChatPanel({ providers, provider, setProvider, phase }: ChatPanelProps) {
  const { t } = useLanguage();
  const { messages, sendMessage, sendFeedback, regenerate, stop, addToolApprovalResponse, status, error, phaseMap, sessionUsage } = useChatContext();
  const airsConfig = useAirsConfig();

  const [modelOpen, setModelOpen] = useState(false);
  const currentProvider = providers.find(p => p.id === provider);
  // msgId → 'up' | 'down' (chosen thumb locks via the button's disabled state)
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down'>>({});
  const [stickyErrors, setStickyErrors] = useState<{ error: any; afterId: string; key: string }[]>([]);
  const lastErrorRef = useRef<any>(null);
  const [msgTimings, setMsgTimings] = useState<Record<string, { start: number; end?: number }>>({});
  const streamingMsgIdRef = useRef<string | null>(null);
  const globalStartRef = useRef<number | null>(null);
  const prevIsStreamingRef = useRef(false);

  const isStreaming = status === 'streaming' || status === 'submitted';

  // Persist stream errors into the chat flow so they survive new sends
  useEffect(() => {
    if (status === 'error' && error && error !== lastErrorRef.current) {
      lastErrorRef.current = error;
      const afterId = messages[messages.length - 1]?.id || 'none';
      setStickyErrors(prev => [...prev, { error, afterId, key: `err-${Date.now()}` }]);
    }
  }, [status, error, messages]);

  // Track whole-generation latency per assistant message
  useEffect(() => {
    if (!isStreaming) {
      if (streamingMsgIdRef.current) {
        const id = streamingMsgIdRef.current;
        streamingMsgIdRef.current = null;
        setMsgTimings(prev => (!prev[id] || prev[id].end ? prev : { ...prev, [id]: { ...prev[id], end: Date.now() } }));
      }
      prevIsStreamingRef.current = false;
      return;
    }
    if (!prevIsStreamingRef.current) {
      streamingMsgIdRef.current = null;
      prevIsStreamingRef.current = true;
      globalStartRef.current = Date.now();
    }
    const lastUserIdx = messages.map((m: any) => m.role).lastIndexOf('user');
    const turnAssistant = messages.slice(lastUserIdx + 1).find((m: any) => m.role === 'assistant');
    if (turnAssistant && turnAssistant.id !== streamingMsgIdRef.current) {
      streamingMsgIdRef.current = turnAssistant.id;
      setMsgTimings(prev => (prev[turnAssistant.id] ? prev : { ...prev, [turnAssistant.id]: { start: globalStartRef.current ?? Date.now() } }));
    }
  }, [isStreaming, messages]);

  const handleSubmit = (message: { text?: string }, event: FormEvent<HTMLFormElement>) => {
    if (isStreaming) return;
    const text = message.text?.trim();
    if (!text) return;
    sendMessage({ text });
    event.currentTarget.reset();
  };

  const handleFeedback = (msg: any, direction: number) => {
    const traceId = msg.metadata?.traceId;
    if (!traceId) return;
    const pick = direction > 0 ? 'up' : 'down';
    if (feedback[msg.id] === pick) return; // chosen thumb is locked
    const prev = feedback[msg.id];

    const value = direction > 0 ? 10 : -10; // thumbs are a strong signal, not a nuance
    const parts = msg.parts || [];
    const toolsUsed = parts.reduce((acc: string[], p: any) => {
      if (!isToolPart(p)) return acc;
      const raw = partToolName(p);
      if (!raw || isReflect(raw)) return acc;
      const name = shortToolName(raw);
      if (!acc.includes(name)) acc.push(name);
      return acc;
    }, []);
    const weight = toolsUsed.length > 0 ? 1 : 0.5;

    setFeedback(f => ({ ...f, [msg.id]: pick }));
    sendFeedback({ traceId, value, weight, toolsUsed }).catch((err: Error) => {
      console.error('[feedback]', err.message);
      setFeedback(f => ({ ...f, [msg.id]: prev }));
    });
  };

  // Build render list with phase dividers and sticky errors interleaved
  const renderItems: any[] = [];
  let prevPhase: string | null = null;
  for (const msg of messages) {
    const msgPhase = phaseMap[msg.id] || 'phase1';
    if (msg.role === 'user' && msgPhase !== prevPhase) {
      renderItems.push({ type: 'divider', phase: msgPhase, key: `divider-${msg.id}` });
    }
    renderItems.push({ type: 'message', msg, phase: msgPhase, key: msg.id });
    for (const se of stickyErrors) {
      if (se.afterId === msg.id) renderItems.push({ type: 'error', error: se.error, key: se.key });
    }
    prevPhase = msgPhase;
  }

  const showWaiting = isStreaming && !streamingMsgIdRef.current;

  return (
    <section className="flex min-h-0 flex-col overflow-hidden">
      <Conversation>
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {messages.length === 0 && (
            <ConversationEmptyState
              icon={
                <div className="relative flex size-80 items-center justify-center">
                  <Persona key={phase} state="thinking" variant="halo" color={PHASE_COLOR[phase] || PHASE_COLOR.phase1} className="size-80" />
                  <i className="otter-icon animate-breathe pointer-events-none absolute text-[6.5rem] text-primary/90 [filter:drop-shadow(0_1px_4px_rgba(255,255,255,0.75))] dark:[filter:drop-shadow(0_1px_4px_rgba(0,0,0,0.6))]" />
                </div>
              }
              title={t('app.brand')}
              description={t('chat.greeting', { name: t('userProfile.name') })}
            />
          )}

          {renderItems.map(item => {
            if (item.type === 'divider') return <PhaseDivider key={item.key} phase={item.phase} t={t} />;
            if (item.type === 'error') return <StreamError key={item.key} error={item.error} airsConfig={airsConfig} t={t} />;

            const msg = item.msg;
            if (msg.role === 'user') {
              const text = (msg.parts || []).filter((p: any) => p.type === 'text').map((p: any) => p.text).join('');
              return (
                <Message from="user" key={msg.id}>
                  <MessageContent>{text}</MessageContent>
                </Message>
              );
            }

            const isThisStreaming = msg.id === streamingMsgIdRef.current;
            return (
              <Message from="assistant" key={msg.id}>
                <MessageContent>
                  <AssistantParts msg={msg} onApprove={addToolApprovalResponse} t={t} />

                  {msg.metadata?.empty && (
                    <div className="flex flex-wrap items-center gap-2 text-sm italic text-muted-foreground">
                      <TriangleAlert className="size-4 text-[color:var(--brand-orange)]" />
                      {t('chat.emptyResponse')}
                      <Button variant="outline" size="sm" onClick={() => regenerate({ messageId: msg.id })}>
                        <RefreshCw className="size-3.5" /> {t('buttons.regenerate')}
                      </Button>
                    </div>
                  )}

                  {!isThisStreaming && <MetaRow msg={msg} timing={msgTimings[msg.id]} feedback={feedback[msg.id]} onFeedback={handleFeedback} onRetry={() => regenerate({ messageId: msg.id })} t={t} />}
                </MessageContent>
              </Message>
            );
          })}

          {showWaiting && (
            <Message from="assistant">
              <MessageContent>
                <span className="text-sm text-muted-foreground">{t('chat.thinking')}</span>
              </MessageContent>
            </Message>
          )}

          {status === 'error' && error && !stickyErrors.some(se => se.error === error) && (
            <StreamError error={error} airsConfig={airsConfig} t={t} onRetry={() => regenerate()} />
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="mx-auto w-full max-w-3xl p-4">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea placeholder={t('chat.placeholder')} disabled={isStreaming} />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              {providers.length > 0 && (
                <ModelSelector open={modelOpen} onOpenChange={setModelOpen}>
                  <ModelSelectorTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2" title={currentProvider?.label || t('llmProvider.label')}>
                      {currentProvider && <ModelSelectorLogo provider={currentProvider.id} className="size-4" />}
                      <span className="text-xs font-medium">{currentProvider?.label || t('llmProvider.label')}</span>
                    </Button>
                  </ModelSelectorTrigger>
                  <ModelSelectorContent title={t('llmProvider.label')}>
                    <p className="px-3 py-2 text-xs text-muted-foreground">{t('llmProvider.note')}</p>
                    <ModelSelectorInput placeholder={t('llmProvider.label')} />
                    <ModelSelectorList>
                      <ModelSelectorEmpty>—</ModelSelectorEmpty>
                      <ModelSelectorGroup heading={t('llmProvider.label')}>
                        {providers.map(p => (
                          <ModelSelectorItem
                            key={p.id}
                            value={`${p.id} ${p.label}`}
                            onSelect={() => { setProvider(p.id); setModelOpen(false); }}
                          >
                            <ModelSelectorLogo provider={p.id} />
                            <ModelSelectorName>{p.label}</ModelSelectorName>
                            {p.id === provider && <Check className="ms-auto size-4 text-primary" />}
                          </ModelSelectorItem>
                        ))}
                      </ModelSelectorGroup>
                    </ModelSelectorList>
                  </ModelSelectorContent>
                </ModelSelector>
              )}
              {sessionUsage.totalTokens > 0 && (
                <Context maxTokens={CONTEXT_WINDOW} usedTokens={sessionUsage.totalTokens} usage={sessionUsage}>
                  <ContextTrigger />
                  <ContextContent>
                    <ContextContentHeader />
                    <ContextContentBody>
                      <ContextInputUsage>
                        <UsageLine label="Input" tokens={sessionUsage.inputTokens} usd={sessionUsage.costInput} />
                      </ContextInputUsage>
                      <ContextOutputUsage>
                        <UsageLine label="Output" tokens={sessionUsage.outputTokens} usd={sessionUsage.costOutput} />
                      </ContextOutputUsage>
                    </ContextContentBody>
                    {sessionUsage.cost > 0 && (
                      <ContextContentFooter>
                        <span className="text-muted-foreground">{t('chat.totalTokens')}</span>
                        <span>{fmtUSD(sessionUsage.cost)}</span>
                      </ContextContentFooter>
                    )}
                  </ContextContent>
                </Context>
              )}
            </PromptInputTools>
            <PromptInputSubmit status={status} onStop={() => stop()} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </section>
  );
}

function AssistantParts({ msg, onApprove, t }: { msg: any; onApprove: (r: { id: string; approved: boolean }) => void; t: Translate }) {
  const parts: any[] = msg.parts || [];
  // A wrong-phase tool call (AI_NoSuchToolError) never executes — it surfaces as an
  // input-error/output-error part. Drop these: they're phase-lock noise, not real steps.
  // Genuine tool failures keep state 'output-available' with output.isError, so they stay.
  const isErroredToolPart = (p: any) => p.state === 'output-error' || p.state === 'input-error';
  const isReflectPart = (p: any) => {
    const name = partToolName(p);
    if (name?.startsWith('reflect_') && !KNOWN_REFLECT.has(name)) return false; // hallucinated reflect_*
    return isReflect(name);
  };

  // Single ordered pass: reflect steps AND data-tool cards go into the chain in the exact
  // order they streamed, so a fetch tool sits between the reason/observe steps that framed it.
  // Approval cards are pulled out (interactive — must stay visible even when the chain is collapsed).
  const chainItems: { kind: 'reflect' | 'tool'; part: any }[] = [];
  const approvals: any[] = [];
  for (const p of parts) {
    if (!isToolPart(p) || isErroredToolPart(p)) continue;
    if (isReflectPart(p)) { chainItems.push({ kind: 'reflect', part: p }); continue; }
    const name = partToolName(p);
    if (name?.startsWith('reflect_')) continue; // hallucinated reflect_* that isn't a real reflect
    if (p.state === 'approval-requested') { approvals.push(p); continue; }
    chainItems.push({ kind: 'tool', part: p });
  }
  const textParts = parts.filter(p => p.type === 'text' && p.text);

  const renderReflect = (p: any, key: number) => {
    const name = partToolName(p);
    const phase = name.startsWith('reflect_') ? name.split('_')[1] : (p.input?.phase || 'reason');
    const meta = REFLECT_META[phase] || REFLECT_META.reason;
    const stepText = p.input?.observation || p.input?.reason;
    const nextAction = p.input?.next_action;
    const stepStatus = p.state === 'input-streaming' ? 'active' : 'complete';
    const stepMs = p.output?.stepMs;
    const label = (
      <span className="flex items-center gap-2">
        {meta.label}
        {typeof stepMs === 'number' && (
          <span className="font-mono text-xs text-muted-foreground">{(stepMs / 1000).toFixed(1)}s</span>
        )}
      </span>
    );
    return (
      <ChainOfThoughtStep key={key} icon={meta.icon} label={label} status={stepStatus} description={stepText}>
        {nextAction && p.state === 'output-available' && (
          <div className="text-xs italic text-muted-foreground">→ {nextAction}</div>
        )}
      </ChainOfThoughtStep>
    );
  };

  const renderToolStep = (p: any, key: number) => {
    const name = shortToolName(partToolName(p));
    return (
      <ChainOfThoughtStep key={key} icon={Wrench} label={name} status={p.state === 'output-available' ? 'complete' : 'active'}>
        <Tool defaultOpen={false}>
          {p.type === 'dynamic-tool'
            ? <ToolHeader type="dynamic-tool" state={p.state} toolName={name} />
            : <ToolHeader type={p.type} state={p.state} title={name} />}
          <ToolContent>
            <ToolInput input={p.input} />
            <ToolOutput output={unwrapMcpOutput(p.output)} errorText={p.errorText} />
          </ToolContent>
        </Tool>
      </ChainOfThoughtStep>
    );
  };

  return (
    <>
      {chainItems.length > 0 && (
        <ChainOfThought defaultOpen>
          <ChainOfThoughtHeader>{t('chat.viewThinking')}</ChainOfThoughtHeader>
          <ChainOfThoughtContent>
            {chainItems.map((it, i) =>
              it.kind === 'reflect' ? renderReflect(it.part, i) : renderToolStep(it.part, i)
            )}
          </ChainOfThoughtContent>
        </ChainOfThought>
      )}

      {approvals.map((p, i) => (
        <ApprovalCard key={i} part={p} onApprove={onApprove} t={t} />
      ))}

      {textParts.map((p, i) => (
        <MessageResponse key={i}>{p.text}</MessageResponse>
      ))}
    </>
  );
}

function ApprovalCard({ part, onApprove, t }: { part: any; onApprove: (r: { id: string; approved: boolean }) => void; t: Translate }) {
  const name = shortToolName(partToolName(part));
  const args = part.input || {};
  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
      <div className="mb-2 flex items-center gap-2">
        <ShieldCheck className="size-4 text-primary" />
        <span className="text-sm font-semibold">{t('tools.approvalRequired')}</span>
      </div>
      <div className="mb-3 font-mono text-xs font-medium text-primary">{name}</div>
      {Object.keys(args).length > 0 && (
        <table className="mb-3 w-full overflow-hidden rounded-md border text-xs">
          <tbody>
            {Object.entries(args).map(([k, v]) => (
              <tr key={k} className="border-b last:border-b-0">
                <th className="w-1/3 border-e p-2 text-start font-medium capitalize text-muted-foreground align-top">{k.replace(/_/g, ' ')}</th>
                <td className="p-2 break-words">{v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onApprove({ id: part.approval.id, approved: true })}>
          <Check className="size-4" /> {t('tools.approve')}
        </Button>
        <Button size="sm" variant="destructive" onClick={() => onApprove({ id: part.approval.id, approved: false })}>
          <X className="size-4" /> {t('tools.deny')}
        </Button>
      </div>
    </div>
  );
}

const fmtUSD = (v?: number) =>
  typeof v === 'number'
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(v)
    : '—';

const fmtTokens = (n?: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact' }).format(n || 0);

function UsageLine({ label, tokens, usd }: { label: string; tokens?: number; usd?: number }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span>{fmtTokens(tokens)}<span className="ms-2 text-muted-foreground">• {fmtUSD(usd)}</span></span>
    </div>
  );
}

function MetaRow({ msg, timing, feedback, onFeedback, onRetry, t }: {
  msg: any; timing?: { start: number; end?: number }; feedback?: 'up' | 'down';
  onFeedback: (msg: any, dir: number) => void; onRetry: () => void; t: Translate;
}) {
  const usage = msg.metadata?.usage;
  const traceId = msg.metadata?.traceId;
  const cost = msg.metadata?.cost; // { total, input, output } USD, from tokens × Portkey pricing
  const text = (msg.parts || []).filter((p: any) => p.type === 'text' && p.text).map((p: any) => p.text).join('');
  const canFeedback = traceId && !!text;
  if (!(usage?.totalTokens > 0 || canFeedback)) return null;

  const seconds = timing?.end ? ((timing.end - timing.start) / 1000).toFixed(1) : null;

  return (
    <div className="flex w-full items-center gap-3 pt-1 text-xs text-muted-foreground">
      {usage?.totalTokens > 0 && (
        <Context maxTokens={CONTEXT_WINDOW} usedTokens={usage.totalTokens} usage={usage}>
          <ContextTrigger />
          <ContextContent>
            <ContextContentHeader />
            <ContextContentBody>
              <ContextInputUsage>
                <UsageLine label="Input" tokens={usage.inputTokens} usd={cost?.input} />
              </ContextInputUsage>
              <ContextOutputUsage>
                <UsageLine label="Output" tokens={usage.outputTokens} usd={cost?.output} />
              </ContextOutputUsage>
            </ContextContentBody>
            <ContextContentFooter>
              <span className="text-muted-foreground">{seconds ? `${seconds}s` : ''}</span>
              <span>{fmtUSD(cost?.total)}</span>
            </ContextContentFooter>
          </ContextContent>
        </Context>
      )}
      {canFeedback && (
        <MessageActions className="ms-auto">
          {traceId && (
            <MessageAction
              tooltip={t('feedback.viewTrace')}
              label="Trace"
              onClick={() => window.open(buildTraceUrl(traceId, timing?.end), '_blank', 'noopener,noreferrer')}
            >
              <img src="/images/portkey-light.svg" alt="" className="size-3.5 dark:hidden" />
              <img src="/images/portkey-dark.svg" alt="" className="hidden size-3.5 dark:block" />
            </MessageAction>
          )}
          <MessageAction tooltip={t('buttons.regenerate')} label="Retry" onClick={onRetry}>
            <RefreshCw className="size-3.5" />
          </MessageAction>
          <MessageAction tooltip={t('feedback.copy')} label="Copy" onClick={() => navigator.clipboard.writeText(text)}>
            <Copy className="size-3.5" />
          </MessageAction>
          <MessageAction
            tooltip={t('feedback.helpful')}
            label="Like"
            disabled={feedback === 'up'}
            className={feedback === 'up' ? 'text-primary' : ''}
            onClick={() => onFeedback(msg, 1)}
          >
            <ThumbsUp className="size-3.5" fill={feedback === 'up' ? 'currentColor' : 'none'} />
          </MessageAction>
          <MessageAction
            tooltip={t('feedback.notHelpful')}
            label="Dislike"
            disabled={feedback === 'down'}
            className={feedback === 'down' ? 'text-[color:var(--brand-orange)]' : ''}
            onClick={() => onFeedback(msg, -1)}
          >
            <ThumbsDown className="size-3.5" fill={feedback === 'down' ? 'currentColor' : 'none'} />
          </MessageAction>
        </MessageActions>
      )}
    </div>
  );
}

function PhaseDivider({ phase, t }: { phase: string; t: Translate }) {
  const color = phase === 'phase2' ? 'var(--brand-red)' : phase === 'phase3' ? 'var(--brand-blue)' : 'var(--brand-green)';
  return (
    <div className="my-2 flex items-center gap-2">
      <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
      <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide" style={{ color }}>{t(`phases.${phase}.label`)}</span>
      <span className="h-px flex-1" style={{ background: `color-mix(in srgb, ${color} 25%, transparent)` }} />
    </div>
  );
}

function StreamError({ error, airsConfig, t, onRetry }: { error: any; airsConfig: AirsConfig | null; t: Translate; onRetry?: () => void }) {
  const type = error?.type || '';
  const isGuardrail = type === 'guardrail_violation' || type === 'guardrail_scan_error';
  const isGuardrailConfig = type === 'guardrail_config_error';
  const reportUrl = isGuardrail ? buildReportUrl(airsConfig, { trId: error.tr_id }) : null;

  if (isGuardrailConfig) {
    return (
      <Message from="assistant">
        <MessageContent>
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <ShieldAlert className="mt-0.5 size-4 text-destructive" />
            <p>{t('guardrail.configError')}</p>
          </div>
        </MessageContent>
      </Message>
    );
  }

  if (isGuardrail) {
    const detected = error.prompt_detected || error.response_detected || error.detected;
    const isResponse = error.isResponseBlock || !!error.response_detected;
    const flags = detected ? Object.entries(detected).filter(([, v]) => v).map(([k]) => k.replace(/_/g, ' ')) : [];
    const issues = flags.join(', ');
    return (
      <Message from="assistant">
        <MessageContent>
          <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 size-4 text-destructive" />
              <p>
                {isResponse ? t('guardrail.cannotProvideResponse') : t('guardrail.cannotProcessRequest')}{' '}
                {issues ? t('guardrail.containsIssues', { issues }) : t('guardrail.policyViolation')}
              </p>
            </div>
            <p className="ps-6 text-muted-foreground">{isResponse ? t('guardrail.helpWithElse') : t('guardrail.rephraseRequest')}</p>
            {reportUrl && (
              <a href={reportUrl} target="_blank" rel="noopener noreferrer" className="ms-6 inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline">
                <ExternalLink className="size-3.5" /> {t('guardrail.viewReport')}
              </a>
            )}
          </div>
        </MessageContent>
      </Message>
    );
  }

  return (
    <Message from="assistant">
      <MessageContent>
        <div className="space-y-2 rounded-lg border p-3 text-sm" style={{ borderColor: 'color-mix(in srgb, var(--brand-orange) 30%, transparent)', background: 'color-mix(in srgb, var(--brand-orange) 8%, transparent)' }}>
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 text-[color:var(--brand-orange)]" />
            <p>{error?.message || t('guardrail.error')}</p>
          </div>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="size-3.5" /> {t('buttons.regenerate')}
            </Button>
          )}
        </div>
      </MessageContent>
    </Message>
  );
}
