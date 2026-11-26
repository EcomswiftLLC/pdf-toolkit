// Calculators kit: loan, discount, tip and compound interest calculators (money maths is exact or stated).
import { registerIcons } from '../core.js';
import { h, icon, panel, bind, workbench, bigAnswer, results, setResults, calcNote, nf, hint, currencyPicker, dateField, dataTable, lineChart, compact } from './calc-ui.js';
import { seg, check, stack, row, select, downloadButton } from '../ui.js';
import {
  D, groupInt, fmtCents, fmtDecMoney, centsOf, loanSchedule, loanPaymentCents, addMonths, fmtDate, compoundGrowth, csv, plural,
} from './calc-lib.js';

registerIcons({
  bank: '<path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8"/><path d="M3 20h18"/>',
  tag: '<path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8a1.5 1.5 0 0 1 0 2.1l-6.4 6.4a1.5 1.5 0 0 1-2.1 0z"/><circle cx="8" cy="8" r="1.3"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
});

const CENTS = D.int(100);
const toCentsDec = d => D.round(d, 2);   // currency units, rounded half up to the cent

// ---- shared by the loan and mortgage calculators: balance chart + payment schedule table + CSV
function scheduleBlock(csvName) {
  const chart = lineChart('Remaining balance over time');
  const chartPanel = panel('Balance over time', chart.el); chartPanel.hidden = true;
  let csvText = '';
  const dl = downloadButton(() => csvText, csvName, 'Download CSV', 'text/csv;charset=utf-8');
  const tableHost = h('div', {});
  const tablePanel = panel('Payment schedule', h('div', { class: 'lt-bar calc-tbar' }, dl), tableHost); tablePanel.hidden = true;
  const iso = d => `${String(d.y).padStart(4, '0')}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  return {
    panels: [chartPanel, tablePanel],
    hide() { chartPanel.hidden = true; tablePanel.hidden = true; csvText = ''; },
    // plan: loanSchedule result, P: amount borrowed in cents, startDate: {y,m,d} or null
    show(plan, P, sym, startDate) {
      const money = c => fmtCents(c, sym), dateOf = k => addMonths(startDate, k), hasDate = !!startDate;
      const pts = [[0, P / 100], ...plan.rows.map(r => [r.k, r.balance / 100])];
      const m = plan.months, useYears = m > 24;
      const step = useYears ? Math.max(1, Math.ceil(m / 12 / 8)) * 12 : Math.max(1, Math.ceil(m / 8));
      const xTicks = []; for (let x = 0; x <= m; x += step) xTicks.push(x);
      const half = plan.rows.find(r => r.balance * 2 <= P);
      chart.set({
        series: [{ name: 'Remaining balance', pts }], xLabel: useYears ? 'Years since the first payment' : 'Months since the first payment',
        xTicks, xTickLabel: x => (useYears ? String(x / 12) : String(x)), yLabel: v => compact(v, sym.trim()),
        caption: `The balance falls from ${money(P)} to ${money(0)} over ${plural(m, 'month')}.${half ? ` Half of the loan is repaid by month ${half.k}.` : ''} Early payments are mostly interest, so the balance drops slowly at first.`,
      });
      chartPanel.hidden = false;
      const cols = ['#', ...(hasDate ? ['Date'] : []), 'Payment', 'Principal', 'Interest', 'Balance'];
      const rows = plan.rows.map(r => [r.k, ...(hasDate ? [fmtDate(dateOf(r.k))] : []), money(r.pay), money(r.principal), money(r.interest), money(r.balance)]);
      tableHost.replaceChildren(dataTable({ label: 'Loan payment schedule', columns: cols, rows, left: hasDate ? [0, 1] : [0] }));
      const c2 = x => (x / 100).toFixed(2);
      csvText = csv([['Payment number', ...(hasDate ? ['Date'] : []), 'Payment', 'Principal', 'Interest', 'Remaining balance'],
        ...plan.rows.map(r => [r.k, ...(hasDate ? [iso(dateOf(r.k))] : []), c2(r.pay), c2(r.principal), c2(r.interest), c2(r.balance)])]);
      tablePanel.hidden = false;
    },
  };
}

// ====================================================================== loan calculator
function mountLoan(container) {
  let sym = '$';
  const fields = [];
  const mk = o => { const f = nf({ prefix: sym, ...o }); fields.push(f); return f; };
  const cur = currencyPicker(s => { sym = s; fields.forEach(f => f.setPrefix(s)); upd(); });
  const amt = mk({ label: 'Loan amount', value: '', min: 0, minExcl: true, max: 1e9, dp: 2, name: 'a loan amount', key: 'amount' });
  const rate = nf({ label: 'Annual interest rate', value: '', suffix: '%', min: 0, max: 100, dp: 4, name: 'a rate', key: 'rate', help: 'Use 0 for an interest-free loan.' });
  const yrs = nf({ label: 'Term, years', value: '', suffix: 'years', int: true, min: 0, max: 100, name: 'years', key: 'years' });
  const mos = nf({ label: 'Term, months', value: '', suffix: 'months', int: true, min: 0, max: 1200, name: 'months', key: 'months' });
  const start = dateField({ label: 'Loan start date (optional)', help: 'Adds dates to the schedule. The first payment is due one month after this date.', key: 'start' });
  const extra = mk({ label: 'Extra payment each month (optional)', value: '', min: 0, max: 1e9, dp: 2, name: 'an extra payment', key: 'extra', help: 'Paid on top of the regular payment, to see how much time and interest it saves.' });
  const ans = bigAnswer(); const tiles = results([]); const notes = h('div', { class: 'calc-notes' });
  const inputs = panel('Loan details', stack(cur, amt, rate, row(yrs, mos), start, extra));
  const outputs = panel('Your loan', ans.el, tiles, notes);
  const sb = scheduleBlock('loan-amortization-schedule.csv');
  container.append(workbench(inputs, outputs), ...sb.panels);

  const idle = msg => { ans.set(msg || 'Enter an amount, rate and term', '', ''); setResults(tiles, []); sb.hide(); };
  function upd() {
    notes.replaceChildren();
    const ra = amt.read(), rr = rate.read(), ry = yrs.read(), rm = mos.read(), rs = start.readDate(), re = extra.read();
    if ([ra, rr, ry, rm, re].some(r => r.kind === 'bad') || rs.kind === 'bad') return idle('Check the highlighted fields');
    if (ra.kind !== 'ok' || rr.kind !== 'ok' || (ry.kind === 'empty' && rm.kind === 'empty')) return idle();
    const n = (ry.kind === 'ok' ? Number(ry.d.n) : 0) * 12 + (rm.kind === 'ok' ? Number(rm.d.n) : 0);
    if (n < 1) { mos.error('Enter a term of at least 1 month.'); return idle('Check the highlighted fields'); }
    if (n > 1200) { mos.error('The term can be at most 100 years (1,200 months).'); return idle('Check the highlighted fields'); }
    const P = centsOf(ra.d), ex = re.kind === 'ok' ? centsOf(re.d) : 0;
    const base = loanSchedule(P, rr.d, n, 0);
    const plan = ex > 0 ? loanSchedule(P, rr.d, n, ex) : base;
    const money = c => fmtCents(c, sym);
    const dateOf = k => (rs.kind === 'ok' ? addMonths(rs.v, k) : null);
    const last = plan.rows[plan.rows.length - 1];
    ans.set('Monthly payment', money(base.payment), ex > 0 ? `With the extra ${money(ex)} you pay ${money(base.payment + ex)} a month` : `${plural(n, 'payment')} of ${money(base.payment)}${last.pay !== base.payment ? ', the last one adjusted' : ''}`);
    const list = [
      { k: 'interest', label: 'Total interest', value: money(plan.totalInterest) },
      { k: 'paid', label: 'Total paid', value: money(plan.totalPaid), hint: `${money(P)} borrowed plus interest` },
      { k: 'count', label: 'Number of payments', value: groupInt(String(plan.months)) },
      { k: 'payoff', label: 'Payoff date', value: rs.kind === 'ok' ? fmtDate(dateOf(plan.months)) : 'Add a start date', hint: rs.kind === 'ok' ? `after payment ${plan.months}` : '' },
    ];
    if (ex > 0) {
      const sm = base.months - plan.months, si = base.totalInterest - plan.totalInterest;
      list.splice(2, 0, { k: 'saved-months', label: 'Time saved', value: plural(sm, 'month'), hint: `Paid off in ${plural(plan.months, 'month')} instead of ${plural(base.months, 'month')}` }, { k: 'saved-interest', label: 'Interest saved', value: money(si), hint: `${money(base.totalInterest)} without the extra payment` });
    }
    if (last.pay !== plan.payment + ex) list.push({ k: 'final', label: 'Final payment', value: money(last.pay), hint: 'Adjusted for rounding to the cent' });
    setResults(tiles, list);
    sb.show(plan, P, sym, rs.kind === 'ok' ? rs.v : null);
    notes.append(hint('Standard amortizing loan: interest is charged monthly on the remaining balance, the payment is rounded to the cent and the last payment clears what is left. Fees, insurance and taxes are not included.'));
  }
  bind([...fields, rate, yrs, mos, start], upd, 120);
  upd();
}

export const LOAN_TOOL = {
  id: 'loan-calculator', slug: 'loan-calculator', name: 'Loan Calculator',
  blurb: 'Monthly payment, total interest and a full payment schedule for any loan, with extra payments.',
  keywords: 'loan payment amortization schedule interest emi car loan personal loan extra payment',
  icon: 'bank', kind: 'live',
  seo: {
    title: 'Free Loan Calculator: Payment and Schedule | Ecom Swift LLC',
    description: 'Enter a loan amount, rate and term to see the monthly payment, total interest, payoff date and a full amortization table you can download as CSV.',
    h1: 'Loan Calculator',
    intro: 'Work out the monthly payment, total interest and payoff date for a fixed-rate loan, see how extra payments shorten it, and download the full payment schedule. It runs in your browser and nothing is uploaded.',
    steps: ['Enter the loan amount, annual interest rate and term.', 'Add a start date or an extra monthly payment if you want.', 'Read the payment, then check the chart and download the schedule.'],
    faq: [
      ['How is the monthly payment worked out?', 'It uses the standard amortization formula for a fixed rate and equal monthly payments. Interest is charged each month on the remaining balance, and the payment is rounded to the nearest cent.'],
      ['Why is the last payment a few cents different?', 'The payment is rounded to the cent, so a tiny difference builds up. The final payment is adjusted so the balance ends at exactly zero.'],
      ['How does an extra monthly payment help?', 'The extra amount goes straight to the balance, so less interest is charged each month and the loan ends sooner. The tool shows the months and interest saved compared with no extra payment.'],
      ['Does it include fees, insurance or taxes?', 'No. It covers principal and interest only. Origination fees, insurance, taxes and any early-repayment charges come on top, and your lender may calculate interest slightly differently.'],
      ['What if the interest rate is 0%?', 'The payment is simply the loan amount divided by the number of months, with no interest.'],
      ['Is this financial advice, and is my data kept?', 'This is a general calculator, not financial advice, and your lender’s figures are the ones that count. Nothing is uploaded or saved: everything is calculated in your browser.'],
    ],
    related: ['mortgage-calculator', 'compound-interest-calculator', 'percentage-calculator', 'date-calculator'],
  },
  mount: mountLoan,
};

// ====================================================================== discount calculator
function mountDiscount(container) {
  let sym = '$'; const fields = [];
  const mk = o => { const f = nf({ prefix: sym, ...o }); fields.push(f); return f; };
  const cur = currencyPicker(s => { sym = s; fields.forEach(f => f.setPrefix(s)); upd(); });
  const mode = seg({
    label: 'What do you want to work out?', value: 'price', onInput: () => upd(),
    choices: [{ v: 'price', t: 'Price after a discount' }, { v: 'find', t: 'Discount from two prices' }, { v: 'stack', t: 'Stacked discounts' }],
  });
  const pct = (label, key) => nf({ label, value: '', suffix: '%', min: 0, max: 100, dp: 4, name: 'a discount', key });
  const taxF = key => nf({ label: 'Sales tax (optional)', value: '', suffix: '%', min: 0, max: 100, dp: 4, name: 'a tax rate', key, help: 'Added after the discount.' });
  const qtyF = key => nf({ label: 'Quantity', value: '1', int: true, min: 1, max: 1000000, name: 'a quantity', key });
  // price
  const p1 = mk({ label: 'Original price', value: '', min: 0, max: 1e9, dp: 2, name: 'a price', key: 'price' });
  const d1 = pct('Discount', 'discount'), q1 = qtyF('qty'), t1 = taxF('tax');
  // find
  const fb = mk({ label: 'Price before', value: '', min: 0, minExcl: true, max: 1e9, dp: 2, name: 'a price', key: 'before' });
  const fa = mk({ label: 'Price after', value: '', min: 0, max: 1e9, dp: 2, name: 'a price', key: 'after' });
  // stack
  const p3 = mk({ label: 'Original price', value: '', min: 0, max: 1e9, dp: 2, name: 'a price', key: 'price3' });
  const stackList = h('div', { class: 'calc-stack-list' });
  let sd = [pct('Discount 1', 'sd1'), pct('Discount 2', 'sd2')]; sd[0].set('20'); sd[1].set('10');
  const addBtn = h('button', { class: 'btn btn-quiet btn-sm', type: 'button' }, icon('percent', 'sm'), 'Add another discount');
  const q3 = qtyF('qty3'), t3 = taxF('tax3');
  const drawStack = () => {
    stackList.replaceChildren(...sd.map((f, i) => {
      const lab = f.el.querySelector('label'); lab.textContent = `Discount ${i + 1}`;
      const rm = h('button', { class: 'btn btn-text btn-sm', type: 'button', 'aria-label': `Remove discount ${i + 1}` }, icon('x', 'sm'), 'Remove');
      rm.addEventListener('click', () => { sd.splice(i, 1); drawStack(); upd(); });
      return h('div', { class: 'calc-stack-row' }, f.el, sd.length > 1 ? rm : null);
    }));
    addBtn.disabled = sd.length >= 6;
  };
  addBtn.addEventListener('click', () => { const f = pct('Discount', 'sd' + (sd.length + 1)); sd.push(f); f.input.addEventListener('input', run); drawStack(); upd(); f.input.focus(); });
  const blocks = {
    price: h('div', { class: 'calc-mode' }, stack(p1, d1, row(q1, t1))),
    find: h('div', { class: 'calc-mode' }, stack(fb, fa)),
    stack: h('div', { class: 'calc-mode' }, stack(p3, stackList, addBtn, row(q3, t3))),
  };
  const ans = bigAnswer(); const tiles = results([]); const steps = h('div', { class: 'calc-steps' }); const notes = h('div', { class: 'calc-notes' });
  const inputs = panel('Prices', cur.el, mode.el, blocks.price, blocks.find, blocks.stack);
  const outputs = panel('Result', ans.el, tiles, steps, notes);
  container.append(workbench(inputs, outputs));
  let run;

  const idle = msg => { ans.set(msg, '', ''); setResults(tiles, []); steps.replaceChildren(); };
  const money = d => fmtDecMoney(d, sym);
  const pc = (d, p = 4) => D.trim(d, p) + '%';
  // price, unit final (Dec, already rounded to cent), quantity (int), tax percent Dec|null
  function finish(orig, unit, qty, tax, extraLines = []) {
    const q = D.int(qty), saved = D.sub(orig, unit), subtotal = D.mul(unit, q);
    const taxAmt = tax && !D.isZero(tax) ? toCentsDec(D.mul(D.mul(subtotal, tax), D.make(1, 2))) : null;
    const total = taxAmt ? D.add(subtotal, taxAmt) : subtotal;
    const list = [
      { k: 'saved', label: qty > 1 ? 'You save per item' : 'You save', value: money(saved), hint: D.isZero(orig) ? '' : `${D.trim(D.div(D.mul(saved, D.int(100)), orig, 4), 2)}% off` },
    ];
    if (qty > 1) list.push({ k: 'saved-total', label: `You save in total (${groupInt(String(qty))} items)`, value: money(D.mul(saved, q)) }, { k: 'orig-total', label: 'Original total', value: money(D.mul(orig, q)) });
    list.push({ k: 'subtotal', label: qty > 1 ? 'Total after discount' : 'Price after discount', value: money(subtotal) });
    if (taxAmt) list.push({ k: 'tax', label: 'Sales tax', value: money(taxAmt), hint: `${D.trim(tax, 4)}% of ${money(subtotal)}` }, { k: 'total', label: 'Total to pay', value: money(total), big: true });
    setResults(tiles, list);
    return { saved, subtotal, taxAmt, total };
  }
  const orderNote = 'Order of operations: the discount is taken off each item first and rounded to the cent, then the items are multiplied by the quantity, then sales tax is added to that total.';

  function upd() {
    const m = mode.get(); for (const k in blocks) blocks[k].hidden = k !== m;
    notes.replaceChildren(); steps.replaceChildren();
    if (m === 'price') {
      const rp = p1.read(), rd = d1.read(), rq = q1.read(), rt = t1.read();
      if ([rp, rd, rq, rt].some(r => r.kind === 'bad') || rp.kind !== 'ok' || rd.kind !== 'ok') return idle(rp.kind === 'bad' || rd.kind === 'bad' ? 'Check the highlighted fields' : 'Enter a price and a discount');
      const qty = rq.kind === 'ok' ? Number(rq.d.n) : 1;
      const unit = toCentsDec(D.mul(D.mul(rp.d, D.sub(D.int(100), rd.d)), D.make(1, 2)));
      const r = finish(rp.d, unit, qty, rt.kind === 'ok' ? rt.d : null);
      ans.set(qty > 1 ? 'Final price per item' : 'Final price', money(unit), `${money(rp.d)} minus ${pc(rd.d)}`);
      notes.append(hint(orderNote));
    } else if (m === 'find') {
      const rb = fb.read(), ra = fa.read();
      if (rb.kind === 'bad' || ra.kind === 'bad' || rb.kind !== 'ok' || ra.kind !== 'ok') return idle(rb.kind === 'bad' || ra.kind === 'bad' ? 'Check the highlighted fields' : 'Enter the price before and after');
      const diff = D.sub(rb.d, ra.d), p = D.div(D.mul(diff, D.int(100)), rb.d, 2);
      const exact = D.cmp(D.div(D.mul(diff, D.int(100)), rb.d, 10), D.round(D.div(D.mul(diff, D.int(100)), rb.d, 10), 2)) === 0;
      if (D.isNeg(diff)) ans.set('Price increase', `${D.trim(D.abs(p), 2)}%`, `The price went up by ${money(D.abs(diff))}. This is an increase, not a discount.`);
      else ans.set('Discount', D.isZero(diff) ? '0%' : `${D.trim(p, 2)}%`, `You save ${money(diff)}${exact ? '' : '. Rounded to 2 decimal places.'}`);
      setResults(tiles, [{ k: 'diff', label: D.isNeg(diff) ? 'Amount more' : 'Amount saved', value: money(D.abs(diff)) }, { k: 'ratio', label: 'Price after as a share of price before', value: D.trim(D.div(D.mul(ra.d, D.int(100)), rb.d, 2), 2) + '%' }]);
      notes.append(hint(`Working: (${money(rb.d)} − ${money(ra.d)}) ÷ ${money(rb.d)} × 100.`));
    } else {
      const rp = p3.read(), rq = q3.read(), rt = t3.read(); const rds = sd.map(f => f.read());
      if ([rp, rq, rt, ...rds].some(r => r.kind === 'bad') || rp.kind !== 'ok' || rds.some(r => r.kind !== 'ok')) return idle([rp, rq, rt, ...rds].some(r => r.kind === 'bad') ? 'Check the highlighted fields' : 'Enter a price and every discount');
      const qty = rq.kind === 'ok' ? Number(rq.d.n) : 1;
      let prod = D.int(1), scale = 0; for (const r of rds) { prod = D.mul(prod, D.sub(D.int(100), r.d)); scale += 2; }
      const factor = D.mul(prod, D.make(1, scale)); // product of (1 - d/100), exact
      const combined = D.mul(D.sub(D.int(1), factor), D.int(100));
      const unit = toCentsDec(D.mul(rp.d, factor));
      finish(rp.d, unit, qty, rt.kind === 'ok' ? rt.d : null);
      const label = rds.map(r => pc(r.d)).join(' then ');
      const simple = rds.reduce((a, r) => D.add(a, r.d), D.int(0));
      ans.set(qty > 1 ? 'Final price per item' : 'Final price', money(unit), `${label} is ${D.trim(combined, 4)}% off in total, not ${D.trim(simple, 4)}%`);
      let run1 = rp.d; const items = [];
      rds.forEach((r, i) => { run1 = D.mul(run1, D.mul(D.sub(D.int(100), r.d), D.make(1, 2))); items.push(h('li', {}, `After discount ${i + 1} (${pc(r.d)}): ${money(D.round(run1, 2))}`)); });
      steps.append(h('p', { class: 'calc-steps-t' }, 'Each discount applies to the price left after the one before. Steps are shown to the cent; only the final price is rounded.'), h('ul', {}, items));
      notes.append(hint(orderNote));
    }
  }
  run = bind([...fields, d1, q1, t1, ...sd, q3, t3], upd, 60);
  drawStack(); sd.forEach(f => f.input.addEventListener('input', run));
  upd();
}

export const DISCOUNT_TOOL = {
  id: 'discount-calculator', slug: 'discount-calculator', name: 'Discount Calculator',
  blurb: 'Find the sale price and savings, work out a discount from two prices, or stack discounts.',
  keywords: 'discount sale price percent off coupon stacked discounts sales tax savings',
  icon: 'tag', kind: 'live',
  seo: {
    title: 'Free Discount Calculator: Sale Price and Savings | Ecom Swift LLC',
    description: 'Find the final price and amount saved after a percentage discount, work out the discount from two prices, or stack discounts, with optional sales tax.',
    h1: 'Discount Calculator',
    intro: 'Find the sale price and how much you save, work out the discount between two prices, or see what two or more discounts add up to. Sales tax and quantity are optional. It runs in your browser.',
    steps: ['Choose a mode: price after a discount, discount from two prices, or stacked discounts.', 'Enter the prices and percentages, plus sales tax or quantity if you need them.', 'Read the final price, the savings and the working notes.'],
    faq: [
      ['How do I calculate a price after a discount?', 'Multiply the price by (100 minus the discount) and divide by 100. A 25% discount on $80 gives 80 × 75 ÷ 100 = $60.'],
      ['Why is 20% off then 10% off not 30% off?', 'The second discount applies to the price that is left after the first. Together they take off 28%: 100 × 0.80 × 0.90 = 72. Adding the percentages would overstate the saving.'],
      ['Is sales tax added before or after the discount?', 'This tool adds tax after the discount, on the reduced price, which is how most shops charge it. Rules vary by place and by coupon type, so check your receipt if it matters.'],
      ['How are cents rounded?', 'Prices are rounded to the nearest cent, with halves rounded up. With a quantity, each item is rounded first and then multiplied. Stacked discounts are rounded once, at the end.'],
      ['What if the second price is higher than the first?', 'Then it is a price increase, not a discount. The tool says so and shows the increase as a percentage.'],
      ['Is my data saved anywhere?', 'No. Everything is calculated in your browser, nothing is uploaded and nothing is saved. The currency picker only changes the symbol shown.'],
    ],
    related: ['percentage-calculator', 'tip-calculator', 'loan-calculator', 'compound-interest-calculator'],
  },
  mount: mountDiscount,
};

// ====================================================================== tip calculator
function mountTip(container) {
  let sym = '$'; const fields = [];
  const cur = currencyPicker(s => { sym = s; bill.setPrefix(s); upd(); });
  const bill = nf({ label: 'Bill amount', prefix: sym, value: '', min: 0, minExcl: true, max: 1e9, dp: 2, name: 'a bill amount', key: 'bill', help: 'Before the tip.' });
  const tipSeg = seg({ label: 'Tip', value: '18', choices: [{ v: '10', t: '10%' }, { v: '15', t: '15%' }, { v: '18', t: '18%' }, { v: '20', t: '20%' }, { v: 'custom', t: 'Custom' }], onInput: () => upd() });
  const custom = nf({ label: 'Custom tip', value: '', suffix: '%', min: 0, max: 100, dp: 2, name: 'a tip', key: 'custom' });
  const customBox = h('div', { hidden: true }, custom.el);
  const people = nf({ label: 'Number of people', value: '1', int: true, min: 1, max: 100, name: 'a number of people', key: 'people' });
  const roundUp = check({ label: 'Round each person’s share up to a whole amount', onInput: () => upd() });
  const ans = bigAnswer(); const tiles = results([]); const notes = h('div', { class: 'calc-notes' });
  container.append(workbench(panel('Bill', stack(cur, bill, tipSeg, customBox, people, roundUp)), panel('Result', ans.el, tiles, notes)));

  const money = c => fmtCents(c, sym);
  const idle = msg => { ans.set(msg, '', ''); setResults(tiles, []); };
  function upd() {
    notes.replaceChildren();
    customBox.hidden = tipSeg.get() !== 'custom';
    const rb = bill.read(), rp = people.read();
    const rc = tipSeg.get() === 'custom' ? custom.read() : { kind: 'ok', d: D.parse(tipSeg.get()) };
    if (rb.kind === 'bad' || rp.kind === 'bad' || rc.kind === 'bad') return idle('Check the highlighted fields');
    if (rb.kind !== 'ok') return idle('Enter the bill amount');
    if (rc.kind !== 'ok') return idle('Enter a tip percentage');
    const n = rp.kind === 'ok' ? Number(rp.d.n) : 1;
    const billC = centsOf(rb.d), tipC = Number(D.round(D.mul(D.mul(D.int(billC), rc.d), D.make(1, 2)), 0).n), totalC = billC + tipC;
    const list = [{ k: 'tip', label: 'Tip', value: money(tipC), hint: `${D.trim(rc.d, 2)}% of ${money(billC)}` }, { k: 'total', label: 'Total with tip', value: money(totalC) }];
    if (roundUp.get()) {
      const u = n * 100, per = Math.floor((totalC + u - 1) / u) * 100, paid = per * n, add = paid - totalC;
      ans.set(n > 1 ? 'Each person pays' : 'You pay', money(per), `${plural(n, 'person', 'people')} × ${money(per)} = ${money(paid)}`);
      const eff = D.trim(D.div(D.mul(D.int(paid - billC), D.int(100)), D.int(billC), 2), 2);
      list.push({ k: 'rounding', label: 'Added by rounding up', value: money(add), hint: add === 0 ? 'The share was already a whole amount' : 'This goes to the tip' },
        { k: 'paid', label: 'Total paid after rounding', value: money(paid) }, { k: 'eff', label: 'Tip you actually leave', value: money(tipC + add), hint: `${eff}% of the bill` });
    } else {
      const q = Math.floor(totalC / n), r = totalC % n;
      const nearest = r * 2 >= n ? q + 1 : q;
      ans.set(n > 1 ? 'Each person pays' : 'You pay', money(nearest), r === 0 ? (n > 1 ? `${plural(n, 'person', 'people')} × ${money(q)} = ${money(totalC)}` : '') : '');
      if (r !== 0) {
        list.push({ k: 'rounding', label: 'Rounding difference', value: money(nearest * n - totalC), hint: `${n} × ${money(nearest)} is ${money(nearest * n)}, not ${money(totalC)}` });
        notes.append(calcNote(`${money(totalC)} does not split evenly into cents between ${n} people. To pay the total exactly, ${plural(r, 'person', 'people')} pay ${money(q + 1)} and ${plural(n - r, 'person', 'people')} pay ${money(q)}.`));
      }
    }
    if (n > 1) list.push({ k: 'tip-pp', label: 'Tip per person', value: money(Math.round(tipC / n)), hint: 'To the nearest cent' });
    setResults(tiles, list);
  }
  bind([bill, custom, people], upd, 50);
  upd();
}

export const TIP_TOOL = {
  id: 'tip-calculator', slug: 'tip-calculator', name: 'Tip and Split Bill Calculator',
  blurb: 'Work out the tip, the total and each person’s share, with optional rounding up.',
  keywords: 'tip calculator split bill restaurant gratuity per person round up',
  icon: 'receipt', kind: 'live',
  seo: {
    title: 'Free Tip and Split Bill Calculator | Ecom Swift LLC',
    description: 'Enter the bill, choose a tip percentage and the number of people to see the tip, the total and each share. Round up per person if you like.',
    h1: 'Tip and Split Bill Calculator',
    intro: 'Enter the bill, pick a tip percentage and say how many people are sharing. You get the tip, the total and each person’s share, and you can round shares up. It runs in your browser.',
    steps: ['Enter the bill amount.', 'Pick a tip percentage or type your own, and set the number of people.', 'Read the tip, the total and what each person pays.'],
    faq: [
      ['How is the tip worked out?', 'The tip is the bill multiplied by the tip percentage and divided by 100, rounded to the nearest cent. The tip is based on the bill before any tip is added.'],
      ['What if the total does not split evenly?', 'Money comes in whole cents, so some totals cannot be split exactly. The tool shows the nearest share and says how many people would pay one cent more so the total is met exactly.'],
      ['What does rounding up each share do?', 'It raises each person’s share to the next whole amount. The difference is shown as extra tip, with the new total and the tip percentage you really leave.'],
      ['What is a normal tip?', 'It depends on the country, the place and the service. Many people in the United States leave 15 to 20 percent at a restaurant, while service is already included in some countries. Use the figure that suits you.'],
      ['Does the currency choice change the maths?', 'No. The picker only changes the symbol shown. The calculation is the same for every currency and nothing is converted.'],
      ['Is anything stored or sent?', 'No. Everything is calculated in your browser. Nothing is uploaded and nothing is saved.'],
    ],
    related: ['discount-calculator', 'percentage-calculator', 'loan-calculator', 'compound-interest-calculator'],
  },
  mount: mountTip,
};

// ====================================================================== compound interest calculator
const FREQ = [{ v: '1', t: 'Annually (1 a year)' }, { v: '2', t: 'Semiannually (2 a year)' }, { v: '4', t: 'Quarterly (4 a year)' }, { v: '12', t: 'Monthly (12 a year)' }, { v: '365', t: 'Daily (365 a year)' }];
function mountCompound(container) {
  let sym = '$'; const fields = [];
  const mk = o => { const f = nf({ prefix: sym, ...o }); fields.push(f); return f; };
  const cur = currencyPicker(s => { sym = s; fields.forEach(f => f.setPrefix(s)); upd(); });
  const prin = mk({ label: 'Starting amount', value: '', min: 0, max: 1e11, dp: 2, name: 'a starting amount', key: 'principal' });
  const rate = nf({ label: 'Annual interest rate', value: '', suffix: '%', min: 0, max: 100, dp: 4, name: 'a rate', key: 'rate', help: 'A constant yearly rate, before fees and tax.' });
  const yrs = nf({ label: 'Time, years', value: '', suffix: 'years', int: true, min: 0, max: 100, name: 'years', key: 'years' });
  const mos = nf({ label: 'Time, extra months', value: '', suffix: 'months', int: true, min: 0, max: 1199, name: 'months', key: 'months' });
  const freq = select({ label: 'Compounding', value: '12', choices: FREQ, onInput: () => upd() });
  const contrib = mk({ label: 'Monthly contribution (optional)', value: '', min: 0, max: 1e9, dp: 2, name: 'a contribution', key: 'contrib' });
  const timing = seg({ label: 'Contributions are made', value: 'end', choices: [{ v: 'end', t: 'At the end of each month' }, { v: 'start', t: 'At the start of each month' }], onInput: () => upd() });
  const ans = bigAnswer(); const tiles = results([]); const notes = h('div', { class: 'calc-notes' });
  const disclaimer = calcNote('This is an illustration using one constant interest rate. It is not a forecast. Real returns go up and down, and fees, taxes and inflation are not included. It is not financial advice.');
  disclaimer.classList.add('calc-disclaimer'); disclaimer.removeAttribute('role');
  const chart = lineChart('Growth over time'); const chartPanel = panel('Growth over time', chart.el); chartPanel.hidden = true;
  let csvText = '';
  const dl = downloadButton(() => csvText, 'compound-interest-by-year.csv', 'Download CSV', 'text/csv;charset=utf-8');
  const tableHost = h('div', {}); const tablePanel = panel('Year by year', h('div', { class: 'lt-bar calc-tbar' }, dl), tableHost); tablePanel.hidden = true;
  container.append(workbench(panel('Your numbers', stack(cur, prin, rate, row(yrs, mos), freq, contrib, timing)), panel('Result', ans.el, tiles, notes, disclaimer)), chartPanel, tablePanel);

  const idle = msg => { ans.set(msg, '', ''); setResults(tiles, []); chartPanel.hidden = true; tablePanel.hidden = true; csvText = ''; };
  function upd() {
    notes.replaceChildren();
    const rp = prin.read(), rr = rate.read(), ry = yrs.read(), rm = mos.read(), rc = contrib.read();
    if ([rp, rr, ry, rm, rc].some(r => r.kind === 'bad')) return idle('Check the highlighted fields');
    if (rr.kind !== 'ok' || (ry.kind === 'empty' && rm.kind === 'empty') || (rp.kind === 'empty' && rc.kind === 'empty')) return idle('Enter an amount, a rate and a time');
    const months = (ry.kind === 'ok' ? Number(ry.d.n) : 0) * 12 + (rm.kind === 'ok' ? Number(rm.d.n) : 0);
    if (months < 1) { mos.error('Enter a time of at least 1 month.'); return idle('Check the highlighted fields'); }
    if (months > 1200) { mos.error('The time can be at most 100 years.'); return idle('Check the highlighted fields'); }
    const pC = rp.kind === 'ok' ? centsOf(rp.d) : 0, cC = rc.kind === 'ok' ? centsOf(rc.d) : 0;
    const g = compoundGrowth({ principalCents: pC, rate: rr.d, months, m: Number(freq.get()), contribCents: cC, atStart: timing.get() === 'start' });
    if (g.finalCents > 9e15) { idle('Result is too large to show'); notes.append(calcNote('The result is larger than this calculator can show. Try a lower rate or a shorter time.', 'err')); return; }
    const money = c => fmtCents(c, sym);
    const finalC = g.finalCents, contribTotal = pC + cC * months, interest = finalC - contribTotal;
    ans.set('Ending balance', money(finalC), `after ${[Math.floor(months / 12) && plural(Math.floor(months / 12), 'year'), months % 12 && plural(months % 12, 'month')].filter(Boolean).join(' and ')}`);
    setResults(tiles, [
      { k: 'contrib', label: 'Total contributions', value: money(contribTotal), hint: cC ? `${money(pC)} start plus ${money(cC)} × ${plural(months, 'month')}` : 'Your starting amount' },
      { k: 'interest', label: 'Total interest earned', value: money(interest), hint: finalC > 0 ? `${D.trim(D.div(D.mul(D.int(interest), D.int(100)), D.int(finalC), 1), 1)}% of the ending balance` : '' },
    ]);
    const rows = g.yearly.map(y => {
      const bc = y.balanceCents, cc = pC + cC * y.months;
      return { label: y.months % 12 ? `${y.year} (${y.months - (y.year - 1) * 12} months)` : String(y.year), bc, cc, ic: bc - cc };
    });
    tableHost.replaceChildren(dataTable({ label: 'Balance at the end of each year', columns: ['Year', 'Contributions', 'Interest', 'Balance'], rows: rows.map(r => [r.label, money(r.cc), money(r.ic), money(r.bc)]) }));
    const c2 = x => (x / 100).toFixed(2);
    csvText = csv([['Year', 'Total contributions', 'Total interest', 'Balance'], ...rows.map(r => [r.label, c2(r.cc), c2(r.ic), c2(r.bc)])]);
    tablePanel.hidden = false;
    const yearsTotal = months / 12, useYears = months > 24;
    const pts = g.monthly.map((b, k) => [k, b]);
    const cpts = g.monthly.map((_, k) => [k, (pC + cC * k) / 100]);
    const step = useYears ? Math.max(1, Math.ceil(yearsTotal / 8)) * 12 : Math.max(1, Math.ceil(months / 8));
    const xTicks = []; for (let x = 0; x <= months; x += step) xTicks.push(x);
    chart.set({
      series: [{ name: 'Balance', pts }, { name: 'Total contributions', pts: cpts }], xLabel: useYears ? 'Years' : 'Months', xTicks, xTickLabel: x => (useYears ? String(x / 12) : String(x)), yLabel: v => compact(v, sym.trim()),
      caption: `The balance grows from ${money(pC)} to ${money(finalC)}. Of that, ${money(contribTotal)} is money you put in and ${money(interest)} is interest.`,
    });
    chartPanel.hidden = false;
    notes.append(hint(`Interest compounds ${Number(freq.get()) === 1 ? 'once a year' : Number(freq.get()) + ' times a year'}. Monthly contributions earn interest at the equivalent monthly rate from the month they are made.`));
  }
  bind([...fields, rate, yrs, mos], upd, 120);
  upd();
}

export const COMPOUND_TOOL = {
  id: 'compound-interest-calculator', slug: 'compound-interest-calculator', name: 'Compound Interest Calculator',
  blurb: 'See how savings grow with compound interest and regular monthly contributions.',
  keywords: 'compound interest savings growth investment contribution future value apy',
  icon: 'trend', kind: 'live',
  seo: {
    title: 'Free Compound Interest Calculator | Ecom Swift LLC',
    description: 'See the ending balance, total contributions and interest earned for a starting amount, rate, time and compounding frequency. Year-by-year table and chart.',
    h1: 'Compound Interest Calculator',
    intro: 'Enter a starting amount, a yearly rate and a time to see how compound interest grows a balance, with optional monthly contributions. You get a year-by-year table and a chart. It runs in your browser.',
    steps: ['Enter the starting amount, the annual rate and the time.', 'Choose how often interest compounds, and add a monthly contribution if you like.', 'Read the ending balance, then check the chart and the year-by-year table.'],
    faq: [
      ['What is compound interest?', 'It is interest earned on both the original amount and the interest already added. Over time this makes a balance grow faster than simple interest, which only pays on the original amount.'],
      ['How is the ending balance calculated?', 'Each month the balance grows at the monthly rate equal to your chosen compounding, then your contribution is added. With no contributions this matches the formula A = P × (1 + r ÷ n) to the power of n × t.'],
      ['Does the compounding frequency matter much?', 'A little. More frequent compounding gives a slightly higher balance for the same yearly rate, and the gap grows with higher rates and longer times.'],
      ['Is this a forecast?', 'No. It is an illustration with one constant rate. Real returns vary from year to year, and fees, taxes and inflation are not included. It is not financial advice.'],
      ['What is the difference between contributions at the start and end of the month?', 'A contribution at the start of the month earns interest for that whole month, so the result is slightly higher than the same contribution made at the end.'],
      ['Is my data stored or sent anywhere?', 'No. Everything is calculated in your browser. Nothing is uploaded or saved, and the currency picker only changes the symbol shown.'],
    ],
    related: ['loan-calculator', 'percentage-calculator', 'discount-calculator', 'tip-calculator'],
  },
  mount: mountCompound,
};

// ====================================================================== mortgage calculator
registerIcons({ home: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>' });
function mountMortgage(container) {
  let sym = '$'; const fields = [];
  const mk = o => { const f = nf({ prefix: sym, ...o }); fields.push(f); return f; };
  const cur = currencyPicker(s => { sym = s; fields.forEach(f => f.setPrefix(s)); upd(); });
  const price = mk({ label: 'Home price', value: '', min: 0, minExcl: true, max: 1e9, dp: 2, name: 'a home price', key: 'price' });
  const downMode = seg({ label: 'Down payment as', value: 'pct', choices: [{ v: 'pct', t: 'Percent of price' }, { v: 'amt', t: 'Amount' }], onInput: () => upd() });
  const downPct = nf({ label: 'Down payment', value: '', suffix: '%', min: 0, max: 100, dp: 2, name: 'a down payment', key: 'downpct' });
  const downAmt = mk({ label: 'Down payment', value: '', min: 0, max: 1e9, dp: 2, name: 'a down payment', key: 'downamt' });
  const rate = nf({ label: 'Annual interest rate', value: '', suffix: '%', min: 0, max: 100, dp: 4, name: 'a rate', key: 'rate' });
  const yrs = nf({ label: 'Loan term', value: '', suffix: 'years', int: true, min: 1, max: 50, name: 'years', key: 'years' });
  const taxMode = seg({ label: 'Property tax as', value: 'pct', choices: [{ v: 'pct', t: 'Percent of price a year' }, { v: 'amt', t: 'Amount a year' }], onInput: () => upd() });
  const taxPct = nf({ label: 'Property tax (optional)', value: '', suffix: '% a year', min: 0, max: 10, dp: 3, name: 'a tax rate', key: 'taxpct' });
  const taxAmt = mk({ label: 'Property tax (optional)', value: '', min: 0, max: 1e8, dp: 2, name: 'a tax amount', key: 'taxamt', suffix: 'a year' });
  const ins = mk({ label: 'Home insurance (optional)', value: '', min: 0, max: 1e8, dp: 2, name: 'an insurance amount', key: 'ins', suffix: 'a year' });
  const hoa = mk({ label: 'HOA or other monthly costs (optional)', value: '', min: 0, max: 1e7, dp: 2, name: 'an amount', key: 'hoa', suffix: 'a month' });
  const start = dateField({ label: 'Loan start date (optional)', help: 'Adds dates to the schedule. The first payment is due one month after this date.', key: 'start' });
  const downPctBox = h('div', {}, downPct.el), downAmtBox = h('div', { hidden: true }, downAmt.el);
  const taxPctBox = h('div', {}, taxPct.el), taxAmtBox = h('div', { hidden: true }, taxAmt.el);
  const ans = bigAnswer(); const tiles = results([]); const notes = h('div', { class: 'calc-notes' });
  const inputs = panel('Home and loan', stack(cur, price, downMode, downPctBox, downAmtBox, rate, yrs, taxMode, taxPctBox, taxAmtBox, ins, hoa, start));
  const sb = scheduleBlock('mortgage-amortization-schedule.csv');
  container.append(workbench(inputs, panel('Your payment', ans.el, tiles, notes)), ...sb.panels);

  const idle = msg => { ans.set(msg || 'Enter a home price, rate and term', '', ''); setResults(tiles, []); sb.hide(); };
  const roundDiv = (a, n) => Math.floor((2 * a + n) / (2 * n)); // a / n rounded half up, whole cents
  function upd() {
    notes.replaceChildren();
    downPctBox.hidden = downMode.get() !== 'pct'; downAmtBox.hidden = downMode.get() !== 'amt';
    taxPctBox.hidden = taxMode.get() !== 'pct'; taxAmtBox.hidden = taxMode.get() !== 'amt';
    const rp = price.read(), rd = downMode.get() === 'pct' ? downPct.read() : downAmt.read(), rr = rate.read(), ry = yrs.read();
    const rt = taxMode.get() === 'pct' ? taxPct.read() : taxAmt.read(), ri = ins.read(), rh = hoa.read(), rs = start.readDate();
    if ([rp, rd, rr, ry, rt, ri, rh].some(r => r.kind === 'bad') || rs.kind === 'bad') return idle('Check the highlighted fields');
    if (rp.kind !== 'ok' || rr.kind !== 'ok' || ry.kind !== 'ok') return idle();
    const priceC = centsOf(rp.d);
    const downC = rd.kind !== 'ok' ? 0 : downMode.get() === 'pct' ? centsOf(D.mul(D.mul(rp.d, rd.d), D.make(1, 2))) : centsOf(rd.d);
    if (downC >= priceC) { (downMode.get() === 'pct' ? downPct : downAmt).error('The down payment must be less than the home price.'); return idle('Check the highlighted fields'); }
    const loanC = priceC - downC, n = Number(ry.d.n) * 12;
    const plan = loanSchedule(loanC, rr.d, n, 0);
    const taxYear = rt.kind !== 'ok' ? 0 : taxMode.get() === 'pct' ? centsOf(D.mul(D.mul(rp.d, rt.d), D.make(1, 2))) : centsOf(rt.d);
    const taxM = roundDiv(taxYear, 12), insM = ri.kind === 'ok' ? roundDiv(centsOf(ri.d), 12) : 0, hoaM = rh.kind === 'ok' ? centsOf(rh.d) : 0;
    const total = plan.payment + taxM + insM + hoaM, money = c => fmtCents(c, sym);
    ans.set('Monthly payment', money(total), `${money(plan.payment)} loan payment${taxM + insM + hoaM ? ` plus ${money(taxM + insM + hoaM)} tax, insurance and fees` : ''}`);
    const downShare = D.div(D.mul(D.int(downC), D.int(100)), D.int(priceC), 2);
    setResults(tiles, [
      { k: 'pi', label: 'Principal and interest', value: money(plan.payment) },
      ...(taxM ? [{ k: 'tax', label: 'Property tax', value: money(taxM), hint: `${money(taxYear)} a year` }] : []),
      ...(insM ? [{ k: 'ins', label: 'Home insurance', value: money(insM), hint: `${money(centsOf(ri.d))} a year` }] : []),
      ...(hoaM ? [{ k: 'hoa', label: 'HOA and other', value: money(hoaM) }] : []),
      { k: 'loan', label: 'Loan amount', value: money(loanC), hint: `${money(downC)} down (${D.trim(downShare, 2)}%)` },
      { k: 'interest', label: 'Total interest', value: money(plan.totalInterest), hint: `over ${plural(Number(ry.d.n), 'year')}` },
      { k: 'paid', label: 'Total of loan payments', value: money(plan.totalPaid), hint: 'Principal and interest only' },
      { k: 'payoff', label: 'Payoff date', value: rs.kind === 'ok' ? fmtDate(addMonths(rs.v, plan.months)) : 'Add a start date', hint: rs.kind === 'ok' ? `after payment ${plan.months}` : '' },
    ]);
    if (downC > 0 && D.cmp(downShare, D.int(20)) < 0) notes.append(calcNote('Some lenders ask for mortgage insurance when the down payment is under 20%. That cost is not included here.'));
    sb.show(plan, loanC, sym, rs.kind === 'ok' ? rs.v : null);
    notes.append(hint('Fixed-rate loan with equal monthly payments. Property tax and insurance are shown as one twelfth of the yearly amount and stay the same every month, which real bills may not. Closing costs and mortgage insurance are not included.'));
  }
  bind([...fields, downPct, rate, yrs, taxPct, start], upd, 120);
  upd();
}

export const MORTGAGE_TOOL = {
  id: 'mortgage-calculator', slug: 'mortgage-calculator', name: 'Mortgage Calculator',
  blurb: 'Monthly mortgage payment with down payment, property tax, insurance and a full schedule.',
  keywords: 'mortgage home loan down payment property tax insurance monthly payment amortization',
  icon: 'home', kind: 'live',
  seo: {
    title: 'Free Mortgage Calculator with Tax and Insurance | Ecom Swift LLC',
    description: 'Enter a home price, down payment, rate and term to see the monthly payment with property tax and insurance, total interest and a payment schedule.',
    h1: 'Mortgage Calculator',
    intro: 'Estimate a monthly mortgage payment from the home price, down payment, interest rate and term, with property tax, insurance and HOA costs added. See total interest and download the schedule. It runs in your browser.',
    steps: ['Enter the home price, down payment, interest rate and loan term.', 'Add property tax, insurance and any monthly fees if you know them.', 'Read the monthly payment, then check the chart and download the schedule.'],
    faq: [
      ['How is the monthly payment worked out?', 'The loan is the home price minus the down payment. The principal and interest part uses the standard fixed-rate formula, rounded to the cent. Property tax and insurance are one twelfth of the yearly amount each, and HOA costs are added as entered.'],
      ['What is included in the payment?', 'Principal, interest, property tax, home insurance and any HOA or other monthly cost you enter. Mortgage insurance, closing costs, transfer taxes and fees from your lender are not included.'],
      ['Is this the exact payment my lender will quote?', 'It is an estimate. Lenders may round or time interest differently, and taxes and insurance change from year to year. Use the lender’s official loan estimate for decisions.'],
      ['What if my down payment is under 20%?', 'Some lenders then require mortgage insurance, which adds to the monthly cost. The tool shows a reminder but does not add that cost, because the rate depends on the lender.'],
      ['Can I use it for an adjustable-rate mortgage?', 'Only as a rough guide for the starting rate. The tool assumes one fixed rate for the whole term, so it cannot show what happens when the rate changes.'],
      ['Is this financial advice, and is my data kept?', 'This is a general calculator, not financial advice. Nothing is uploaded or saved: everything is calculated in your browser.'],
    ],
    related: ['loan-calculator', 'compound-interest-calculator', 'percentage-calculator', 'discount-calculator'],
  },
  mount: mountMortgage,
};
