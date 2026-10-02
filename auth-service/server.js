import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { oauthProviderAuthServerMetadata, oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { auth, setPersona } from "./auth.js";
import { PORT, ALLOWED_DOMAIN, PERSONAS, RESOURCE_GROUPS } from "./lib/config.js";
import { renderLoginPage } from "./views/login.js";
import { renderConsentPage } from "./views/consent.js";

const app = new Hono();

/** Static assets of the login page (CSS, logos). */
app.use("/auth/public/*", serveStatic({ root: "./", rewriteRequestPath: (p) => p.replace("/auth/public", "/public") }));

/** Authorization server discovery (RFC 8414 and OpenID), served at the root as clients expect. */
const authServerMetadata = oauthProviderAuthServerMetadata(auth);
const openIdMetadata = oauthProviderOpenIdConfigMetadata(auth);
app.get("/.well-known/oauth-authorization-server/*", (c) => authServerMetadata(c.req.raw));
app.get("/.well-known/oauth-authorization-server", (c) => authServerMetadata(c.req.raw));
app.get("/.well-known/openid-configuration/*", (c) => openIdMetadata(c.req.raw));
app.get("/.well-known/openid-configuration", (c) => openIdMetadata(c.req.raw));

/** Login page; redirects straight to redirect_url when the visitor already has a session. */
app.get("/auth/login", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session) {
      const redirectUrl = c.req.query("redirect_url") || "/";
      return c.redirect(redirectUrl);
    }
  } catch {}
  return c.html(renderLoginPage({
    error: c.req.query("error") || "",
    sent: c.req.query("sent") || "",
    allowedDomain: ALLOWED_DOMAIN,
    redirectUrl: c.req.query("redirect_url") || "/",
  }));
});

/** Consent page the authorization endpoint sends third-party clients to; first-party clients skip it. */
app.get("/auth/consent", (c) => c.html(renderConsentPage({
  clientId: c.req.query("client_id") || "",
  scope: c.req.query("scope") || "",
})));

/**
 * Caddy forward_auth endpoint. 200 with X-Auth-* identity headers for a valid session
 * cookie, 401 otherwise.
 */
app.get("/auth/check", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.body(null, 401);

    c.header("X-Auth-User", session.user.email);
    c.header("X-Auth-Email", session.user.email);
    c.header("X-Auth-Roles", "authp/user");
    c.header("X-Auth-Origin", "better-auth");
    return c.body(null, 200);
  } catch {
    return c.body(null, 401);
  }
});

/** Current session identity, for pages that want to show who is signed in. */
app.get("/auth/whoami", async (c) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ authenticated: false });
    return c.json({
      authenticated: true,
      email: session.user.email,
      name: session.user.name,
      persona: session.user.persona || PERSONAS[0].id,
      roles: ["authp/user"],
    });
  } catch {
    return c.json({ authenticated: false });
  }
});

/** The personas a signed-in user can switch to (id, name, email, groups, access level). */
app.get("/auth/personas", (c) => c.json({ personas: PERSONAS }));

/** Switches the signed-in user's persona ({ persona: "<id>" }); tokens issued afterwards carry it. */
app.post("/auth/persona", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
  if (!session) return c.json({ error: "unauthorized" }, 401);
  const { persona } = await c.req.json().catch(() => ({}));
  if (!PERSONAS.some((p) => p.id === persona)) return c.json({ error: "invalid_persona" }, 400);
  await setPersona(session.user.id, persona);
  return c.json({ persona });
});

app.get("/auth/logout", async (c) => {
  await auth.api.signOut({ headers: c.req.raw.headers }).catch((err) => {
    console.error("Logout error:", err.message);
  });
  return c.redirect("/auth/login");
});

/**
 * Authorization requests keep only the MCP servers the signed-in user's persona may reach
 * (RESOURCE_GROUPS): the code, and the token exchanged for it, are then limited to those audiences.
 * Without a session the request goes through unchanged and the provider sends the user to sign in.
 */
app.get("/api/auth/oauth2/authorize", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
  if (!session) return auth.handler(c.req.raw);
  const groups = (PERSONAS.find((p) => p.id === session.user.persona) || PERSONAS[0]).groups;
  const url = new URL(c.req.url);
  const allowed = url.searchParams.getAll("resource").filter((r) => {
    const needed = RESOURCE_GROUPS[new URL(r).hostname.split(".")[0]];
    return !needed || needed.some((g) => groups.includes(g));
  });
  url.searchParams.delete("resource");
  for (const r of allowed) url.searchParams.append("resource", r);
  return auth.handler(new Request(url, c.req.raw));
});

/** Every other /api/auth/* route (magic link, session, OAuth 2.1, JWKS) is Better Auth's. */
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Auth service running on :${PORT}`);
});
