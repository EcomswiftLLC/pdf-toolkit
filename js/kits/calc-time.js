// Calculators kit: age calculator and date calculator.
import { registerIcons } from '../core.js';
import { h, panel, bind, workbench, bigAnswer, results, setResults, calcNote, nf, dateField, hint } from './calc-ui.js';
import { seg, check, stack, row } from '../ui.js';
import {
  todayLocal, cmpDate, dayNum, fromDays, ageBetween, addMonths, addDays, diffYMD, weekday, WEEKDAYS, MONTHS, fmtDate, fmtDateLong,
  isFeb29, isLeap, dim, isoWeek, dayOfYear, weekdaysBetween, plural, groupInt, inRange,
} from './calc-lib.js';

registerIcons({
  cake: '<path d="M4 20h16"/><path d="M5 20v-6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6"/><path d="M5 16c2 1.5 4 1.5 7 0s5-1.5 7 0"/><path d="M12 12V9"/><path d="M12 6.5c-1-1-1-2 0-3 1 1 1 2 0 3z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17"/><path d="M8 3v4M16 3v4"/><path d="M8 14h2M14 14h2M8 17h2"/>',
});

const todayDefaultHelp = 'Leave blank to use today’s date on your device.';

// ====================================================================== age calculator
function mountAge(container) {
  const dob = dateField({ label: 'Date of birth', help: 'Pick or type the date you were born.', key: 'dob' });
  const at = dateField({ label: 'Age at', help: todayDefaultHelp, key: 'at' });
  const ans = bigAnswer();
  const tiles = results([]);
  const notes = h('div', { class: 'calc-notes' });
  const inputs = panel('Dates', stack(dob, at), hint('Everything is worked out on your device from the calendar dates. Time of day is ignored.'));
  const outputs = panel('Your age', ans.el, tiles, notes);
  container.append(workbench(inputs, outputs));
  ans.set('Enter a date of birth', '', '');

  const update = () => {
    notes.replaceChildren();
    const d = dob.readDate(), a = at.readDate();
    if (d.kind !== 'ok' || a.kind === 'bad') { ans.set('Enter a date of birth', '', ''); setResults(tiles, []); return; }
    const today = todayLocal();
    const on = a.kind === 'ok' ? a.v : today;
    if (cmpDate(d.v, today) > 0) { dob.error('That birth date is in the future. Enter a date that has already happened.'); ans.set('Enter a date of birth', '', ''); setResults(tiles, []); return; }
    if (cmpDate(d.v, on) > 0) { dob.error('The birth date must be on or before the "Age at" date.'); ans.set('Enter a date of birth', '', ''); setResults(tiles, []); return; }
    const r = ageBetween(d.v, on);
    const sameDay = cmpDate(on, today) === 0;
    const parts = [plural(r.years, 'year'), plural(r.months, 'month'), plural(r.days, 'day')];
    ans.set(a.kind === 'ok' && !sameDay ? `Age on ${fmtDate(on)}` : 'Your age today', parts.join(', '), `Born on a ${r.bornWeekday}, ${fmtDate(d.v)}`);
    const until = r.daysToNext === 0 ? 'Today' : plural(r.daysToNext, 'day');
    setResults(tiles, [
      { k: 'months', label: 'Total months', value: groupInt(String(r.totalMonths)), hint: `${r.years} years and ${r.months} months` },
      { k: 'weeks', label: 'Total weeks', value: groupInt(String(r.totalWeeks)), hint: `and ${plural(r.weekRemainder, 'day')}` },
      { k: 'days', label: 'Total days', value: groupInt(String(r.totalDays)) },
      { k: 'hours', label: 'Total hours', value: groupInt(String(r.totalHours)), hint: 'Days × 24, so time of day is not counted' },
      { k: 'next', label: r.daysToNext === 0 ? 'Birthday' : 'Next birthday', value: r.daysToNext === 0 ? 'Today' : fmtDate(r.nextBirthday), hint: `${WEEKDAYS[weekday(dayNum(r.nextBirthday))]}, turning ${r.turning}` },
      { k: 'until', label: 'Days until birthday', value: until },
      { k: 'weekday', label: 'Born on a', value: r.bornWeekday },
    ]);
    if (isFeb29(d.v)) notes.append(calcNote('Born on February 29: in years that are not leap years, this calculator counts your birthday on March 1. Some places use February 28 instead, so check the rule that applies to you if it matters.'));
  };
  bind([dob, at], update, 60);
  update();
}

