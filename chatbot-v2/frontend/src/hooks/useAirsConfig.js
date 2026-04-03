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
  if (!config?.tsgId || !config?.appId || !config?.appName || !trId || !scanId) return null;
  const appName = encodeURIComponent(config.appName);
  return `${config.baseUrl}/${scanId}/0/${trId}/${config.appId}/${appName}?tsg-id=${config.tsgId}`;
}
