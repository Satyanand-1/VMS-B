// One email rule for the whole app (browser and server): name@domain.tld
//  - exactly one @, nothing empty on either side, no spaces;
//  - the name part: letters, digits and . _ % + - ' (no dot at the start or end, no two dots in a row);
//  - the domain: labels of letters, digits and hyphens separated by dots, ending in a letters-only extension of 2+ characters (.com, .io, .co.in).
const EMAIL_RE = /^(?!\.)(?!.*\.\.)[A-Za-z0-9._%+'-]+(?<!\.)@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/;

export function isValidEmail(v: string | null | undefined): boolean {
  const e = (v || '').trim();
  return e.length <= 254 && EMAIL_RE.test(e);
}

// A short reason, so the user knows what to fix.
export function emailProblem(v: string | null | undefined): string | null {
  const e = (v || '').trim();
  if (!e) return null;
  if (/\s/.test(e)) return 'An email address cannot contain spaces.';
  const at = (e.match(/@/g) || []).length;
  if (at === 0) return 'The email address must contain @, e.g. name@company.com.';
  if (at > 1) return 'The email address can contain only one @.';
  const [name, domain] = e.split('@');
  if (!name) return 'Enter the part before @, e.g. name@company.com.';
  if (!domain) return 'Enter the domain after @, e.g. name@company.com.';
  if (!domain.includes('.')) return 'The domain needs an extension, e.g. @company.com.';
  if (e.includes('..')) return 'The email address cannot contain two dots in a row.';
  if (name.startsWith('.') || name.endsWith('.')) return 'The part before @ cannot start or end with a dot.';
  if (!/\.[A-Za-z]{2,24}$/.test(domain)) return 'The domain must end with an extension of letters, e.g. .com or .in.';
  if (/[^A-Za-z0-9.-]/.test(domain) || /(^|\.)-|-(\.|$)/.test(domain)) return 'The domain can contain only letters, digits, dots and hyphens, e.g. @my-company.com.';
  if (/[^A-Za-z0-9._%+'-]/.test(name)) return 'The part before @ contains a character that is not allowed.';
  if (!isValidEmail(e)) return 'Enter a valid email address, e.g. name@company.com.';
  return null;
}