export const AGE_TOOL = {
  id: 'age-calculator', slug: 'age-calculator', name: 'Age Calculator',
  blurb: 'Work out your exact age in years, months and days, and when your next birthday is.',
  keywords: 'age date of birth birthday how old days weeks months leap year',
  icon: 'cake', kind: 'live',
  seo: {
    title: 'Age Calculator: Exact Age in Years and Days | Ecom Swift LLC',
    description: 'Enter a date of birth to see your exact age in years, months and days, plus total days and your next birthday. Runs in your browser, nothing is uploaded.',
    h1: 'Age Calculator',
    intro: 'Find out exactly how old you are, or how old someone was on a given day. See years, months and days, total weeks and hours, and the date of the next birthday. It all runs in your browser.',
    steps: ['Enter the date of birth.', 'Leave "Age at" blank for today, or pick another date.', 'Read your age, totals and next birthday below.'],
    faq: [
      ['How is the age worked out?', 'The calculator counts complete years since the birth date, then complete months, then the days left over. It uses calendar dates only, so the time of day does not matter.'],
      ['What happens if I was born on February 29?', 'In years that are not leap years, this tool counts your birthday on March 1. Some countries and forms treat February 28 as the birthday instead, so check the rule that applies to you.'],
      ['Which date does "today" mean?', 'Today is the date on your own device, in your own time zone, so the result does not shift by a day near midnight.'],
      ['Why are total hours only an estimate?', 'Total hours is the number of days multiplied by 24. It ignores the time you were born and clock changes for daylight saving, so treat it as a rough figure.'],
      ['Can I find the age on a past or future date?', 'Yes. Put any date in the "Age at" field. The birth date cannot be after that date, and it cannot be in the future.'],
      ['Is my date of birth stored or sent anywhere?', 'No. The calculation happens in your browser, nothing is uploaded, and nothing is saved when you close the page.'],
    ],
    related: ['date-calculator', 'percentage-calculator', 'bmi-calculator', 'loan-calculator'],
  },
  mount: mountAge,
};

