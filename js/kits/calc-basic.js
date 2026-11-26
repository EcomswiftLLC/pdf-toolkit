// Calculators kit: percentage calculator and BMI calculator.
import { registerIcons } from '../core.js';
import { h, panel, bind, workbench, bigAnswer, results, setResults, calcNote, nf, hint } from './calc-ui.js';
import { seg, check, stack, row } from '../ui.js';
import { D, groupInt } from './calc-lib.js';

registerIcons({
  percent: '<path d="M19 5 5 19"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>',
  scale: '<path d="M5 6h14l1.5 13a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/><path d="M8.5 6a3.5 3.5 0 0 1 7 0"/><path d="m12 10.5 2 3"/><circle cx="12" cy="13.5" r=".6"/>',
});

const T = (d, p) => D.trim(d, p);            // trimmed, grouped number text
const roundedNote = (d, p) => (D.cmp(D.round(d, p), d) === 0 ? '' : `Rounded to ${p} decimal places.`);

// ====================================================================== percentage calculator
function mountPercent(container) {
  const spec = {
    of: { t: 'X% of Y', q: 'What is X% of Y?', a: { label: 'Percentage (X)', suffix: '%', name: 'a percentage', neg: true }, b: { label: 'Number (Y)', name: 'a number', neg: true } },
    is: { t: 'X is what % of Y', q: 'X is what % of Y?', a: { label: 'Number (X)', name: 'a number', neg: true }, b: { label: 'Total (Y)', name: 'a total', neg: true } },
    change: { t: '% change from X to Y', q: 'Percentage change from X to Y', a: { label: 'Starting value (X)', name: 'a starting value', neg: true }, b: { label: 'Ending value (Y)', name: 'an ending value', neg: true } },
    addsub: { t: 'Add or subtract X%', q: 'Add or subtract X% to Y', a: { label: 'Percentage (X)', suffix: '%', name: 'a percentage', neg: true }, b: { label: 'Number (Y)', name: 'a number', neg: true } },
    whatof: { t: 'X is Y% of what', q: 'X is Y% of what number?', a: { label: 'Number (X)', name: 'a number', neg: true }, b: { label: 'Percentage (Y)', suffix: '%', name: 'a percentage', neg: true } },
  };
  const mode = seg({ label: 'What do you want to work out?', value: 'of', choices: Object.entries(spec).map(([v, s]) => ({ v, t: s.t })), onInput: () => upd() });
  const op = seg({ label: 'Operation', value: 'add', choices: [{ v: 'add', t: 'Add X% to Y' }, { v: 'sub', t: 'Subtract X% from Y' }], onInput: () => upd() });
  const F = {}; const blocks = {};
  for (const k in spec) {
    F[k] = { a: nf({ ...spec[k].a, key: k + '-a', value: '' }), b: nf({ ...spec[k].b, key: k + '-b', value: '' }) };
    blocks[k] = h('div', { class: 'calc-mode', 'data-mode': k }, stack(F[k].a, F[k].b));
  }
  blocks.addsub.append(op.el);
  const ans = bigAnswer();
  const working = h('p', { class: 'calc-working', 'data-k': 'working' });
  const tiles = results([]); const notes = h('div', { class: 'calc-notes' });
  const inputs = panel('Numbers', mode.el, ...Object.values(blocks), hint('Type numbers with a dot for decimals. Commas for thousands are fine.'));
  const outputs = panel('Result', ans.el, working, tiles, notes);
  container.append(workbench(inputs, outputs));

  const prompt = () => { ans.set(spec[mode.get()].q, '', ''); working.textContent = ''; setResults(tiles, []); };
  const upd = () => {
    const m = mode.get();
    for (const k in blocks) blocks[k].hidden = k !== m;
    notes.replaceChildren();
    const ra = F[m].a.read(), rb = F[m].b.read();
    if (ra.kind === 'bad' || rb.kind === 'bad' || ra.kind === 'empty' || rb.kind === 'empty') return prompt();
    const a = ra.d, b = rb.d, ta = T(a, 12), tb = T(b, 12);
    const hundred = D.int(100);
    const zeroMsg = (f, msg) => { f.error(msg); prompt(); };
    if (m === 'of') {
      const r = D.mul(D.mul(a, b), D.make(1, 2)); // a*b/100 exactly
      ans.set(`${ta}% of ${tb}`, T(r, 12), '');
      working.textContent = `${ta} ÷ 100 × ${tb} = ${T(r, 12)}`;
      setResults(tiles, [{ k: 'rest', label: `${tb} minus ${ta}%`, value: T(D.sub(b, r), 12) }, { k: 'plus', label: `${tb} plus ${ta}%`, value: T(D.add(b, r), 12) }]);
    } else if (m === 'is') {
      if (D.isZero(b)) return zeroMsg(F.is.b, 'The total cannot be zero, because a share of zero is not defined.');
      const r = D.div(D.mul(a, hundred), b, 4);
      ans.set(`${ta} as a percentage of ${tb}`, `${T(r, 4)}%`, roundedNote(D.div(D.mul(a, hundred), b, 12), 4));
      working.textContent = `${ta} ÷ ${tb} × 100 = ${T(r, 4)}%`;
      setResults(tiles, [{ k: 'ratio', label: 'As a decimal', value: T(D.div(a, b, 6), 6) }]);
    } else if (m === 'change') {
      if (D.isZero(a)) return zeroMsg(F.change.a, 'A percentage change from 0 is not defined. Enter a starting value other than 0.');
      const diff = D.sub(b, a), r = D.div(D.mul(diff, hundred), D.abs(a), 4);
      const word = D.isZero(diff) ? 'No change' : D.isNeg(diff) ? 'Decrease' : 'Increase';
      const rn = roundedNote(D.div(D.mul(diff, hundred), D.abs(a), 12), 4);
      ans.set(`${word} from ${ta} to ${tb}`, D.isZero(diff) ? '0%' : `${T(D.abs(r), 4)}%`, [D.isZero(diff) ? '' : `The value went ${word === 'Increase' ? 'up' : 'down'}.`, rn].filter(Boolean).join(' '));
      working.textContent = `(${tb} − ${ta}) ÷ ${T(D.abs(a), 12)} × 100 = ${T(r, 4)}%`;
      setResults(tiles, [{ k: 'diff', label: 'Difference', value: T(diff, 12) }]);
      if (D.isNeg(a)) notes.append(calcNote('The starting value is negative, so the size of the starting value is used to divide, and "increase" means the value moved up.'));
    } else if (m === 'addsub') {
      const sub = op.get() === 'sub';
      const delta = D.mul(D.mul(a, b), D.make(1, 2)), r = sub ? D.sub(b, delta) : D.add(b, delta);
      ans.set(`${tb} ${sub ? 'minus' : 'plus'} ${ta}%`, T(r, 12), '');
      working.textContent = `${tb} ${sub ? '−' : '+'} (${tb} × ${ta} ÷ 100) = ${tb} ${sub ? '−' : '+'} ${T(delta, 12)} = ${T(r, 12)}`;
      setResults(tiles, [{ k: 'amount', label: sub ? 'Amount taken off' : 'Amount added', value: T(delta, 12) }]);
    } else {
      if (D.isZero(b)) return zeroMsg(F.whatof.b, 'The percentage cannot be zero, because no number is 0% of anything but 0.');
      const r = D.div(D.mul(a, hundred), b, 6);
      ans.set(`${ta} is ${tb}% of`, T(r, 6), roundedNote(D.div(D.mul(a, hundred), b, 14), 6));
      working.textContent = `${ta} ÷ ${tb} × 100 = ${T(r, 6)}`;
      setResults(tiles, []);
    }
  };
  const allFields = Object.values(F).flatMap(x => [x.a, x.b]);
  bind(allFields, upd, 50);
  upd();
}

