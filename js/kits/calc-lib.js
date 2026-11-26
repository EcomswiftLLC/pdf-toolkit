// Calculators kit: pure maths, no DOM. Exact decimal arithmetic (BigInt), civil-date maths without Date objects.
// Everything here is verified against independent Python (Decimal / dateutil) in tests/t_calc.py.

// ------------------------------------------------------------------ exact decimals
const P10 = k => 10n ** BigInt(k);
const babs = x => (x < 0n ? -x : x);
// divide two BigInts, rounding half away from zero
function divHalfUp(num, den) {
  if (den < 0n) { num = -num; den = -den; }
  const neg = num < 0n; const a = babs(num);
  let q = a / den; const r = a % den;
  if (2n * r >= den) q += 1n;
  return neg ? -q : q;
}
// A decimal is { n: BigInt, s: number } meaning n / 10^s.
export const D = {
  make: (n, s = 0) => ({ n: BigInt(n), s }),
  int: i => ({ n: BigInt(i), s: 0 }),
  // strict parse of a plain decimal string like "-12.50"; returns null if not valid
  parse(str) {
    const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(String(str).trim());
    if (!m || (m[2] === '' && (m[3] === undefined || m[3] === ''))) return null;
    const frac = m[3] || '';
    const n = BigInt((m[2] || '0') + frac);
    return { n: m[1] === '-' ? -n : n, s: frac.length };
  },
  align(a, b) { const s = Math.max(a.s, b.s); return [a.n * P10(s - a.s), b.n * P10(s - b.s), s]; },
  add(a, b) { const [x, y, s] = D.align(a, b); return { n: x + y, s }; },
  sub(a, b) { const [x, y, s] = D.align(a, b); return { n: x - y, s }; },
  mul: (a, b) => ({ n: a.n * b.n, s: a.s + b.s }),
  cmp(a, b) { const [x, y] = D.align(a, b); return x < y ? -1 : x > y ? 1 : 0; },
  isZero: a => a.n === 0n,
  isNeg: a => a.n < 0n,
  neg: a => ({ n: -a.n, s: a.s }),
  abs: a => ({ n: babs(a.n), s: a.s }),
  // round to p decimal places, half away from zero
  round(a, p) {
    if (a.s <= p) return { n: a.n * P10(p - a.s), s: p };
    return { n: divHalfUp(a.n, P10(a.s - p)), s: p };
  },
  // a / b to p decimal places (b must not be zero)
  div(a, b, p) {
    const num = a.n * P10(b.s + p); const den = b.n * P10(a.s);
    return { n: divHalfUp(num, den), s: p };
  },
  // a / b to p decimal places rounded toward +infinity ('ceil') or -infinity ('floor')
  divDir(a, b, p, dir) {
    let num = a.n * P10(b.s + p), den = b.n * P10(a.s);
    if (den < 0n) { num = -num; den = -den; }
    let q = num / den; const r = num % den; // BigInt division truncates toward zero
    if (r !== 0n) { if (dir === 'ceil' && num > 0n) q += 1n; if (dir === 'floor' && num < 0n) q -= 1n; }
    return { n: q, s: p };
  },
  num: a => Number(a.n) / 10 ** a.s,
  // fixed p decimals, optional thousands separators
  str(a, p, group = true) {
    const r = D.round(a, p); const neg = r.n < 0n; let t = babs(r.n).toString().padStart(p + 1, '0');
    let ip = t.slice(0, t.length - p), fp = p ? t.slice(t.length - p) : '';
    if (group) ip = groupInt(ip);
    return (neg ? '-' : '') + ip + (p ? '.' + fp : '');
  },
  // up to p decimal places with trailing zeros removed
  trim(a, p, group = true) {
    let s = D.str(a, p, group);
    if (s.includes('.')) s = s.replace(/\.?0+$/, '');
    return s === '-0' ? '0' : s;
  },
};
export const groupInt = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// Parse what a person typed into a number field.
// Returns { kind: 'empty' } | { kind: 'bad', msg } | { kind: 'ok', d }.
// o: name (for messages), neg (allow negatives), min, max (numbers), minExcl (value must be > min), dp (max decimal places), int (whole numbers only), unit (appended in range messages)
export function parseNumInput(raw, o = {}) {
  const name = o.name || 'a number';
  const s0 = String(raw ?? '').trim();
  if (s0 === '') return { kind: 'empty' };
  let s = s0.replace(/[\s ]/g, '');
  let neg = false;
  if (s[0] === '-' || s[0] === '+' || s[0] === '−') { neg = s[0] !== '+'; s = s.slice(1); }
  const ok = /^(\d{1,3}(,\d{3})+|\d*)(\.\d*)?$/.test(s) && /\d/.test(s);
  if (!ok) {
    if (s.includes(',')) return { kind: 'bad', msg: 'Use a dot for decimals and commas only for thousands, for example 1,250.50.' };
    return { kind: 'bad', msg: `Enter ${name} as a number, using digits and a dot, for example 12.5.` };
  }
  s = s.replace(/,/g, '');
  const [ip, fp = ''] = s.split('.');
  const dp = o.dp ?? 6;
  if (o.int && fp.replace(/0+$/, '') !== '') return { kind: 'bad', msg: `Enter ${name} as a whole number.` };
  if (fp.length > dp && fp.slice(dp).replace(/0/g, '') !== '') return { kind: 'bad', msg: dp === 0 ? `Enter ${name} as a whole number.` : `Use at most ${dp} decimal places.` };
  if (ip.replace(/^0+/, '').length > 15) return { kind: 'bad', msg: 'That number is too large to calculate.' };
  let d = D.parse((neg ? '-' : '') + (ip || '0') + (fp ? '.' + fp.slice(0, Math.max(dp, 0)) : ''));
  if (!d) return { kind: 'bad', msg: `Enter ${name} as a number, using digits and a dot, for example 12.5.` };
  if (d.n === 0n) neg = false;
  if (neg && !o.neg && !(o.min !== undefined && o.min < 0)) return { kind: 'bad', msg: `${cap(name)} cannot be negative.` };
  const unit = o.unit ? ' ' + o.unit : '';
  if (o.min !== undefined && o.max !== undefined) {
    if (D.cmp(d, D.parse(String(o.min))) < 0 || D.cmp(d, D.parse(String(o.max))) > 0 || (o.minExcl && D.cmp(d, D.parse(String(o.min))) === 0)) {
      return { kind: 'bad', msg: o.minExcl ? `Enter ${name} greater than ${fmtPlain(o.min)} and up to ${fmtPlain(o.max)}${unit}.` : `Enter ${name} from ${fmtPlain(o.min)} to ${fmtPlain(o.max)}${unit}.` };
    }
  } else if (o.min !== undefined) {
    const c = D.cmp(d, D.parse(String(o.min)));
    if (c < 0 || (o.minExcl && c === 0)) return { kind: 'bad', msg: `${cap(name)} must be ${o.minExcl ? 'greater than' : 'at least'} ${fmtPlain(o.min)}${unit}.` };
  } else if (o.max !== undefined) {
    if (D.cmp(d, D.parse(String(o.max))) > 0) return { kind: 'bad', msg: `${cap(name)} must be ${fmtPlain(o.max)}${unit} or less.` };
  }
  return { kind: 'ok', d };
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const fmtPlain = n => { const [a, b] = String(n).split('.'); return groupInt(a) + (b ? '.' + b : ''); };

// ------------------------------------------------------------------ currency (display only)
export const CURRENCIES = [
  { v: 'USD', t: 'US dollar ($)', sym: '$' }, { v: 'EUR', t: 'Euro (€)', sym: '€' }, { v: 'GBP', t: 'British pound (£)', sym: '£' },
  { v: 'PKR', t: 'Pakistani rupee (Rs)', sym: 'Rs ' }, { v: 'INR', t: 'Indian rupee (₹)', sym: '₹' }, { v: 'CAD', t: 'Canadian dollar (C$)', sym: 'C$' },
  { v: 'AUD', t: 'Australian dollar (A$)', sym: 'A$' }, { v: 'AED', t: 'UAE dirham (AED)', sym: 'AED ' }, { v: 'NGN', t: 'Nigerian naira (₦)', sym: '₦' },
  { v: 'ZAR', t: 'South African rand (R)', sym: 'R ' },
];
export const symOf = code => (CURRENCIES.find(c => c.v === code) || CURRENCIES[0]).sym;
// integer cents (Number, safe up to 9e15) -> "$1,234.56"
export function fmtCents(cents, sym = '$') {
  const c = BigInt(Math.round(cents)); const neg = c < 0n; const a = babs(c);
  const s = a.toString().padStart(3, '0');
  return (neg ? '-' : '') + sym + groupInt(s.slice(0, -2)) + '.' + s.slice(-2);
}
export const fmtDecMoney = (d, sym = '$') => { const t = D.str(d, 2); return t[0] === '-' ? '-' + sym + t.slice(1) : sym + t; };
export const centsOf = d => Number(D.round(D.mul(d, D.int(100)), 0).n); // Dec of currency units -> integer cents

// ------------------------------------------------------------------ calendar dates (proleptic Gregorian, no Date objects, so no DST or time zone bugs)
export const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const dim = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
// days since 1970-01-01
export function toDays(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400); const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
export function fromDays(z) {
  z += 719468;
  const era = Math.floor(z / 146097); const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}
export const dayNum = o => toDays(o.y, o.m, o.d);
export const mod = (a, n) => ((a % n) + n) % n;
// 0 = Sunday
export const weekday = days => mod(days + 4, 7);
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const fmtDate = o => `${MONTHS[o.m - 1]} ${o.d}, ${o.y}`;
export const fmtDateLong = o => `${WEEKDAYS[weekday(dayNum(o))]}, ${fmtDate(o)}`;
export const pad2 = n => String(n).padStart(2, '0');
export const isoDate = o => `${String(o.y).padStart(4, '0')}-${pad2(o.m)}-${pad2(o.d)}`;
// "YYYY-MM-DD" -> {y,m,d} or null if it is not a real date
export function parseISODate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1 || mo < 1 || mo > 12 || d < 1 || d > dim(y, mo)) return null;
  return { y, m: mo, d };
}
// local calendar date today (the user's own time zone)
export function todayLocal() { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() }; }
// add k months, clamping the day to the end of the target month (Jan 31 + 1 month = Feb 28 or 29)
export function addMonths(o, k) {
  const t = o.y * 12 + (o.m - 1) + k; const y = Math.floor(t / 12), m = mod(t, 12) + 1;
  return { y, m, d: Math.min(o.d, dim(y, m)) };
}
export const addDays = (o, k) => fromDays(dayNum(o) + k);
export const cmpDate = (a, b) => dayNum(a) - dayNum(b);
export const inRange = o => o.y >= 1 && o.y <= 9999;
// whole years / months / days from a (earlier) to b (later or equal), month-end clamp rule
export function diffYMD(a, b, cap11 = false) {
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  while (months > 0 && cmpDate(addMonths(a, months), b) > 0) months--;
  if (cap11 && months > 11) months = 11;
  const anchor = addMonths(a, months);
  return { years: Math.floor(months / 12), months: mod(months, 12), totalMonths: months, days: dayNum(b) - dayNum(anchor) };
}
// ISO 8601 week
export function isoWeek(o) {
  const n = dayNum(o); const wd = mod(weekday(n) + 6, 7); // Monday = 0
  const thursday = n - wd + 3; const ty = fromDays(thursday).y;
  const jan1 = toDays(ty, 1, 1);
  return { week: Math.floor((thursday - jan1) / 7) + 1, year: ty };
}
export const dayOfYear = o => dayNum(o) - toDays(o.y, 1, 1) + 1;
// Monday-Friday days in [from, to) (day numbers)
export function weekdaysBetween(from, to) {
  if (to <= from) return 0;
  const n = to - from; let c = Math.floor(n / 7) * 5;
  for (let i = from + Math.floor(n / 7) * 7; i < to; i++) { const w = weekday(i); if (w !== 0 && w !== 6) c++; }
  return c;
}

