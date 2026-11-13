// Dates read like "Nov 12, 2026" everywhere (PRD §7); money is USD with 2 decimals.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parts(d: string | Date): [number, number, number] {
  if (typeof d === 'string') {
    const [y, m, day] = d.slice(0, 10).split('-').map(Number);
    return [y, m - 1, day];
  }
  return [d.getFullYear(), d.getMonth(), d.getDate()];
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const [y, m, day] = parts(d);
  return `${MONTHS[m]} ${day}, ${y}`;
}

// "2026-10-01" → "October 2026" / "Oct 2026"
export function monthLong(period: string): string {
  const [y, m] = parts(period);
  return `${MONTHS_LONG[m]} ${y}`;
}
export function monthShort(period: string): string {
  const [y, m] = parts(period);
  return `${MONTHS[m]} ${y}`;
}
// "October 2026" → "2026-10-01"
export function periodFromLong(label: string): string {
  const [name, year] = label.split(' ');
  const m = MONTHS_LONG.indexOf(name);
  return `${year}-${String(m + 1).padStart(2, '0')}-01`;
}

export function usd(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '—';
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Half-up rounding to 2 decimals (INV-6), safe for floating point.
export function roundHalfUp(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function initials(name: string): string {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export function todayISO(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = parts(iso);
  const t = new Date(Date.UTC(y, m, d + days));
  return t.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const [y1, m1, d1] = parts(fromIso);
  const [y2, m2, d2] = parts(toIso);
  return Math.round((Date.UTC(y2, m2, d2) - Date.UTC(y1, m1, d1)) / 86400000);
}