export const PERCENT_TOOL = {
  id: 'percentage-calculator', slug: 'percentage-calculator', name: 'Percentage Calculator',
  blurb: 'Find a percentage of a number, a percentage change, or add and subtract percentages.',
  keywords: 'percent percentage change increase decrease what is x% of',
  icon: 'percent', kind: 'live',
  seo: {
    title: 'Free Percentage Calculator with Working | Ecom Swift LLC',
    description: 'Work out X% of a number, what percent one number is of another, percentage change, and adding or removing a percentage, with the working shown.',
    h1: 'Percentage Calculator',
    intro: 'Answer the five percentage questions people ask most: what is X% of Y, X is what percent of Y, percentage change, adding or subtracting a percentage, and X is Y% of what. The working is shown. It runs in your browser.',
    steps: ['Choose the question you want to answer.', 'Type your two numbers.', 'Read the answer and the working line below it.'],
    faq: [
      ['How do I work out X% of a number?', 'Divide X by 100 and multiply by the number. For example, 15% of 80 is 15 ÷ 100 × 80 = 12. The tool shows this line for your numbers.'],
      ['How is percentage change calculated?', 'Subtract the starting value from the ending value, divide by the starting value, then multiply by 100. A positive answer is an increase and a negative answer is a decrease.'],
      ['Why does percentage change from 0 show a message?', 'Dividing by zero has no answer. A change from 0 cannot be written as a percentage, so the tool asks for a starting value other than 0.'],
      ['Are the answers exact?', 'Multiplying and adding are exact. When a division does not end, such as 1 ÷ 3, the answer is rounded to four decimal places (six for "X is Y% of what") and the tool says so.'],
      ['Can I use negative numbers or decimals?', 'Yes. Type a minus sign or a decimal point. Commas for thousands are accepted, for example 1,250.50. Numbers with more than 15 digits are refused.'],
      ['Is anything sent to a server?', 'No. The sums are done in your browser, nothing is uploaded and nothing is saved.'],
    ],
    related: ['discount-calculator', 'tip-calculator', 'compound-interest-calculator', 'loan-calculator'],
  },
  mount: mountPercent,
};