// ====================================================================== date calculator
function mountDate(container) {
  const mode = seg({
    label: 'What do you want to do?', value: 'between', choices: [
      { v: 'between', t: 'Days between two dates' }, { v: 'add', t: 'Add or subtract time' }, { v: 'info', t: 'Day of week and year' }],
    onInput: () => upd(),
  });
  // --- between
  const from = dateField({ label: 'Start date', key: 'from' }), to = dateField({ label: 'End date', key: 'to' });
  const incl = check({ label: 'Count the end date too', value: false });
  const bAns = bigAnswer(), bTiles = results([]), bNotes = h('div', { class: 'calc-notes' });
  const bIn = panel('Dates', stack(from, to, incl), hint('Business days are Monday to Friday. Public holidays are not excluded.'));
  const bOut = panel('Result', bAns.el, bTiles, bNotes);
  const between = workbench(bIn, bOut);
  // --- add / subtract
  const start = dateField({ label: 'Start date', key: 'start' });
  const op = seg({ label: 'Operation', value: 'add', choices: [{ v: 'add', t: 'Add' }, { v: 'sub', t: 'Subtract' }], onInput: () => upd() });
  const yrs = nf({ label: 'Years', value: '0', int: true, min: 0, max: 9999, name: 'years', key: 'yrs' });
  const mos = nf({ label: 'Months', value: '0', int: true, min: 0, max: 99999, name: 'months', key: 'mos' });
  const wks = nf({ label: 'Weeks', value: '0', int: true, min: 0, max: 999999, name: 'weeks', key: 'wks' });
  const dys = nf({ label: 'Days', value: '0', int: true, min: 0, max: 9999999, name: 'days', key: 'dys' });
  const aAns = bigAnswer(), aTiles = results([]), aNotes = h('div', { class: 'calc-notes' });
  const aIn = panel('Start date and amount', stack(start, op, row(yrs, mos), row(wks, dys)), hint('Years and months are applied first, then weeks and days.'));
  const aOut = panel('Result', aAns.el, aTiles, aNotes);
  const add = workbench(aIn, aOut);
  // --- info
  const one = dateField({ label: 'Date', key: 'one' });
  const iAns = bigAnswer(), iTiles = results([]);
  const info = workbench(panel('Date', stack(one)), panel('Result', iAns.el, iTiles));

  const secs = { between, add, info };
  container.append(panel(null, mode.el), between, add, info);
  const show = () => { for (const k in secs) secs[k].hidden = k !== mode.get(); };
  const clear = (ans, tiles, notes) => { setResults(tiles, []); if (notes) notes.replaceChildren(); };

  const updBetween = () => {
    bNotes.replaceChildren();
    const a = from.readDate(), b = to.readDate();
    if (a.kind !== 'ok' || b.kind !== 'ok') { bAns.set('Pick a start and an end date', '', ''); clear(bAns, bTiles); return; }
    let s = a.v, e = b.v; const rev = cmpDate(s, e) > 0; if (rev) [s, e] = [e, s];
    const inc = incl.get() ? 1 : 0;
    const n = dayNum(e) - dayNum(s) + inc;
    const breakEnd = inc ? addDays(e, 1) : e;
    const ymd = diffYMD(s, breakEnd);
    const biz = weekdaysBetween(dayNum(s), dayNum(e) + inc);
    bAns.set(`${rev ? 'Days from ' + fmtDate(s) + ' to ' + fmtDate(e) : 'Days between the dates'}`, plural(n, 'day'), inc ? 'Includes both the start and the end date.' : 'The start date is counted, the end date is not.');
    setResults(bTiles, [
      { k: 'ymd', label: 'Years, months and days', value: [ymd.years && plural(ymd.years, 'year'), ymd.months && plural(ymd.months, 'month'), ymd.days && plural(ymd.days, 'day')].filter(Boolean).join(', ') || '0 days' },
      { k: 'weeks', label: 'Weeks and days', value: `${plural(Math.floor(n / 7), 'week')}, ${plural(n % 7, 'day')}` },
      { k: 'months', label: 'Whole months', value: groupInt(String(ymd.totalMonths)), hint: `plus ${plural(ymd.days, 'day')}` },
      { k: 'years', label: 'Whole years', value: groupInt(String(ymd.years)) },
      { k: 'biz', label: 'Business days', value: groupInt(String(biz)), hint: 'Monday to Friday' },
      { k: 'wknd', label: 'Weekend days', value: groupInt(String(n - biz)), hint: 'Saturdays and Sundays' },
    ]);
    if (rev) bNotes.append(calcNote('The start date is after the end date, so the dates were swapped and the result is shown as a positive count.'));
    if (addMonths(s, ymd.totalMonths).d !== s.d) bNotes.append(calcNote('Month-end rule: a month added to a day that does not exist in the next month lands on that month’s last day.'));
  };

  const updAdd = () => {
    aNotes.replaceChildren();
    const s = start.readDate();
    const vals = [yrs, mos, wks, dys].map(f => f.read());
    if (s.kind !== 'ok' || vals.some(v => v.kind === 'bad')) { aAns.set(s.kind === 'ok' ? 'Check the amounts' : 'Pick a start date', '', ''); clear(aAns, aTiles); return; }
    const [y, m, w, d] = vals.map(v => (v.kind === 'ok' ? Number(v.d.n) : 0));
    const sign = op.get() === 'sub' ? -1 : 1;
    const afterMonths = addMonths(s.v, sign * (y * 12 + m));
    if (!inRange(afterMonths) || dayNum(afterMonths) + sign * (w * 7 + d) < dayNum({ y: 1, m: 1, d: 1 }) || dayNum(afterMonths) + sign * (w * 7 + d) > dayNum({ y: 9999, m: 12, d: 31 })) {
      aAns.set('Result out of range', '', ''); clear(aAns, aTiles); aNotes.append(calcNote('The result would fall outside the years 1 to 9999. Use a smaller amount.', 'err')); return;
    }
    const res = fromDays(dayNum(afterMonths) + sign * (w * 7 + d));
    aAns.set(`${sign > 0 ? 'Start date plus' : 'Start date minus'} ${[y && plural(y, 'year'), m && plural(m, 'month'), w && plural(w, 'week'), d && plural(d, 'day')].filter(Boolean).join(', ') || '0 days'}`, fmtDateLong(res), '');
    const diff = Math.abs(dayNum(res) - dayNum(s.v));
    setResults(aTiles, [
      { k: 'weekday', label: 'Day of the week', value: WEEKDAYS[weekday(dayNum(res))] },
      { k: 'span', label: 'Days from the start date', value: groupInt(String(diff)) },
      { k: 'iso', label: 'Date (YYYY-MM-DD)', value: `${String(res.y).padStart(4, '0')}-${String(res.m).padStart(2, '0')}-${String(res.d).padStart(2, '0')}` },
    ]);
    if ((y || m) && s.v.d > dim(afterMonths.y, afterMonths.m)) aNotes.append(calcNote(`Month-end rule: ${MONTHS[s.v.m - 1]} ${s.v.d} does not exist ${sign > 0 ? 'that many months later' : 'that many months earlier'}, so the day moved to the last day of the month (${fmtDate(afterMonths)}) before any weeks or days were applied.`));
  };

  const updInfo = () => {
    const r = one.readDate();
    if (r.kind !== 'ok') { iAns.set('Pick a date', '', ''); setResults(iTiles, []); return; }
    const v = r.v, n = dayNum(v), iso = isoWeek(v), doy = dayOfYear(v), len = isLeap(v.y) ? 366 : 365;
    iAns.set(fmtDate(v), WEEKDAYS[weekday(n)], '');
    setResults(iTiles, [
      { k: 'doy', label: 'Day of the year', value: `${doy}`, hint: `${len - doy} days left in ${v.y}` },
      { k: 'iso', label: 'ISO week', value: `Week ${iso.week}`, hint: `of ISO year ${iso.year}, weeks start on Monday` },
      { k: 'quarter', label: 'Quarter', value: `Q${Math.floor((v.m - 1) / 3) + 1}` },
      { k: 'leap', label: 'Leap year?', value: isLeap(v.y) ? 'Yes' : 'No', hint: `${v.y} has ${len} days` },
      { k: 'dim', label: 'Days in the month', value: `${dim(v.y, v.m)}`, hint: MONTHS[v.m - 1] },
    ]);
  };
  const upd = () => { show(); updBetween(); updAdd(); updInfo(); };
  bind([from, to, incl, start, yrs, mos, wks, dys, one], upd, 60);
  upd();
}

