import { useState, useEffect } from 'react';

export function useAirsConfig() {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    fetch('/api/airs-config')
      .then(r => r.json())
      .then(setConfig)
      .catch(() => {});
  }, []);

  return config;
}

export function buildReportUrl(config, { trId, scanId }) {
  if (!config?.tsgId || !trId) return null;
  // Direct incident link when all identifiers are available
  if (scanId && config.appId && config.appName) {
    const appName = encodeURIComponent(config.appName);
    return `${config.baseUrl}/${scanId}/0/${trId}/${config.appId}/${appName}?tsg_id=${config.tsgId}`;
  }
  // Dashboard fallback when scanId is unavailable (e.g. plain text guardrail errors)
  return `${config.baseUrl}?tsg-id=${config.tsgId}`;
}
