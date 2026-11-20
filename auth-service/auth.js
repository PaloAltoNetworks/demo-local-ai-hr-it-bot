import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { betterAuth, APIError } from "better-auth";
import { magicLink, bearer, jwt } from "better-auth/plugins";
import { createAuthMiddleware } from "better-auth/api";
import { getMigrations } from "better-auth/db/migration";
import { oauthProvider } from "@better-auth/oauth-provider";
import nodemailer from "nodemailer";
import {
  ALLOWED_DOMAIN, SITE_URL, SMTP_CONFIG, AUTH_SECRET, TRUSTED_ORIGINS, COOKIE_PREFIX,
  PERSONAS, AGENT_GROUPS, SCOPES, RESOURCES, TRUSTED_CLIENTS,
} from "./lib/config.js";
import { renderEmail } from "./views/email.js";

/** SQLite file on the persistent volume: users, sessions, magic links, OAuth clients and signing keys. */
const DB_PATH = process.env.AUTH_DB_PATH || "/data/auth.db";

/**
 * Token claims of a persona: its email in email_id (the claim the AI Gateway logs a user by) and
 * email, name, groups, the persona id, and employee_id for employees. The signed-in account
 * stays in sub and login_email (who is testing), so logs and authorization see the persona.
 */
function personaClaims(personaId) {
  const p = PERSONAS.find((x) => x.id === personaId) || PERSONAS[0];
  return {
    email_id: p.email,
    email: p.email,
    name: p.name,
    groups: p.groups,
    persona: p.id,
    ...(p.id.startsWith("EMP-") && { employee_id: p.id }),
  };
}

/**
 * Actor of a token issued to a client for a user (RFC 8693 §4.1): `act.sub` is the workload
 * identity of the client (its agentId), so one token names both the user (sub, email_id) and the
 * agent acting for them. A persona client's own tokens name it as actor of its persona the same
 * way. Other tokens a client gets for itself carry no actor, nor do clients without an agentId.
 */
const actorClaims = {
  claims: {
    accessToken: ({ user, client }) => {
      const c = TRUSTED_CLIENTS.find((x) => x.clientId === client?.clientId);
      return (user || c?.persona) && c?.agentId ? { act: { sub: c.agentId } } : {};
    },
  },
};

/**
 * Audience of a persona client's client_credentials token: a request naming no MCP server gets
 * all of them (RESOURCES), as a signed-in user's token does. The Red Teaming target sends a fixed
 * form body and cannot repeat `resource`. The client id comes from Basic auth, else the body.
 */
function personaClientAudience(ctx) {
  const body = ctx.body;
  if (body?.grant_type !== "client_credentials" || body.resource) return;
  const basic = ctx.headers?.get("authorization")?.match(/^Basic\s+(.+)$/i)?.[1];
  const clientId = basic ? decodeURIComponent(Buffer.from(basic, "base64").toString().split(":")[0]) : body.client_id;
  if (!TRUSTED_CLIENTS.some((c) => c.clientId === clientId && c.persona)) return;
  return { context: { body: { ...body, resource: RESOURCES } } };
}

/** Client secrets are stored as unpadded base64url SHA-256, the same hash seedTrustedClients writes. */
const hashSecret = (secret) => createHash("sha256").update(secret).digest("base64url");

const transporter = nodemailer.createTransport(SMTP_CONFIG);

/**
 * Better Auth with magic-link sign-in only (no passwords), restricted to one email domain.
 * Sessions last 7 days, refresh daily, and are cached in the cookie for 5 minutes.
 * The cookie is shared across subdomains when AUTH_COOKIE_DOMAIN is set; its name prefix
 * is configurable so two instances can share a cookie domain without overwriting each other.
 * Magic links expire after 10 minutes.
 *
 * It is also the OAuth 2.1 authorization server of the MCP servers: RS256 JWT access tokens
 * (JWKS at /api/auth/jwks) carrying the identity of the user's persona, the client that asked
 * (client_id / azp) and its workload identity as actor (act), the requested MCP servers as
 * audience and the granted scopes.
 * Clients are first-party only (no dynamic registration), so every enabled resource is open to them.
 */