// ---- age (Feb 29 births: the birthday falls on Mar 1 in years that are not leap years)
export const isFeb29 = o => o.m === 2 && o.d === 29;
export function anniversary(dob, year) {
  if (isFeb29(dob) && !isLeap(year)) return { y: year, m: 3, d: 1 };
  return { y: year, m: dob.m, d: dob.d };
}
export function ageBetween(dob, at) {
  let k = at.y - dob.y;
  if (cmpDate(anniversary(dob, dob.y + k), at) > 0) k--;
  const A = anniversary(dob, dob.y + k);
  const sub = diffYMD(A, at, true);
  const totalDays = dayNum(at) - dayNum(dob);
  let nb = anniversary(dob, at.y); if (cmpDate(nb, at) < 0) nb = anniversary(dob, at.y + 1);
  return {
    years: k, months: sub.months, days: sub.days, totalMonths: k * 12 + sub.months,
    totalDays, totalWeeks: Math.floor(totalDays / 7), weekRemainder: totalDays % 7, totalHours: totalDays * 24,
    nextBirthday: nb, daysToNext: dayNum(nb) - dayNum(at), turning: nb.y - dob.y, bornWeekday: WEEKDAYS[weekday(dayNum(dob))],
  };
}

// ------------------------------------------------------------------ loans (exact, integer cents)
// rate: Dec percent per year. Returns the payment in whole cents (rounded half up), exact rational arithmetic.
export function loanPaymentCents(principalCents, rate, n) {
  const P = BigInt(principalCents);
  if (rate.n === 0n) return Number(divHalfUp(P, BigInt(n)));
  const Dn = 1200n * P10(rate.s); const rn = rate.n;
  const A = (Dn + rn) ** BigInt(n), B = Dn ** BigInt(n);
  return Number(divHalfUp(P * rn * A, Dn * (A - B)));
}
// Full schedule. extra = extra cents added to every payment. Rows: { k, pay, principal, interest, balance }
export function loanSchedule(principalCents, rate, n, extraCents = 0) {
  const pmt = loanPaymentCents(principalCents, rate, n);
  const Dn = 1200n * P10(rate.s), rn = rate.n;
  let bal = principalCents; const rows = []; let totalInterest = 0, totalPaid = 0;
  for (let k = 1; k <= n && bal > 0; k++) {
    const interest = Number(divHalfUp(BigInt(bal) * rn, Dn));
    let pay = pmt + extraCents;
    if (k === n || bal + interest <= pay) pay = bal + interest;
    const principal = pay - interest; bal -= principal;
    rows.push({ k, pay, principal, interest, balance: bal });
    totalInterest += interest; totalPaid += pay;
  }
  return { payment: pmt, rows, totalInterest, totalPaid, months: rows.length };
}

