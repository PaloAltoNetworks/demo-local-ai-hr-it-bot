import { escapeHtml } from "./helpers.js";

/**
 * Consent page for clients that do not skip consent. Approve or Deny posts the signed
 * authorization query back to /api/auth/oauth2/consent, then follows the redirect it returns.
 */
export function renderConsentPage({ clientId, scope }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize - The Otter</title>
  <link rel="stylesheet" href="/auth/public/css/style.css" />
</head>
<body>
  <div class="card">
    <img src="/auth/public/images/logo-dark.png" alt="Palo Alto Networks" class="logo-dark" />
    <img src="/auth/public/images/logo-light.png" alt="Palo Alto Networks" class="logo-light" />
    <h1>Authorize ${escapeHtml(clientId)}</h1>
    <p class="subtitle">This application asks to act on your behalf with: ${escapeHtml(scope.split(" ").join(", "))}</p>
    <div id="alert-error" class="alert alert-error" style="display:none"></div>
    <button type="button" data-accept="true">Approve</button>
    <button type="button" data-accept="false">Deny</button>
    <script>
      document.querySelectorAll('button[data-accept]').forEach((btn) => btn.addEventListener('click', async () => {
        const res = await fetch('/api/auth/oauth2/consent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accept: btn.dataset.accept === 'true', oauth_query: location.search.slice(1) }),
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));
        const target = data.url || data.redirect_uri;
        if (res.ok && target) return location.assign(target);
        const err = document.getElementById('alert-error');
        err.textContent = data.message || data.error_description || 'Authorization failed';
        err.style.display = 'block';
      }));
    </script>
  </div>
</body>
</html>`;
}