export const DATE_TOOL = {
  id: 'date-calculator', slug: 'date-calculator', name: 'Date Calculator',
  blurb: 'Count days between dates, add or subtract time, and find the weekday or week number.',
  keywords: 'days between dates add days subtract business days weekday iso week day of year',
  icon: 'calendar', kind: 'live',
  seo: {
    title: 'Free Date Calculator: Days Between Dates | Ecom Swift LLC',
    description: 'Count the days between two dates, add or subtract days, weeks, months or years, and find the weekday or ISO week of any date. Runs in your browser.',
    h1: 'Date Calculator',
    intro: 'Count the days between two dates, add or subtract days, weeks, months and years, or look up the weekday, day of the year and ISO week for any date. It runs in your browser and nothing is uploaded.',
    steps: ['Choose what you want to do: count days, add or subtract time, or look up a date.', 'Enter the dates and amounts.', 'Read the result, which updates as you type.'],
    faq: [
      ['Does the count include the end date?', 'Not by default. January 1 to January 10 is 9 days. Turn on "Count the end date too" to count both ends, which gives 10 days.'],
      ['What happens when I add a month to January 31?', 'February has no 31st, so the result moves to the last day of that month: February 28, or February 29 in a leap year. The tool tells you when this rule was used.'],
      ['How are business days counted?', 'Business days are Monday to Friday. Public holidays differ by country and company, so they are not removed. Take off any holidays yourself.'],
      ['Do clock changes for daylight saving affect the result?', 'No. The tool works with calendar dates only, never with clock times, so a day is always a day.'],
      ['Which calendar is used, and how far back does it go?', 'The standard Gregorian calendar, applied to every year from 1 to 9999. Dates before the 1580s were recorded in other calendars in most places, so very old results are mathematical, not historical.'],
      ['Are my dates stored or sent anywhere?', 'No. Everything is calculated in your browser and nothing is uploaded or saved.'],
    ],
    related: ['age-calculator', 'percentage-calculator', 'loan-calculator', 'compound-interest-calculator'],
  },
  mount: mountDate,
};
