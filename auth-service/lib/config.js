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
 * Service clients allowed to get a token through the client_credentials grant
 * (POST /api/auth/oauth2/token), as a JSON array in OAUTH_CLIENTS:
 * [{"client_id":"myapp","client_secret":"s3cret","name":"My app"}]
 */
export const OAUTH_CLIENTS = (() => {
  try {
    return JSON.parse(process.env.OAUTH_CLIENTS || "[]");
  } catch {
    console.error("Invalid OAUTH_CLIENTS JSON, disabling OAuth");
    return [];
  }
})();
