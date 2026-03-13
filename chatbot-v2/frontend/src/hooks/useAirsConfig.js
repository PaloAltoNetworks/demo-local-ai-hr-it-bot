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
  if (!config?.tsgId || !config?.appId || !trId || !scanId) return null;
  return `${config.baseUrl}/${trId}/${config.appId}/LiteLLM/transactions/${scanId}/0?tsg_id=${config.tsgId}#date=24hr`;
}
