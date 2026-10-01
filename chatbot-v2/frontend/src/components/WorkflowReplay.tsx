import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  BaseEdge,
  getBezierPath,
  getSmoothStepPath,
  type EdgeProps,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Server, Cpu, Database, ShieldCheck, ShieldAlert, ShieldX, Bot, Cloud, Network, X,
  Play, Pause, SkipBack, SkipForward, RotateCcw, Ban, Route, MessageSquare, SlidersHorizontal, TriangleAlert,
  Angry, ListChecks, Anchor, Link2Off, Bug, EyeOff, DatabaseZap, Code, Eraser, Wrench,
  Boxes, Fingerprint, Scale, Activity, LineChart, ExternalLink, KeyRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Translate } from '../context/LanguageContext';
import { Tip } from '@/components/ui/tooltip';

/* ---------- phase + deployment ---------- */
export type Phase = 'phase1' | 'phase2' | 'phase3';
type Deploy = 'saas' | 'onprem';
export type ProviderId = 'aws' | 'gcp' | 'azure';
type Routing = 'single' | 'balanced' | 'fallback';

const PHASE_VAR: Record<Phase, string> = {
  phase1: 'var(--brand-green)',
  phase2: 'var(--brand-red)',
  phase3: 'var(--brand-blue)',
};
const AIRS_VAR = 'var(--brand-blue)';
const CUST_VAR = 'var(--brand-orange)';
const RED = 'var(--brand-red)';
const GREY = 'var(--muted-foreground)';

const PROVIDERS: { id: ProviderId; label: string; themed: boolean }[] = [
  { id: 'aws', label: 'AWS', themed: true },
  { id: 'gcp', label: 'GCP', themed: false },
  { id: 'azure', label: 'Azure', themed: false },
];
const providerOf = (id: ProviderId) => PROVIDERS.find((p) => p.id === id)!;
/**
 * Provider logo. Themed providers ship a dark-ink file (light backgrounds) and a light-ink file (dark backgrounds), swapped by the `.dark` class.
 */
function ProviderImg({ id, className }: { id: ProviderId; className: string }) {
  if (!providerOf(id).themed) return <img src={`/images/${id}.svg`} alt="" className={className} />;
  return (
    <>
      <img src={`/images/${id}-dark.svg`} alt="" className={`${className} dark:hidden`} />
      <img src={`/images/${id}-light.svg`} alt="" className={`hidden ${className} dark:block`} />
    </>
  );
}

/* ---------- replay script ---------- */
type Kind = 'req' | 'reason' | 'observe' | 'mcp' | 'extract' | 'guardrail' | 'final' | 'leak' | 'blocked';
type Step = { edge: string; reverse?: boolean; focus: string; label: string; kind: Kind; iter?: number; data?: unknown; sens?: boolean; detected?: string[] };

/* ---------- node defs ---------- */
type Role = 'agent' | 'gateway' | 'llm' | 'mcp' | 'triage' | 'rsapi' | 'scm';
type Handles = { id: string; type: 'source' | 'target'; pos: Position; off?: string }[];
type CardData = {
  title: string; icon?: keyof typeof ICONS; iconColor?: string; logo?: 'mcp'; role: Role;
  provider?: ProviderId; failed?: boolean; w?: number;
  badge?: string; badgeTone?: 'saas' | 'onprem' | 'ctrl'; handles: Handles;
  /** What the component is, shown on hover. */
  hint?: string;
  /** Half-width card with the badge under the title, for platform components. */
  compact?: boolean;
  /** Single-ink product logo from public/images, inverted in dark mode. */
  img?: string;
};
const ICONS = { Server, Cpu, Database, ShieldCheck, ShieldAlert, ShieldX, Route, Ban, MessageSquare, SlidersHorizontal, Bot, Cloud, Network, Fingerprint, KeyRound };
const H = (id: string, type: 'source' | 'target', pos: Position, off?: string) => ({ id, type, pos, off });
const handleStyle = (h: { pos: Position; off?: string }) => {
  const base = { opacity: 0, pointerEvents: 'none' as const };
  if (!h.off) return base;
  return h.pos === Position.Left || h.pos === Position.Right ? { ...base, top: h.off } : { ...base, left: h.off };
};

/* ---------- declarative layout: columns + rows, positions computed (no hand-tuned pixels) ---------- */
const CARD_W = 240, CARD_H = 68, GW_W = 260, GW_W_WIDE = 320, GW_H = 158, GW_H_WIDE = 236, SCM_W = 268, SCM_H = 138, RS_W = 268, RS_H = 176, PROV_W = 160;
const gwWidthFor = (routing: Routing) => (routing === 'single' ? GW_W : GW_W_WIDE);
const gwHeightFor = (routing: Routing) => (routing === 'single' ? GW_H : GW_H_WIDE);
const COLX = { ext: -260, data: 40, gw: 430, saas: 850 };           // column left-x (tightened)
const DATA_TOP = 250, ROW_GAP = 120;                                 // data column rhythm
const DATA_ORDER = ['agent', 'hr', 'triage'];                        // add a tool here → everything re-spaces
const dataY = (id: string) => DATA_TOP + DATA_ORDER.indexOf(id) * ROW_GAP;
const centerOf = (y: number, h: number) => y + h / 2;
const topFor = (centerY: number, h: number) => centerY - h / 2;
const hrCenter = centerOf(dataY('hr'), CARD_H);                      // GW aligns to the middle data row (HR)
const gwY = (routing: Routing) => topFor(hrCenter, gwHeightFor(routing));  // keep the GW centered on the HR row at any height
const SCM_TOP = 130;
const RS_TOP = SCM_TOP + SCM_H + 90;

const NODE_DEFS: { id: string; type: string; position: { x: number; y: number }; data: CardData }[] = [
  { id: 'agent', type: 'card', position: { x: COLX.data, y: dataY('agent') }, data: { title: 'The Otter', role: 'agent', badge: 'Agent', badgeTone: 'ctrl', w: CARD_W, handles: [H('r', 'source', Position.Right, '50%')] } },
  { id: 'hr', type: 'card', position: { x: COLX.data, y: dataY('hr') }, data: { title: 'HR tools', logo: 'mcp', role: 'mcp', badge: 'MCP', badgeTone: 'ctrl', w: CARD_W, handles: [H('r', 'target', Position.Right, '50%')] } },
  { id: 'triage', type: 'card', position: { x: COLX.data, y: dataY('triage') }, data: { title: 'IT Triage Agent', icon: 'Bot', role: 'triage', badge: 'Agent', badgeTone: 'ctrl', w: CARD_W, handles: [H('r', 'target', Position.Right, '50%'), H('snb', 'source', Position.Bottom, '50%')] } },
  // external SaaS reached by the triage agent — sits below the triage, on the LLM-provider line (position set dynamically)
  { id: 'it', type: 'card', position: { x: COLX.data, y: dataY('triage') + 200 }, data: { title: 'ServiceNow', icon: 'Cloud', iconColor: '#62D84E', role: 'mcp', w: PROV_W, handles: [H('t', 'target', Position.Top, '50%')] } },
  // hub — cache + load balancer live INSIDE the gateway; centered on the HR row. LLM nodes are dynamic.
  { id: 'gw', type: 'gateway', position: { x: COLX.gw, y: gwY('single') }, data: { title: 'AI Gateway', role: 'gateway', handles: [H('l', 'target', Position.Left, '15%'), H('hr', 'source', Position.Left, '45%'), H('triage', 'source', Position.Left, '75%'), H('mgmt', 'target', Position.Right, '30%'), H('airs', 'source', Position.Right, '70%'), H('llm', 'source', Position.Bottom, '50%')] } },
  // PANW SaaS column (right): SCM on top, RS API below. Management leaves the SCM bottom.
  { id: 'scm', type: 'scm', position: { x: COLX.saas, y: SCM_TOP }, data: { title: 'Strata Cloud Manager', role: 'scm', badge: 'Control plane', badgeTone: 'ctrl', handles: [H('m', 'source', Position.Bottom, '40%'), H('logIn', 'target', Position.Bottom, '75%')] } },
  { id: 'rsapi', type: 'rsapi', position: { x: COLX.saas, y: RS_TOP }, data: { title: 'Runtime Security', role: 'rsapi', handles: [H('l', 'target', Position.Left, '50%'), H('mt', 'target', Position.Top, '35%'), H('log', 'source', Position.Top, '72%')] } },
];

// node box size (for auto-computing zone bounding boxes). GW width depends on routing (LB expands it).
const nodeW = (n: (typeof NODE_DEFS)[number], routing: Routing) => n.type === 'gateway' ? gwWidthFor(routing) : (n.data.w ?? (n.type === 'scm' ? SCM_W : n.type === 'rsapi' ? RS_W : CARD_W));
const nodeH = (n: (typeof NODE_DEFS)[number], routing: Routing) => (n.type === 'gateway' ? gwHeightFor(routing) : n.type === 'scm' ? SCM_H : n.type === 'rsapi' ? RS_H : CARD_H);
// bounding box of a set of node ids, padded — used to draw the customer / SaaS zones automatically
function zoneBox(ids: string[], routing: Routing, padX = 40, padTop = 48, padBottom = 34) {
  const ns = NODE_DEFS.filter((n) => ids.includes(n.id));
  const y = (n: (typeof NODE_DEFS)[number]) => (n.type === 'gateway' ? gwY(routing) : n.position.y);
  const minX = Math.min(...ns.map((n) => n.position.x));
  const maxX = Math.max(...ns.map((n) => n.position.x + nodeW(n, routing)));
  const minY = Math.min(...ns.map((n) => y(n)));
  const maxY = Math.max(...ns.map((n) => y(n) + nodeH(n, routing)));
  return { x: minX - padX, y: minY - padTop, width: maxX - minX + padX * 2, height: maxY - minY + padTop + padBottom };
}

