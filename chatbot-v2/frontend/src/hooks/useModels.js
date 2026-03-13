import { useState, useEffect } from 'react';

export function useModels() {
  const [models, setModels] = useState([]);
  const [model, setModel] = useState(() => localStorage.getItem('selectedModel') || '');

  useEffect(() => {
    fetch('/api/models')
      .then(r => r.json())
      .then(data => {
        setModels(data.models || []);
        if (!model && data.default) setModel(data.default);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (model) localStorage.setItem('selectedModel', model);
  }, [model]);

  return { models, model, setModel };
}