// ------------------------------------------------------------------ compound interest (50-digit fixed point, shown to the cent)
// Interest compounds m times a year; contributions are monthly and earn the equivalent monthly rate g = (1 + r/m)^(m/12) - 1.
const FP = 10n ** 50n;
const fpMul = (a, b) => (a * b) / FP;
function fpLn(x) { // ln of a fixed-point x > 0 near 1..2, via 2*atanh((x-1)/(x+1))
  const z = ((x - FP) * FP) / (x + FP), z2 = fpMul(z, z);
  let term = z, sum = 0n;
  for (let k = 1n; term !== 0n && k < 400n; k += 2n) { sum += term / k; term = fpMul(term, z2); }
  return 2n * sum;
}
function fpExp(y) { // exp of a small fixed-point y (|y| < 1) by Taylor series
  let term = FP, sum = FP;
  for (let k = 1n; term !== 0n && k < 400n; k++) { term = fpMul(term, y) / k; sum += term; }
  return sum;
}
const centsFromFp = (v, perFp = 1n) => Number(divHalfUp(v * 100n, FP)); // fixed-point currency units -> whole cents
export function compoundGrowth({ principalCents, rate, months, m, contribCents, atStart }) {
  let g = 0n;
  if (rate.n !== 0n) {
    const den = 100n * BigInt(m) * P10(rate.s);
    const x = ((den + rate.n) * FP) / den;                       // 1 + r/(100 m)
    g = fpExp((fpLn(x) * BigInt(m)) / 12n) - FP;                 // (1 + r/m)^(m/12) - 1
  }
  const c = (BigInt(contribCents) * FP) / 100n; let bal = (BigInt(principalCents) * FP) / 100n;
  const monthly = [principalCents / 100], yearly = [{ year: 0, months: 0, balanceCents: principalCents }];
  for (let k = 1; k <= months; k++) {
    bal = atStart ? fpMul(bal + c, FP + g) : fpMul(bal, FP + g) + c;
    monthly.push(Number(bal / 10n ** 40n) / 1e10);
    if (k % 12 === 0 || k === months) yearly.push({ year: Math.ceil(k / 12), months: k, balanceCents: centsFromFp(bal) });
  }
  return { finalCents: centsFromFp(bal), monthly, yearly };
}

// ------------------------------------------------------------------ misc
export function csv(rows) {
  const q = v => { const s = String(v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return rows.map(r => r.map(q).join(',')).join('\r\n') + '\r\n';
}
export const plural = (n, w, w2) => `${groupInt(String(n))} ${n === 1 ? w : (w2 || w + 's')}`;