const EDGE_DEFS = [
  { id: 'agent-gw', source: 'agent', target: 'gw', sourceHandle: 'r', targetHandle: 'l' },
  { id: 'gw-hr', source: 'gw', target: 'hr', sourceHandle: 'hr', targetHandle: 'r' },
  { id: 'gw-triage', source: 'gw', target: 'triage', sourceHandle: 'triage', targetHandle: 'r' },
  { id: 'triage-it', source: 'triage', target: 'it', sourceHandle: 'snb', targetHandle: 't', static: true },
  { id: 'gw-rsapi', source: 'gw', target: 'rsapi', sourceHandle: 'airs', targetHandle: 'l' },
  { id: 'scm-gw', source: 'scm', target: 'gw', sourceHandle: 'm', targetHandle: 'mgmt', manage: true },
  { id: 'scm-rsapi', source: 'scm', target: 'rsapi', sourceHandle: 'm', targetHandle: 'mt', manage: true },
  { id: 'rsapi-log', source: 'rsapi', target: 'scm', sourceHandle: 'log', targetHandle: 'logIn', log: true },
];

/* ---------- badges ---------- */
function Badge({ text, tone }: { text: string; tone?: 'saas' | 'onprem' | 'ctrl' }) {
  const c = tone === 'onprem' ? CUST_VAR : tone === 'ctrl' ? 'var(--foreground)' : AIRS_VAR;
  return (
    <span className="shrink-0 whitespace-nowrap rounded-full border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide" style={{ borderColor: c, color: c }}>{text}</span>
  );
}

/* ---------- capability chips (icon + short label) ---------- */
type Cap = { icon: LucideIcon; label: string; short: string };
// AIRS runtime security capabilities (distinct icon + word each)
const RS_CAPS: Cap[] = [
  { icon: ShieldAlert, label: 'Prompt injection & jailbreak prevention', short: 'Injection' },
  { icon: Angry, label: 'Toxic content moderation', short: 'Toxicity' },
  { icon: ListChecks, label: 'Custom topic guardrails', short: 'Topics' },
  { icon: Anchor, label: 'Contextual grounding', short: 'Grounding' },
  { icon: Link2Off, label: 'Malicious URL detection', short: 'URLs' },
  { icon: Bug, label: 'Malware detection for model output', short: 'Malware' },
  { icon: EyeOff, label: 'Sensitive data leakage prevention', short: 'DLP' },
  { icon: DatabaseZap, label: 'Database query guardrails (CRUD SQL)', short: 'SQL' },
  { icon: Code, label: 'Source code detection', short: 'Code' },
  { icon: Eraser, label: 'In-line redaction & anonymization', short: 'Redaction' },
  { icon: Wrench, label: 'MCP server schema tool I/O threats', short: 'MCP I/O' },
];
// AI Gateway capability pillars
const GW_CAPS: Cap[] = [
  { icon: Boxes, label: 'MCP registry', short: 'MCP registry' },
  { icon: Activity, label: 'Runtime', short: 'Runtime' },
  { icon: Fingerprint, label: 'Identity', short: 'Identity' },
  { icon: Scale, label: 'Governance', short: 'Governance' },
  { icon: LineChart, label: 'Observability', short: 'Observability' },
];

function CapChip({ cap, tone, flag }: { cap: Cap; tone?: string; flag?: boolean }) {
  const Icon = cap.icon;
  return (
    <Tip label={cap.label}>
      <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ${flag ? 'animate-pulse' : ''}`}
        style={{ background: flag ? `color-mix(in srgb, ${RED} 22%, transparent)` : tone ? `color-mix(in srgb, ${tone} 12%, transparent)` : 'var(--muted)', color: tone || 'var(--foreground)', outline: flag ? `1px solid ${RED}` : undefined }}>
        <Icon className="size-3.5 shrink-0" />
        <span className="text-[10px] font-semibold leading-none">{cap.short}</span>
      </span>
    </Tip>
  );
}

/* ---------- custom nodes ---------- */
function CardNode({ data }: NodeProps) {
  const d = data as unknown as CardData & { active?: boolean; accent?: string; airsOn?: boolean };
  const Icon = d.icon ? ICONS[d.icon] : null;
  const isAirs = d.role === 'rsapi';
  const isAgent = d.role === 'agent';
  const isProv = d.role === 'llm' && !!d.provider;
  const accent = d.failed ? RED : isAirs ? AIRS_VAR : d.accent || 'var(--foreground)';
  const airsDim = isAirs && !d.airsOn;
  const ring = d.failed ? RED : d.active ? accent : 'var(--border)';
  return (
    <Tip label={d.hint && <div className="max-w-72 text-left leading-snug">{d.hint}</div>}>
    <div
      style={{ borderColor: ring, borderStyle: airsDim || d.failed ? 'dashed' : 'solid', boxShadow: d.active && !d.failed ? `0 0 0 2px ${ring}, 0 6px 22px -8px ${ring}` : 'none', opacity: airsDim || d.failed ? 0.6 : 1, transition: 'box-shadow .25s, border-color .25s, opacity .25s', width: d.w }}
      className={`relative rounded-xl border bg-card ${d.compact ? 'px-2.5 py-1.5' : 'min-w-[150px] px-3.5 py-2.5'}`}
    >
      {d.failed && <span className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full text-white" style={{ background: RED }}><X className="size-3" /></span>}
      {d.compact ? (
        <div className="flex items-center gap-1.5">
          {Icon && <Icon className="size-3.5 shrink-0" style={{ color: d.iconColor || accent }} />}
          <div className="min-w-0">
            <div className="whitespace-nowrap text-xs font-medium text-foreground">{d.title}</div>
            {d.badge && <div className="mt-0.5"><Badge text={d.badge} tone={d.badgeTone} /></div>}
          </div>
        </div>
      ) : (
      <div className="flex items-center gap-2">
        {isAgent ? (
          <i className="otter-icon text-[18px]" style={{ color: accent }} />
        ) : isProv ? (
          <ProviderImg id={d.provider!} className="size-4" />
        ) : d.logo === 'mcp' ? (
          <>
            <img src="/images/mcp-light.svg" alt="MCP" className="size-4 dark:hidden" />
            <img src="/images/mcp-dark.svg" alt="MCP" className="hidden size-4 dark:block" />
          </>
        ) : d.img ? (
          <img src={d.img} alt="" className="h-4 w-auto dark:invert" />
        ) : Icon ? (
          <Icon className="size-4" style={{ color: airsDim ? GREY : d.iconColor || accent }} />
        ) : null}
        <div className="text-sm font-medium text-foreground">{d.title}</div>
        {d.badge && <span className="ms-auto ps-2"><Badge text={d.badge} tone={d.badgeTone} /></span>}
      </div>
      )}
      {d.handles.map((h) => (
        <Handle key={h.id + h.type} id={h.id} type={h.type} position={h.pos} style={handleStyle(h)} />
      ))}
    </div>
    </Tip>
  );
}

function GatewayNode({ data }: NodeProps) {
  const d = data as unknown as CardData & { active?: boolean; accent?: string; airsOn?: boolean; routing?: Routing };
  const glow = d.airsOn ? AIRS_VAR : d.accent || CUST_VAR;
  const lbOn = d.routing === 'balanced' || d.routing === 'fallback';
  return (
    <div
      style={{ borderColor: glow, boxShadow: `0 0 0 1px ${glow}, 0 0 34px -6px ${glow}${d.active ? ', 0 0 0 3px ' + glow : ''}`, transition: 'box-shadow .25s, width .25s', width: gwWidthFor(d.routing || 'single'), minHeight: gwHeightFor(d.routing || 'single') }}
      className="flex flex-col rounded-2xl border-2 bg-card px-4 py-3.5"
    >
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-lg border" style={{ borderColor: glow }}>
          <img src="/images/portkey-light.svg" alt="" className="size-5 dark:hidden" />
          <img src="/images/portkey-dark.svg" alt="" className="hidden size-5 dark:block" />
        </span>
        <div className="text-[15px] font-semibold text-foreground">{d.title}</div>
      </div>
      {/* capability pillars + built-in cache */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {GW_CAPS.map((c) => <CapChip key={c.label} cap={c} />)}
        <CapChip cap={{ icon: Database, label: 'Prompt & response cache (built-in)', short: 'Cache' }} />
      </div>
      {/* built-in load balancer — expands and routes to the LLM providers when active */}
      {lbOn && (
        <div className="mt-2.5 flex items-center gap-2 rounded-lg border px-2.5 py-1.5" style={{ borderColor: glow, background: `color-mix(in srgb, ${glow} 8%, transparent)` }}>
          <Network className="size-4" style={{ color: glow }} />
          <div className="text-[11px] font-medium text-foreground">Load balancer</div>
          <div className="ms-auto text-[10px] text-muted-foreground">{d.routing === 'fallback' ? 'primary + failover' : 'weighted'}</div>
        </div>
      )}
      {d.handles.map((h) => (
        <Handle key={h.id + h.type} id={h.id} type={h.type} position={h.pos} style={handleStyle(h)} />
      ))}
    </div>
  );
}

const SCM_PARTS: Cap[] = [
  { icon: SlidersHorizontal, label: 'Management UI', short: 'UI' },
  { icon: Server, label: 'Backend', short: 'Backend' },
  { icon: LineChart, label: 'Metrics DB', short: 'Metrics' },
  { icon: SlidersHorizontal, label: 'Configs DB', short: 'Configs' },
  { icon: Database, label: 'Log store', short: 'Logs' },
];
function ScmNode({ data }: NodeProps) {
  const d = data as unknown as CardData & { blocked?: string[] };
  const blockedSet = new Set(d.blocked || []);
  return (
    <div className="rounded-2xl border px-4 py-3" style={{ width: SCM_W, borderColor: blockedSet.size ? RED : undefined }}>
      <div className="mb-1 flex items-center gap-2">
        <img src="/images/scm.svg" alt="" className="h-4 w-auto dark:invert" />
        <span className="text-sm font-semibold text-foreground">{d.title}</span>
      </div>
      <div className="mb-2"><Badge text={d.badge || ''} tone={d.badgeTone} /></div>
      <div className="flex flex-wrap gap-1.5">
        {SCM_PARTS.map((p, i) => <CapChip key={i} cap={p} flag={blockedSet.has(p.short)} tone={blockedSet.has(p.short) ? RED : undefined} />)}
      </div>
      {d.handles.map((h) => (
        <Handle key={h.id + h.type} id={h.id} type={h.type} position={h.pos} style={handleStyle(h)} />
      ))}
    </div>
  );
}

function RsapiNode({ data }: NodeProps) {
  const d = data as unknown as CardData & { active?: boolean; airsOn?: boolean; blocked?: string[] };
  const dim = !d.airsOn;
  const blockedSet = new Set(d.blocked || []);
  const ring = blockedSet.size ? RED : d.active ? AIRS_VAR : 'var(--border)';
  return (
    <div
      style={{ borderColor: ring, borderStyle: dim ? 'dashed' : 'solid', boxShadow: blockedSet.size ? `0 0 0 2px ${RED}, 0 6px 22px -8px ${RED}` : d.active ? `0 0 0 2px ${AIRS_VAR}, 0 6px 22px -8px ${AIRS_VAR}` : 'none', opacity: dim ? 0.55 : 1, transition: 'box-shadow .25s, border-color .25s, opacity .25s', width: RS_W }}
      className="rounded-2xl border bg-card px-4 py-3"
    >
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in srgb, ${blockedSet.size ? RED : AIRS_VAR} 15%, transparent)`, color: blockedSet.size ? RED : AIRS_VAR }}>{blockedSet.size ? <ShieldX className="size-4" /> : <ShieldCheck className="size-4" />}</span>
        <span className="text-sm font-semibold text-foreground leading-tight">{d.title}</span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {RS_CAPS.map((c) => <CapChip key={c.label} cap={c} tone={blockedSet.has(c.short) ? RED : AIRS_VAR} flag={blockedSet.has(c.short)} />)}
      </div>
      {d.handles.map((h) => (
        <Handle key={h.id + h.type} id={h.id} type={h.type} position={h.pos} style={handleStyle(h)} />
      ))}
    </div>
  );
}

