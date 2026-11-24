/* SmartSpend AI – front-end only (HTML + CSS + vanilla JavaScript).
   Data is stored in the browser's localStorage, so no backend is needed. */
'use strict';

/* ---------- Config & helpers ---------- */
const CATS = ['Food', 'Transportation', 'Education', 'Shopping', 'Entertainment', 'Bills', 'Other']; // FR4
const SRC = ['Salary', 'Freelance', 'Business', 'Investments', 'Other'];                              // FR3
const COL = { Food: '#f59e0b', Transportation: '#3b82f6', Education: '#8b5cf6', Shopping: '#ec4899',
              Entertainment: '#14b8a6', Bills: '#ef4444', Other: '#6b7280' };
const NAV = [['dashboard', '📊 Dashboard'], ['tx', '🧾 Transactions'], ['budgets', '🎯 Budgets'],
             ['reports', '📈 Reports'], ['ai', '🤖 AI Insights']];
const $ = (s) => document.querySelector(s);
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
                set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const today = () => new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
const ym = (d) => d.slice(0, 7);
const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);

async function hash(p) { // NFR1: passwords are never stored in plain text
  try {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(p));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  } catch { return btoa(p); }
}

/* ---------- State ---------- */
let user = null, D = null, view = 'dashboard', month = today().slice(0, 7), editId = null, F = {};
const save = () => store.set('sf_data_' + user.email, D);

/* ---------- Calculations (NFR8: accuracy) ---------- */
const inM = (m) => D.tx.filter((t) => ym(t.date) === m);
const sum = (a, type) => a.filter((x) => x.type === type).reduce((s, x) => s + x.amount, 0);
const byCat = (a) => { const o = {}; a.filter((x) => x.type === 'expense').forEach((x) => (o[x.category] = (o[x.category] || 0) + x.amount)); return o; };
const prevMonth = (m, k = 1) => { let [y, mm] = m.split('-').map(Number); mm -= k; while (mm < 1) { mm += 12; y--; } return `${y}-${String(mm).padStart(2, '0')}`; };

function alerts() { // FR11: budget notifications at 80% and 100%
  const a = [], e = inM(month), c = byCat(e);
  const chk = (n, s, l) => {
    if (!(l > 0)) return;
    const p = pct(s, l);
    if (p >= 100) a.push({ lv: 'danger', t: `${n} budget exceeded: ${fmt(s)} of ${fmt(l)}` });
    else if (p >= 80) a.push({ lv: 'warn', t: `${n} budget at ${Math.round(p)}% (${fmt(s)} of ${fmt(l)})` });
  };
  chk('Overall monthly', sum(e, 'expense'), D.budgets.total);
  Object.entries(D.budgets.cats).forEach(([k, l]) => chk(k, c[k] || 0, l));
  return a;
}

function insights() { // FR9 & FR10: rule-based "AI" analysis of spending patterns
  const e = inM(month), inc = sum(e, 'income'), exp = sum(e, 'expense'), c = byCat(e);
  const pc = byCat(inM(prevMonth(month))), ins = [], rec = [];
  const [y, m] = month.split('-').map(Number), days = new Date(y, m, 0).getDate();
  const isNow = month === today().slice(0, 7), day = isNow ? new Date().getDate() : days;
  if (!e.length) return { ins: [{ lv: '', t: 'Add some transactions to get personalised insights.' }], rec: [] };
  Object.entries(c).forEach(([k, v]) => {
    if (pc[k] > 0 && v > pc[k] * 1.2) ins.push({ lv: 'warn', t: `${k} spending rose ${Math.round((v / pc[k] - 1) * 100)}% compared with last month.` });
  });
  const proj = (exp / day) * days;
  if (exp) ins.push({ lv: D.budgets.total && proj > D.budgets.total ? 'danger' : '', t: `At this pace, projected ${isNow ? 'end-of-month' : 'monthly'} spending is ${fmt(proj)}${D.budgets.total ? ` against a budget of ${fmt(D.budgets.total)}` : ''}.` });
  const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  if (top) ins.push({ lv: '', t: `Your biggest category is ${top[0]} (${Math.round(pct(top[1], exp))}% of expenses).` });
  const rate = pct(inc - exp, inc);
  if (inc) ins.push({ lv: rate >= 20 ? 'good' : 'warn', t: `Your savings rate this month is ${Math.round(rate)}%.` });
  if (top && pct(top[1], exp) > 35) rec.push(`Set a category budget for ${top[0]}; it takes over a third of your spending.`);
  if (inc && rate < 20) rec.push(`Aim to save 20% of income (${fmt(inc * 0.2)}). Try automating a transfer on payday.`);
  ['Entertainment', 'Shopping'].forEach((k) => { if (inc && (c[k] || 0) > inc * 0.15) rec.push(`${k} exceeds 15% of income. Cutting it by 20% would save about ${fmt(c[k] * 0.2)} a month.`); });
  if ((c.Bills || 0) > inc * 0.3 && inc) rec.push('Bills are above 30% of income. Review subscriptions and utility plans for savings.');
  alerts().filter((a) => a.lv === 'danger').forEach((a) => rec.push('Over budget: ' + a.t + '. Pause non-essential purchases in that category.'));
  if (!rec.length) rec.push('Great job! Your spending looks healthy. Consider moving surplus money into savings or investments.');
  return { ins, rec };
}

