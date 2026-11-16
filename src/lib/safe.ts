// Security helpers shared by server code.

// Where to go after saving: only a path inside this app (e.g. "/vendors?m=…"), never another site.
// Rejects absolute URLs, protocol-relative "//evil.com", backslash tricks and control characters.
export function safeBack(back: unknown, fallback: string): string {
  const b = typeof back === 'string' ? back.trim() : '';
  if (!b.startsWith('/') || b.startsWith('//') || b.startsWith('/\\') || /[\\\u0000-\u001f]/.test(b) || b.length > 500) return fallback;
  return b;
}

// Look up a table by a key that may come from outside (a file extension, a stored status …): only the table's own
// entries count, never built-in object properties such as "constructor" or "__proto__".
export function ownValue<T>(table: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

// For case-insensitive "same name already exists" checks: % and _ are wildcards in ILIKE, so match them literally.
export function likeExact(v: string): string {
  return v.replace(/[\\%_]/g, (c) => `\\${c}`);
}