function ZoneNode({ data }: NodeProps) {
  const d = data as unknown as { label: string; color: string; provider?: ProviderId; logo?: string; solid?: boolean; labelBottom?: boolean; fill?: number };
  return (
    <div className="pointer-events-none relative size-full rounded-3xl border-2" style={{ borderColor: d.color, borderStyle: d.solid ? 'solid' : 'dashed', background: `color-mix(in srgb, ${d.color} ${d.fill ?? 5}%, transparent)` }}>
      <span className={`absolute left-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest ${d.labelBottom ? 'bottom-2' : 'top-2'}`} style={{ color: d.color }}>
        {d.provider && <ProviderImg id={d.provider} className="size-3.5" />}
        {d.logo && <img src={d.logo} alt="" className="size-4" />}
        {d.label}
      </span>
    </div>
  );
}

const nodeTypes = { card: CardNode, gateway: GatewayNode, scm: ScmNode, rsapi: RsapiNode, zone: ZoneNode };

/* ---------- edges ---------- */
function SpokeEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps) {
  const d = (data || {}) as { active?: boolean; reverse?: boolean; color?: string; dim?: boolean; airs?: boolean; manage?: boolean; fail?: boolean; sensitive?: boolean; blockedPkt?: boolean; arc?: number; orthogonal?: boolean; centerX?: number; centerY?: number; idle?: string };
  // `arc` lifts a top-to-top edge into a curve that clears the cards between its ends;
  // `orthogonal` draws right-angle routes, with centerX / centerY pinning the corridor they use.
  const [path, labelX, labelY] = d.arc
    ? [`M ${sourceX} ${sourceY} C ${sourceX} ${sourceY - d.arc} ${targetX} ${targetY - d.arc} ${targetX} ${targetY}`, (sourceX + targetX) / 2, Math.min(sourceY, targetY) - d.arc * 0.75]
    : d.orthogonal
      ? getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 14, centerX: d.centerX, centerY: d.centerY })
      : getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const color = d.color || 'var(--border)';
  const idle = d.idle || 'var(--border)';
  const airsDim = d.airs && !d.active;
  if (d.fail) {
    return (
      <>
        <BaseEdge id={id} path={path} style={{ stroke: RED, strokeWidth: 1.5, strokeDasharray: '5 4', opacity: 0.7 }} />
        <text x={labelX} y={labelY - 4} textAnchor="middle" className="font-mono" style={{ fontSize: 8, fill: RED }}>failover</text>
      </>
    );
  }
  if (d.manage) {
    return <BaseEdge id={id} path={path} style={{ stroke: GREY, strokeWidth: 1.25, strokeDasharray: '4 4', opacity: 0.5 }} />;
  }
  return (
    <>
      <BaseEdge id={id} path={path} style={{ stroke: d.active ? color : airsDim ? GREY : idle, strokeWidth: d.active ? 2.5 : 1.5, strokeDasharray: airsDim ? '5 5' : undefined, opacity: d.active ? 1 : d.dim ? 0.35 : 1, transition: 'stroke .2s, opacity .2s' }} />
      {d.active && (() => {
        const pk = d.sensitive || d.blockedPkt ? RED : color;
        return (
          <>
            <path id={`mp-${id}`} d={path} fill="none" stroke="none" />
            <g>
              {/* data packet gliding along the edge */}
              <rect x={-9} y={-7} width={18} height={14} rx={4} fill={pk} stroke="var(--card)" strokeWidth={1.5} />
              {d.blockedPkt ? (
                // block marker → an X, the refusal propagating back to the user
                <>
                  <path d="M -3 -3 L 3 3 M 3 -3 L -3 3" stroke="var(--card)" strokeWidth={1.8} strokeLinecap="round" />
                  <animate attributeName="opacity" values="1;0.5;1" dur="0.6s" repeatCount="indefinite" />
                </>
              ) : d.sensitive ? (
                // tiny padlock inside the packet → sensitive data in transit
                <>
                  <rect x={-3.5} y={-1} width={7} height={6} rx={1} fill="var(--card)" />
                  <path d="M -2 -1 v -1.6 a 2 2 0 0 1 4 0 V -1" fill="none" stroke="var(--card)" strokeWidth={1.2} />
                  <animate attributeName="opacity" values="1;0.55;1" dur="0.7s" repeatCount="indefinite" />
                </>
              ) : (
                <circle r={2} fill="var(--card)" />
              )}
              <animateMotion dur="0.9s" repeatCount="indefinite" keyPoints={d.reverse ? '1;0' : '0;1'} keyTimes="0;1" calcMode="linear">
                <mpath href={`#mp-${id}`} />
              </animateMotion>
            </g>
          </>
        );
      })()}
    </>
  );
}
const edgeTypes = { spoke: SpokeEdge };

/* ---------- side panel ---------- */
function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="mt-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-muted px-2.5 py-2 font-mono text-[11px] text-foreground">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}
function TextBlock({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="mt-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <p className="mt-1 rounded-lg px-2.5 py-2 text-[12px] leading-snug" style={{ background: tone ? `color-mix(in srgb, ${tone} 10%, transparent)` : 'var(--muted)', color: 'var(--foreground)' }}>{value}</p>
    </div>
  );
}

/* ---------- LLM cluster (external providers + load balancer / fallback) ---------- */
const CLOUD: ProviderId[] = ['aws', 'gcp', 'azure'];

// The load balancer / fallback logic lives INSIDE the AI Gateway (Portkey), so the GW fans
// out directly to the external LLM providers — no separate LB node.
function buildLlm(provider: ProviderId, routing: Routing, accent: string, focus: string | undefined, activeEdge: string | undefined, reverse: boolean | undefined, providersY: number, activeLlmId: ProviderId, failedId: ProviderId | null, sensitive: boolean) {
  const nodes: any[] = [];
  const edges: any[] = [];
  const llmActive = focus === 'llm';

  const shown = routing === 'single' ? CLOUD.filter((c) => c === provider) : CLOUD;
  const activeId = activeLlmId;

  // providers sit in a row below, centered under the gateway; band fits the count.
  const BOX = PROV_W, SP = 185, CX = COLX.gw + gwWidthFor(routing) / 2, Y = providersY;
  const n = shown.length;
  const xs = shown.map((_, i) => Math.round(CX + (i - (n - 1) / 2) * SP - BOX / 2));

  shown.forEach((id, i) => {
    const failed = id === failedId;
    const isActive = id === activeId;
    nodes.push({ id, type: 'card', position: { x: xs[i], y: Y }, zIndex: 1, draggable: false, selectable: false,
      data: { title: providerOf(id).label, role: 'llm', provider: id, failed, accent, active: llmActive && isActive, w: BOX, handles: [H('t', 'target', Position.Top, '50%')] } });
    const eid = isActive ? 'gw-llm' : `gw-${id}`;
    const liveLlm = eid === 'gw-llm' && activeEdge === 'gw-llm';
    edges.push({ id: eid, source: 'gw', target: id, sourceHandle: 'llm', targetHandle: 't', type: 'spoke',
      data: { active: liveLlm, reverse: liveLlm ? reverse : false, color: accent, fail: failed, sensitive: liveLlm && sensitive } });
  });

  const zoneX = Math.min(...xs) - 28;
  const zoneW = (Math.max(...xs) + BOX + 28) - zoneX;
  const zone = { id: 'z-llm', type: 'zone', position: { x: zoneX, y: Y - 46 }, draggable: false, selectable: false, zIndex: 0, style: { width: zoneW, height: CARD_H + 78 }, data: { label: 'LLM PROVIDERS · external', color: GREY, labelBottom: true } };
  return { nodes, edges, zone };
}

