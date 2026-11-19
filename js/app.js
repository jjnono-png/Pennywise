/* Pennywise – app.js
   Sections: 1 Data · 2 Helpers · 3 Screens · 4 Forms · 5 Actions · 6 Start */
'use strict';

/* ---------- 1. Data ---------- */
const KEY = 'pennywise-v1', SIZE_KEY = 'pennywise-size';
let CFG = { currency: '₱', currencyName: 'Philippine Peso', categories: ['Food', 'Transport', 'Bills', 'Savings', 'Others'] };  // overridden by config.json
let CATS = CFG.categories, CUR = CFG.currency, useApi = false;
const PAGES = [['dashboard', 'Dashboard'], ['transactions', 'Transactions'], ['reports', 'Reports'], ['goals', 'Savings Goals'], ['settings', 'Settings']];
const SIZES = { normal: ['Normal', '112.5%'], large: ['Large', '125%'], xl: ['Extra Large', '150%'] };
let S = { tx: [], goals: [] }, page = 'dashboard', period = 'week', query = '', filter = 'all', size = 'large', modalType = 'expense';
try { S = JSON.parse(localStorage.getItem(KEY)) || S; size = localStorage.getItem(SIZE_KEY) || size; } catch (e) {}
const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  if (useApi) fetch('api/data', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(S) })
    .then(r => { if (!r.ok) throw 0; }).catch(() => toast('Could not save to the server. A copy is kept in this browser.'));
};

/* ---------- 2. Helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const peso = n => CUR + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => iso(new Date());
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmtDate = s => new Date(s + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
const sorted = l => [...l].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
const empty = m => `<div class="empty">${m}</div>`;
const applySize = () => { document.documentElement.style.fontSize = (SIZES[size] || SIZES.large)[1]; };

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3000);
}
function range(p) {
  const d = new Date();
  if (p === 'month') return [iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
  const s = new Date(d); s.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const e = new Date(s); e.setDate(s.getDate() + 6);
  return [iso(s), iso(e)];
}
function sum(list) {
  const inc = list.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0);
  const ex = list.filter(t => t.type === 'expense');
  const exp = ex.reduce((a, t) => a + t.amount, 0);
  const sav = ex.filter(t => t.category === 'Savings').reduce((a, t) => a + t.amount, 0);
  return { inc, exp, sav, bal: inc - exp };
}

/* ---------- 3. Screens ---------- */
function txRow(t, withButtons) {
  const inc = t.type === 'income', d = esc(t.desc);
  return `<div class="tx"><div class="m"><div class="d">${d}${t.demo ? '<span class="chip">Demo</span>' : ''}</div>
    <div class="meta">${fmtDate(t.date)} · ${inc ? 'Income' : 'Expense: ' + t.category}</div></div>
    <div class="amt ${inc ? 'pos' : 'neg'}">${inc ? '+ ' : '− '}${peso(t.amount)}</div>
    ${withButtons ? `<div class="row"><button class="btn alt small" aria-label="Edit ${d}" onclick="txForm('${t.id}')">Edit</button>
    <button class="btn danger small" aria-label="Delete ${d}" onclick="delTx('${t.id}')">Delete</button></div>` : ''}</div>`;
}
function goalCard(g, full) {
  const p = Math.min(100, g.target ? g.saved / g.target * 100 : 0), left = Math.max(0, g.target - g.saved);
  return `<div class="card"><h2>${esc(g.name)}</h2>
    <div class="bar" role="progressbar" aria-valuenow="${p.toFixed(0)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${p}%"></i></div>
    <p style="margin:.2rem 0"><b>${p.toFixed(0)}% complete</b></p>
    <p class="muted" style="margin:0">Saved ${peso(g.saved)} of ${peso(g.target)}.<br>${left > 0 ? 'Still needed: ' + peso(left) : 'Goal reached. Well done!'}</p>
    ${full ? `<div class="row" style="margin-top:1rem"><button class="btn small" onclick="addMoney('${g.id}')">Add Money</button>
    <button class="btn alt small" onclick="goalForm('${g.id}')">Edit</button><button class="btn danger small" onclick="delGoal('${g.id}')">Delete</button></div>` : ''}</div>`;
}
const demoNote = () => S.tx.some(t => t.demo) ? `<div class="note">You are viewing demo (sample) data. You can remove it in <a href="#settings">Settings</a>.</div>` : '';
const addButtons = () => `<div class="row"><button class="btn" onclick="txForm(null,'income')">Add Income</button><button class="btn danger" onclick="txForm(null,'expense')">Add Expense</button></div>`;

