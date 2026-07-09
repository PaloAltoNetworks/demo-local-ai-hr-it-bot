import { useState, useEffect } from 'react';

export interface AirsConfig {
  tsgId?: string;
  appId?: string;
  appName?: string;
  baseUrl?: string;
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