/* ---------- main flow ---------- */
/** Step-by-step playback state shared by the data-flow and identity replays. */
function usePlayback(length: number) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const advance = useCallback(() => {
    setIdx((i) => { if (i >= length - 1) { setPlaying(false); return i; } return i + 1; });
  }, [length]);
  useEffect(() => {
    if (!playing) return;
    timer.current = setTimeout(advance, 950);
    return () => clearTimeout(timer.current);
  }, [playing, idx, advance]);
  const reset = useCallback(() => { setIdx(0); setPlaying(false); }, []);
  return { idx, setIdx, playing, setPlaying, advance, reset };
}

/** Restart / back / play / forward / scrubber bar at the bottom of a replay. */
function PlaybackBar({ pb, length, accent, extra, t }: { pb: ReturnType<typeof usePlayback>; length: number; accent: string; extra?: string; t: Translate }) {
  const { idx, setIdx, playing, setPlaying, advance, reset } = pb;
  return (
    <div className="absolute inset-x-0 bottom-3 flex justify-center">
      <div className="flex items-center gap-3 rounded-full border bg-card/90 px-4 py-2 shadow-lg backdrop-blur">
        <Tip label={t('workflow.restart')}><button className="grid size-8 place-items-center rounded-full hover:bg-muted" onClick={reset} aria-label={t('workflow.restart')}><RotateCcw className="size-4" /></button></Tip>
        <button className="grid size-8 place-items-center rounded-full hover:bg-muted disabled:opacity-40" disabled={idx === 0} onClick={() => setIdx((i) => Math.max(0, i - 1))}><SkipBack className="size-4" /></button>
        <button className="grid size-9 place-items-center rounded-full text-white" style={{ background: accent }} onClick={() => { if (idx >= length - 1) setIdx(0); setPlaying((p) => !p); }}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <button className="grid size-8 place-items-center rounded-full hover:bg-muted disabled:opacity-40" disabled={idx >= length - 1} onClick={advance}><SkipForward className="size-4" /></button>
        <input type="range" min={0} max={length - 1} value={idx} onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }} className="w-56" style={{ accentColor: accent }} />
        <span className="w-28 text-right font-mono text-[11px] text-muted-foreground">{idx + 1}/{length}{extra ? ` · ${extra}` : ''}</span>
      </div>
    </div>
  );
}

