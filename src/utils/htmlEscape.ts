export function htmlEscape(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function htmlCode(s: string): string {
  return `<code>${htmlEscape(s)}</code>`;
}

export function htmlPre(s: string): string {
  return `<pre>${htmlEscape(s)}</pre>`;
}
