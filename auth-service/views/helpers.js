export function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** JSON for a value written inside an inline <script>: `<` is escaped so the value cannot close the tag. */
export function scriptJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
