export const PORT = parseInt(process.env.PORT || "3001", 10);
export const AUTH_SECRET = process.env.AUTH_SECRET || process.env.JWT_SHARED_SECRET;
export const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || "paloaltonetworks.com";
export const SITE_URL = process.env.SITE_URL || "https://localhost";
/** Origins allowed to call the auth API, from comma-separated TRUSTED_ORIGINS (wildcards allowed). */
export const TRUSTED_ORIGINS = (process.env.TRUSTED_ORIGINS || "https://*.panw.pro").split(",").map((o) => o.trim()).filter(Boolean);
/** Session cookie name prefix; two instances sharing a cookie domain need different prefixes. */
export const COOKIE_PREFIX = process.env.AUTH_COOKIE_PREFIX || "better-auth";

if (!AUTH_SECRET || AUTH_SECRET.length < 32) {
  throw new Error("AUTH_SECRET (or JWT_SHARED_SECRET) must be set and at least 32 characters");
}
if (!process.env.SMTP_HOST || !process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
  throw new Error("SMTP_HOST, SMTP_USERNAME, and SMTP_PASSWORD are required");
}

export const SMTP_CONFIG = {
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587", 10),
  secure: parseInt(process.env.SMTP_PORT || "587", 10) === 465,
  auth: {
    user: process.env.SMTP_USERNAME,
    pass: process.env.SMTP_PASSWORD,
  },
};

/**
 * Identities a signed-in user can act as; the first is the default. This is the directory side of
 * identity (name, email, groups), as an identity provider holds it: employees match a record of
 * the demo HR data by employee_id, the external contractor has none. `access` names the access
 * level the UI describes. Groups drive the gateway's authorization of the MCP servers.
 */
export const PERSONAS = [
  { id: "EMP-034", name: "Aurélien Girard", email: "aurelien.girard@company.com", groups: ["employees"], access: "employee" },
  { id: "EMP-033", name: "Sophie Martin", email: "sophie.martin@company.com", groups: ["employees"], access: "manager" },
  { id: "EMP-068", name: "Lisa Wang", email: "lisa.wang@company.com", groups: ["employees", "hr"], access: "hr" },
  { id: "EXT-001", name: "Alex Morgan", email: "alex.morgan@partner.example", groups: ["external"], access: "external" },
];

/** Groups of tokens issued to a client acting on its own (client_credentials). */
export const AGENT_GROUPS = ["agents"];

/** Scopes the MCP servers check on each tool. */
export const SCOPES = ["hr:read", "it:read", "it:write", "it:triage"];

/**
 * Protected resources (RFC 8707) tokens are issued for: the canonical URLs of the MCP servers,
 * comma-separated in OAUTH_RESOURCES. Each server checks that its own URL is in the token audience.
 */
export const RESOURCES = (process.env.OAUTH_RESOURCES || "").split(",").map((r) => r.trim()).filter(Boolean);

/**
 * First-party clients, seeded at startup with skip_consent. Their secrets come from the shared
 * app env so the client and the auth service read the same value; a client without a secret is
 * not seeded. The chatbot's redirect URI is a loopback URL nobody visits: its backend reads the code from the
 * authorize redirect itself.
 */
export const TRUSTED_CLIENTS = [
  {
    clientId: "chatbot",
    name: "The Otter",
    secret: process.env.CHATBOT_CLIENT_SECRET,
    grantTypes: ["authorization_code", "client_credentials"],
    redirectUris: [process.env.CHATBOT_REDIRECT_URI || "http://localhost:3018/oauth/callback"],
    clientCredentialsScopes: SCOPES,
  },
  {
    clientId: "it-triage",
    name: "IT Triage Agent",
    secret: process.env.IT_TRIAGE_CLIENT_SECRET,
    grantTypes: ["client_credentials"],
    redirectUris: [],
    clientCredentialsScopes: ["hr:read", "it:read"],
  },
].filter((c) => c.secret);
