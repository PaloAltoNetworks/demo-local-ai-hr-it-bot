import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { auth } from "./auth.js";
import { PORT, ALLOWED_DOMAIN, OAUTH_CLIENTS, AUTH_SECRET } from "./lib/config.js";
import { renderLoginPage } from "./views/login.js";
import { signJwt, verifyJwt } from "./lib/jwt.js";

const app = new Hono();

/** Static assets of the login page (CSS, logos). */
app.use("/auth/public/*", serveStatic({ root: "./", rewriteRequestPath: (p) => p.replace("/auth/public", "/public") }));

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

/**
 * Caddy forward_auth endpoint. 200 with X-Auth-* identity headers for a valid
 * client_credentials bearer token or a valid session cookie, 401 otherwise.
 */
app.get("/auth/check", async (c) => {
  const authHeader = c.req.header("Authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    const payload = verifyJwt(authHeader.slice(7), AUTH_SECRET);
    if (payload) {
      c.header("X-Auth-User", payload.sub);
      c.header("X-Auth-Email", payload.sub);
      c.header("X-Auth-Roles", "authp/service");
      c.header("X-Auth-Origin", "client-credentials");
      return c.body(null, 200);
    }
  }

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
      roles: ["authp/user"],
    });
  } catch {
    return c.json({ authenticated: false });
  }
});

app.get("/auth/logout", async (c) => {
  await auth.api.signOut({ headers: c.req.raw.headers }).catch((err) => {
    console.error("Logout error:", err.message);
  });
  return c.redirect("/auth/login");
});

/**
 * OAuth 2.0 client_credentials token endpoint for service clients (OAUTH_CLIENTS).
 * Credentials come from a Basic auth header or the form body; the token is a 1-hour
 * HS256 JWT signed with AUTH_SECRET, accepted by /auth/check as a bearer token.
 */
app.post("/api/auth/oauth2/token", async (c) => {
  const body = await c.req.parseBody();
  if (body.grant_type !== "client_credentials") {
    return c.json({ error: "unsupported_grant_type" }, 400);
  }

  let clientId, clientSecret;
  const authHeader = c.req.header("Authorization") || "";
  if (authHeader.startsWith("Basic ")) {
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
    const sep = decoded.indexOf(":");
    if (sep === -1) return c.json({ error: "invalid_client" }, 401);
    clientId = decodeURIComponent(decoded.slice(0, sep));
    clientSecret = decodeURIComponent(decoded.slice(sep + 1));
  } else {
    clientId = body.client_id;
    clientSecret = body.client_secret;
  }

  const client = OAUTH_CLIENTS.find(
    (cl) => cl.client_id === clientId && cl.client_secret === clientSecret
  );
  if (!client) {
    return c.json({ error: "invalid_client" }, 401);
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 3600;
  const scopes = body.scope ? body.scope.split(" ").filter(Boolean) : [];

  const token = signJwt(
    {
      iss: c.req.url.replace(/\/api\/auth\/oauth2\/token.*/, ""),
      sub: client.client_id,
      client_id: client.client_id,
      name: client.name || client.client_id,
      scope: scopes.join(" "),
      iat: now,
      exp: now + expiresIn,
    },
    AUTH_SECRET
  );

  return c.json({
    access_token: token,
    token_type: "Bearer",
    expires_in: expiresIn,
    scope: scopes.join(" "),
  });
});

/** Every other /api/auth/* route (magic link, session, sign-out) is Better Auth's. */
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Auth service running on :${PORT}`);
});