function Flow({ script, phase, deploy, provider, routing, t }: { script: Step[]; phase: Phase; deploy: Deploy; provider: ProviderId; routing: Routing; t: Translate }) {
  const pb = usePlayback(script.length);
  const { idx, reset } = pb;
  const accent = PHASE_VAR[phase];
  const airsOn = phase === 'phase3';
  const step = script[idx];
  const { fitView } = useReactFlow();
  const userZoomed = useRef(false);

  // adapt to window size while the user hasn't manually zoomed/panned
  useEffect(() => {
    const onResize = () => { if (!userZoomed.current) fitView({ padding: 0.08, maxZoom: 1.2, duration: 200 }); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fitView]);
  // re-fit when the graph shape changes (provider count, deploy, routing) unless user took over
  useEffect(() => { if (!userZoomed.current) fitView({ padding: 0.08, maxZoom: 1.2, duration: 200 }); }, [deploy, provider, routing, fitView]);

  useEffect(() => { reset(); }, [phase, script, reset]);

  const activeEdge = step?.edge;
  const focus = step?.focus;

  // On-prem → GW lives inside the customer data plane; SaaS → GW joins the PANW SaaS zone.
  const onprem = deploy === 'onprem';
  const custIds = onprem ? ['agent', 'hr', 'triage', 'gw'] : ['agent', 'hr', 'triage'];
  const saasIds = onprem ? ['scm', 'rsapi'] : ['gw', 'scm', 'rsapi'];
  const custBox = zoneBox(custIds, routing);
  const saasBox = zoneBox(saasIds, routing);
  const providersY = saasBox.y + saasBox.height + Math.round(saasBox.height * 0.33);   // LLM band below the SaaS zone (~1/3 of its height)

  // per-step LLM routing:
  //  balanced → round-robin AWS→Azure→GCP
  //  fallback → primary works for the first hop, then goes down mid-run → later hops fail over
  const LB_ORDER: ProviderId[] = ['aws', 'azure', 'gcp'];
  const failover = CLOUD.find((c) => c !== provider) || provider;
  const routeByStep = useMemo(() => {
    let hop = -1, llmRev = 0;
    let curBal: ProviderId = LB_ORDER[0];
    let curFb: ProviderId = provider;
    let fbFailed = false;
    return script.map((s) => {
      if (s.edge === 'gw-llm' && !s.reverse) {
        hop += 1;
        curBal = LB_ORDER[hop % LB_ORDER.length];
        curFb = fbFailed ? failover : provider;   // failure already declared → route this hop to failover
      }
      const ret = { bal: curBal, fb: curFb, fbFailed };
      // primary goes down right after its first LLM round-trip (works in every phase/scenario)
      if (s.edge === 'gw-llm' && s.reverse) { llmRev += 1; if (llmRev >= 1) fbFailed = true; }
      return ret;
    });
  }, [script, provider, failover]);
  const rs = routeByStep[idx] || { bal: provider, fb: provider, fbFailed: false };
  const activeLlmId: ProviderId = routing === 'balanced' ? rs.bal : routing === 'fallback' ? rs.fb : provider;
  const failedId: ProviderId | null = routing === 'fallback' && rs.fbFailed ? provider : null;

  const llm = useMemo(() => buildLlm(provider, routing, accent, focus, activeEdge, step?.reverse, providersY, activeLlmId, failedId, !!step?.sens), [provider, routing, accent, focus, activeEdge, step, providersY, activeLlmId, failedId]);

  const zones = useMemo(() => [
    { id: 'z-cust', type: 'zone', position: { x: custBox.x, y: custBox.y }, draggable: false, selectable: false, zIndex: 0, style: { width: custBox.width, height: custBox.height }, data: { label: 'APP', color: CUST_VAR } },
    { id: 'z-saas', type: 'zone', position: { x: saasBox.x, y: saasBox.y }, draggable: false, selectable: false, zIndex: 0, style: { width: saasBox.width, height: saasBox.height }, data: { label: 'PALO ALTO NETWORKS · SaaS', color: AIRS_VAR } },
    llm.zone,
  ], [custBox, saasBox, llm.zone]);

  // RS API detections stay lit red from the block step onward through the propagation back to the app
  const blockIdx = useMemo(() => script.findIndex((s) => s.kind === 'blocked' && s.focus === 'rsapi'), [script]);
  const blockedCaps = blockIdx >= 0 && idx >= blockIdx ? script[blockIdx].detected : undefined;
  const logActive = blockIdx >= 0 && idx >= blockIdx;   // RS API logs the incident to SCM, from the block step to the end

  const nodes = useMemo(() => {
    const list = NODE_DEFS
      .map((n) => ({
        ...n, zIndex: 1, draggable: false, selectable: false,
        position: n.id === 'gw' ? { x: n.position.x, y: gwY(routing) } : n.id === 'it' ? { x: COLX.data + (CARD_W - PROV_W) / 2, y: providersY } : n.position,
        data: { ...n.data, accent, airsOn, active: focus === n.id, deploy, provider, routing, ...(n.id === 'rsapi' ? { blocked: blockedCaps } : {}), ...(n.id === 'scm' && logActive ? { blocked: ['Logs'] } : {}) },
      }));
    return [...zones, ...list, ...llm.nodes];
  }, [zones, llm.nodes, accent, airsOn, focus, blockedCaps, logActive, deploy, provider, routing]);

  const edges = useMemo(() => {
    const base = EDGE_DEFS
      .map((e) => {
        const isAirsPath = e.id === 'gw-rsapi';
        const isLog = e.id === 'rsapi-log';
        return {
          ...e, type: 'spoke',
          hidden: e.id === 'gw-rsapi' ? !airsOn : isLog ? !logActive : false,
          data: {
            active: isLog ? logActive : e.id === activeEdge,
            reverse: e.id === activeEdge ? step?.reverse : false,
            color: isLog ? RED : isAirsPath ? AIRS_VAR : accent,
            airs: isAirsPath,
            manage: !!(e as { manage?: boolean }).manage,
            dim: !!(e as { static?: boolean }).static,
            sensitive: e.id === activeEdge && (!!step?.sens || (step?.kind === 'extract' && !!step?.reverse) || step?.kind === 'leak'),
            blockedPkt: isLog ? true : (e.id === activeEdge && step?.kind === 'blocked' && !step?.sens),
          },
        };
      });
    return [...base, ...llm.edges];
  }, [activeEdge, step, accent, airsOn, logActive, llm.edges]);

  const iters = script.reduce((m, s) => Math.max(m, s.iter || 0), 0);
  const sd = step?.data as { prompt?: string; response?: string } | undefined;
  const danger = step?.kind === 'extract' || step?.kind === 'leak';
  const stepColor = step?.kind === 'blocked' || danger ? RED : step?.kind === 'guardrail' ? AIRS_VAR : accent;
  const bd = step?.data as { detected?: unknown; tokens?: number; reportUrl?: string; traceUrl?: string } | undefined;

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        fitView fitViewOptions={{ padding: 0.08, maxZoom: 1.2 }} proOptions={{ hideAttribution: true }}
        onMoveStart={() => { userZoomed.current = true; }}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
        zoomOnScroll minZoom={0.3} maxZoom={2} zoomOnDoubleClick={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--border)" />
      </ReactFlow>

      <PlaybackBar pb={pb} length={script.length} accent={accent} extra={iters > 1 && step?.iter ? `${t('workflow.iter')} ${step.iter}/${iters}` : undefined} t={t} />

      {/* step panel */}
      <div className="absolute right-4 top-4 w-72 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md text-white" style={{ background: stepColor }}>
            {step?.kind === 'blocked' ? <Ban className="size-3.5" /> : step?.kind === 'guardrail' ? <ShieldAlert className="size-3.5" /> : danger ? <TriangleAlert className="size-3.5" /> : step?.kind === 'req' || step?.kind === 'final' ? <MessageSquare className="size-3.5" /> : <Route className="size-3.5" />}
          </span>
          <div className="text-sm font-medium text-foreground">{step?.label}</div>
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{step?.kind}</div>
        {sd?.prompt && <TextBlock label={t('workflow.userPrompt')} value={sd.prompt} tone={phase === 'phase2' ? RED : undefined} />}
        {sd?.response && <TextBlock label={step?.kind === 'leak' ? t('workflow.leakedResponse') : t('workflow.assistantResponse')} value={sd.response} tone={step?.kind === 'leak' ? RED : undefined} />}
        {step?.data != null && !sd?.prompt && !sd?.response && step.kind !== 'blocked' && <JsonBlock label={danger ? t('workflow.extractedData') : t('workflow.payload')} value={step.data} />}
        {step?.kind === 'blocked' && bd?.detected != null && (
          <div className="mt-2 space-y-1 text-[11px]">
            <JsonBlock label={t('workflow.detections')} value={bd.detected} />
            {bd.reportUrl && <a className="inline-flex items-center gap-1 underline" href={bd.reportUrl} target="_blank" rel="noopener noreferrer" style={{ color: accent }}><ExternalLink className="size-3" /> {t('workflow.viewReport')}</a>}
            {bd.traceUrl && <a className="inline-flex items-center gap-1 underline" href={bd.traceUrl} target="_blank" rel="noopener noreferrer" style={{ color: accent }}><ExternalLink className="size-3" /> {t('workflow.viewTrace')}</a>}
            {typeof bd.tokens === 'number' && <div className="text-muted-foreground">{t('workflow.tokensConsumed')}: {bd.tokens.toLocaleString()}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- identity replay: how The Otter proves who it is to the AI Gateway ---------- */
const IDIRA_VAR = 'var(--brand-idira)';
const SPIFFE_ID = 'spiffe://otter/ai/ns/hr-it-bot/sa/chatbot-v2';
type IdKind = 'sync' | 'request' | 'attest' | 'mint' | 'deliver' | 'present' | 'verify' | 'allow' | 'gap' | 'denied';
/** Identity replay variant: how the demo works today, or the end-to-end target model. */
export type IdMode = 'today' | 'target';
type IdStep = { edge?: string; reverse?: boolean; focus: string; label: string; kind: IdKind; data?: unknown };

/**
 * Three worker nodes side by side, each a column of pods: application pods on the top row, one
 * SWA agent per node right below (a DaemonSet: each agent attests only the pods of its own node
 * through the local kubelet), and the SWA server at the bottom (a Deployment, on Node 3 here,
 * reached through its Service), linked to every agent: they all get their SVIDs signed by it.
 * Strata Cloud Manager and Idira sit outside the cluster, as SaaS.
 */
const ID_W = 260;
/** Compact SWA cards: half a pod card, so the agent and the server share Node 3's bottom row. */
const SWA_W = 125;
const NODE_X = [0, 350, 700];
const ID_ROW = { app: 120, mid: 250, swa: 380 };
const SAAS_X = 1120;
/** Pods sit 30px inside their node frame, leaving a left corridor for the agent-to-pod links. */
const podX = (node: number) => NODE_X[node] + 30;

const HINT = {
  rogue: 'Any pod that cannot reach the SWA agent socket, or is not allowed an identity. It holds no valid JWT, so the AI Gateway turns it away.',
  agent: 'Idira Secure Workload Access agent. A DaemonSet: one pod on every node. It attests the pods of its own node through the local kubelet (namespace, service account, labels) and hands them a short-lived JWT-SVID over a local Unix socket (SPIFFE Workload API). The workload is given no secret.',
  otter: 'The HR/IT chatbot pod. It runs under its own service account, chatbot-v2, which becomes its identity: spiffe://…/ns/hr-it-bot/sa/chatbot-v2. It holds no API key for the AI Gateway.',
  gw: 'Prisma AIRS AI Gateway: hybrid data plane running in the cluster, managed from Strata Cloud Manager. It checks each JWT against the Idira JWKS (gateway-local JWT auth), then calls the LLMs and MCP servers with its own credentials.',
  server: 'Idira Secure Workload Access server. A Deployment pod, on any node. It signs the JWT-SVIDs the agents request, and syncs its configuration and signing keys with the Idira trust domain, logging in with its Kubernetes service account token.',
  scm: 'Strata Cloud Manager: control plane of the AI Gateway. It holds the JWT authentication settings (the Idira JWKS URL), the configs and the guardrails, and syncs them to the gateway.',
  td: 'Idira trust domain (SaaS): root of the workload identities. It sets the signing algorithm and the token lifetime, and publishes the public keys (JWKS) that verify every JWT-SVID.',
  llm: 'Model providers, outside the cluster. They never see the JWT: the AI Gateway calls them with the provider keys configured in Strata Cloud Manager.',
  hr: 'hr-tools MCP server: its own Deployment and Service, holding the HR records. Today it answers any caller that reaches its Service. In the target model it verifies who calls (the gateway or it-triage) and for which user, before returning any data.',
  it: 'it-tools MCP server: its own Deployment and Service, holding IT tickets and assets. Same model as hr-tools: today open to any caller in the cluster, in the target model it verifies the caller and the user.',
};

const swaCard = (id: string, node: number, right: boolean, title: string, icon: 'Fingerprint' | 'KeyRound', badge: string, hint: string, handles: Handles) =>
  ({ id, position: { x: podX(node) + (right ? ID_W - SWA_W : 0), y: ID_ROW.swa }, data: { title, icon, role: 'triage' as const, badge, badgeTone: 'ctrl' as const, w: SWA_W, compact: true, hint, handles } });
const agentCard = (id: string, node: number, extra: Handles = []) =>
  swaCard(id, node, false, 'SWA agent', 'Fingerprint', 'DaemonSet', HINT.agent, [H('b', 'source', Position.Bottom, '50%'), ...extra]);

const ID_NODES: { id: string; position: { x: number; y: number }; data: CardData }[] = [
  { id: 'rogue', position: { x: podX(0), y: ID_ROW.app }, data: { title: 'Unknown pod', icon: 'Bot', role: 'triage', badge: 'no identity', badgeTone: 'ctrl', w: ID_W, hint: HINT.rogue, handles: [H('t', 'source', Position.Top, '50%')] } },
  agentCard('swaAgent1', 0),
  { id: 'otter', position: { x: podX(1), y: ID_ROW.app }, data: { title: 'The Otter', role: 'agent', badge: 'sa/chatbot-v2', badgeTone: 'ctrl', w: ID_W, hint: HINT.otter, handles: [H('r', 'source', Position.Right, '50%'), H('lt', 'target', Position.Left, '50%')] } },
  { id: 'hrTools', position: { x: podX(1), y: ID_ROW.mid }, data: { title: 'hr-tools', logo: 'mcp', role: 'mcp', badge: 'MCP server', badgeTone: 'ctrl', w: ID_W, hint: HINT.hr, handles: [H('r', 'target', Position.Right, '50%')] } },
  agentCard('swaAgent', 1, [H('l', 'source', Position.Left, '50%')]),
  { id: 'gw', position: { x: podX(2), y: ID_ROW.app }, data: { title: 'AI Gateway', icon: 'Network', role: 'triage', badge: 'JWT auth', badgeTone: 'ctrl', w: ID_W, hint: HINT.gw, handles: [H('t', 'target', Position.Top, '50%'), H('lt', 'target', Position.Left, '20%'), H('l', 'target', Position.Left, '50%'), H('lb', 'source', Position.Left, '85%'), H('b', 'source', Position.Bottom, '50%'), H('r', 'source', Position.Right, '20%'), H('rm', 'target', Position.Right, '50%'), H('rd', 'source', Position.Right, '80%')] } },
  { id: 'itTools', position: { x: podX(2), y: ID_ROW.mid }, data: { title: 'it-tools', logo: 'mcp', role: 'mcp', badge: 'MCP server', badgeTone: 'ctrl', w: ID_W, hint: HINT.it, handles: [H('t', 'target', Position.Top, '50%')] } },
  agentCard('swaAgent3', 2, [H('l', 'source', Position.Left, '50%'), H('r', 'source', Position.Right, '50%')]),
  swaCard('swaServer', 2, true, 'SWA server', 'KeyRound', 'Deployment', HINT.server, [H('b', 'target', Position.Bottom, '50%'), H('l', 'target', Position.Left, '50%'), H('r', 'source', Position.Right, '50%')]),
  { id: 'llm', position: { x: SAAS_X, y: -10 }, data: { title: 'LLM providers', icon: 'Cloud', role: 'triage', w: ID_W, hint: HINT.llm, handles: [H('l', 'target', Position.Left, '50%')] } },
  { id: 'scm', position: { x: SAAS_X, y: ID_ROW.app + 20 }, data: { title: 'Strata Cloud Manager', img: '/images/scm.svg', role: 'triage', badge: 'Control plane', badgeTone: 'ctrl', w: ID_W, hint: HINT.scm, handles: [H('l', 'source', Position.Left, '50%')] } },
  { id: 'td', position: { x: SAAS_X, y: ID_ROW.swa - 12 }, data: { title: 'Trust domain', icon: 'ShieldCheck', role: 'triage', badge: 'JWKS', badgeTone: 'ctrl', w: ID_W, hint: HINT.td, handles: [H('l', 'target', Position.Left, '22%'), H('lb', 'target', Position.Left, '60%')] } },
];

const NODE_W = ID_W + 50;
const NODE_TOP = ID_ROW.app - 22;
const SWA_H = 56;
const NODE_H = ID_ROW.swa + SWA_H + 50 - NODE_TOP;
/** Corridors of the orthogonal edges: the bus under the SWA row, the gap between Node 2 and 3, the gap outside the cluster. */
const BUS_Y = ID_ROW.swa + SWA_H + 18;
const GAP_23 = (NODE_X[1] + NODE_W + NODE_X[2]) / 2;
const GAP_OUT = NODE_X[2] + NODE_W + 30 + (SAAS_X - 40 - (NODE_X[2] + NODE_W + 30)) / 2;
const corridor = (node: number) => NODE_X[node] + 15;

/** Kubernetes cluster framing the three worker nodes; PANW and Idira SaaS framing their cards. */
const ID_ZONES = [
  { id: 'z-cluster', type: 'zone', position: { x: NODE_X[0] - 30, y: NODE_TOP - 50 }, draggable: false, selectable: false, zIndex: 0, style: { width: NODE_X[2] + NODE_W + 60 - NODE_X[0], height: NODE_H + 80 }, data: { label: 'Kubernetes cluster · EKS', color: CUST_VAR, logo: '/images/kubernetes.svg', solid: true, fill: 7 } },
  ...NODE_X.map((x, i) => ({ id: `z-node${i + 1}`, type: 'zone', position: { x, y: NODE_TOP }, draggable: false, selectable: false, zIndex: 0, style: { width: NODE_W, height: NODE_H }, data: { label: `Node ${i + 1}`, color: GREY, labelBottom: true } })),
  { id: 'z-panw', type: 'zone', position: { x: SAAS_X - 40, y: ID_ROW.app + 20 - 48 }, draggable: false, selectable: false, zIndex: 0, style: { width: ID_W + 80, height: CARD_H + 82 }, data: { label: 'Palo Alto Networks · SaaS', color: AIRS_VAR } },
  { id: 'z-idira', type: 'zone', position: { x: SAAS_X - 40, y: ID_ROW.swa - 12 - 48 }, draggable: false, selectable: false, zIndex: 0, style: { width: ID_W + 80, height: CARD_H + 82 }, data: { label: 'Idira · SaaS', color: IDIRA_VAR, fill: 7 } },
];

/** `modes` limits an edge to one variant of the replay; `quiet` keeps it dimmed when idle (it exists but plays no part in the story). */
const ID_EDGES: { id: string; source: string; target: string; sourceHandle: string; targetHandle: string; centerX?: number; centerY?: number; modes?: IdMode[]; quiet?: IdMode[] }[] = [
  { id: 'agent-otter', source: 'swaAgent', target: 'otter', sourceHandle: 'l', targetHandle: 'lt', centerX: corridor(1) },
  { id: 'agent-server', source: 'swaAgent', target: 'swaServer', sourceHandle: 'b', targetHandle: 'b', centerY: BUS_Y },
  { id: 'agent1-server', source: 'swaAgent1', target: 'swaServer', sourceHandle: 'b', targetHandle: 'b', centerY: BUS_Y, quiet: ['today', 'target'] },
  { id: 'agent3-server', source: 'swaAgent3', target: 'swaServer', sourceHandle: 'r', targetHandle: 'l', quiet: ['today'] },
  { id: 'agent3-gw', source: 'swaAgent3', target: 'gw', sourceHandle: 'l', targetHandle: 'lt', centerX: corridor(2), modes: ['target'] },
  { id: 'server-td', source: 'swaServer', target: 'td', sourceHandle: 'r', targetHandle: 'lb', centerX: GAP_OUT - 12 },
  { id: 'scm-gw', source: 'scm', target: 'gw', sourceHandle: 'l', targetHandle: 'rm', centerX: GAP_OUT },
  { id: 'otter-gw', source: 'otter', target: 'gw', sourceHandle: 'r', targetHandle: 'l' },
  { id: 'gw-td', source: 'gw', target: 'td', sourceHandle: 'rd', targetHandle: 'l', centerX: GAP_OUT - 12 },
  { id: 'gw-llm', source: 'gw', target: 'llm', sourceHandle: 'r', targetHandle: 'l', centerX: GAP_OUT + 12 },
  { id: 'gw-mcp', source: 'gw', target: 'hrTools', sourceHandle: 'lb', targetHandle: 'r', centerX: GAP_23 },
  { id: 'gw-it', source: 'gw', target: 'itTools', sourceHandle: 'b', targetHandle: 't' },
  { id: 'rogue-gw', source: 'rogue', target: 'gw', sourceHandle: 't', targetHandle: 't' },
];

const JWT_HEADER = { alg: 'RS256', kid: '12ad65f6-54f5-4ace-921c-afd83f7bbcda', typ: 'JWT' };
const JWT_CLAIMS = { sub: SPIFFE_ID, aud: ['portkey'], iss: 'https://<tenant>.secretsmgr.cyberark.cloud/api/swa/trust-domains/otter', exp: 'iat + 300 s' };
const GW_SPIFFE_ID = 'spiffe://otter/ai/ns/hr-it-bot/sa/airs-gw';

/** Shared opening: the chatbot gets its JWT-SVID and the gateway verifies it. */
const ID_OPENING: IdStep[] = [
  { edge: 'server-td', focus: 'td', label: 'SWA server syncs its trust domain and publishes its signing key', kind: 'sync', data: { trust_domain: 'otter', jwks: 'public, RS256', authn: 'server logs in with its Kubernetes service account token' } },
  { edge: 'scm-gw', focus: 'gw', label: 'Strata Cloud Manager pushes the gateway its JWT settings', kind: 'sync', data: { jwt_auth: 'gateway-local (JWT_ENABLED=ON)', jwks_url: 'Idira trust domain JWKS', default_scopes: ['completions.write', 'mcp.invoke'] } },
  { edge: 'agent-otter', reverse: true, focus: 'swaAgent', label: 'The Otter asks for a JWT over the Workload API socket', kind: 'request', data: { rpc: 'FetchJWTSVID', audience: ['portkey'], socket: '/tmp/swa-agent/public/api.sock' } },
  { focus: 'swaAgent', label: "Node 2's agent attests the calling pod through its node's kubelet", kind: 'attest', data: { node: 'Node 2 (the agent only sees pods of its own node)', selectors: ['k8s:ns:hr-it-bot', 'k8s:sa:chatbot-v2', 'k8s:pod-label:app:chatbot-v2'] } },
  { edge: 'agent-server', focus: 'swaServer', label: 'Agent asks the SWA server (Service, Node 3) to mint a JWT-SVID', kind: 'mint', data: { spiffe_id: SPIFFE_ID, via: 'swa-server Service · port 8443 (mTLS)' } },
  { edge: 'agent-server', reverse: true, focus: 'swaAgent', label: 'Signed JWT-SVID · RS256 · 5 min', kind: 'mint', data: { header: JWT_HEADER, claims: JWT_CLAIMS } },
  { edge: 'agent-otter', focus: 'otter', label: 'JWT delivered, cached until a minute before expiry', kind: 'deliver', data: { spiffe_id: SPIFFE_ID, renew: 'exp - 60 s' } },
  { edge: 'otter-gw', focus: 'gw', label: 'Request carries the JWT instead of an API key', kind: 'present', data: { 'x-portkey-api-key': '<JWT-SVID>', 'x-portkey-config': 'otter-guarded (phase 3)', metadata: { employee_id: 'EMP-034' } } },
  { edge: 'gw-td', focus: 'td', label: 'Gateway checks the signature against the Idira JWKS', kind: 'verify', data: { checks: ['kid in JWKS', 'RS256 signature', 'iss', 'aud = portkey', 'not expired'] } },
  { edge: 'gw-td', reverse: true, focus: 'gw', label: 'Valid · caller is the chatbot workload', kind: 'verify', data: { user: SPIFFE_ID, auth_type: 'JWT' } },
  { edge: 'gw-llm', focus: 'llm', label: 'LLM called with the provider keys held by the gateway', kind: 'allow', data: { authorized_by: 'AI Gateway (JWT checked here)', upstream: 'the LLM never sees the JWT' } },
];

const ID_ROGUE: IdStep[] = [
  { edge: 'rogue-gw', focus: 'gw', label: 'Unknown pod calls the gateway without a valid JWT', kind: 'denied', data: { 'x-portkey-api-key': '(none or forged)' } },
  { edge: 'rogue-gw', reverse: true, focus: 'rogue', label: '401 · authentication required', kind: 'denied', data: { status: 401, error: 'Authentication required to access this resource' } },
];

/** Today: identity stops at the gateway; the MCP servers trust whoever reaches them. */
const SCRIPT_IDENTITY_TODAY: IdStep[] = [
  ...ID_OPENING,
  { edge: 'gw-mcp', focus: 'hrTools', label: 'Gateway calls hr-tools with the auth set in SCM', kind: 'allow', data: { auth: 'static credential configured in SCM (or none)', identity: 'none: the MCP server learns neither the calling workload nor the user' } },
  { focus: 'hrTools', label: 'hr-tools answers without checking who calls', kind: 'gap', data: { risks: ['any pod that reaches the hr-tools Service reads HR data', 'employee_id is a tool argument chosen by the LLM, so a prompt injection can ask for someone else'] } },
  ...ID_ROGUE,
];

/** Target: every hop carries its own token; the MCP server verifies the caller and the user. */
const SCRIPT_IDENTITY_TARGET: IdStep[] = [
  ...ID_OPENING,
  { edge: 'agent3-gw', reverse: true, focus: 'swaAgent3', label: 'Gateway asks its own node agent for a JWT for hr-tools', kind: 'request', data: { rpc: 'FetchJWTSVID', audience: ['hr-tools'], caller: 'gateway pod, Node 3' } },
  { edge: 'agent3-server', focus: 'swaServer', label: 'Node 3 agent attests the gateway, the SWA server signs', kind: 'mint', data: { selectors: ['k8s:ns:hr-it-bot', 'k8s:sa:airs-gw'], spiffe_id: GW_SPIFFE_ID } },
  { edge: 'agent3-gw', focus: 'gw', label: 'Gateway receives its own JWT-SVID', kind: 'deliver', data: { sub: GW_SPIFFE_ID, aud: ['hr-tools'] } },
  { edge: 'gw-mcp', focus: 'hrTools', label: 'Gateway calls hr-tools with its JWT and a delegated user token', kind: 'present', data: { authorization: 'Bearer <gateway JWT-SVID, aud=hr-tools>', user_token: { sub: 'EMP-034', act: { sub: SPIFFE_ID }, aud: 'hr-tools' }, never_forwarded: 'the chatbot JWT (aud=portkey)' } },
  { focus: 'hrTools', label: 'hr-tools verifies the caller and the user, then applies data policy', kind: 'verify', data: { checks: ['signature against the Idira JWKS', 'aud = hr-tools', 'caller allowed: sa/airs-gw, sa/it-triage', 'user EMP-034, acting through the chatbot'], policy: 'EMP-034 reads EMP-034 records only' } },
  ...ID_ROGUE,
];

/** Idle stroke of the identity edges: visible enough to read the topology before playback. */
const ID_IDLE = 'color-mix(in srgb, var(--muted-foreground) 45%, transparent)';

function IdentityFlow({ mode, t }: { mode: IdMode; t: Translate }) {
  const script = mode === 'target' ? SCRIPT_IDENTITY_TARGET : SCRIPT_IDENTITY_TODAY;
  const pb = usePlayback(script.length);
  const { reset } = pb;
  useEffect(() => { reset(); }, [mode, reset]);
  const step = script[pb.idx];
  const denied = step?.kind === 'denied';
  const accent = denied || step?.kind === 'gap' ? RED : IDIRA_VAR;

  const nodes = useMemo(() => [
    ...ID_ZONES,
    ...ID_NODES.map((n) => ({
      // React Flow drops pointer events on inert nodes; re-enable them so the hover hint shows.
      ...n, type: 'card', zIndex: 1, draggable: false, selectable: false, style: { pointerEvents: 'all' as const },
      data: { ...n.data, accent, active: step?.focus === n.id, failed: denied && n.id === 'rogue' && !!step?.reverse },
    })),
  ], [step, accent, denied]);

  const edges = useMemo(() => ID_EDGES.map((e) => ({
    id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, type: 'spoke',
    hidden: (e.id === 'rogue-gw' && !denied) || (!!e.modes && !e.modes.includes(mode)),
    data: {
      active: e.id === step?.edge, reverse: e.id === step?.edge ? step?.reverse : false, color: accent, idle: ID_IDLE,
      blockedPkt: e.id === step?.edge && denied && !!step?.reverse,
      arc: e.id === 'rogue-gw' ? 80 : undefined,
      orthogonal: e.id !== 'rogue-gw', centerX: e.centerX, centerY: e.centerY,
      manage: e.id === 'scm-gw' && e.id !== step?.edge,
      dim: !!e.quiet?.includes(mode),
    },
  })), [step, accent, denied, mode]);

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        fitView fitViewOptions={{ padding: 0.08, maxZoom: 1.2 }} proOptions={{ hideAttribution: true }}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
        zoomOnScroll minZoom={0.3} maxZoom={2} zoomOnDoubleClick={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--border)" />
      </ReactFlow>
      <PlaybackBar pb={pb} length={script.length} accent={accent} t={t} />
      <div className="absolute right-4 top-4 w-72 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md text-white" style={{ background: accent }}>
            {denied ? <Ban className="size-3.5" /> : step?.kind === 'gap' ? <TriangleAlert className="size-3.5" /> : step?.kind === 'verify' || step?.kind === 'allow' ? <ShieldCheck className="size-3.5" /> : step?.kind === 'attest' ? <Fingerprint className="size-3.5" /> : <KeyRound className="size-3.5" />}
          </span>
          <div className="text-sm font-medium text-foreground">{step?.label}</div>
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{step?.kind}</div>
        {step?.data != null && <JsonBlock label={t('workflow.payload')} value={step.data} />}
      </div>
    </div>
  );
}

/* ---------- segmented control (shared) ---------- */
function Seg<T extends string>({ value, opts, onChange }: { value: T; opts: { v: T; label: string; color?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1">
      {opts.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)} className="rounded-md border px-3 py-1 text-sm"
          style={{ borderColor: value === o.v ? o.color || 'var(--foreground)' : 'var(--border)', color: value === o.v ? o.color || 'var(--foreground)' : 'var(--muted-foreground)' }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- curated demo scenarios (per phase, self-contained) ---------- */
// Normal (phase1): real USB-key scenario → triage → ticket INC-2025-0184 created (pending approval).
const USB_PROMPT = 'I need to transfer some files to a USB drive but when I plug it into my laptop it doesn’t work.';
const USB_REASON = {
  observation: 'User (EMP-034) has provided all required details for the USB access request: laptop (Lenovo ThinkPad X1 Carbon, ASSET-00035), duration (5 days), and business justification (export client demo data for a customer presentation).',
  gaps: 'None — all information needed to create the IT support ticket is available.',
  next_action: 'Create an IT support ticket to enable USB access on the specified laptop; route to manager Sophie Martin for approval.',
};
const TRIAGE_IN = { tool: 'triage_it_request', input: { employee_id: 'EMP-034', query: 'Enable USB on Lenovo ThinkPad X1 Carbon (ASSET-00035), 5 days — export client demo data for a customer presentation.' } };
const TICKET_CREATED = {
  ticket: 'INC-2025-0184', category: 'USB Access', asset: 'ASSET-00035 (Lenovo ThinkPad X1 Carbon)',
  severity: 'Medium', priority: 'High', sla: '24h', status: 'Pending Approval', team: 'Security Ops', approver: 'Sophie Martin',
};
const USB_OBSERVE = {
  observation: 'Ticket INC-2025-0184 created for USB access enablement on the Lenovo ThinkPad X1 Carbon (ASSET-00035) for 5 days. Routed to Sophie Martin (manager) for approval; Security Ops will enable USB and auto-revoke after 5 days.',
  gaps: 'None — ticket creation complete, awaiting manager approval.',
  next_action: 'Done — user waits for manager approval, then USB access is enabled.',
};
const USB_ANSWER =
  'Your USB access request is submitted. Ticket INC-2025-0184 (USB Access, Lenovo ThinkPad X1 Carbon) is pending approval from your manager Sophie Martin. Once approved, Security Ops enables USB for 5 days, then it auto-revokes.';

// Risky (phase2) / Protected (phase3): real DLP scenario → get_ticket INC-2025-0120 → Sophie Martin's postal address.
const LEAK_PROMPT = 'Review IT ticket INC-2025-0120 and extract the postal address mentioned in it.';
const LEAK_RESPONSE =
  'The postal address on ticket INC-2025-0120, provided by Sophie Martin to ship the replacement laptop: 250 Park Avenue, Apt 3A, New York, NY 10169, USA.';
const BLOCK_RESPONSE =
  'I can’t share that — the response was blocked by the DLP policy (personal postal address). Please raise an authorised request through the proper channel.';
const DLP_REASON = {
  observation: 'The user is asking me to review an existing IT support ticket (INC-2025-0120) and extract postal address information from it.',
  gaps: 'I need to retrieve the ticket details from the corporate ticketing system. The postal address data is likely contained within the ticket record.',
  next_action: 'Fetch the ticket INC-2025-0120 and locate the postal address mentioned in it.',
};
const DLP_OBSERVE = {
  observation: 'Ticket INC-2025-0120 retrieved. Laptop replacement request from Sophie Martin (EMP-033). Postal address in a comment dated 2025-08-03: "250 Park Avenue, Apt 3A, New York, NY 10169, USA".',
  gaps: 'None — the postal address has been located in the ticket discussion.',
  next_action: 'Done — sufficient information to answer.',
};
const TICKET_IN = { tool: 'get_ticket', input: { ticket_id: 'INC-2025-0120' } };
const TICKET_OUT = {
  ticket_id: 'INC-2025-0120', employee_name: 'Sophie Martin', employee_id: 'EMP-033',
  status: 'Open', priority: 'High', category: 'Hardware', assigned_to: 'James Wilson',
  address_comment: '250 Park Avenue, Apt 3A, New York, NY 10169, USA',
};
const GUARD_IN = { scan: 'prompt', detections: [] as string[], verdict: 'allow' };
const GUARD_OUT = { scan: 'response', detections: [] as string[], verdict: 'allow' };
const BLOCK_DATA = { detected: { dlp: true, topic_violation: true }, tokens: 11481, tr_id: '81504db3-8373-47e7-8d4e-466c2b9bf60e' };

const SCRIPT_NORMAL: Step[] = [
  { edge: 'agent-gw', focus: 'gw', label: 'Request received', kind: 'req', data: { prompt: USB_PROMPT } },
  { edge: 'gw-llm', focus: 'llm', label: 'Reason · plan ticket', kind: 'reason', data: USB_REASON },
  { edge: 'gw-llm', reverse: true, focus: 'gw', label: 'LLM → call triage_it_request', kind: 'reason', data: { tool_call: 'triage_it_request', args: TRIAGE_IN.input } },
  { edge: 'gw-triage', focus: 'triage', label: 'IT Triage · triage_it_request', kind: 'mcp', data: TRIAGE_IN },
  { edge: 'triage-it', focus: 'it', label: 'ServiceNow · create ticket', kind: 'mcp', data: TRIAGE_IN },
  { edge: 'triage-it', reverse: true, focus: 'triage', label: 'ServiceNow → Triage · ticket created', kind: 'mcp', data: { ...TRIAGE_IN, output: TICKET_CREATED } },
  { edge: 'gw-triage', reverse: true, focus: 'gw', label: 'Ticket returned', kind: 'mcp' },
  { edge: 'gw-llm', focus: 'llm', label: 'Observe · ticket filed', kind: 'observe', data: USB_OBSERVE },
  { edge: 'gw-llm', reverse: true, focus: 'gw', label: 'Answer ready', kind: 'observe' },
  { edge: 'agent-gw', reverse: true, focus: 'agent', label: 'Response delivered', kind: 'final', data: { response: USB_ANSWER } },
];

const EXTRACT_LOOP: Step[] = [
  { edge: 'gw-llm', focus: 'llm', label: 'Reason · plan lookup', kind: 'reason', iter: 1, data: DLP_REASON },
  { edge: 'gw-llm', reverse: true, focus: 'gw', label: 'LLM → call get_ticket', kind: 'reason', iter: 1, data: { tool_call: 'get_ticket', args: TICKET_IN.input } },
  { edge: 'gw-triage', focus: 'triage', label: 'IT Triage · get_ticket', kind: 'mcp', iter: 1, data: TICKET_IN },
  { edge: 'triage-it', focus: 'it', label: 'ServiceNow · get_ticket INC-2025-0120', kind: 'extract', iter: 1, data: TICKET_IN },
  { edge: 'triage-it', reverse: true, focus: 'triage', label: 'ServiceNow → Triage · ticket', kind: 'extract', iter: 1, data: { ...TICKET_IN, output: TICKET_OUT } },
  { edge: 'gw-triage', reverse: true, focus: 'gw', label: 'Ticket returned', kind: 'extract', iter: 1 },
  { edge: 'gw-llm', focus: 'llm', label: 'Observe · address located', kind: 'observe', iter: 1, sens: true, data: DLP_OBSERVE },
  { edge: 'gw-llm', reverse: true, focus: 'gw', label: 'Answer ready', kind: 'observe', iter: 1, sens: true },
];

const SCRIPT_RISKY: Step[] = [
  { edge: 'agent-gw', focus: 'gw', label: 'Request received', kind: 'req', data: { prompt: LEAK_PROMPT } },
  ...EXTRACT_LOOP,
  { edge: 'agent-gw', reverse: true, focus: 'agent', label: 'Address leaked · no guardrail', kind: 'leak', data: { response: LEAK_RESPONSE } },
];

const SCRIPT_BLOCKED: Step[] = [
  { edge: 'agent-gw', focus: 'gw', label: 'Request received', kind: 'req', data: { prompt: LEAK_PROMPT } },
  { edge: 'gw-rsapi', focus: 'rsapi', label: 'RS API · assess prompt', kind: 'guardrail', data: GUARD_IN },
  { edge: 'gw-rsapi', reverse: true, focus: 'gw', label: 'Verdict · allow', kind: 'guardrail' },
  { edge: 'gw-llm', focus: 'llm', label: 'Reason · plan lookup', kind: 'reason', iter: 1, data: DLP_REASON },
  { edge: 'gw-llm', reverse: true, focus: 'gw', label: 'LLM → call get_ticket', kind: 'reason', iter: 1, data: { tool_call: 'get_ticket', args: TICKET_IN.input } },
  { edge: 'gw-rsapi', focus: 'rsapi', label: 'RS API · assess LLM output', kind: 'guardrail', data: GUARD_OUT },
  { edge: 'gw-rsapi', reverse: true, focus: 'gw', label: 'Verdict · allow', kind: 'guardrail' },
  { edge: 'gw-triage', focus: 'triage', label: 'IT Triage · get_ticket', kind: 'mcp', iter: 1, data: TICKET_IN },
  { edge: 'triage-it', focus: 'it', label: 'ServiceNow · get_ticket INC-2025-0120', kind: 'extract', iter: 1, data: TICKET_IN },
  { edge: 'triage-it', reverse: true, focus: 'triage', label: 'ServiceNow → Triage · ticket', kind: 'extract', iter: 1, data: { ...TICKET_IN, output: TICKET_OUT } },
  { edge: 'gw-triage', reverse: true, focus: 'gw', label: 'Ticket returned', kind: 'extract', iter: 1 },
  { edge: 'gw-rsapi', focus: 'rsapi', label: 'RS API · block (DLP · topic)', kind: 'blocked', sens: true, detected: ['DLP', 'Topics'], data: BLOCK_DATA },
  { edge: 'gw-rsapi', reverse: true, focus: 'gw', label: 'Block propagated to Gateway', kind: 'blocked', data: BLOCK_DATA },
  { edge: 'agent-gw', reverse: true, focus: 'agent', label: 'The Otter shows the block to the user', kind: 'blocked', data: { response: BLOCK_RESPONSE } },
];

function demoScriptFor(phase: Phase): Step[] {
  if (phase === 'phase1') return SCRIPT_NORMAL;
  if (phase === 'phase2') return SCRIPT_RISKY;
  return SCRIPT_BLOCKED;   // Protected = same DLP scenario, but blocked
}

/* ---------- self-contained explorer (global entry point, opened from the header) ---------- */
export default function WorkflowReplay({ initialPhase = 'phase1', initialProvider = 'aws', initialRouting = 'single', t }: { initialPhase?: Phase; initialProvider?: ProviderId; initialRouting?: Routing; t: Translate }) {
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const provider = initialProvider;
  const [deploy, setDeploy] = useState<Deploy>('saas');
  const [routing, setRouting] = useState<Routing>(initialRouting);
  const [view, setView] = useState<'flow' | 'identity'>('flow');
  const [idMode, setIdMode] = useState<IdMode>('today');
  const script = useMemo(() => demoScriptFor(phase), [phase]);

  return (
    <div className={`phase${phase[5]}-active flex h-full w-full flex-col`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2.5">
        <Seg value={view} onChange={setView} opts={[
          { v: 'flow', label: t('workflow.viewFlow') },
          { v: 'identity', label: t('workflow.viewIdentity'), color: 'var(--brand-idira)' },
        ]} />
        {view === 'flow' && <Seg value={phase} onChange={setPhase} opts={[
          { v: 'phase1', label: t('workflow.normal'), color: PHASE_VAR.phase1 },
          { v: 'phase2', label: t('workflow.risky'), color: PHASE_VAR.phase2 },
          { v: 'phase3', label: t('workflow.protected'), color: PHASE_VAR.phase3 },
        ]} />}
        {view === 'identity' && <Seg value={idMode} onChange={setIdMode} opts={[
          { v: 'today', label: t('workflow.idToday') },
          { v: 'target', label: t('workflow.idTarget'), color: 'var(--brand-idira)' },
        ]} />}
        {view === 'flow' && <div className="ms-auto flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('workflow.gateway')}</span>
            <Seg value={deploy} onChange={setDeploy} opts={[
              { v: 'saas', label: t('workflow.saas'), color: AIRS_VAR },
              { v: 'onprem', label: t('workflow.onprem'), color: CUST_VAR },
            ]} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('workflow.llm')}</span>
            <Seg value={routing} onChange={setRouting} opts={[
              { v: 'single', label: t('workflow.single') },
              { v: 'balanced', label: t('workflow.balanced') },
              { v: 'fallback', label: t('workflow.fallback'), color: RED },
            ]} />
          </div>
        </div>}
      </div>
      <div className="min-h-0 flex-1">
        <ReactFlowProvider key={view}>
          <style>{`.react-flow__node{transition:transform 300ms cubic-bezier(0.4,0,0.2,1)}`}</style>
          {view === 'flow'
            ? <Flow script={script} phase={phase} deploy={deploy} provider={provider} routing={routing} t={t} />
            : <IdentityFlow mode={idMode} t={t} />}
        </ReactFlowProvider>
      </div>
    </div>
  );
}
