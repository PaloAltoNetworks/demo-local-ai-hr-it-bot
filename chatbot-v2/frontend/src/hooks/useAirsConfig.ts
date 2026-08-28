import { useState, useEffect } from 'react';

export interface AirsConfig {
  tsgId?: string;
  appId?: string;
  appName?: string;
  baseUrl?: string;
  gateway?: {
    workspaceId?: string;
    deploymentId?: string;
    orgId?: string;
  };
}

export function useAirsConfig(): AirsConfig | null {
  const [config, setConfig] = useState<AirsConfig | null>(null);

  useEffect(() => {
    fetch('/api/airs-config')
      .then(r => r.json())
      .then(setConfig)
      .catch(() => {});
  }, []);

  return config;
}

export function buildReportUrl(
  config: AirsConfig | null,
  { trId }: { trId?: string }
): string | null {
  if (!config?.tsgId || !trId || !config.appId) return null;
  // AI-session link: {baseUrl}/{trId}/{appId}/Portkey — groups the turn's chats.
  // Last segment is the literal source ("Portkey"), not the app name.
  return `${config.baseUrl}/${trId}/${config.appId}/Portkey`;
}

const SCM_LOGS_URL =
  'https://stratacloudmanager.paloaltonetworks.com/ai-security/gateway/observability/logs';

// Gateway trace link. Strata Cloud Manager (workspaceId + licenseId, path format v2) when the
// gateway is SCM-managed; standalone Portkey (organisation path, format v1) otherwise.
export function buildTraceUrl(
  config: AirsConfig | null,
  traceId: string,
  createdAt?: number
): string | null {
  const gw = config?.gateway;
  if (!traceId || !gw?.workspaceId) return null;

  const scm = Boolean(config?.tsgId && gw.deploymentId);
  const q = new URLSearchParams({
    workspaceId: gw.workspaceId,
    traceView: 'true',
    selectedTraceId: traceId,
    logLogStoreFilePathFormat: scm ? 'v2' : 'v1',
  });
  if (createdAt) q.set('logCreatedAt', new Date(createdAt).toISOString());

  if (!scm) {
    return gw.orgId
      ? `https://app.portkey.ai/organisation/${gw.orgId}/logs?${q}`
      : null;
  }
  q.set('tsg_id', config!.tsgId!);
  q.set('licenseId', gw.deploymentId!);
  return `${SCM_LOGS_URL}?${q}`;
}
