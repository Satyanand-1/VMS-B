// Shared server-side checks (PRD §7 validation rules).
import { extraDocs } from './domain/documents';

// Phone: 7–15 digits; only digits, +, (, ), - and spaces are allowed.
export function phoneError(v: string | null | undefined, required = false): string | null {
  const p = (v || '').trim();
  if (!p) return required ? 'Enter the phone number.' : null;
  if (/[^\d+()\-\s]/.test(p)) return 'Enter a phone number using digits only (+, ( ), - and spaces are allowed).';
  const n = p.replace(/\D/g, '').length;
  if (n < 7 || n > 15) return 'Enter a valid phone number (7 to 15 digits).';
  return null;
}

// A real calendar date between 1900 and 2100 (YYYY-MM-DD from the date fields).
export function badDate(v: string | null | undefined): boolean {
  if (!v) return false;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return true;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return y < 1900 || y > 2100 || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d;
}
const BAD_DATE = 'Enter a valid date (MM/DD/YYYY, year 1900–2100).';

// End date may not be before the start date. Dates arrive as YYYY-MM-DD.
export function rangeError(start: string | null | undefined, end: string | null | undefined): string | null {
  if (badDate(start) || badDate(end)) return BAD_DATE;
  return start && end && end < start ? 'The end date cannot be before the start date.' : null;
}

// Duration is optional; when given it must start with a number greater than 0 ("12 months").
export function durationError(v: string | null | undefined): string | null {
  const t = (v || '').trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  return Number.isNaN(n) || n <= 0 ? 'Enter the duration as a number greater than 0, e.g. 12 months.' : null;
}

const hasFile = (form: FormData, n: string) => form.getAll(n).some((v) => v instanceof File && v.size > 0);

// Document rows (<name>, <name>__start, <name>__end):
//  - dates must be valid and the end date not before the start date;
//  - `dated` rows that get a file also need both dates.
// "Other documents" rows need a name that is not already used, a file, and (when a file is chosen) both dates.
export function docDateErrors(form: FormData, names: string[], fe: Record<string, string>, opts: { dated?: string[]; reserved?: string[] } = {}) {
  for (const n of names) {
    const start = String(form.get(`${n}__start`) || '');
    const end = String(form.get(`${n}__end`) || '');
    let e = rangeError(start, end);
    if (!e && opts.dated?.includes(n) && hasFile(form, n) && (!start || !end)) e = 'Enter the start and end date for this document.';
    if (e) fe[n] = fe[`${n}__end`] = e;
  }
  const reserved = (opts.reserved || []).map((x) => x.trim().toLowerCase());
  const seen = new Set<string>();
  for (const x of extraDocs(form)) {
    const key = x.name.toLowerCase();
    if (x.file && !x.name) fe.extra = 'Enter a name for each other document.';
    else if (x.name && !x.file) fe.extra = `Choose a file for “${x.name}”, or remove the row.`;
    else if (reserved.includes(key) || seen.has(key)) fe.extra = `A document named “${x.name}” already exists. Use a different name.`;
    else if (x.file && (!x.start || !x.end)) fe.extra = `Enter the start and end date for “${x.name}”.`;
    else { const e = rangeError(x.start, x.end); if (e) fe.extra = e; }
    seen.add(key);
  }
}