const options = {
  database: new Database(DB_PATH),
  baseURL: SITE_URL,
  basePath: "/api/auth",
  secret: AUTH_SECRET,
  trustedOrigins: TRUSTED_ORIGINS,
  emailAndPassword: { enabled: false },
  user: {
    additionalFields: {
      persona: { type: "string", required: false, defaultValue: PERSONAS[0].id, input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  advanced: {
    cookiePrefix: COOKIE_PREFIX,
    crossSubDomainCookies: {
      enabled: !!process.env.AUTH_COOKIE_DOMAIN,
      domain: process.env.AUTH_COOKIE_DOMAIN,
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/oauth2/token") return personaClientAudience(ctx);
      if (!ctx.path.startsWith("/sign-in")) return;
      const email = ctx.body?.email;
      if (!email || typeof email !== "string") return;
      const domain = email.toLowerCase().split("@").pop();
      if (domain !== ALLOWED_DOMAIN) {
        throw new APIError("BAD_REQUEST", {
          message: `Only @${ALLOWED_DOMAIN} emails are allowed`,
        });
      }
    }),
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await transporter.sendMail({
          from: `"The Otter - Auth" <${SMTP_CONFIG.auth.user}>`,
          to: email,
          subject: "Your sign-in link",
          html: renderEmail(url, email),
        });
      },
      expiresIn: 600,
    }),
    bearer(),
    jwt({ jwks: { keyPairConfig: { alg: "RS256" } }, disableSettingJwtHeader: true }),
    oauthProvider({
      loginPage: "/auth/login",
      consentPage: "/auth/consent",
      scopes: SCOPES,
      resources: RESOURCES,
      resourceSeedMode: "overwrite",
      enforcePerClientResources: false,
      storeClientSecret: { hash: hashSecret },
      customAccessTokenClaims: ({ user, metadata }) =>
        user ? { ...personaClaims(user.persona), login_email: user.email }
          : metadata?.persona ? personaClaims(metadata.persona) : { groups: AGENT_GROUPS },
      extensions: [actorClaims],
    }),
  ],
};

await (await getMigrations(options)).runMigrations();
export const auth = betterAuth(options);

/**
 * Creates or updates the first-party clients so their settings and secrets follow the config
 * on every start. They skip consent and must use PKCE on the authorization code grant. A persona
 * client's persona is stored in its metadata, where customAccessTokenClaims reads it.
 */
async function seedTrustedClients() {
  const { adapter } = await auth.$context;
  for (const c of TRUSTED_CLIENTS) {
    const data = {
      clientSecret: hashSecret(c.secret),
      name: c.name,
      disabled: false,
      skipConsent: true,
      requirePKCE: true,
      tokenEndpointAuthMethod: "client_secret_basic",
      grantTypes: c.grantTypes,
      responseTypes: c.grantTypes.includes("authorization_code") ? ["code"] : [],
      redirectUris: c.redirectUris,
      scopes: SCOPES,
      clientCredentialsScopes: c.clientCredentialsScopes,
      metadata: c.persona ? JSON.stringify({ persona: c.persona }) : null,
      updatedAt: new Date(),
    };
    const where = [{ field: "clientId", value: c.clientId }];
    const existing = await adapter.findOne({ model: "oauthClient", where });
    if (existing) await adapter.update({ model: "oauthClient", where, update: data });
    else await adapter.create({ model: "oauthClient", data: { ...data, clientId: c.clientId, createdAt: new Date() } });
  }
}
await seedTrustedClients();

/** Sets the persona of a user; only the demo personas are accepted. */
export async function setPersona(userId, persona) {
  if (!PERSONAS.some((p) => p.id === persona)) throw new APIError("BAD_REQUEST", { message: "Unknown persona" });
  const { internalAdapter } = await auth.$context;
  await internalAdapter.updateUser(userId, { persona });
}
