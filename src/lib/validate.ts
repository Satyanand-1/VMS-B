// Shared server-side checks (PRD §7 validation rules).

// Phone: 7–15 digits; only digits, +, (, ), - and spaces are allowed.
export function phoneError(v: string | null | undefined, required = false): string | null {
  const p = (v || '').trim();
  if (!p) return required ? 'Enter the phone number.' : null;
  if (/[^\d+()\-\s]/.test(p)) return 'Enter a phone number using digits only (+, ( ), - and spaces are allowed).';
  const n = p.replace(/\D/g, '').length;
  if (n < 7 || n > 15) return 'Enter a valid phone number (7 to 15 digits).';
  return null;
}

// End date may not be before the start date. Dates arrive as YYYY-MM-DD.
export function rangeError(start: string | null | undefined, end: string | null | undefined): string | null {
  return start && end && end < start ? 'The end date cannot be before the start date.' : null;
}

// Checks the start/end dates of document upload rows (<name>__start / <name>__end) and of "Other documents" rows.
export function docDateErrors(form: FormData, names: string[], fe: Record<string, string>) {
  for (const n of names) {
    const e = rangeError(String(form.get(`${n}__start`) || ''), String(form.get(`${n}__end`) || ''));
    if (e) fe[`${n}__end`] = fe[n] = e;
  }
  const starts = form.getAll('extra_start').map(String);
  form.getAll('extra_end').map(String).forEach((end, i) => { const e = rangeError(starts[i], end); if (e) fe.extra = e; });
}
