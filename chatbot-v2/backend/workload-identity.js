/**
 * Workload identity for the chatbot: a JWT-SVID from the CyberArk Secure Workload Access
 * agent, fetched over the standard SPIFFE Workload API (gRPC on the agent's unix socket).
 * The AI Gateway accepts it in place of a Portkey API key when it runs gateway-local JWT
 * auth (JWT_ENABLED=ON) against the trust domain's JWKS.
 *
 * Enabled when SPIFFE_ENDPOINT_SOCKET is set (e.g. unix:///tmp/swa-agent/public/api.sock).
 * There is no API-key fallback in that mode: a Workload API error surfaces as is, so a broken
 * identity setup never silently turns back into a static key.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

const SOCKET = process.env.SPIFFE_ENDPOINT_SOCKET || '';
export const WORKLOAD_IDENTITY_ENABLED = Boolean(SOCKET);

/** Audience the gateway expects in the JWT-SVID. */
const AUDIENCE = process.env.SPIFFE_JWT_AUDIENCE || 'portkey';

/** Tokens are renewed this long before `exp`, so an in-flight request never carries an expired one. */
const RENEW_MARGIN_S = 60;

let client = null;
let cached = null;
let inFlight = null;

function workloadClient() {
  if (client) return client;
  const def = protoLoader.loadSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'workload.proto'), {
    keepCase: true,
  });
  const { SpiffeWorkloadAPI } = grpc.loadPackageDefinition(def);
  client = new SpiffeWorkloadAPI(SOCKET.replace(/^unix:\/\//, 'unix:'), grpc.credentials.createInsecure());
  return client;
}

function fetchJwtSvid() {
  const metadata = new grpc.Metadata();
  metadata.set('workload.spiffe.io', 'true');
  return new Promise((resolve, reject) => {
    workloadClient().FetchJWTSVID({ audience: [AUDIENCE] }, metadata, { deadline: Date.now() + 5000 }, (err, res) => {
      if (err) return reject(new Error(`SPIFFE Workload API (${SOCKET}): ${err.details || err.message}`));
      const svid = res?.svids?.[0];
      if (!svid?.svid) return reject(new Error('SPIFFE Workload API returned no JWT-SVID'));
      const { exp } = JSON.parse(Buffer.from(svid.svid.split('.')[1], 'base64url'));
      resolve({ token: svid.svid, spiffeId: svid.spiffe_id, exp });
    });
  });
}

/**
 * Current JWT-SVID for the gateway, from cache until RENEW_MARGIN_S before expiry.
 * Concurrent callers during a renewal share the same Workload API call.
 * @returns {Promise<{ token: string, spiffeId: string, exp: number }>}
 */
export async function getWorkloadToken() {
  if (cached && cached.exp - RENEW_MARGIN_S > Date.now() / 1000) return cached;
  inFlight ??= fetchJwtSvid()
    .then((svid) => (cached = svid))
    .finally(() => { inFlight = null; });
  return inFlight;
}

/** SPIFFE ID of the last token fetched, for /health and message metadata. */
export function workloadSpiffeId() {
  return cached?.spiffeId || null;
}