function dashboardView() {
  const s = sum(S.tx);
  return `${demoNote()}<h1>Welcome to Pennywise!</h1><p class="sub">Your money, made easier to manage.</p>${addButtons()}
  <div class="hero gap"><div>Money left (Remaining Balance)</div><div class="big">${peso(s.bal)}</div>
    <div class="mini"><div><small>Total Income</small><b>${peso(s.inc)}</b></div><div><small>Total Expenses</small><b>${peso(s.exp)}</b></div><div><small>Total Savings</small><b>${peso(s.sav)}</b></div></div></div>
  <div class="grid g2"><div class="card"><div class="row between"><h2>Recent Transactions</h2><a href="#transactions">See all</a></div>
    ${S.tx.length ? sorted(S.tx).slice(0, 5).map(t => txRow(t)).join('') : empty('No transactions yet. Press “Add Income” or “Add Expense” to begin.')}</div>
  <div><h2>Savings Goals</h2><div class="grid">${S.goals.length ? S.goals.slice(0, 3).map(g => goalCard(g)).join('') : `<div class="card">${empty('No goals yet.')}<p style="text-align:center"><a href="#goals">Create a goal</a></p></div>`}</div></div></div>`;
}
function transactionsView() {
  return `${demoNote()}<h1>Transactions</h1><p class="sub">Everything you earned and spent.</p>${addButtons()}
  <div class="row gap"><div style="flex:2 1 14rem"><label for="q" style="margin-top:0">Search</label><input id="q" placeholder="Type a word, like Food" value="${esc(query)}"></div>
  <div style="flex:1 1 10rem"><label for="f" style="margin-top:0">Show</label><select id="f"><option value="all">All</option><option value="income">Income only</option><option value="expense">Expenses only</option></select></div></div>
  <div class="card gap" id="txl"></div>`;
}
function txList() {
  const s = query.trim().toLowerCase();
  const l = sorted(S.tx).filter(t => (filter === 'all' || t.type === filter) && (!s || (t.desc + ' ' + (t.category || 'income') + ' ' + t.amount).toLowerCase().includes(s)));
  $('#txl').innerHTML = l.length ? l.map(t => txRow(t, true)).join('') : empty(S.tx.length ? 'No matching transactions found.' : 'No transactions yet. Press “Add Income” or “Add Expense” to begin.');
}
function reportsView() {
  const [a, b] = range(period), l = S.tx.filter(t => t.date >= a && t.date <= b), s = sum(l);
  const by = CATS.map(c => [c, l.filter(t => t.type === 'expense' && t.category === c).reduce((x, t) => x + t.amount, 0)]).filter(x => x[1] > 0);
  return `${demoNote()}<h1>Reports</h1><p class="sub">${period === 'week' ? 'This week' : 'This month'}: ${fmtDate(a)} to ${fmtDate(b)}</p>
  <div class="row"><button class="btn" aria-pressed="${period === 'week'}" onclick="setPeriod('week')">Weekly</button><button class="btn" aria-pressed="${period === 'month'}" onclick="setPeriod('month')">Monthly</button></div>
  <div class="grid g3 gap"><div class="card stat"><small>Income</small><b class="pos">${peso(s.inc)}</b></div><div class="card stat"><small>Expenses</small><b class="neg">${peso(s.exp)}</b></div>
  <div class="card stat"><small>Money left</small><b class="${s.bal < 0 ? 'neg' : 'pos'}">${peso(s.bal)}</b></div><div class="card stat"><small>Savings</small><b>${peso(s.sav)}</b></div></div>
  <div class="card gap"><h2>Where your money went</h2>${by.length ? by.map(([c, v]) => `<div class="row between"><span>${c}</span><b>${peso(v)} (${(v / s.exp * 100).toFixed(0)}%)</b></div><div class="bar exp"><i style="width:${v / s.exp * 100}%"></i></div>`).join('') : empty('No expenses in this period.')}</div>`;
}
function goalsView() {
  return `<div class="row between"><div><h1>Savings Goals</h1><p class="sub">Small steps add up.</p></div><button class="btn" onclick="goalForm()">New Goal</button></div>
  <div class="grid g2">${S.goals.length ? S.goals.map(g => goalCard(g, true)).join('') : `<div class="card" style="grid-column:1/-1">${empty('No savings goals yet. Press “New Goal” to start.')}</div>`}</div>`;
}
function settingsView() {
  return `<h1>Settings</h1><p class="sub">${useApi ? 'Your information is saved in the file data/pennywise.json.' : 'Your information is saved only in this browser.'}</p>
  <div class="card"><h2>Text size</h2><div class="row">${Object.entries(SIZES).map(([k, v]) => `<button class="btn" aria-pressed="${size === k}" onclick="setSize('${k}')">${v[0]}</button>`).join('')}</div></div>
  <div class="card gap"><h2>Demo data</h2><p class="muted">Add sample entries to try the app. They are clearly marked “Demo”.</p><div class="row"><button class="btn alt" onclick="loadDemo()">Load demo data</button><button class="btn alt" onclick="rmDemo()">Remove demo data</button></div></div>
  <div class="card gap"><h2>Backup</h2><p class="muted">Save your data to a .json file, or restore it later.</p><div class="row"><button class="btn alt" onclick="exportData()">Download backup</button>
  <button class="btn alt" onclick="$('#imp').click()">Restore from backup</button><input id="imp" type="file" accept=".json,application/json" hidden onchange="importData(this)"></div></div>
  <div class="card gap"><h2>Erase everything</h2><p class="muted">This deletes all transactions and goals.</p><button class="btn danger" onclick="clearAll()">Erase all data</button></div>
  <div class="card gap"><h2>Currency</h2><p class="muted" style="margin:0">${CFG.currencyName} (${CUR})</p></div>`;
}
function render() {
  $('#nav').innerHTML = PAGES.map(p => `<a href="#${p[0]}" class="${p[0] === page ? 'on' : ''}" ${p[0] === page ? 'aria-current="page"' : ''}>${p[1]}</a>`).join('');
  $('#main').innerHTML = { dashboard: dashboardView, transactions: transactionsView, reports: reportsView, goals: goalsView, settings: settingsView }[page]();
  if (page === 'transactions') {
    $('#f').value = filter;
    $('#q').oninput = e => { query = e.target.value; txList(); };
    $('#f').onchange = e => { filter = e.target.value; txList(); };
    txList();
  }
}