/* ---------- UI helpers ---------- */
const toast = (t) => { const e = $('#toast'); e.textContent = t; e.classList.add('show'); setTimeout(() => e.classList.remove('show'), 2800); };
const bar = (p) => `<div class="bar ${p >= 100 ? 'danger' : p >= 80 ? 'warn' : ''}"><i style="width:${Math.min(p, 100)}%"></i></div>`;
const opts = (type, sel) => (type === 'income' ? SRC : CATS).map((o) => `<option ${o === sel ? 'selected' : ''}>${o}</option>`).join('');

function donut(cv, data) {
  const x = cv.getContext('2d'), tot = Object.values(data).reduce((a, b) => a + b, 0);
  cv.width = cv.height = 300; x.clearRect(0, 0, 300, 300);
  if (!tot) { x.fillStyle = '#888'; x.textAlign = 'center'; x.fillText('No expense data', 150, 150); return; }
  let a = -Math.PI / 2;
  Object.entries(data).forEach(([k, v]) => { const s = (v / tot) * Math.PI * 2; x.beginPath(); x.moveTo(150, 150); x.arc(150, 150, 140, a, a + s); x.fillStyle = COL[k] || '#999'; x.fill(); a += s; });
  x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(150, 150, 80, 0, 7); x.fill(); x.globalCompositeOperation = 'source-over';
}
const legend = (d) => `<div class="legend">${Object.entries(d).map(([k, v]) => `<span><i style="background:${COL[k]}"></i>${k}: ${fmt(v)}</span>`).join('')}</div>`;

function bars(cv) { // income vs expense for the last 6 months
  const x = cv.getContext('2d'); cv.width = 600; cv.height = 260; x.clearRect(0, 0, 600, 260);
  const ms = [5, 4, 3, 2, 1, 0].map((i) => prevMonth(month, i));
  const v = ms.map((k) => { const e = inM(k); return [sum(e, 'income'), sum(e, 'expense')]; });
  const mx = Math.max(1, ...v.flat()); x.font = '12px sans-serif'; x.textAlign = 'center';
  v.forEach((p, i) => {
    const px = 40 + i * 92;
    [['#16a34a', p[0]], ['#ef4444', p[1]]].forEach(([c, val], j) => { const h = (val / mx) * 190; x.fillStyle = c; x.fillRect(px + j * 30, 220 - h, 26, h); });
    x.fillStyle = getComputedStyle(document.body).color; x.fillText(ms[i], px + 28, 242);
  });
}

/* ---------- Auth screens (FR1) ---------- */
function authView(mode = 'login') {
  const L = mode === 'login';
  $('#app').innerHTML = `<div class="auth"><form class="card auth-card" id="af" data-mode="${mode}" novalidate>
    <h1>💸 SmartSpend AI</h1><p class="muted">${L ? 'Log in to manage your finances' : 'Create your free account'}</p>
    ${L ? '' : '<label>Full name<input name="name" required minlength="2" autocomplete="name"></label>'}
    <label>Email<input name="email" type="email" required autocomplete="email"></label>
    <label>Password<input name="password" type="password" required minlength="6" autocomplete="${L ? 'current-password' : 'new-password'}"></label>
    <div class="err" id="err"></div><button class="btn">${L ? 'Login' : 'Register'}</button>
    <p class="muted">${L ? 'New here?' : 'Already registered?'} <a href="#" data-sw="${L ? 'register' : 'login'}">${L ? 'Create an account' : 'Login'}</a></p></form></div>`;
}

