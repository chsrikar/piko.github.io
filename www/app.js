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

  // ---------- Capacitor Native Check & Device Setup ----------
  const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

  function initNativeDevice() {
    if (!isNative()) return;
    const { StatusBar } = window.Capacitor.Plugins || {};
    if (StatusBar) {
      StatusBar.setBackgroundColor({ color: '#4f46e5' }).catch(() => {});
      StatusBar.setStyle({ style: 'DARK' }).catch(() => {});
    }
  }

  // ---------- In-Page Custom Modal Dialogs ----------
  function showModal({ message, showCancel = false }) {
    return new Promise((resolve) => {
      const overlay = $('appModal');
      const text = $('modalMsg');
      const okBtn = $('modalOkBtn');
      const cancelBtn = $('modalCancelBtn');

      text.textContent = message;
      cancelBtn.style.display = showCancel ? 'inline-block' : 'none';
      overlay.hidden = false;

      function cleanup(val) {
        overlay.hidden = true;
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        resolve(val);
      }
      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
    });
  }

  const showAlert = (msg) => showModal({ message: msg, showCancel: false });
  const showConfirm = (msg) => showModal({ message: msg, showCancel: true });

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
    } catch (e) { /* storage blocked */ }
    return { transactions: [], budget: 0 };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* storage full */ }
  }

  let state = load();

  // ---------- Helpers ----------
  const todayStr = () => new Date().toLocaleDateString('en-CA');
  const thisMonth = () => todayStr().slice(0, 7);
  const currentType = () => document.querySelector('input[name="type"]:checked').value;

  function filtered() {
    const month = $('monthFilter').value;
    return state.transactions.filter((t) => !month || t.date.startsWith(month));
  }

  function sum(list, type) {
    return list.filter((t) => t.type === type).reduce((acc, t) => acc + t.amount, 0);
  }

  // ---------- UI Rendering ----------
  function renderCategories() {
    const catSelect = $('category');
    const type = currentType();
    catSelect.innerHTML = CATEGORIES[type]
      .map((c) => `<option value="${c}">${c}</option>`)
      .join('');
  }

  function renderSummary(list) {
    const inc = sum(list, 'income');
    const exp = sum(list, 'expense');
    const bal = inc - exp;

    $('totalIncome').textContent = money.format(inc);
    $('totalExpense').textContent = money.format(exp);
    $('balance').textContent = money.format(bal);
    $('balance').style.color = bal < 0 ? 'var(--expense)' : 'var(--primary)';
  }

  function renderBudget(list) {
    const exp = sum(list, 'expense');
    const b = state.budget;
    const bar = $('budgetBar');
    const text = $('budgetText');

    if (!b) {
      bar.style.width = '0%';
      bar.className = 'bar-fill';
      text.textContent = 'Set a monthly budget to track spending.';
      return;
    }

    const pct = Math.round((exp / b) * 100);
    bar.style.width = `${Math.min(pct, 100)}%`;
    bar.className = 'bar-fill' + (pct >= 100 ? ' over' : pct >= 80 ? ' warn' : '');

    const diff = b - exp;
    if (diff >= 0) {
      text.textContent = `${money.format(exp)} of ${money.format(b)} spent (${pct}%). ${money.format(diff)} remaining.`;
    } else {
      text.textContent = `${money.format(exp)} of ${money.format(b)} spent (${pct}%). Over by ${money.format(Math.abs(diff))}!`;
    }
  }

  function renderBreakdown(list) {
    const container = $('breakdown');
    const expList = list.filter((t) => t.type === 'expense');
    const total = sum(expList, 'expense');

    if (!expList.length || total === 0) {
      container.innerHTML = '<p class="empty">No expenses for this period.</p>';
      return;
    }

    const map = {};
    expList.forEach((t) => { map[t.category] = (map[t.category] || 0) + t.amount; });

    const rows = Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt], i) => {
        const pct = ((amt / total) * 100).toFixed(1);
        const col = COLORS[i % COLORS.length];
        return `
          <div class="break-row">
            <div class="row-top">
              <span><strong>${cat}</strong> (${pct}%)</span>
              <span>${money.format(amt)}</span>
            </div>
            <div class="bar">
              <div class="bar-fill" style="width: ${pct}%; background: ${col};"></div>
            </div>
          </div>
        `;
      }).join('');
    container.innerHTML = rows;
  }

  function renderList(list) {
    const ul = $('list');
    if (!list.length) {
      ul.innerHTML = '<li class="empty">No transactions yet.</li>';
      return;
    }

    const sorted = list.slice().sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : b.id - a.id));

    ul.innerHTML = sorted.map((t) => `
      <li class="item" data-id="${t.id}">
        <span class="dot ${t.type}"></span>
        <div class="item-main">
          <div class="item-title">${escapeHtml(t.description || t.category)}</div>
          <div class="item-meta">${t.date} &bull; ${t.category}</div>
        </div>
        <span class="amt ${t.type}">${t.type === 'expense' ? '-' : '+'}${money.format(t.amount)}</span>
        <button type="button" class="del" aria-label="Delete">&times;</button>
      </li>
    `).join('');

    ul.querySelectorAll('.del').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = Number(e.currentTarget.closest('.item').dataset.id);
        removeTransaction(id);
      });
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (s) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[s]);
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
    const date = $('date').value;
    const category = $('category').value;
    const description = $('desc').value.trim();
    const type = currentType();

    if (!amount || amount <= 0 || !date) return;

    state.transactions.push({
      id: Date.now(),
      type,
      amount,
      category,
      description,
      date,
    });

    save();
    render();
    $('desc').value = '';
    $('amount').value = '';
  }

  async function removeTransaction(id) {
    const ok = await showConfirm('Delete this transaction?');
    if (!ok) return;
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

  // ---------- Native / Web CSV Export ----------
  async function exportCsv() {
    const list = filtered();
    if (!list.length) {
      await showAlert('Nothing to export.');
      return;
    }

    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [['Date', 'Type', 'Category', 'Description', 'Amount']]
      .concat(list.map((t) => [t.date, t.type, t.category, t.description, t.amount]));
    const csvContent = rows.map((r) => r.map(esc).join(',')).join('\n');
    const fileName = `transactions-${todayStr()}.csv`;

    // 1. Native Capacitor (Android)
    if (isNative() && window.Capacitor?.Plugins?.Filesystem && window.Capacitor?.Plugins?.Share) {
      const { Filesystem, Share } = window.Capacitor.Plugins;
      try {
        const written = await Filesystem.writeFile({
          path: fileName,
          data: csvContent,
          directory: 'CACHE',
          encoding: 'utf8'
        });

        await Share.share({
          title: 'Export Transactions',
          text: 'Here is my transaction export.',
          url: written.uri,
          dialogTitle: 'Share CSV file'
        });
        return;
      } catch (err) {
        console.error('Native export failed, falling back to browser download:', err);
      }
    }

    // 2. Standard Web & PWA Fallback (Blob + anchor download)
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
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
    initNativeDevice();
  }

  init();
})();