/* ---------- 4. Forms (pop-ups) ---------- */
function openModal(title, body) {
  $('#mbox').innerHTML = `<h2 id="mtitle">${title}</h2>${body}`;
  $('#modal').classList.add('show');
  const f = $('#mbox input'); if (f) f.focus();
}
function closeModal() { $('#modal').classList.remove('show'); }
$('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
document.onkeydown = e => { if (e.key === 'Escape') closeModal(); };
const formButtons = label => `<div class="row" style="margin-top:1rem"><button class="btn" type="submit">${label}</button><button class="btn alt" type="button" onclick="closeModal()">Cancel</button></div>`;

function txForm(id, type) {
  const t = id ? S.tx.find(x => x.id === id) : { type: type || 'expense', date: today(), category: 'Food' };
  modalType = t.type;
  openModal(id ? 'Edit transaction' : 'Add transaction', `<form onsubmit="saveTx(event,'${id || ''}')" novalidate>
    <div class="row"><button type="button" class="btn" id="bi" onclick="setType('income')">Income</button><button type="button" class="btn" id="be" onclick="setType('expense')">Expense</button></div>
    <label for="fa">Amount (${CUR})</label><input id="fa" type="number" step="0.01" min="0.01" inputmode="decimal" value="${t.amount || ''}">
    <label for="fd">Description (example: Salary, Lunch)</label><input id="fd" maxlength="60" value="${esc(t.desc || '')}">
    <div id="fcw"><label for="fc">Category</label><select id="fc">${CATS.map(c => `<option ${c === t.category ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <label for="fdt">Date</label><input id="fdt" type="date" value="${t.date}">
    <div class="err" id="err" role="alert"></div>${formButtons('Save')}</form>`);
  setType(modalType);
}
function setType(t) {
  modalType = t;
  $('#bi').setAttribute('aria-pressed', t === 'income'); $('#be').setAttribute('aria-pressed', t === 'expense');
  $('#fcw').style.display = t === 'expense' ? 'block' : 'none';
}
function goalForm(id) {
  const g = id ? S.goals.find(x => x.id === id) : {};
  openModal(id ? 'Edit savings goal' : 'New savings goal', `<form onsubmit="saveGoal(event,'${id || ''}')" novalidate>
    <label for="gn">Goal name (example: Emergency fund)</label><input id="gn" maxlength="40" value="${esc(g.name || '')}">
    <label for="gt">Target amount (${CUR})</label><input id="gt" type="number" step="0.01" min="0.01" inputmode="decimal" value="${g.target || ''}">
    <label for="gs">Amount saved so far (${CUR})</label><input id="gs" type="number" step="0.01" min="0" inputmode="decimal" value="${g.saved ?? 0}">
    <div class="err" id="err" role="alert"></div>${formButtons('Save')}</form>`);
}
function addMoney(id) {
  openModal('Add money to your goal', `<form onsubmit="doAdd(event,'${id}')" novalidate><label for="ga">Amount (${CUR})</label>
    <input id="ga" type="number" step="0.01" min="0.01" inputmode="decimal"><div class="err" id="err" role="alert"></div>${formButtons('Add')}</form>`);
}

/* ---------- 5. Actions ---------- */
function saveTx(e, id) {
  e.preventDefault();
  const amt = parseFloat($('#fa').value), desc = $('#fd').value.trim(), date = $('#fdt').value, err = $('#err');
  if (!(amt > 0) || !isFinite(amt)) return err.textContent = 'Please type an amount greater than zero.';
  if (amt > 1e9) return err.textContent = 'That amount is too large.';
  if (!desc) return err.textContent = 'Please type a description.';
  if (!date) return err.textContent = 'Please choose a date.';
  const o = { type: modalType, amount: Math.round(amt * 100) / 100, desc, date };
  if (modalType === 'expense') o.category = $('#fc').value;
  if (id) { const i = S.tx.findIndex(x => x.id === id); const keep = { id, demo: S.tx[i].demo }; S.tx[i] = { ...keep, ...o }; toast('Saved. Your changes were updated.'); }
  else { S.tx.push({ id: uid(), ...o }); toast(modalType === 'income' ? 'Income added.' : 'Expense added.'); }
  save(); closeModal(); render();
}
function delTx(id) {
  if (!confirm('Delete this transaction? This cannot be undone.')) return;
  S.tx = S.tx.filter(t => t.id !== id); save(); render(); toast('Transaction deleted.');
}
function saveGoal(e, id) {
  e.preventDefault();
  const name = $('#gn').value.trim(), t = parseFloat($('#gt').value), s = parseFloat($('#gs').value || 0), err = $('#err');
  if (!name) return err.textContent = 'Please type a name for your goal.';
  if (!(t > 0)) return err.textContent = 'The target must be greater than zero.';
  if (!(s >= 0)) return err.textContent = 'The saved amount cannot be negative.';
  if (id) { Object.assign(S.goals.find(g => g.id === id), { name, target: t, saved: s }); toast('Goal updated.'); }
  else { S.goals.push({ id: uid(), name, target: t, saved: s }); toast('Goal created.'); }
  save(); closeModal(); render();
}
function doAdd(e, id) {
  e.preventDefault();
  const a = parseFloat($('#ga').value);
  if (!(a > 0)) return $('#err').textContent = 'Please type an amount greater than zero.';
  const g = S.goals.find(x => x.id === id); g.saved = Math.round((g.saved + a) * 100) / 100;
  save(); closeModal(); render(); toast('Savings updated. Keep it up!');
}
function delGoal(id) {
  if (!confirm('Delete this goal? This cannot be undone.')) return;
  S.goals = S.goals.filter(g => g.id !== id); save(); render(); toast('Goal deleted.');
}
function setPeriod(p) { period = p; render(); }
function setSize(k) { size = k; try { localStorage.setItem(SIZE_KEY, k); } catch (e) {} applySize(); render(); }
function loadDemo() {
  if (S.tx.some(t => t.demo)) return toast('Demo data is already loaded.');
  const d = new Date(), f = n => { const x = new Date(d); x.setDate(d.getDate() - n); return iso(x); };
  [['income', 25000, 'Salary (demo)', 0, f(10)], ['income', 1500, 'Freelance work (demo)', 0, f(3)], ['expense', 350, 'Groceries (demo)', 'Food', f(2)],
   ['expense', 120, 'Jeepney fare (demo)', 'Transport', f(1)], ['expense', 2200, 'Electric bill (demo)', 'Bills', f(5)],
   ['expense', 1000, 'Emergency fund (demo)', 'Savings', f(4)], ['expense', 480, 'Movie night (demo)', 'Others', f(0)]]
    .forEach(([type, amount, desc, category, date]) => { const t = { id: uid(), type, amount, desc, date, demo: true }; if (type === 'expense') t.category = category; S.tx.push(t); });
  S.goals.push({ id: uid(), name: 'Emergency fund (demo)', target: 20000, saved: 5000, demo: true });
  save(); render(); toast('Demo data loaded.');
}
function rmDemo() { S.tx = S.tx.filter(t => !t.demo); S.goals = S.goals.filter(g => !g.demo); save(); render(); toast('Demo data removed.'); }
function clearAll() {
  if (!confirm('Erase ALL your data? This cannot be undone.')) return;
  S = { tx: [], goals: [] }; save(); render(); toast('All data erased.');
}

function exportData() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
  a.download = 'pennywise-backup-' + today() + '.json'; a.click(); URL.revokeObjectURL(a.href);
  toast('Backup file downloaded.');
}
const validTx = t => t && ['income', 'expense'].includes(t.type) && Number.isFinite(t.amount) && t.amount > 0 && typeof t.desc === 'string' && typeof t.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date);
const validGoal = g => g && typeof g.name === 'string' && typeof g.id === 'string' && g.target > 0 && g.saved >= 0;
function importData(input) {
  const file = input.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!Array.isArray(d.tx) || !Array.isArray(d.goals) || !d.tx.every(validTx) || !d.goals.every(validGoal)) throw 0;
      if (!confirm('Replace your current data with this backup?')) return;
      S = { tx: d.tx.map(t => t.type === 'expense' && !CATS.includes(t.category) ? { ...t, category: 'Others' } : t), goals: d.goals };
      save(); render(); toast('Backup restored.');
    } catch (e) { toast('That file is not a valid Pennywise backup.'); }
  };
  r.readAsText(file); input.value = '';
}

/* ---------- 6. Start ---------- */
async function init() {
  try { const c = await (await fetch('config.json')).json(); if (Array.isArray(c.categories) && c.categories.length) { CFG = { ...CFG, ...c }; CATS = CFG.categories; CUR = CFG.currency; } } catch (e) {}
  try {
    const r = await fetch('api/data');
    if (r.ok) {
      const d = await r.json(), local = S; useApi = true;
      S = (d.tx && d.tx.length) || (d.goals && d.goals.length) ? { tx: d.tx || [], goals: d.goals || [] } : local;
      if (S === local && (local.tx.length || local.goals.length)) save();   // move browser data to the server once
    }
  } catch (e) {}
}
function route() {
  const h = location.hash.slice(1);
  page = PAGES.some(p => p[0] === h) ? h : 'dashboard';
  render(); window.scrollTo(0, 0);
}
addEventListener('hashchange', route);
applySize(); init().then(route);
