import { escapeHtml } from "./helpers.js";

export function renderEmail(magicUrl, email) {
  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
  <h2 style="color: #1a1a2e; margin-bottom: 16px;">Sign in to The Otter</h2>
  <p style="color: #4a5568; font-size: 15px; line-height: 1.6;">
    Click the button below to sign in as <strong>${escapeHtml(email)}</strong>. This link expires in 10 minutes.
  </p>
  <a href="${magicUrl}" style="display: inline-block; margin: 24px 0; padding: 14px 32px; background: #fa582d; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
    Sign in
  </a>
  <p style="color: #8892a4; font-size: 13px; line-height: 1.5;">
    If you didn't request this, you can safely ignore this email.<br/>
    Link: <a href="${magicUrl}" style="color: #fa582d;">${magicUrl}</a>
  </p>
</div>`;
}