async function submitAuth(f) {
  const d = Object.fromEntries(new FormData(f)), users = store.get('sf_users', {}), em = (d.email || '').trim().toLowerCase(), err = $('#err');
  if (!/^\S+@\S+\.\S+$/.test(em)) return (err.textContent = 'Enter a valid email address.');
  if ((d.password || '').length < 6) return (err.textContent = 'Password must be at least 6 characters.');
  if (f.dataset.mode === 'register') {
    if ((d.name || '').trim().length < 2) return (err.textContent = 'Enter your name.');
    if (users[em]) return (err.textContent = 'An account with this email already exists.');
    users[em] = { name: d.name.trim(), hash: await hash(d.password) }; store.set('sf_users', users);
  } else if (!users[em] || users[em].hash !== (await hash(d.password))) return (err.textContent = 'Incorrect email or password.');
  startSession(em, users[em].name); toast('Welcome, ' + users[em].name + '!');
}
function startSession(email, name) {
  user = { email, name }; store.set('sf_session', user);
  D = store.get('sf_data_' + email, { tx: [], budgets: { total: 0, cats: {} } }); view = 'dashboard'; shell();
}
function logout() { localStorage.removeItem('sf_session'); user = D = null; authView(); toast('You have been logged out.'); }

/* ---------- Shell ---------- */
function shell() {
  const n = alerts().length;
  $('#app').innerHTML = `<div class="layout"><aside class="side"><h2>💸 SmartSpend</h2>
    ${NAV.map(([k, l]) => `<a href="#" data-v="${k}" class="${k === view ? 'on' : ''}">${l}</a>`).join('')}
    <button class="btn ghost" data-act="logout">Logout</button></aside>
    <section><header class="top"><b>Hi, ${esc(user.name)} 👋</b><div class="row">
      <input type="month" id="mo" value="${month}" aria-label="Select month">
      <button class="bell" data-act="bell" aria-label="Notifications">🔔<span>${n}</span></button></div></header>
    <div id="notif" class="card hide"></div><main id="main"></main></section></div>`;
  ({ dashboard: vDash, tx: vTx, budgets: vBud, reports: vRep, ai: vAI })[view]();
}
const main = (h) => ($('#main').innerHTML = h);

/* ---------- Views ---------- */
function vDash() { // FR7
  const e = inM(month), inc = sum(e, 'income'), exp = sum(e, 'expense'), c = byCat(e), B = D.budgets.total, rem = B ? B - exp : null;
  main(`<div class="stats">
    <div class="card stat"><span class="muted">Income</span><b class="ok">${fmt(inc)}</b></div>
    <div class="card stat"><span class="muted">Expenses</span><b class="dg">${fmt(exp)}</b></div>
    <div class="card stat"><span class="muted">Savings</span><b>${fmt(inc - exp)}</b></div>
    <div class="card stat"><span class="muted">Remaining budget</span><b class="${rem < 0 ? 'dg' : ''}">${rem === null ? 'Not set' : fmt(rem)}</b></div></div>
    ${D.tx.length ? '' : '<div class="card"><p>No data yet. <button class="btn sm" data-act="seed">Load sample data</button> or add a transaction.</p></div>'}
    <div class="two"><div class="card"><h3>Budget usage</h3>${budgetBars(exp, c) || '<p class="muted">Set budgets in the Budgets tab.</p>'}</div>
    <div class="card"><h3>Spending by category</h3><canvas id="c1" width="300" height="300" style="max-width:220px"></canvas>${legend(c)}</div></div>
    <div class="card"><h3>Recent transactions</h3>${txTable(D.tx.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5), false)}</div>`);
  donut($('#c1'), c);
}
function budgetBars(exp, c) {
  let h = D.budgets.total ? `<small>Overall: ${fmt(exp)} / ${fmt(D.budgets.total)}</small>${bar(pct(exp, D.budgets.total))}` : '';
  Object.entries(D.budgets.cats).forEach(([k, l]) => { if (l > 0) h += `<small>${k}: ${fmt(c[k] || 0)} / ${fmt(l)}</small>${bar(pct(c[k] || 0, l))}`; });
  return h;
}

