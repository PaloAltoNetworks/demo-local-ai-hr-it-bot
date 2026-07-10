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
  type EdgeProps,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Server, Cpu, Database, ShieldCheck, ShieldAlert, ShieldX, Bot, Cloud, Network, X,
  Play, Pause, SkipBack, SkipForward, RotateCcw, Ban, Route, MessageSquare, SlidersHorizontal, TriangleAlert,
  Angry, ListChecks, Anchor, Link2Off, Bug, EyeOff, DatabaseZap, Code, Eraser, Wrench,
  Boxes, Fingerprint, Scale, Activity, LineChart, ExternalLink,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Translate } from '../context/LanguageContext';

/* ---------- phase + deployment ---------- */
export type Phase = 'phase1' | 'phase2' | 'phase3';
export type Deploy = 'saas' | 'onprem';
export type ProviderId = 'aws' | 'gcp' | 'azure';
export type Routing = 'single' | 'balanced' | 'fallback';

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
const providerImg = (id: ProviderId, dark: boolean) => {
  const p = providerOf(id);
  return p.themed ? `/images/${id}-${dark ? 'dark' : 'light'}.svg` : `/images/${id}.svg`;
};

/* ---------- replay script ---------- */
export type Kind = 'req' | 'reason' | 'observe' | 'mcp' | 'extract' | 'guardrail' | 'final' | 'leak' | 'blocked';
export type Step = { edge: string; reverse?: boolean; focus: string; label: string; kind: Kind; iter?: number; data?: unknown; sens?: boolean; detected?: string[] };

/* ---------- node defs ---------- */
type Role = 'agent' | 'gateway' | 'llm' | 'lb' | 'mcp' | 'triage' | 'cache' | 'rsapi' | 'scm' | 'blocked';
type Handles = { id: string; type: 'source' | 'target'; pos: Position; off?: string }[];
type CardData = {
  title: string; subtitle?: string; icon?: keyof typeof ICONS; iconColor?: string; logo?: 'mcp'; role: Role;
  provider?: ProviderId; failed?: boolean; w?: number;
  badge?: string; badgeTone?: 'saas' | 'onprem' | 'ctrl'; handles: Handles;
};
const ICONS = { Server, Cpu, Database, ShieldCheck, ShieldAlert, ShieldX, Route, Ban, MessageSquare, SlidersHorizontal, Bot, Cloud, Network };
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