// ====================================================================== BMI calculator
const KG_PER_LB_NOTE = 'Imperial BMI uses the standard factor of 703.';
function category(b1) { // b1: Dec rounded to 1 decimal
  const c = x => D.cmp(b1, D.parse(x));
  if (c('18.5') < 0) return { name: 'Underweight', i: 0 };
  if (c('25') < 0) return { name: 'Normal weight', i: 1 };
  if (c('30') < 0) return { name: 'Overweight', i: 2 };
  if (c('35') < 0) return { name: 'Obese, class I', i: 3 };
  if (c('40') < 0) return { name: 'Obese, class II', i: 3 };
  return { name: 'Obese, class III', i: 3 };
}
const SCALE = [
  { n: 'Underweight', r: 'under 18.5', lo: 15, hi: 18.5 },
  { n: 'Normal weight', r: '18.5 to 24.9', lo: 18.5, hi: 25 },
  { n: 'Overweight', r: '25 to 29.9', lo: 25, hi: 30 },
  { n: 'Obese', r: '30 and above', lo: 30, hi: 40 },
];
function scaleEl() {
  const marker = h('div', { class: 'calc-marker', 'data-k': 'marker' }, h('span', { class: 'mk-l' }), h('span', { class: 'mk-t', 'aria-hidden': 'true' }));
  const segs = SCALE.map((s, i) => h('div', { class: 'calc-seg calc-seg' + i }, h('span', { class: 'sg-bar' }), h('span', { class: 'sg-n' }, s.n), h('span', { class: 'sg-r' }, s.r)));
  const el = h('div', { class: 'calc-scale', role: 'img' }, h('div', { class: 'calc-track' }, marker), h('div', { class: 'calc-segs' }, ...segs));
  return {
    el, segs,
    set(b, cat, text) {
      const v = Math.min(40, Math.max(15, b));
      let x = 0;
      for (let i = 0; i < SCALE.length; i++) { const s = SCALE[i]; if (v <= s.hi || i === SCALE.length - 1) { x = i + Math.min(1, Math.max(0, (v - s.lo) / (s.hi - s.lo))); break; } }
      marker.style.left = Math.min(97, Math.max(3, (x / 4) * 100)) + '%';
      marker.querySelector('.mk-l').textContent = text;
      segs.forEach((s, i) => s.classList.toggle('on', i === cat.i));
      el.setAttribute('aria-label', `BMI scale. Underweight is under 18.5, normal weight 18.5 to 24.9, overweight 25 to 29.9, obese 30 and above. Your BMI is ${text.replace('You: ', '')}, which is ${cat.name.toLowerCase()}.`);
    },
  };
}

