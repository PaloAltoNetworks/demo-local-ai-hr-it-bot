import { escapeHtml } from "./helpers.js";

export function renderLoginPage({ error, sent, allowedDomain, redirectUrl }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign In - The Otter</title>
  <link rel="stylesheet" href="/auth/public/css/style.css" />
</head>
<body>
  <div class="card">
    <img src="/auth/public/images/logo-dark.png" alt="Palo Alto Networks" class="logo-dark" />
    <img src="/auth/public/images/logo-light.png" alt="Palo Alto Networks" class="logo-light" />
    <h1>Sign in to The Otter</h1>
    <p class="subtitle">Enterprise HR/IT Assistant</p>

    <div id="alert-error" class="alert alert-error" style="display:none"></div>
    <div id="alert-success" class="alert alert-success" style="display:none"></div>

    ${error ? `<div class="alert alert-error">${escapeHtml(error)}</div>` : ""}
    ${sent ? `<div class="alert alert-success">Magic link sent to <strong>${escapeHtml(sent)}</strong>. Check your inbox.</div>` : ""}

    <form id="loginForm">
      <label for="email">Email address</label>
      <input type="email" id="email" name="email" placeholder="you@${allowedDomain}" required autofocus />
      <button type="submit" id="submitBtn">Send magic link</button>
    </form>

    <p class="footer">Only @${allowedDomain} addresses are accepted</p>

    <script>
      const input = document.getElementById('email');
      const form = document.getElementById('loginForm');
      const btn = document.getElementById('submitBtn');
      const alertErr = document.getElementById('alert-error');
      const alertOk = document.getElementById('alert-success');
      const domain = ${JSON.stringify(allowedDomain)};
      const redirectUrl = ${JSON.stringify(redirectUrl || "/")};

      const saved = localStorage.getItem('auth_email');
      if (saved) { input.value = saved; }

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        alertErr.style.display = 'none';
        alertOk.style.display = 'none';

        const email = input.value.trim().toLowerCase();
        if (!email.endsWith('@' + domain)) {
          alertErr.textContent = 'Only @' + domain + ' emails are allowed';
          alertErr.style.display = 'block';
          return;
        }

        localStorage.setItem('auth_email', email);
        btn.disabled = true;
        btn.textContent = 'Sending...';

        try {
          const res = await fetch('/api/auth/sign-in/magic-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, callbackURL: redirectUrl.startsWith('http') ? redirectUrl : window.location.origin + redirectUrl }),
            credentials: 'include',
          });

          if (res.ok) {
            alertOk.textContent = 'Magic link sent to ' + email + '. Check your inbox.';
            alertOk.style.display = 'block';
          } else {
            const data = await res.json().catch(() => ({}));
            alertErr.textContent = data.message || 'Failed to send magic link. Try again.';
            alertErr.style.display = 'block';
          }
        } catch (err) {
          alertErr.textContent = 'Network error. Please try again.';
          alertErr.style.display = 'block';
        }

        btn.disabled = false;
        btn.textContent = 'Send magic link';
      });
    </script>
  </div>
</body>
</html>`;
}