const NODE_DEFS: { id: string; type: string; position: { x: number; y: number }; data: CardData; hidden?: boolean }[] = [
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
    <span className="rounded-full border px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide" style={{ borderColor: c, color: c }}>{text}</span>
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
    <span title={cap.label} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ${flag ? 'animate-pulse' : ''}`}
      style={{ background: flag ? `color-mix(in srgb, ${RED} 22%, transparent)` : tone ? `color-mix(in srgb, ${tone} 12%, transparent)` : 'var(--muted)', color: tone || 'var(--foreground)', outline: flag ? `1px solid ${RED}` : undefined }}>
      <Icon className="size-3.5 shrink-0" />
      <span className="text-[10px] font-semibold leading-none">{cap.short}</span>
    </span>
  );
}

/* ---------- custom nodes ---------- */
function CardNode({ data }: NodeProps) {
  const d = data as unknown as CardData & { active?: boolean; accent?: string; airsOn?: boolean; dark?: boolean };
  const Icon = d.icon ? ICONS[d.icon] : null;
  const isAirs = d.role === 'rsapi';
  const isBlock = d.role === 'blocked';
  const isAgent = d.role === 'agent';
  const isProv = d.role === 'llm' && !!d.provider;
  const accent = isBlock || d.failed ? RED : isAirs ? AIRS_VAR : d.accent || 'var(--foreground)';
  const airsDim = isAirs && !d.airsOn;
  const ring = d.failed ? RED : d.active ? accent : 'var(--border)';
  return (
    <div
      style={{ borderColor: ring, borderStyle: airsDim || d.failed ? 'dashed' : 'solid', boxShadow: d.active && !d.failed ? `0 0 0 2px ${ring}, 0 6px 22px -8px ${ring}` : 'none', opacity: airsDim || d.failed ? 0.6 : 1, transition: 'box-shadow .25s, border-color .25s, opacity .25s', width: d.w }}
      className="relative min-w-[150px] rounded-xl border bg-card px-3.5 py-2.5"
    >
      {d.failed && <span className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full text-white" style={{ background: RED }}><X className="size-3" /></span>}
      <div className="flex items-center gap-2">
        {isAgent ? (
          <i className="otter-icon text-[18px]" style={{ color: accent }} />
        ) : isProv ? (
          <img src={providerImg(d.provider!, !!d.dark)} alt="" className="size-4" />
        ) : d.logo === 'mcp' ? (
          <>
            <img src="/images/mcp-light.svg" alt="MCP" className="size-4 dark:hidden" />
            <img src="/images/mcp-dark.svg" alt="MCP" className="hidden size-4 dark:block" />
          </>
        ) : Icon ? (
          <Icon className="size-4" style={{ color: airsDim ? GREY : d.iconColor || accent }} />
        ) : null}
        <div className="text-sm font-medium text-foreground">{d.title}</div>
        {d.badge && <span className="ms-auto ps-2"><Badge text={d.badge} tone={d.badgeTone} /></span>}
      </div>
      {d.subtitle && <div className="mt-0.5 text-[11px] text-muted-foreground">{d.subtitle}</div>}
      {d.handles.map((h) => (
        <Handle key={h.id + h.type} id={h.id} type={h.type} position={h.pos} style={handleStyle(h)} />
      ))}
    </div>
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
        <SlidersHorizontal className="size-4 text-foreground" />
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
  const d = data as unknown as { label: string; color: string; provider?: ProviderId; dark?: boolean; solid?: boolean; labelBottom?: boolean };
  return (
    <div className="pointer-events-none relative size-full rounded-3xl border-2" style={{ borderColor: d.color, borderStyle: d.solid ? 'solid' : 'dashed', background: `color-mix(in srgb, ${d.color} 5%, transparent)` }}>
      <span className={`absolute left-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest ${d.labelBottom ? 'bottom-2' : 'top-2'}`} style={{ color: d.color }}>
        {d.provider && <img src={providerImg(d.provider, !!d.dark)} alt="" className="size-3.5" />}
        {d.label}
      </span>
    </div>
  );
}

const nodeTypes = { card: CardNode, gateway: GatewayNode, scm: ScmNode, rsapi: RsapiNode, zone: ZoneNode };

/* ---------- edges ---------- */
function SpokeEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const d = (data || {}) as { active?: boolean; reverse?: boolean; color?: string; dim?: boolean; airs?: boolean; manage?: boolean; fail?: boolean; sensitive?: boolean; blockedPkt?: boolean };
  const color = d.color || 'var(--border)';
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
      <BaseEdge id={id} path={path} style={{ stroke: d.active ? color : airsDim ? GREY : 'var(--border)', strokeWidth: d.active ? 2.5 : 1.5, strokeDasharray: airsDim ? '5 5' : undefined, opacity: d.active ? 1 : d.dim ? 0.35 : 1, transition: 'stroke .2s, opacity .2s' }} />
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
function buildLlm(provider: ProviderId, routing: Routing, accent: string, dark: boolean, focus: string | undefined, activeEdge: string | undefined, reverse: boolean | undefined, providersY: number, activeLlmId: ProviderId, failedId: ProviderId | null, sensitive: boolean) {
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
      data: { title: providerOf(id).label, role: 'llm', provider: id, failed, accent, dark, active: llmActive && isActive, w: BOX, handles: [H('t', 'target', Position.Top, '50%')] } });
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
function Flow({ script, phase, deploy, provider, routing, dark, t }: { script: Step[]; phase: Phase; deploy: Deploy; provider: ProviderId; routing: Routing; dark: boolean; t?: Translate }) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const accent = PHASE_VAR[phase];
  const airsOn = phase === 'phase3';
  const step = script[idx];
  const prov = providerOf(provider);
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

  useEffect(() => { setIdx(0); setPlaying(false); }, [phase, script]);

  const advance = useCallback(() => {
    setIdx((i) => { if (i >= script.length - 1) { setPlaying(false); return i; } return i + 1; });
  }, [script.length]);

  useEffect(() => {
    if (!playing) return;
    timer.current = setTimeout(advance, 950);
    return () => clearTimeout(timer.current);
  }, [playing, idx, advance]);

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

  const llm = useMemo(() => buildLlm(provider, routing, accent, dark, focus, activeEdge, step?.reverse, providersY, activeLlmId, failedId, !!step?.sens), [provider, routing, accent, dark, focus, activeEdge, step, providersY, activeLlmId, failedId]);

  const zones = useMemo(() => [
    { id: 'z-cust', type: 'zone', position: { x: custBox.x, y: custBox.y }, draggable: false, selectable: false, zIndex: 0, style: { width: custBox.width, height: custBox.height }, data: { label: 'APP', color: CUST_VAR } },
    { id: 'z-saas', type: 'zone', position: { x: saasBox.x, y: saasBox.y }, draggable: false, selectable: false, zIndex: 0, style: { width: saasBox.width, height: saasBox.height }, data: { label: 'PALO ALTO NETWORKS · SaaS', color: AIRS_VAR } },
    llm.zone,
  ], [custBox, saasBox, prov, provider, dark, llm.zone]);

  // RS API detections stay lit red from the block step onward through the propagation back to the app
  const blockIdx = useMemo(() => script.findIndex((s) => s.kind === 'blocked' && s.focus === 'rsapi'), [script]);
  const blockedCaps = blockIdx >= 0 && idx >= blockIdx ? script[blockIdx].detected : undefined;
  const logActive = blockIdx >= 0 && idx >= blockIdx;   // RS API logs the incident to SCM, from the block step to the end

  const nodes = useMemo(() => {
    const list = NODE_DEFS
      .map((n) => ({
        ...n, zIndex: 1, draggable: false, selectable: false,
        position: n.id === 'gw' ? { x: n.position.x, y: gwY(routing) } : n.id === 'it' ? { x: COLX.data + (CARD_W - PROV_W) / 2, y: providersY } : n.position,
        hidden: n.hidden,
        data: { ...n.data, accent, airsOn, active: focus === n.id, deploy, provider, routing, dark, ...(n.id === 'rsapi' ? { blocked: blockedCaps } : {}), ...(n.id === 'scm' && logActive ? { blocked: ['Logs'] } : {}) },
      }));
    return [...zones, ...list, ...llm.nodes];
  }, [zones, llm.nodes, accent, airsOn, focus, blockedCaps, logActive, deploy, provider, routing, dark]);

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

      {/* controls */}
      <div className="absolute inset-x-0 bottom-3 flex justify-center">
        <div className="flex items-center gap-3 rounded-full border bg-card/90 px-4 py-2 shadow-lg backdrop-blur">
          <button className="grid size-8 place-items-center rounded-full hover:bg-muted" onClick={() => { setIdx(0); setPlaying(false); }} title={t?.('workflow.restart') || 'Restart'}><RotateCcw className="size-4" /></button>
          <button className="grid size-8 place-items-center rounded-full hover:bg-muted disabled:opacity-40" disabled={idx === 0} onClick={() => setIdx((i) => Math.max(0, i - 1))}><SkipBack className="size-4" /></button>
          <button className="grid size-9 place-items-center rounded-full text-white" style={{ background: accent }} onClick={() => { if (idx >= script.length - 1) setIdx(0); setPlaying((p) => !p); }}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
          <button className="grid size-8 place-items-center rounded-full hover:bg-muted disabled:opacity-40" disabled={idx >= script.length - 1} onClick={advance}><SkipForward className="size-4" /></button>
          <input type="range" min={0} max={script.length - 1} value={idx} onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }} className="w-56" style={{ accentColor: accent }} />
          <span className="w-28 text-right font-mono text-[11px] text-muted-foreground">{idx + 1}/{script.length}{iters > 1 && step?.iter ? ` · ${t?.('workflow.iter') || 'iter'} ${step.iter}/${iters}` : ''}</span>
        </div>
      </div>

      {/* step panel */}
      <div className="absolute right-4 top-4 w-72 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md text-white" style={{ background: stepColor }}>
            {step?.kind === 'blocked' ? <Ban className="size-3.5" /> : step?.kind === 'guardrail' ? <ShieldAlert className="size-3.5" /> : danger ? <TriangleAlert className="size-3.5" /> : step?.kind === 'req' || step?.kind === 'final' ? <MessageSquare className="size-3.5" /> : <Route className="size-3.5" />}
          </span>
          <div className="text-sm font-medium text-foreground">{step?.label}</div>
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{step?.kind}</div>
        {sd?.prompt && <TextBlock label={t?.('workflow.userPrompt') || 'user prompt'} value={sd.prompt} tone={phase === 'phase2' ? RED : undefined} />}
        {sd?.response && <TextBlock label={step?.kind === 'leak' ? (t?.('workflow.leakedResponse') || 'leaked response') : (t?.('workflow.assistantResponse') || 'assistant response')} value={sd.response} tone={step?.kind === 'leak' ? RED : undefined} />}
        {step?.data != null && !sd?.prompt && !sd?.response && step.kind !== 'blocked' && <JsonBlock label={danger ? (t?.('workflow.extractedData') || 'extracted data') : (t?.('workflow.payload') || 'payload')} value={step.data} />}
        {step?.kind === 'blocked' && bd?.detected != null && (
          <div className="mt-2 space-y-1 text-[11px]">
            <JsonBlock label={t?.('workflow.detections') || 'detections'} value={bd.detected} />
            {bd.reportUrl && <a className="inline-flex items-center gap-1 underline" href={bd.reportUrl} target="_blank" rel="noopener noreferrer" style={{ color: accent }}><ExternalLink className="size-3" /> {t?.('workflow.viewReport') || 'View AIRS report'}</a>}
            {bd.traceUrl && <a className="inline-flex items-center gap-1 underline" href={bd.traceUrl} target="_blank" rel="noopener noreferrer" style={{ color: accent }}><ExternalLink className="size-3" /> {t?.('workflow.viewTrace') || 'View Portkey trace'}</a>}
            {typeof bd.tokens === 'number' && <div className="text-muted-foreground">{t?.('workflow.tokensConsumed') || 'tokens consumed'}: {bd.tokens.toLocaleString()}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- segmented control (shared) ---------- */
export function Seg<T extends string>({ value, opts, onChange }: { value: T; opts: { v: T; label: string; color?: string }[]; onChange: (v: T) => void }) {
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

/* ---------- real turn → replay script ---------- */
const KNOWN_REFLECT = new Set(['reflect', 'reflect_reason', 'reflect_observe', 'reflect_decide', 'reflect_conclude']);
const partToolName = (part: any): string => (part.type === 'dynamic-tool' ? part.toolName : String(part.type).slice(5));
const isToolPart = (part: any) => part.type === 'dynamic-tool' || String(part.type || '').startsWith('tool-');
const isReflect = (name: string) => KNOWN_REFLECT.has(name) || name?.endsWith('-reflect');
const shortToolName = (name: string) => (name.includes('-') ? name.split('-').slice(1).join('-') : name);
const unwrapMcpOutput = (output: any): any => {
  if (!output || typeof output !== 'object' || !Array.isArray(output.content)) return output;
  const text = output.content.filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('\n');
  if (!text) return output;
  try { return JSON.parse(text); } catch { return text; }
};

// Which spoke a tool call travels: HR tools hit the HR MCP; IT/ticket tools go through the
// IT Triage Agent, which in turn reaches ServiceNow. Everything else defaults to the triage lane.
function toolLane(name: string): { edge: 'gw-hr' | 'gw-triage'; focus: 'hr' | 'triage'; serviceNow: boolean } {
  const n = shortToolName(name).toLowerCase();
  if (n.includes('employee') || n.startsWith('hr') || n.includes('_hr')) return { edge: 'gw-hr', focus: 'hr', serviceNow: false };
  // ticket / triage / IT tools route through ServiceNow via the triage agent
  return { edge: 'gw-triage', focus: 'triage', serviceNow: true };
}

export type BlockInfo = { detected?: Record<string, boolean>; tokens?: number; reportUrl?: string; traceUrl?: string; isResponseBlock?: boolean };

// Convert a completed assistant message's real streamed parts into a replay script that
// always crosses the AI Gateway hub. phase3 wraps each LLM boundary with an RS API assessment.
export function buildScriptFromMessage(
  msg: any,
  phase: Phase,
  opts: { prompt?: string; block?: BlockInfo } = {},
): Step[] {
  const parts: any[] = msg?.parts || [];
  const isErroredToolPart = (p: any) => p.state === 'output-error' || p.state === 'input-error';
  const chain: { kind: 'reflect' | 'tool'; part: any }[] = [];
  for (const p of parts) {
    if (!isToolPart(p) || isErroredToolPart(p)) continue;
    const name = partToolName(p);
    if (name?.startsWith('reflect_') && !KNOWN_REFLECT.has(name)) continue; // hallucinated reflect_*
    if (isReflect(name)) { chain.push({ kind: 'reflect', part: p }); continue; }
    if (p.state === 'approval-requested') continue; // interactive, not a transit step
    chain.push({ kind: 'tool', part: p });
  }
  const text = parts.filter((p) => p.type === 'text' && p.text).map((p) => p.text).join('');

  const airs = phase === 'phase3' && !opts.block;
  const out: Step[] = [];
  let iter = 0;
  const assess = (label: string, what: string) => {
    out.push({ edge: 'gw-rsapi', focus: 'rsapi', label, kind: 'guardrail', iter: iter || undefined, data: { scan: what, verdict: 'allow' } });
    out.push({ edge: 'gw-rsapi', reverse: true, focus: 'gw', label: 'Verdict · allow', kind: 'guardrail', iter: iter || undefined });
  };

  out.push({ edge: 'agent-gw', focus: 'gw', label: 'Request received', kind: 'req', data: opts.prompt ? { prompt: opts.prompt } : undefined });

  for (const it of chain) {
    if (it.kind === 'reflect') {
      const name = partToolName(it.part);
      const reflectPhase = name.startsWith('reflect_') ? name.split('_')[1] : (it.part.input?.phase || 'reason');
      const observe = reflectPhase === 'observe' || reflectPhase === 'decide';
      const kind: Kind = observe ? 'observe' : 'reason';
      if (!observe) iter += 1;
      const data = { observation: it.part.input?.observation, gaps: it.part.input?.gaps, next_action: it.part.input?.next_action };
      if (airs) assess('RS API · assess LLM request', 'prompt + context → LLM');
      out.push({ edge: 'gw-llm', focus: 'llm', label: observe ? 'Observe · findings' : 'Reason · plan', kind, iter, data });
      out.push({ edge: 'gw-llm', reverse: true, focus: 'gw', label: observe ? 'Answer ready' : 'LLM ready', kind, iter });
      if (airs) assess('RS API · assess LLM output', 'LLM output');
    } else {
      const name = partToolName(it.part);
      const short = shortToolName(name);
      const lane = toolLane(name);
      const input = it.part.input;
      const output = unwrapMcpOutput(it.part.output);
      out.push({ edge: lane.edge, focus: lane.focus, label: `${lane.focus === 'hr' ? 'HR tools' : 'IT Triage'} · ${short}`, kind: 'mcp', iter: iter || undefined, data: input });
      if (lane.serviceNow) {
        out.push({ edge: 'triage-it', focus: 'it', label: `ServiceNow · ${short}`, kind: 'mcp', iter: iter || undefined, data: input });
        out.push({ edge: 'triage-it', reverse: true, focus: 'triage', label: 'ServiceNow → Triage', kind: 'mcp', iter: iter || undefined, data: output });
      }
      out.push({ edge: lane.edge, reverse: true, focus: 'gw', label: `${short} returned`, kind: 'mcp', iter: iter || undefined, data: output });
    }
  }

  out.push({ edge: 'agent-gw', reverse: true, focus: 'agent', label: 'Response delivered', kind: 'final', data: text ? { response: text } : undefined });
  return out;
}

// Build a block script for a phase3 guardrail_violation turn: the RS API catches the violation
// and the refusal propagates GW → Otter, with the incident logged to SCM.
export function buildBlockScript(block: BlockInfo, opts: { prompt?: string; refusal?: string } = {}): Step[] {
  const flags = block.detected ? Object.entries(block.detected).filter(([, v]) => v).map(([k]) => k) : [];
  const nice = flags.map((f) => (f === 'dlp' ? 'DLP' : f === 'topic_violation' ? 'Topics' : f.replace(/_/g, ' '))).map((s) => s[0].toUpperCase() + s.slice(1));
  const blockData = { detected: block.detected, tokens: block.tokens, reportUrl: block.reportUrl, traceUrl: block.traceUrl };
  const assessLabel = block.isResponseBlock ? 'RS API · assess LLM output' : 'RS API · assess LLM request';
  return [
    { edge: 'agent-gw', focus: 'gw', label: 'Request received', kind: 'req', data: opts.prompt ? { prompt: opts.prompt } : undefined },
    { edge: 'gw-rsapi', focus: 'rsapi', label: assessLabel, kind: 'guardrail' },
    { edge: 'gw-rsapi', reverse: true, focus: 'gw', label: 'Assessment in progress', kind: 'guardrail' },
    { edge: 'gw-rsapi', focus: 'rsapi', label: `RS API · block (${nice.join(' · ') || 'policy'})`, kind: 'blocked', sens: true, detected: nice, data: blockData },
    { edge: 'gw-rsapi', reverse: true, focus: 'gw', label: 'Block propagated to Gateway', kind: 'blocked', data: blockData },
    { edge: 'agent-gw', reverse: true, focus: 'agent', label: 'The Otter shows the block to the user', kind: 'blocked', data: opts.refusal ? { response: opts.refusal } : blockData },
  ];
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

export function demoScriptFor(phase: Phase): Step[] {
  if (phase === 'phase1') return SCRIPT_NORMAL;
  if (phase === 'phase2') return SCRIPT_RISKY;
  return SCRIPT_BLOCKED;   // Protected = same DLP scenario, but blocked
}

/* ---------- reusable canvas (mockup + modal share this) ---------- */
export function WorkflowCanvas(props: { script: Step[]; phase: Phase; deploy: Deploy; provider: ProviderId; routing: Routing; dark: boolean; t?: Translate }) {
  return (
    <ReactFlowProvider>
      <style>{`.react-flow__node{transition:transform 300ms cubic-bezier(0.4,0,0.2,1)}`}</style>
      <Flow {...props} />
    </ReactFlowProvider>
  );
}

/* ---------- self-contained explorer (global entry point, opened from the header) ---------- */
export default function WorkflowReplay({ initialPhase = 'phase1', initialProvider = 'aws', t }: { initialPhase?: Phase; initialProvider?: ProviderId; t?: Translate }) {
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const provider = initialProvider;
  const [deploy, setDeploy] = useState<Deploy>('saas');
  const [routing, setRouting] = useState<Routing>('single');
  const [dark, setDark] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributeFilter: ['class'], attributes: true });
    return () => obs.disconnect();
  }, []);

  const script = useMemo(() => demoScriptFor(phase), [phase]);

  return (
    <div className={`phase${phase[5]}-active flex h-full w-full flex-col`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2.5">
        <Seg value={phase} onChange={setPhase} opts={[
          { v: 'phase1', label: t?.('workflow.normal') || 'Normal', color: PHASE_VAR.phase1 },
          { v: 'phase2', label: t?.('workflow.risky') || 'Risky', color: PHASE_VAR.phase2 },
          { v: 'phase3', label: t?.('workflow.protected') || 'Protected', color: PHASE_VAR.phase3 },
        ]} />
        <div className="ms-auto flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t?.('workflow.gateway') || 'GW'}</span>
            <Seg value={deploy} onChange={setDeploy} opts={[
              { v: 'saas', label: t?.('workflow.saas') || 'SaaS', color: AIRS_VAR },
              { v: 'onprem', label: t?.('workflow.onprem') || 'On-prem', color: CUST_VAR },
            ]} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t?.('workflow.llm') || 'LLM'}</span>
            <Seg value={routing} onChange={setRouting} opts={[
              { v: 'single', label: t?.('workflow.single') || 'Single' },
              { v: 'balanced', label: t?.('workflow.balanced') || 'Load-balanced' },
              { v: 'fallback', label: t?.('workflow.fallback') || 'Fallback', color: RED },
            ]} />
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <WorkflowCanvas script={script} phase={phase} deploy={deploy} provider={provider} routing={routing} dark={dark} t={t} />
      </div>
    </div>
  );
}

export { Flow };
