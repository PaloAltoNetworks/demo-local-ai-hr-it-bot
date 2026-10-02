/**
 * OAuth 2.1 resource server for the MCP servers, per the MCP authorization spec.
 *
 * OAUTH_SERVER_URL is the auth-service as reached from this server (in-cluster URL); its
 * authorization server metadata and JWKS are read from there. OAUTH_RESOURCE is this server's
 * canonical MCP URL (RFC 8707): an access token is accepted only when it is an RS256 JWT signed
 * by the auth-service, issued by it, unexpired and with OAUTH_RESOURCE in its audience.
 * /.well-known/oauth-protected-resource{path} (RFC 9728) points clients to the auth-service, and
 * a request without a valid token gets a 401 whose WWW-Authenticate names that document.
 * Without both variables (local docker compose) the server stays open.
 */
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { mcpAuthMetadataRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const OAUTH_SERVER_URL = process.env.OAUTH_SERVER_URL || '';
const OAUTH_RESOURCE = process.env.OAUTH_RESOURCE || '';

/** Authorization server metadata of the auth-service, retried every 2 s until it answers. */
async function fetchAuthServerMetadata() {
  const url = new URL('/.well-known/oauth-authorization-server/api/auth', OAUTH_SERVER_URL);
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      console.warn(`[oauth] ${url} answered ${res.status}, retrying`);
    } catch (err) {
      console.warn(`[oauth] ${url} unreachable (${err.cause?.code || err.message}), retrying`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/**
 * Mounts the protected resource metadata on `app` and returns the middleware guarding /mcp.
 * Verified tokens land in req.auth, which the MCP SDK hands to tool handlers as extra.authInfo
 * (claims in authInfo.extra).
 *
 * @param {import('express').Express} app
 * @param {{ name: string, scopes: string[] }} options resource name and the scopes its tools check
 * @returns {Promise<import('express').RequestHandler>}
 */
export async function oauthResource(app, { name, scopes }) {
  if (!OAUTH_SERVER_URL || !OAUTH_RESOURCE) {
    console.warn('[oauth] OAUTH_SERVER_URL or OAUTH_RESOURCE unset: /mcp is not protected');
    return (_req, _res, next) => next();
  }
  const resourceUrl = new URL(OAUTH_RESOURCE);
  const oauthMetadata = await fetchAuthServerMetadata();
  const keys = createRemoteJWKSet(new URL(new URL(oauthMetadata.jwks_uri).pathname, OAUTH_SERVER_URL));

  const verifier = {
    async verifyAccessToken(token) {
      let payload;
      try {
        ({ payload } = await jwtVerify(token, keys, {
          issuer: oauthMetadata.issuer,
          audience: OAUTH_RESOURCE,
          algorithms: ['RS256'],
        }));
      } catch (err) {
        console.warn(`[oauth] rejected token: ${err.code || err.message}`);
        throw new InvalidTokenError('Invalid access token');
      }
      const { sub, email, name, persona, employee_id, groups } = payload;
      console.log(`[oauth] ${JSON.stringify({ client_id: payload.client_id, sub, email, persona, employee_id, groups, scope: payload.scope })}`);
      return {
        token,
        clientId: payload.client_id || payload.azp,
        scopes: (payload.scope || '').split(' ').filter(Boolean),
        expiresAt: payload.exp,
        resource: resourceUrl,
        extra: { sub, email, name, persona, employee_id, groups: groups || [] },
      };
    },
  };

  app.use(mcpAuthMetadataRouter({ oauthMetadata, resourceServerUrl: resourceUrl, scopesSupported: scopes, resourceName: name }));
  return requireBearerAuth({ verifier, resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resourceUrl) });
}

/**
 * Whether the token is a client's own service account (client_credentials, group "agents"):
 * no user behind it, so it is trusted for everything its scopes allow.
 */
export function isServiceAccount(authInfo) {
  return Boolean(authInfo && !authInfo.extra?.employee_id && authInfo.extra?.groups?.includes('agents'));
}

/**
 * Tool result refusing a call whose token lacks `scope`, or null when the call may proceed.
 * Without OAuth (no authInfo) every call proceeds.
 *
 * @param {import('@modelcontextprotocol/sdk/server/auth/types.js').AuthInfo | undefined} authInfo
 * @param {string} scope
 */
export function missingScope(authInfo, scope) {
  if (!authInfo || authInfo.scopes.includes(scope)) return null;
  return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'insufficient_scope', required_scope: scope }) }] };
}
