/** Lowercase word tokens used for index-ordered title search ("Node.js" and "C++" survive intact). */
export function tokenize(text: string | undefined): string[] {
  const tokens = String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter(Boolean);
  return [...new Set(tokens)];
}