function mountBmi(container) {
  const units = seg({ label: 'Units', value: 'metric', choices: [{ v: 'metric', t: 'Metric (kg, cm)' }, { v: 'imperial', t: 'Imperial (lb, ft, in)' }], onInput: u => switchUnits(u) });
  const age = nf({ label: 'Age in years (optional)', value: '', int: true, min: 1, max: 120, name: 'an age', help: 'BMI categories below only apply to adults aged 20 or over.', key: 'age', suffix: 'years' });
  const preg = check({ label: 'I am pregnant', onInput: () => upd() });
  const cm = nf({ label: 'Height', value: '', suffix: 'cm', min: 50, max: 260, minExcl: false, name: 'a height', unit: 'cm', dp: 1, key: 'cm' });
  const ft = nf({ label: 'Height, feet', value: '', suffix: 'ft', min: 1, max: 8, int: true, name: 'feet', key: 'ft' });
  const inch = nf({ label: 'Height, inches', value: '', suffix: 'in', min: 0, max: 11.9, dp: 1, name: 'inches', key: 'in' });
  const kg = nf({ label: 'Weight', value: '', suffix: 'kg', min: 10, max: 500, name: 'a weight', unit: 'kg', dp: 1, key: 'kg' });
  const lb = nf({ label: 'Weight', value: '', suffix: 'lb', min: 20, max: 1100, name: 'a weight', unit: 'lb', dp: 1, key: 'lb' });
  const metricBox = h('div', { class: 'calc-mode' }, stack(cm, kg));
  const impBox = h('div', { class: 'calc-mode', hidden: true }, stack(row(ft, inch), lb));
  const ans = bigAnswer(); const scale = scaleEl(); const tiles = results([]); const notes = h('div', { class: 'calc-notes' });
  const disclaimer = calcNote('BMI is a screening number, not a diagnosis. It does not measure body fat, muscle or overall health. This tool gives general information, not medical advice. Talk to a doctor or dietitian about your weight.', 'info');
  disclaimer.classList.add('calc-disclaimer'); disclaimer.removeAttribute('role');
  const inputs = panel('Your measurements', units.el, metricBox, impBox, stack(age, preg));
  const outputs = panel('Your BMI', ans.el, scale.el, tiles, notes, disclaimer);
  container.append(workbench(inputs, outputs));
  scale.el.hidden = true;

  const num = f => (f.get().trim() === '' ? NaN : Number(f.get().replace(/,/g, '')));
  function switchUnits(u) {
    const toImp = u === 'imperial';
    const a = num(cm), w = num(kg), tin = num(ft) * 12 + (num(inch) || 0), wl = num(lb);
    metricBox.hidden = toImp; impBox.hidden = !toImp;
    if (toImp) {
      if (Number.isFinite(a)) { const t = a / 2.54; let f = Math.floor(t / 12), i = Math.round((t - f * 12) * 10) / 10; if (i >= 12) { f++; i = 0; } ft.set(String(f)); inch.set(String(i)); }
      if (Number.isFinite(w)) lb.set(String(Math.round(w * 2.2046226218 * 10) / 10));
    } else {
      if (Number.isFinite(tin)) cm.set(String(Math.round(tin * 2.54 * 10) / 10));
      if (Number.isFinite(wl)) kg.set(String(Math.round(wl / 2.2046226218 * 10) / 10));
    }
    upd();
  }
  const reset = msg => { ans.set(msg || 'Enter your height and weight', '', ''); scale.el.hidden = true; setResults(tiles, []); };
  function upd() {
    notes.replaceChildren();
    const imp = units.get() === 'imperial';
    const ar = age.read();
    let hDec, wDec, bmi;
    if (!imp) {
      const hr = cm.read(), wr = kg.read();
      if (hr.kind !== 'ok' || wr.kind !== 'ok' || ar.kind === 'bad') return reset();
      hDec = hr.d; wDec = wr.d;
      bmi = D.div(D.mul(wDec, D.int(10000)), D.mul(hDec, hDec), 1);
    } else {
      const fr = ft.read(), ir = inch.read(), wr = lb.read();
      if (fr.kind === 'bad' || ir.kind === 'bad' || wr.kind !== 'ok' || ar.kind === 'bad' || (fr.kind === 'empty' && ir.kind === 'empty')) return reset();
      const tin = D.add(D.mul(fr.kind === 'ok' ? fr.d : D.int(0), D.int(12)), ir.kind === 'ok' ? ir.d : D.int(0));
      if (D.cmp(tin, D.int(20)) < 0) { ft.error('Enter a height of at least 20 inches.'); return reset(); }
      hDec = tin; wDec = wr.d;
      bmi = D.div(D.mul(wDec, D.int(703)), D.mul(hDec, hDec), 1);
    }
    const under20 = ar.kind === 'ok' && D.cmp(ar.d, D.int(20)) < 0;
    const pregnant = preg.get();
    const b1 = D.str(bmi, 1, false);
    if (under20 || pregnant) {
      ans.set('Your BMI', b1, under20 ? 'Adult categories do not apply under age 20.' : 'Adult categories do not apply during pregnancy.');
      scale.el.hidden = true; setResults(tiles, [{ k: 'bmi', label: 'BMI (kg/m²)', value: b1 }]);
      notes.append(calcNote(under20
        ? 'BMI for children and teens under 20 is not read with the adult categories. It is compared with growth charts for the same age and sex (BMI-for-age percentiles). Ask a doctor or a school nurse to check it that way.'
        : 'The adult BMI categories are not meant for use during pregnancy. A midwife or doctor can tell you what weight gain is right for you.'));
      return;
    }
    const cat = category(bmi);
    ans.set('Your BMI', b1, cat.name);
    scale.el.hidden = false; scale.set(Number(b1), cat, `You: ${b1}`);
    // healthy range: weight at BMI 18.5 and 24.9 for this height (low rounded up, high rounded down, so the range stays inside the band)
    const sq = D.mul(hDec, hDec), f = imp ? D.int(703) : D.int(10000);
    const lo = D.divDir(D.mul(D.parse('18.5'), sq), f, 1, 'ceil'), hi = D.divDir(D.mul(D.parse('24.9'), sq), f, 1, 'floor');
    const u = imp ? 'lb' : 'kg';
    setResults(tiles, [
      { k: 'category', label: 'Category', value: cat.name, hint: 'WHO adult categories' },
      { k: 'range', label: `Healthy weight range for your height`, value: `${D.trim(lo, 1)} to ${D.trim(hi, 1)} ${u}`, hint: 'Weights that give a BMI of 18.5 to 24.9' },
    ]);
    if (imp) notes.append(hint(KG_PER_LB_NOTE));
  }
  bind([cm, ft, inch, kg, lb, age, preg], upd, 50);
  upd();
}

