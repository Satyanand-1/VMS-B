// US formats used in forms (browser and server): phone (555) 123-4567, Federal ID (EIN) 12-3456789, SSN 123-45-6789.

// Phone: a US number of 10 digits (a leading +1 / 1 country code is allowed and dropped), shown as (555) 123-4567.
// Area code and exchange cannot start with 0 or 1 (North American numbering plan).
export function usPhone(v: string | null | undefined): string {
  let d = (v || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  if (d.length !== 10) return (v || '').trim();
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
export function phoneError(v: string | null | undefined, required = false): string | null {
  const p = (v || '').trim();
  if (!p) return required ? 'Enter the phone number.' : null;
  if (/[^\d+()\-.\s]/.test(p)) return 'Enter a US phone number using digits, e.g. (555) 123-4567.';
  let d = p.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  if (d.length !== 10) return 'Enter a 10-digit US phone number, e.g. (555) 123-4567.';
  if (/^[01]/.test(d)) return 'The area code cannot start with 0 or 1, e.g. (555) 123-4567.';
  if (/^[01]/.test(d.slice(3))) return 'The 3 digits after the area code cannot start with 0 or 1, e.g. (555) 123-4567.';
  return null;
}
// While typing: (555) 123-4567
export function typePhone(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('1')) d = d.slice(1); // country code +1 / 1 (a US area code never starts with 1)
  d = d.slice(0, 10);
  if (d.length <= 3) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

// Federal ID (EIN): 9 digits as 12-3456789, with a prefix the IRS issues.
const EIN_BAD_PREFIX = ['00', '07', '08', '09', '17', '18', '19', '28', '29', '49', '69', '70', '78', '79', '89', '96', '97'];
export function einProblem(v: string | null | undefined): string | null {
  const t = (v || '').trim();
  if (!t) return 'Enter the Federal ID (EIN), e.g. 12-3456789.';
  if (!/^\d{2}-?\d{7}$/.test(t)) return 'Enter the Federal ID as 2 digits, a hyphen and 7 digits, e.g. 12-3456789.';
  if (EIN_BAD_PREFIX.includes(t.slice(0, 2))) return `${t.slice(0, 2)} is not a valid Federal ID prefix. Check the first two digits.`;
  return null;
}
export function typeEin(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 9);
  return d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d;
}

// SSN: 9 digits as 123-45-6789; never 000, 666 or 9xx in the first part, 00 in the middle or 0000 at the end.
export function ssnProblem(v: string | null | undefined): string | null {
  const t = (v || '').trim();
  if (!t) return 'Enter the SSN, e.g. 123-45-6789.';
  if (!/^\d{3}-?\d{2}-?\d{4}$/.test(t)) return 'Enter the SSN as 123-45-6789 (9 digits).';
  const d = t.replace(/\D/g, '');
  if (d.startsWith('000') || d.startsWith('666') || d.startsWith('9') || d.slice(3, 5) === '00' || d.slice(5) === '0000') return 'This is not a valid SSN. Check the number.';
  return null;
}
export function typeSsn(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 9);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}
