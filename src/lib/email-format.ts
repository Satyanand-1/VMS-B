// One email rule for the whole app (browser and server): name@domain.tld
//  - exactly one @, nothing empty on either side, no spaces, at most 254 characters;
//  - the name part: letters, digits and . _ % + - ' (no dot at the start or end, no two dots in a row);
//  - the domain: labels of letters, digits and hyphens (1–63 characters, not starting or ending with a hyphen) separated
//    by dots, ending in a letters-only extension of 2–24 characters (.com, .io, .co.in).
// Checked with simple, linear patterns (no nested repetition), so a long input can never slow the check down.
const NAME_CHARS = /^[A-Za-z0-9._%+'-]+$/;
const LABEL_CHARS = /^[A-Za-z0-9-]{1,63}$/;
const TLD = /^[A-Za-z]{2,24}$/;

export function isValidEmail(v: string | null | undefined): boolean {
  const e = (v || '').trim();
  if (!e || e.length > 254) return false;
  const parts = e.split('@');
  if (parts.length !== 2) return false;
  const [name, domain] = parts;
  if (!name || name.length > 64 || !NAME_CHARS.test(name) || name.startsWith('.') || name.endsWith('.') || name.includes('..')) return false;
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  const tld = labels[labels.length - 1];
  if (!TLD.test(tld)) return false;
  return labels.every((l) => LABEL_CHARS.test(l) && !l.startsWith('-') && !l.endsWith('-'));
}

// A short reason, so the user knows what to fix.
export function emailProblem(v: string | null | undefined): string | null {
  const e = (v || '').trim();
  if (!e) return null;
  if (/\s/.test(e)) return 'An email address cannot contain spaces.';
  if (e.length > 254) return 'The email address is too long.';
  const at = e.split('@').length - 1;
  if (at === 0) return 'The email address must contain @, e.g. name@company.com.';
  if (at > 1) return 'The email address can contain only one @.';
  const [name, domain] = e.split('@');
  if (!name) return 'Enter the part before @, e.g. name@company.com.';
  if (!domain) return 'Enter the domain after @, e.g. name@company.com.';
  if (!domain.includes('.')) return 'The domain needs an extension, e.g. @company.com.';
  if (e.includes('..')) return 'The email address cannot contain two dots in a row.';
  if (name.startsWith('.') || name.endsWith('.')) return 'The part before @ cannot start or end with a dot.';
  if (!TLD.test(domain.split('.').pop() || '')) return 'The domain must end with an extension of letters, e.g. .com or .in.';
  if (domain.split('.').some((l) => !LABEL_CHARS.test(l) || l.startsWith('-') || l.endsWith('-'))) return 'The domain can contain only letters, digits, dots and hyphens, e.g. @my-company.com.';
  if (!NAME_CHARS.test(name)) return 'The part before @ contains a character that is not allowed.';
  if (!isValidEmail(e)) return 'Enter a valid email address, e.g. name@company.com.';
  return null;
}
