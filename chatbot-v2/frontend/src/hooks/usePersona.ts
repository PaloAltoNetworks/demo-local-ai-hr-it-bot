import { useState, useEffect } from 'react';

/** An identity the signed-in user can act as, from the auth-service (via /api/me). */
export interface Persona {
  id: string;
  name: string;
  email: string;
  groups: string[];
  access: 'employee' | 'manager' | 'hr' | 'external';
}

/**
 * The signed-in user's current persona and the ones they can switch to, from /api/me, and the
 * switch through /api/persona. The next turn's token carries the new persona. userName is the
 * persona's name (the fixed default user's without user tokens), for the greeting. Without user
 * tokens (local docker compose) `personas` stays empty.
 */
export function usePersona() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    fetch('/api/me')
      .then(r => (r.ok ? r.json() : null))
      .then(me => {
        setName(me?.name || '');
        if (!me?.userTokens) return;
        setPersonas(me.personas || []);
        setPersonaId(me.persona);
      })
      .catch(() => {});
  }, []);

  const setPersona = async (id: string) => {
    const res = await fetch('/api/persona', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona: id }),
    });
    if (res.ok) setPersonaId(id);
  };

  const persona = personas.find(p => p.id === personaId) ?? null;
  return { personas, persona, setPersona, userName: persona?.name || name };
}