export const BMI_TOOL = {
  id: 'bmi-calculator', slug: 'bmi-calculator', name: 'BMI Calculator',
  blurb: 'Calculate body mass index in metric or imperial units, with the WHO adult categories.',
  keywords: 'bmi body mass index weight height healthy weight kg lb',
  icon: 'scale', kind: 'live',
  seo: {
    title: 'Free BMI Calculator, Metric and Imperial | Ecom Swift LLC',
    description: 'Calculate your body mass index in kg and cm or lb, feet and inches, see the WHO adult category and the weight range for your height. Runs in your browser.',
    h1: 'BMI Calculator',
    intro: 'Enter your height and weight in metric or imperial units to see your body mass index, the WHO adult category and the weight range for your height. It runs in your browser and nothing is uploaded.',
    steps: ['Choose metric or imperial units.', 'Enter your height and weight, and your age if you like.', 'Read your BMI, the category and the healthy weight range.'],
    faq: [
      ['How is BMI calculated?', 'BMI is weight in kilograms divided by height in metres squared. For pounds and inches, multiply weight by 703 and divide by height in inches squared.'],
      ['What are the BMI categories?', 'For adults the WHO groups are: under 18.5 underweight, 18.5 to 24.9 normal, 25 to 29.9 overweight, and 30 or more obese, split into class I (30 to 34.9), class II (35 to 39.9) and class III (40 or more). The category uses the BMI rounded to one decimal.'],
      ['Does this work for children and teens?', 'No. For people under 20, BMI is compared with growth charts for their age and sex. If you enter an age under 20, the tool shows the number but no adult category.'],
      ['Is BMI a diagnosis?', 'No. It is a quick screening number. It does not measure body fat, muscle, bone or where weight is carried, and it can be misleading for athletes, older adults and some ethnic groups. This tool is not medical advice, so ask a doctor or dietitian.'],
      ['How is the healthy weight range worked out?', 'It is the weight that gives a BMI of 18.5 at the low end and 24.9 at the high end for your height, rounded so the range stays inside those limits.'],
      ['Is my height or weight stored anywhere?', 'No. The calculation happens in your browser, nothing is uploaded and nothing is saved.'],
    ],
    related: ['age-calculator', 'percentage-calculator', 'date-calculator', 'tip-calculator'],
  },
  mount: mountBmi,
};
