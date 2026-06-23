import { useState, useEffect } from 'react';

export function useProviders() {
  const [providers, setProviders] = useState([]);
  const [provider, setProvider] = useState(() => localStorage.getItem('selectedProvider') || '');

  useEffect(() => {
    fetch('/api/providers')
      .then(r => r.json())
      .then(data => {
        setProviders(data.providers || []);
        if (!provider && data.default) setProvider(data.default);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (provider) localStorage.setItem('selectedProvider', provider);
  }, [provider]);

  return { providers, provider, setProvider };
}
