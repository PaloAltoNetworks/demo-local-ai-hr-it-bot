import { useState, useEffect } from 'react';

export interface Provider {
  id: string;
  label: string;
}

export function useProviders() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [provider, setProvider] = useState<string>(() => localStorage.getItem('selectedProvider') || '');

  useEffect(() => {
    fetch('/api/providers')
      .then(r => r.json())
      .then(data => {
        setProviders(data.providers || []);
        if (!provider && data.default) setProvider(data.default);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (provider) localStorage.setItem('selectedProvider', provider);
  }, [provider]);

  return { providers, provider, setProvider };
}
