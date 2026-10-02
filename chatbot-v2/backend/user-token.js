/**
 * Access tokens from the auth-service, the OAuth 2.1 authorization server of the MCP servers.
 * The AI Gateway accepts them in place of a Portkey API key (gateway-local JWT auth against the
 * auth-service JWKS) and forwards them as is to the MCP servers (identity forwarding `bearer`).
 *
 * - userToken(cookie): the signed-in user's token, obtained as the first-party `chatbot` client
 *   with the authorization code grant and PKCE. The authorize request carries the user's session
 *   cookie (the browser's request, passed through by Caddy), so there is no redirect and no
 *   consent: the code is read from the authorize response and exchanged at once. It carries the
 *   identity of the user's persona (email, name, groups, employee_id), names the chatbot as client
 *   and its workload identity as actor (act.sub).
 * - agentToken(): the chatbot's own token (client_credentials, group "agents", every scope): a
 *   service account, for MCP connections and the tool calls of unprotected turns. The MCP
 *   servers grant it everything its scopes allow, whoever the user is.
 *
 * Both name every MCP server (OAUTH_RESOURCES) as audience and are cached until 60 s before
 * expiry. Enabled when OAUTH_SERVER_URL, OAUTH_RESOURCES and CHATBOT_CLIENT_SECRET are set.
 */
import crypto from 'crypto';

const SERVER = process.env.OAUTH_SERVER_URL || '';
const RESOURCES = (process.env.OAUTH_RESOURCES || '').split(',').map((r) => r.trim()).filter(Boolean);
const CLIENT_ID = 'chatbot';
const CLIENT_SECRET = process.env.CHATBOT_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.CHATBOT_REDIRECT_URI || 'http://localhost:3018/oauth/callback';
const SCOPE = 'hr:read it:read it:write it:triage';
const RENEW_MARGIN_S = 60;

export const USER_TOKENS_ENABLED = Boolean(SERVER && RESOURCES.length && CLIENT_SECRET);

/** User tokens by session; agent token under the empty key. ponytail: unbounded map, one entry per session seen since start; evict on exp if sessions pile up. */
const cache = new Map();

const decode = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));

/** Cache key of a browser session: the auth-service session cookie, hashed. */
function sessionKey(cookie) {
  const session = cookie.split(';').map((c) => c.trim()).find((c) => /session_token=/.test(c)) || cookie;
  return crypto.createHash('sha256').update(session).digest('base64url');
}

/** Token request; `resources` names the audiences (client_credentials), absent for a code, which carries those the user was granted. */
async function tokenRequest(params, resources = []) {
  const body = new URLSearchParams(params);
  for (const r of resources) body.append('resource', r);
  const res = await fetch(new URL('/api/auth/oauth2/token', SERVER), {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`auth-service token ${res.status}: ${data.error_description || data.error || 'no token'}`);
  return { token: data.access_token, claims: decode(data.access_token) };
}

async function authorizationCode(cookie) {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const state = crypto.randomBytes(16).toString('base64url');
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    state,
    code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  });
  for (const r of RESOURCES) query.append('resource', r);
  const res = await fetch(new URL(`/api/auth/oauth2/authorize?${query}`, SERVER), { headers: { cookie }, redirect: 'manual' });
  const location = res.headers.get('location') || (await res.json().catch(() => ({}))).url || '';
  const callback = location.startsWith(REDIRECT_URI) ? new URL(location).searchParams : null;
  if (!callback?.get('code') || callback.get('state') !== state) {
    throw new Error(`auth-service authorize ${res.status}: ${callback?.get('error_description') || 'no session'}`);
  }
  return tokenRequest({ grant_type: 'authorization_code', code: callback.get('code'), redirect_uri: REDIRECT_URI, code_verifier: verifier });
}

async function cached(key, issue) {
  const hit = cache.get(key);
  if (hit && hit.claims.exp - RENEW_MARGIN_S > Date.now() / 1000) return hit;
  const fresh = await issue();
  cache.set(key, fresh);
  return fresh;
}

/**
 * Token of the user whose browser sent `cookie`.
 * @returns {Promise<{ token: string, claims: { persona: string, name: string, email: string, groups: string[], employee_id?: string, client_id: string, act?: { sub: string } } }>}
 */
export function userToken(cookie) {
  if (!cookie) return Promise.reject(new Error('No auth-service session cookie on the request'));
  return cached(sessionKey(cookie), () => authorizationCode(cookie));
}

/** Drops the cached token of this session, so the next one carries a changed persona. */
export function forgetUserToken(cookie) {
  if (cookie) cache.delete(sessionKey(cookie));
}

/** The chatbot's own token (client_credentials). */
export function agentToken() {
  return cached('', () => tokenRequest({ grant_type: 'client_credentials', scope: SCOPE }, RESOURCES));
}

let personaList = null;

/** The personas the auth-service offers (id, name, email, groups, access), fetched once. */
export async function personas() {
  personaList ??= fetch(new URL('/auth/personas', SERVER))
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`auth-service personas ${r.status}`))))
    .then((d) => d.personas)
    .catch((err) => { personaList = null; throw err; });
  return personaList;
}

/**
 * Relays a persona switch of the signed-in user to the auth-service.
 * @returns {Promise<Response>} the auth-service response
 */
export function setPersona(cookie, persona) {
  return fetch(new URL('/auth/persona', SERVER), {
    method: 'POST',
    headers: { cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ persona }),
  });
}