function txTable(list, actions = true) {
  if (!list.length) return '<p class="muted">No transactions found.</p>';
  return `<div class="tbl"><table><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Note</th><th class="r">Amount</th>${actions ? '<th></th>' : ''}</tr></thead><tbody>
  ${list.map((t) => `<tr><td>${t.date}</td><td><span class="badge ${t.type}">${t.type}</span></td><td>${esc(t.category)}</td><td>${esc(t.note || '')}</td>
  <td class="r ${t.type === 'income' ? 'ok' : 'dg'}">${t.type === 'income' ? '+' : '-'}${fmt(t.amount)}</td>
  ${actions ? `<td><button class="btn ghost sm" data-edit="${t.id}">Edit</button> <button class="btn dg sm" data-del="${t.id}">Delete</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}
function filtered() { // FR6: search & filter by date, category, amount
  return D.tx.filter((t) => (!F.q || (t.note + t.category).toLowerCase().includes(F.q.toLowerCase())) && (!F.type || t.type === F.type) &&
    (!F.cat || t.category === F.cat) && (!F.from || t.date >= F.from) && (!F.to || t.date <= F.to) &&
    (!F.min || t.amount >= +F.min) && (!F.max || t.amount <= +F.max)).sort((a, b) => b.date.localeCompare(a.date));
}
function vTx() { // FR2, FR3, FR12
  const t = (editId && D.tx.find((x) => x.id === editId)) || { type: 'expense', date: today(), category: 'Food', amount: '', note: '' };
  main(`<div class="card"><h3>${editId ? 'Edit' : 'Add'} transaction</h3><form id="txf" class="grid">
    <label>Type<select name="type" id="tt"><option ${t.type === 'expense' ? 'selected' : ''}>expense</option><option ${t.type === 'income' ? 'selected' : ''}>income</option></select></label>
    <label>Category / Source<select name="category" id="tc">${opts(t.type, t.category)}</select></label>
    <label>Amount (₹)<input name="amount" type="number" min="0.01" step="0.01" required value="${t.amount}"></label>
    <label>Date<input name="date" type="date" required value="${t.date}"></label>
    <label>Note<input name="note" maxlength="80" value="${esc(t.note || '')}"></label>
    <div class="row"><button class="btn">${editId ? 'Update' : 'Add'}</button>${editId ? '<button type="button" class="btn ghost" data-act="cancel">Cancel</button>' : ''}</div></form></div>
    <div class="card"><h3>Search &amp; filter</h3><div class="grid" id="flt">
    <label>Search<input data-f="q" placeholder="note or category" value="${esc(F.q || '')}"></label>
    <label>Type<select data-f="type"><option value="">All</option><option>income</option><option>expense</option></select></label>
    <label>Category<select data-f="cat"><option value="">All</option>${[...CATS, ...SRC].filter((v, i, a) => a.indexOf(v) === i).map((c) => `<option>${c}</option>`).join('')}</select></label>
    <label>From<input type="date" data-f="from" value="${F.from || ''}"></label><label>To<input type="date" data-f="to" value="${F.to || ''}"></label>
    <label>Min ₹<input type="number" data-f="min" value="${F.min || ''}"></label><label>Max ₹<input type="number" data-f="max" value="${F.max || ''}"></label>
    <button class="btn ghost" data-act="clearf">Clear</button></div></div>
    <div class="card" id="tl"></div>`);
  $('#flt [data-f=type]').value = F.type || ''; $('#flt [data-f=cat]').value = F.cat || ''; tl();
}
const tl = () => { const l = filtered(); $('#tl').innerHTML = `<h3>Transactions (${l.length})</h3>` + txTable(l); };

function vBud() { // FR5
  const e = inM(month), c = byCat(e), b = D.budgets;
  main(`<div class="card"><h3>Set budgets for ${month}</h3><form id="bf" class="grid">
    <label>Overall monthly budget (₹)<input name="total" type="number" min="0" value="${b.total || ''}"></label>
    ${CATS.map((k) => `<label>${k} (₹)<input name="c_${k}" type="number" min="0" value="${b.cats[k] || ''}"></label>`).join('')}
    <button class="btn">Save budgets</button></form></div><div class="card"><h3>Progress</h3>${budgetBars(sum(e, 'expense'), c) || '<p class="muted">No budgets set yet.</p>'}</div>`);
}

function vRep() { // FR8
  const e = inM(month), c = byCat(e), exp = sum(e, 'expense'), inc = sum(e, 'income');
  main(`<div class="card"><h3>Summary for ${month}</h3><p>You earned <b>${fmt(inc)}</b>, spent <b>${fmt(exp)}</b> across <b>${e.filter((x) => x.type === 'expense').length}</b> expenses and saved <b>${fmt(inc - exp)}</b>.</p>
    <button class="btn ghost sm" onclick="window.print()">🖨 Print / Save as PDF</button></div>
    <div class="two"><div class="card"><h3>Category breakdown</h3><canvas id="c1" style="max-width:240px"></canvas>${legend(c)}</div>
    <div class="card"><h3>Last 6 months <span class="muted">(green = income, red = expense)</span></h3><canvas id="c2"></canvas></div></div>
    <div class="card"><h3>Category table</h3>${Object.keys(c).length ? `<div class="tbl"><table><tr><th>Category</th><th class="r">Spent</th><th class="r">Share</th></tr>${Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${k}</td><td class="r">${fmt(v)}</td><td class="r">${Math.round(pct(v, exp))}%</td></tr>`).join('')}</table></div>` : '<p class="muted">No expenses this month.</p>'}</div>`);
  donut($('#c1'), c); bars($('#c2'));
}

