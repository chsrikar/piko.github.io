(() => {
  'use strict';

  const STORAGE_KEY = 'expense-tracker-v1';

  const CATEGORIES = {
    expense: ['Food', 'Transport', 'Shopping', 'Bills', 'Health', 'Education', 'Entertainment', 'Other'],
    income: ['Salary', 'Freelance', 'Stipend', 'Gift', 'Other'],
  };
  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#8b5cf6', '#64748b'];

  const $ = (id) => document.getElementById(id);
  const money = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  });

  // ---------- Storage ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
          budget: Number(parsed.budget) || 0,
        };
      }
    } catch (e) { /* ignore corrupted or blocked storage */ }
    return { transactions: [], budget: 0 };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* storage full or blocked */ }
  }

  let state = load();

  // ---------- Helpers ----------
  const todayStr = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  const thisMonth = () => todayStr().slice(0, 7);                // YYYY-MM
  const currentType = () => document.querySelector('input[name="type"]:checked').value;

  function filtered() {
    const month = $('monthFilter').value;
    return state.transactions.filter((t) => !month || t.date.startsWith(month));
  }

  function sum(list, type) {
    return list.filter((t) => t.type === type).reduce((acc, t) => acc + t.amount, 0);
  }

  // ---------- Rendering ----------
  function renderCategories() {
    const select = $('category');
    select.innerHTML = '';
    CATEGORIES[currentType()].forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      select.appendChild(opt);
    });
  }

  function renderSummary(list) {
    const income = sum(list, 'income');
    const expense = sum(list, 'expense');
    $('totalIncome').textContent = money.format(income);
    $('totalExpense').textContent = money.format(expense);
    $('balance').textContent = money.format(income - expense);
  }

  function renderBudget(list) {
    const bar = $('budgetBar');
    const wrap = $('budgetBarWrap');
    const text = $('budgetText');
    const month = $('monthFilter').value;
    const spent = sum(list, 'expense');

    bar.className = 'bar-fill';

    if (!month) {
      bar.style.width = '0%';
      wrap.setAttribute('aria-valuenow', 0);
      text.textContent = 'Pick a month to compare spending with your budget.';
      return;
    }
    if (!state.budget) {
      bar.style.width = '0%';
      wrap.setAttribute('aria-valuenow', 0);
      text.textContent = 'Set a monthly budget to track your spending.';
      return;
    }

    const pct = (spent / state.budget) * 100;
    bar.style.width = Math.min(pct, 100) + '%';
    wrap.setAttribute('aria-valuenow', Math.round(Math.min(pct, 100)));
    if (pct >= 100) bar.classList.add('over');
    else if (pct >= 75) bar.classList.add('warn');

    const left = state.budget - spent;
    text.textContent = left >= 0
      ? `${money.format(spent)} of ${money.format(state.budget)} used (${Math.round(pct)}%). ${money.format(left)} left.`
      : `Over budget by ${money.format(-left)} (${money.format(spent)} of ${money.format(state.budget)}).`;
  }

  function renderBreakdown(list) {
    const box = $('breakdown');
    box.innerHTML = '';

    const expenses = list.filter((t) => t.type === 'expense');
    const total = sum(expenses, 'expense');

    if (!expenses.length) {
      box.innerHTML = '<p class="empty">No expenses to show yet.</p>';
      return;
    }

    const byCat = {};
    expenses.forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });

    Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, amount], i) => {
        const pct = (amount / total) * 100;

        const row = document.createElement('div');
        row.className = 'break-row';

        const top = document.createElement('div');
        top.className = 'row-top';
        const name = document.createElement('span');
        name.textContent = cat;
        const val = document.createElement('span');
        val.textContent = `${money.format(amount)} · ${pct.toFixed(0)}%`;
        top.append(name, val);

        const bar = document.createElement('div');
        bar.className = 'bar';
        const fill = document.createElement('div');
        fill.className = 'bar-fill';
        fill.style.width = pct + '%';
        fill.style.background = COLORS[i % COLORS.length];
        bar.appendChild(fill);

        row.append(top, bar);
        box.appendChild(row);
      });
  }

  function renderList(list) {
    const ul = $('list');
    ul.innerHTML = '';

    if (!list.length) {
      ul.innerHTML = '<li class="empty">No transactions yet. Add your first one above.</li>';
      return;
    }

    [...list]
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .forEach((t) => {
        const li = document.createElement('li');
        li.className = 'item';

        const dot = document.createElement('span');
        dot.className = 'dot ' + t.type;

        const main = document.createElement('div');
        main.className = 'item-main';
        const title = document.createElement('div');
        title.className = 'item-title';
        title.textContent = t.description;
        const meta = document.createElement('div');
        meta.className = 'item-meta';
        meta.textContent = `${t.category} · ${t.date}`;
        main.append(title, meta);

        const amt = document.createElement('span');
        amt.className = 'amt ' + t.type;
        amt.textContent = (t.type === 'income' ? '+' : '-') + money.format(t.amount);

        const del = document.createElement('button');
        del.className = 'del';
        del.type = 'button';
        del.title = 'Delete';
        del.setAttribute('aria-label', 'Delete transaction');
        del.textContent = '✕';
        del.addEventListener('click', () => removeTransaction(t.id));

        li.append(dot, main, amt, del);
        ul.appendChild(li);
      });
  }

  function render() {
    const list = filtered();
    renderSummary(list);
    renderBudget(list);
    renderBreakdown(list);
    renderList(list);
  }

  // ---------- Actions ----------
  function addTransaction(e) {
    e.preventDefault();

    const amount = parseFloat($('amount').value);
    if (!(amount > 0)) return;

    const category = $('category').value;
    state.transactions.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type: currentType(),
      description: $('desc').value.trim() || category,
      amount: Math.round(amount * 100) / 100,
      category,
      date: $('date').value || todayStr(),
    });
    save();

    $('desc').value = '';
    $('amount').value = '';

    // Make sure the new entry is visible under the current month filter
    const month = $('monthFilter').value;
    if (month && !state.transactions[state.transactions.length - 1].date.startsWith(month)) {
      $('monthFilter').value = state.transactions[state.transactions.length - 1].date.slice(0, 7);
    }
    render();
  }

  function removeTransaction(id) {
    if (!confirm('Delete this transaction?')) return;
    state.transactions = state.transactions.filter((t) => t.id !== id);
    save();
    render();
  }

  function saveBudget(e) {
    e.preventDefault();
    const value = parseFloat($('budgetInput').value);
    state.budget = value > 0 ? value : 0;
    save();
    render();
  }

  function exportCsv() {
    const list = filtered();
    if (!list.length) { alert('Nothing to export.'); return; }

    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [['Date', 'Type', 'Category', 'Description', 'Amount']]
      .concat(list.map((t) => [t.date, t.type, t.category, t.description, t.amount]));
    const csv = rows.map((r) => r.map(esc).join(',')).join('\n');

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transactions.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------- Init ----------
  function init() {
    $('date').value = todayStr();
    $('monthFilter').value = thisMonth();
    if (state.budget) $('budgetInput').value = state.budget;
    renderCategories();

    document.querySelectorAll('input[name="type"]').forEach((r) =>
      r.addEventListener('change', renderCategories));
    $('txForm').addEventListener('submit', addTransaction);
    $('budgetForm').addEventListener('submit', saveBudget);
    $('monthFilter').addEventListener('change', render);
    $('allTimeBtn').addEventListener('click', () => { $('monthFilter').value = ''; render(); });
    $('exportBtn').addEventListener('click', exportCsv);

    render();
  }

  init();
})();
