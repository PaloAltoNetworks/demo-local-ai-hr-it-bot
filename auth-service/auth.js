import Database from "better-sqlite3";
import { betterAuth, APIError } from "better-auth";
import { magicLink, bearer } from "better-auth/plugins";
import { createAuthMiddleware } from "better-auth/api";
import nodemailer from "nodemailer";
import { ALLOWED_DOMAIN, SITE_URL, SMTP_CONFIG, AUTH_SECRET, TRUSTED_ORIGINS, COOKIE_PREFIX } from "./lib/config.js";
import { renderEmail } from "./views/email.js";
import { migrate } from "./lib/migrate.js";

/** SQLite file on the persistent volume: users, sessions and pending magic links. */
const DB_PATH = "/data/auth.db";
migrate(DB_PATH);

const transporter = nodemailer.createTransport(SMTP_CONFIG);

/**
 * Better Auth with magic-link sign-in only (no passwords), restricted to one email domain.
 * Sessions last 7 days, refresh daily, and are cached in the cookie for 5 minutes.
 * The cookie is shared across subdomains when AUTH_COOKIE_DOMAIN is set; its name prefix
 * is configurable so two instances can share a cookie domain without overwriting each other.
 * Magic links expire after 10 minutes.
 */
export const auth = betterAuth({
  database: new Database(DB_PATH),
  baseURL: SITE_URL,
  basePath: "/api/auth",
  secret: AUTH_SECRET,
  trustedOrigins: TRUSTED_ORIGINS,
  emailAndPassword: { enabled: false },
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
  ],
});