function vAI() { // FR9, FR10
  const { ins, rec } = insights();
  main(`<div class="card"><h3>🤖 AI spending insights – ${month}</h3>${ins.map((i) => `<div class="tip ${i.lv}">${i.t}</div>`).join('')}</div>
    <div class="card"><h3>💡 Recommendations</h3>${rec.map((r) => `<div class="tip good">${r}</div>`).join('') || '<p class="muted">Nothing to recommend yet.</p>'}</div>
    <p class="muted">Insights come from an on-device rule-based engine (trend comparison, projection, savings-rate checks). A real ML/LLM API can be plugged into insights().</p>`);
}

/* ---------- Sample data ---------- */
function seed() {
  const mk = (m, d, type, category, amount, note) => ({ id: crypto.randomUUID?.() || Math.random().toString(36).slice(2), type, category, amount, date: `${m}-${String(d).padStart(2, '0')}`, note });
  [month, prevMonth(month)].forEach((m, i) => D.tx.push(mk(m, 1, 'income', 'Salary', 60000, 'Monthly salary'), mk(m, 3, 'expense', 'Bills', 9000, 'Rent share'), mk(m, 5, 'expense', 'Food', i ? 4000 : 6500, 'Groceries & dining'),
    mk(m, 8, 'expense', 'Transportation', 2500, 'Metro & fuel'), mk(m, 10, 'expense', 'Shopping', i ? 3000 : 7000, 'Clothes'), mk(m, 12, 'expense', 'Entertainment', 2000, 'Movies & OTT'), mk(m, 14, 'expense', 'Education', 3000, 'Online course')));
  D.budgets = { total: 35000, cats: { Food: 7000, Shopping: 6000 } }; save(); shell();
}

/* ---------- Events ---------- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-v],[data-act],[data-edit],[data-del],[data-sw]'); if (!t) return;
  const d = t.dataset;
  if (d.sw) { e.preventDefault(); return authView(d.sw); }
  if (d.v) { e.preventDefault(); view = d.v; editId = null; return shell(); }
  if (d.edit) { editId = d.edit; return vTx(); }
  if (d.del && confirm('Delete this record permanently?')) { D.tx = D.tx.filter((x) => x.id !== d.del); save(); toast('Record deleted.'); return view === 'tx' ? (tl(), shell()) : shell(); }
  if (d.act === 'logout') logout();
  if (d.act === 'seed') seed();
  if (d.act === 'cancel') { editId = null; vTx(); }
  if (d.act === 'clearf') { F = {}; vTx(); }
  if (d.act === 'bell') { const a = alerts(), n = $('#notif'); n.innerHTML = '<h3>Notifications</h3>' + (a.map((x) => `<div class="tip ${x.lv}">${x.t}</div>`).join('') || '<p class="muted">No budget alerts. You are on track!</p>'); n.classList.toggle('hide'); }
});
document.addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.target;
  if (f.id === 'af') return submitAuth(f);
  if (f.id === 'txf') {
    const d = Object.fromEntries(new FormData(f)), amt = parseFloat(d.amount);
    if (!(amt > 0)) return toast('Enter a valid amount.');
    const rec = { type: d.type, category: d.category, amount: amt, date: d.date, note: d.note.trim() };
    if (editId) { Object.assign(D.tx.find((x) => x.id === editId), rec); toast('Transaction updated.'); editId = null; }
    else { D.tx.push({ id: crypto.randomUUID?.() || Math.random().toString(36).slice(2), ...rec }); toast('Transaction added.'); }
    save(); shell(); const a = alerts(); if (rec.type === 'expense' && a.length) setTimeout(() => toast('⚠ ' + a[0].t), 3000);
  }
  if (f.id === 'bf') {
    const d = Object.fromEntries(new FormData(f)); D.budgets = { total: +d.total || 0, cats: {} };
    CATS.forEach((k) => { if (+d['c_' + k] > 0) D.budgets.cats[k] = +d['c_' + k]; }); save(); toast('Budgets saved.'); shell();
  }
});
document.addEventListener('input', (e) => {
  if (e.target.dataset.f) { F[e.target.dataset.f] = e.target.value; tl(); }
  if (e.target.id === 'mo' && e.target.value) { month = e.target.value; shell(); }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'tt') $('#tc').innerHTML = opts(e.target.value, '');
});

/* ---------- Boot ---------- */
const s = store.get('sf_session', null);
s && store.get('sf_users', {})[s.email] ? startSession(s.email, s.name) : authView();
