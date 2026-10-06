// ====== APP STATE ======
let editTxId = null;
let curTxFiltered = [];
const ASSET_TYPES = [
  ['หุ้นไทย', 'Thai stocks (SET)'],
  ['หุ้นต่างประเทศ', 'Foreign stocks'],
  ['กองทุนรวม', 'Mutual funds'],
  ['คริปโต', 'Crypto'],
  ['ทอง', 'Gold'],
  ['พันธบัตร/หนี้ระยะสั้น', 'Bonds / fixed income'],
  ['อื่นๆ', 'Other'],
];
const ASSET_TYPE_LABELS = Object.fromEntries(ASSET_TYPES);
const ACTION_LABELS = { ซื้อ: 'Buy', ขาย: 'Sell', ปันผล: 'Dividend', ดอกเบี้ย: 'Interest', ฝากเงิน: 'Deposit / Cash In', ถอนเงิน: 'Withdrawal / Cash Out' };

function fmt(value) {
  return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtMoney(value) {
  return '$' + fmt(value);
}

function fmtCurrency(value, currency) {
  const code = String(currency || 'USD').trim().toUpperCase();
  const symbol = { USD: '$', THB: '฿', EUR: '€', JPY: '¥', GBP: '£' }[code] || `${code} `;
  return symbol + fmt(value);
}

function fmtQ(value) {
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 8 });
}

function fmtDS(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? String(value || '') : date.toLocaleDateString('en-GB');
}

function assetTypeLabel(type) {
  return ASSET_TYPE_LABELS[type] || type;
}

function actBadge(action) {
  const cls = action === 'ซื้อ' ? 'b-buy' : action === 'ขาย' ? 'b-sell' : action === 'ปันผล' ? 'b-div' : 'b-other';
  return `<span class="badge ${cls}">${ACTION_LABELS[action] || action}</span>`;
}

function initApp() {
  if (Auth.token && Auth.me) {
    showApp();
  } else {
    showLoginPage();
  }
}

function showLoginPage(msg) {
  document.getElementById('app').style.display = 'none';
  document.getElementById('loginPage').style.display = 'flex';
  const err = document.getElementById('loginError');
  if (msg) { err.textContent = msg; err.style.display = 'block'; } else { err.style.display = 'none'; }
}

async function doLogin() {
  const u = document.getElementById('lUser').value.trim();
  const p = document.getElementById('lPass').value;
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('loginError');
  err.style.display = 'none';
  if (!u || !p) { err.textContent = 'Please enter username and password'; err.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = 'Signing in...';
  try {
    const data = await API.login(u, p);
    Auth.token = data.token;
    Auth.me = data.user;
    showApp();
  } catch (e) {
    err.textContent = e.message === 'unauthorized' ? 'Invalid username or password' : e.message;
    err.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Sign in';
  }
}

function doLogout() {
  Auth.token = null; Auth.me = null;
  location.reload();
}

async function showApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  const u = Auth.me;
  if (u) {
    document.getElementById('sbAv').textContent = u.name.charAt(0);
    document.getElementById('sbName').textContent = u.name;
    document.getElementById('sbRole').textContent = u.role === 'owner' ? 'Owner' : 'Staff';
    if (u.role !== 'owner') document.querySelectorAll('.owner-only').forEach((el) => (el.style.display = 'none'));
  }
  try {
    const { settings } = await API.settings();
    if (settings && settings.name) document.getElementById('sbCo').textContent = settings.name;
  } catch { /* non-fatal */ }
  navigate('dashboard');
}

function navigate(page) {
  document.querySelectorAll('.pg-section').forEach((section) => { section.style.display = 'none'; });
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.page === page));
  const section = document.getElementById('page-' + page);
  if (!section) return;
  section.style.display = 'block';
  if (page === 'dashboard') loadDash();
  if (page === 'new-tx') initTxForm();
  if (page === 'transactions') initTxPage();
  if (page === 'holdings') loadHoldings();
  if (page === 'dcaplan') initDcaPlan();
  if (page === 'settings') loadSettings();
}

function toast(msg, type) {
  const t = document.getElementById('toast');
  const c = { success: '#4A7A4A', danger: '#C0392B', warning: '#D4831A', info: '#2980B9' };
  t.style.background = c[type] || c.success;
  t.textContent = msg; t.style.display = 'block'; t.style.opacity = '1';
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => (t.style.display = 'none'), 300); }, 3000);
}
function errMsg(e) { return (e && e.message) || 'Something went wrong'; }
function openM(id) { document.getElementById(id).classList.add('show'); }
function closeM(id) { document.getElementById(id).classList.remove('show'); }
document.querySelectorAll('.modal-overlay').forEach((m) => {
  m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('show'); });
});

// ====== NEW TX FORM ======
let dividendHoldingOptions = [];

const liveFxQuoteConfig = {
  THB: { ticker: 'THB=X', quoteIsLocalPerUsd: true },
  EUR: { ticker: 'EURUSD=X', quoteIsLocalPerUsd: false },
  JPY: { ticker: 'JPY=X', quoteIsLocalPerUsd: true },
  GBP: { ticker: 'GBPUSD=X', quoteIsLocalPerUsd: false },
};
let liveFxRates = { USD: 1 };

function initTxForm() {
  document.getElementById('fDate').value = new Date().toISOString().split('T')[0];
  resetTxForm();
  populateBrokerList();
  loadDividendHoldingOptions();
}
async function populateBrokerList() {
  try {
    const { brokers } = await API.listBrokers();
    document.getElementById('brokerList').innerHTML = brokers.map((b) => `<option value="${b}"></option>`).join('');
  } catch { /* non-fatal */ }
}
function resetTxForm() {
  document.getElementById('txForm').reset();
  document.getElementById('fDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('fFee').value = 0;
  document.getElementById('fTax').value = 0;
  document.getElementById('fCurrency').value = 'USD';
  updateTransactionForm();
}

async function loadDividendHoldingOptions() {
  try {
    const { holdings = [] } = await API.holdings();
    dividendHoldingOptions = holdings.filter((h) => Number(h.qty) > 0).sort((a, b) => a.symbol.localeCompare(b.symbol));
    const list = document.getElementById('symbolDatalist');
    if (!list) return;
    list.innerHTML = dividendHoldingOptions.map((h) => `<option value="${h.symbol}" data-name="${(h.name || '').replace(/"/g, '&quot;')}" data-ticker="${(h.ticker || '').replace(/"/g, '&quot;')}" data-asset="${(h.assetType || '').replace(/"/g, '&quot;')}" data-qty="${Number(h.qty || 0)}"></option>`).join('');
  } catch { dividendHoldingOptions = []; }
}

function applyDividendHoldingSelection() {
  const action = document.getElementById('fAction').value;
  if (action !== 'เธเธฑเธเธเธฅ') return;
  const value = String(document.getElementById('fSymbol').value || '').trim().toUpperCase();
  const match = dividendHoldingOptions.find((h) => String(h.symbol || '').trim().toUpperCase() === value);
  if (!match) return;
  if (match.name) document.getElementById('fName').value = match.name;
  if (match.ticker) document.getElementById('fTicker').value = match.ticker;
  if (match.assetType) document.getElementById('fAssetType').value = match.assetType;
  if (Number(match.qty) > 0) document.getElementById('fQty').value = Number(match.qty).toString();
}

function updateTransactionForm() {
  const action = document.getElementById('fAction').value;
  if (action === 'เธเธฑเธเธเธฅ') loadDividendHoldingOptions();
  const isCashFlow = action === 'เธเธฒเธเน€เธเธดเธ' || action === 'เธ–เธญเธเน€เธเธดเธ';
  const currency = document.getElementById('fCurrency').value || 'USD';
  document.getElementById('fAssetGroup').hidden = isCashFlow;
  document.getElementById('fSecurityFields').hidden = isCashFlow;
  document.getElementById('fAssetType').required = !isCashFlow;
  document.getElementById('fSymbol').required = !isCashFlow;
  document.getElementById('lblQty').innerHTML = isCashFlow ? `Amount (${currency}) <span class="req">*</span>` : 'Quantity <span class="req">*</span>';
  document.getElementById('fPriceGroup').hidden = isCashFlow;
  document.getElementById('fPrice').required = !isCashFlow;
  document.getElementById('fPrice').disabled = isCashFlow;
  if (isCashFlow) document.getElementById('fPrice').value = 1;
  document.getElementById('lblFee').textContent = `Fee (${currency})`;
  document.getElementById('lblTax').textContent = `Tax (${currency})`;
  calcTx();
}
async function refreshLiveFxRates() {
  const quotes = Object.entries(liveFxQuoteConfig);
  const results = await Promise.all(quotes.map(async ([currency, config]) => {
    try {
      const { quote } = await API.marketQuote(config.ticker);
      const marketPrice = Number(quote?.price);
      if (!Number.isFinite(marketPrice) || marketPrice <= 0) throw new Error('Invalid FX quote');
      const rate = config.quoteIsLocalPerUsd ? marketPrice : 1 / marketPrice;
      return { currency, rate, marketPrice };
    } catch {
      return { currency, rate: null, marketPrice: null };
    }
  }));
  liveFxRates = { USD: 1 };
  results.forEach(({ currency, rate }) => {
    if (Number.isFinite(rate) && rate > 0) liveFxRates[currency] = rate;
  });
  calcTx();
  const thbQuote = results.find((result) => result.currency === 'THB');
  return {
    updated: results.filter((result) => Number.isFinite(result.rate)).length,
    failed: results.filter((result) => !Number.isFinite(result.rate)).length,
    rates: { ...liveFxRates },
    thbPerUsd: thbQuote?.marketPrice || null,
  };
}
let calcTxDebounce = null;
function calcTx() {
  const action = document.getElementById('fAction').value;
  const currency = document.getElementById('fCurrency').value || 'USD';
  const currencyPerUsd = liveFxRates[currency];
  const hasFxRate = Number.isFinite(currencyPerUsd) && currencyPerUsd > 0;
  const qty = parseFloat(document.getElementById('fQty').value) || 0;
  const price = action === 'เธเธฒเธเน€เธเธดเธ' || action === 'เธ–เธญเธเน€เธเธดเธ' ? 1 : parseFloat(document.getElementById('fPrice').value) || 0;
  const fee = parseFloat(document.getElementById('fFee').value) || 0;
  const tax = parseFloat(document.getElementById('fTax').value) || 0;
  const gross = hasFxRate ? (qty * price) / currencyPerUsd : 0;
  const feeUsd = hasFxRate ? fee / currencyPerUsd : 0;
  const taxUsd = hasFxRate ? tax / currencyPerUsd : 0;
  document.getElementById('dGross').textContent = hasFxRate ? fmtMoney(gross) : '—';
  document.getElementById('dFee').textContent = hasFxRate ? fmtMoney(feeUsd) : '—';
  document.getElementById('dTax').textContent = hasFxRate ? fmtMoney(taxUsd) : '—';
  const net = action === 'เธเธทเนเธญ' || action === 'เธ–เธญเธเน€เธเธดเธ' ? gross + feeUsd + taxUsd : gross - feeUsd - taxUsd;
  document.getElementById('dNet').textContent = hasFxRate ? fmtMoney(net) : '—';
  document.getElementById('dNetLbl').textContent = action === 'เธเธทเนเธญ' ? 'Amount due' : action === 'เธเธฒเธข' ? 'Net proceeds' : action === 'เธเธฒเธเน€เธเธดเธ' ? 'Cash added' : action === 'เธ–เธญเธเน€เธเธดเธ' ? 'Cash removed' : 'Amount received';
  document.getElementById('lblPrice').innerHTML = action === 'เธเธฑเธเธเธฅ' || action === 'เธ”เธญเธเน€เธเธตเนเธข' ? `Amount per unit (${currency}) <span class="req">*</span>` : `Price per unit (${currency}) <span class="req">*</span>`;
  const rb = document.getElementById('realizedBox');
  const symbol = document.getElementById('fSymbol').value.trim().toUpperCase();
  if (action === 'เธเธฒเธข' && symbol && qty > 0) {
    clearTimeout(calcTxDebounce);
    calcTxDebounce = setTimeout(async () => {
      try {
        const r = await API.previewSell({ symbol, qty, price, fee, tax });
        rb.style.display = 'block';
        const gain = r.estimatedGain;
        rb.innerHTML = `Current average cost: <b>${fmtMoney(r.avgCost)}</b>/unit (remaining ${fmtQ(r.remainingQty)} units)<br>
          Estimated P/L on this trade: <b class="${gain >= 0 ? 'pos' : 'neg'}">${fmtMoney(gain)}</b>`;
      } catch { /* ignore preview errors while typing */ }
    }, 350);
  } else {
    rb.style.display = 'none';
  }
}
document.getElementById('fSymbol')?.addEventListener('input', () => {
  if (document.getElementById('fAction').value === 'เธเธฑเธเธเธฅ') {
    applyDividendHoldingSelection();
  }
  calcTx();
});

async function saveTx(e) {
  e.preventDefault();
  const action = document.getElementById('fAction').value;
  const isCashFlow = action === 'เธเธฒเธเน€เธเธดเธ' || action === 'เธ–เธญเธเน€เธเธดเธ';
  const currency = document.getElementById('fCurrency').value || 'USD';
  const body = {
    date: document.getElementById('fDate').value,
    assetType: isCashFlow ? 'เน€เธเธดเธเธชเธ”' : document.getElementById('fAssetType').value,
    action,
    symbol: isCashFlow ? 'CASH' : document.getElementById('fSymbol').value.trim().toUpperCase(),
    ticker: document.getElementById('fTicker').value.trim(),
    name: document.getElementById('fName').value.trim(),
    broker: document.getElementById('fBroker').value.trim(),
    qty: parseFloat(document.getElementById('fQty').value) || 0,
    price: isCashFlow ? 1 : parseFloat(document.getElementById('fPrice').value) || 0,
    fee: parseFloat(document.getElementById('fFee').value) || 0,
    tax: parseFloat(document.getElementById('fTax').value) || 0,
    currency,
    note: document.getElementById('fNote').value.trim(),
  };
  if ((!isCashFlow && (!body.assetType || !body.symbol)) || body.qty <= 0) { toast('Please fill in all required fields', 'danger'); return false; }
  try {
    await API.createTx(body);
    toast('Transaction saved');
    resetTxForm();
    navigate('transactions');
  } catch (e2) {
    toast(errMsg(e2), 'danger');
  }
  return false;
}

// ====== TRANSACTIONS LIST ======
async function initTxPage() {
  const sel = document.getElementById('sType');
  sel.innerHTML = '<option value="">All</option>' + ASSET_TYPES.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  try {
    const { brokers } = await API.listBrokers();
    document.getElementById('sBroker').innerHTML = '<option value="">All</option>' + brokers.map((b) => `<option value="${b}">${b}</option>`).join('');
    document.getElementById('brokerList').innerHTML = brokers.map((b) => `<option value="${b}"></option>`).join('');
  } catch { /* non-fatal */ }
  await filterTx();
}
async function clearTxFilters() {
  ['sQ', 'sFrom', 'sTo'].forEach((id) => (document.getElementById(id).value = ''));
  document.getElementById('sType').value = ''; document.getElementById('sAction').value = ''; document.getElementById('sBroker').value = '';
  await filterTx();
}
async function filterTx() {
  const params = {
    q: document.getElementById('sQ').value.trim(),
    from: document.getElementById('sFrom').value,
    to: document.getElementById('sTo').value,
    type: document.getElementById('sType').value,
    action: document.getElementById('sAction').value,
    broker: document.getElementById('sBroker').value,
  };
  document.getElementById('txTbl').innerHTML = '<div class="loading-inline">Loading...</div>';
  try {
    const { transactions } = await API.listTx(params);
    curTxFiltered = transactions;
    document.getElementById('txSub').textContent = `${transactions.length} transaction${transactions.length === 1 ? '' : 's'}`;
    renderTxTbl(transactions);
  } catch (e) {
    document.getElementById('txTbl').innerHTML = `<div class="api-error-banner">${errMsg(e)}</div>`;
  }
}
function renderTxTbl(list) {
  const wrap = document.getElementById('txTbl');
  if (!list.length) { wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">•</div><p>No transactions yet</p></div>'; return; }
  wrap.innerHTML = `<table>
  <thead><tr><th>Date</th><th>Asset</th><th>Symbol</th><th>Broker</th><th>Action</th><th class="td-r">Qty / Amount</th><th class="td-r">Price</th><th class="td-r">Fee</th><th class="td-r">Tax</th><th class="td-r">Net</th><th class="td-c">Edit</th></tr></thead>
   <tbody>${list.map((t) => {
    const gross = t.qty * t.price;
    const currency = t.currency || 'USD';
    const net = t.action === 'เธเธทเนเธญ' || t.action === 'เธ–เธญเธเน€เธเธดเธ' ? gross + t.fee + (t.tax || 0) : gross - t.fee - (t.tax || 0);
    const isCashFlow = t.action === 'เธเธฒเธเน€เธเธดเธ' || t.action === 'เธ–เธญเธเน€เธเธดเธ';
    return `<tr>
      <td style="font-size:12px">${fmtDS(t.date)}</td>
      <td style="font-size:12px">${isCashFlow ? 'Cash' : assetTypeLabel(t.asset_type)}</td>
      <td class="mono">${isCashFlow ? '—' : `${t.symbol}${t.ticker ? `<span class="ticker-chip">${t.ticker}</span>` : ''}`}</td>
      <td style="font-size:12px">${t.broker || '<span class="tm">—</span>'}</td>
      <td>${actBadge(t.action)}</td>
      <td class="td-r">${isCashFlow ? fmtCurrency(t.qty, currency) : fmtQ(t.qty)}</td>
      <td class="td-r">${isCashFlow ? '—' : fmtCurrency(t.price, currency)}</td>
      <td class="td-r">${fmtCurrency(t.fee, currency)}</td>
      <td class="td-r">${fmtCurrency(t.tax || 0, currency)}</td>
      <td class="td-r fw">${fmtCurrency(net, currency)}</td>
      <td class="td-c"><button class="btn btn-outline btn-sm" onclick="openEditTx('${t.id}')">Edit</button></td>
     </tr>`;
  }).join('')}</tbody></table>`;
}
function openEditTx(id) {
  const t = curTxFiltered.find((x) => x.id === id); if (!t) return;
  editTxId = id;
  document.getElementById('eDate').value = t.date;
  document.getElementById('eAssetType').value = t.asset_type;
  document.getElementById('eAction').value = t.action;
  document.getElementById('eSymbol').value = t.symbol;
  document.getElementById('eName').value = t.name || '';
  document.getElementById('eTicker').value = t.ticker || '';
  document.getElementById('eBroker').value = t.broker || '';
  document.getElementById('eQty').value = t.qty;
  document.getElementById('ePrice').value = t.price;
  document.getElementById('eFee').value = t.fee;
  document.getElementById('eTax').value = t.tax || 0;
  document.getElementById('eNote').value = t.note || '';
  openM('mEditTx');
}
async function saveEditTx() {
  const body = {
    date: document.getElementById('eDate').value,
    assetType: document.getElementById('eAssetType').value,
    action: document.getElementById('eAction').value,
    symbol: document.getElementById('eSymbol').value.trim().toUpperCase(),
    name: document.getElementById('eName').value.trim(),
    ticker: document.getElementById('eTicker').value.trim(),
    broker: document.getElementById('eBroker').value.trim(),
    qty: parseFloat(document.getElementById('eQty').value) || 0,
    price: parseFloat(document.getElementById('ePrice').value) || 0,
    fee: parseFloat(document.getElementById('eFee').value) || 0,
    tax: parseFloat(document.getElementById('eTax').value) || 0,
    note: document.getElementById('eNote').value.trim(),
  };
  try {
    await API.updateTx(editTxId, body);
    closeM('mEditTx'); await filterTx(); toast('Changes saved');
  } catch (e) { toast(errMsg(e), 'danger'); }
}
async function deleteTxFromModal() {
  if (!confirm('Delete this transaction?')) return;
  try {
    await API.deleteTx(editTxId);
    closeM('mEditTx'); await filterTx(); toast('Deleted');
  } catch (e) { toast(errMsg(e), 'danger'); }
}

// ====== HOLDINGS ======
async function loadHoldings() {
  const wrap = document.getElementById('holdTbl');
  wrap.innerHTML = '<div class="loading-inline">Loading...</div>';
  try {
    const { holdings } = await API.holdings();
    if (!holdings.length) { wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">•</div><p>No open holdings</p></div>'; return; }
    wrap.innerHTML = `<table>
    <thead><tr><th>Symbol</th><th>Type</th><th>Broker</th><th class="td-r">Qty</th><th class="td-r">Avg cost (USD)</th><th class="td-r">Cost basis (USD)</th><th class="td-r">Current price (USD)</th><th class="td-r">Market value (USD)</th><th class="td-r">P/L (USD)</th><th class="td-r">%</th></tr></thead>
     <tbody>${holdings.map((h) => `<tr>
        <td class="mono">${h.symbol}${h.ticker ? `<span class="ticker-chip">${h.ticker}</span>` : ''}<div class="tm" style="font-size:11px">${h.name || ''}</div></td>
        <td style="font-size:12px">${assetTypeLabel(h.assetType)}</td>
        <td style="font-size:12px">${(h.brokers && h.brokers.length) ? h.brokers.join(', ') : '<span class="tm">—</span>'}</td>
        <td class="td-r">${fmtQ(h.qty)}</td>
        <td class="td-r">${fmtMoney(h.avgCost)}</td>
        <td class="td-r">${fmtMoney(h.costBasis)}</td>
        <td class="td-r">${fmtMoney(h.currentPrice)}</td>
        <td class="td-r fw">${fmtMoney(h.marketValue)}</td>
        <td class="td-r fw ${h.unrealizedPL >= 0 ? 'pos' : 'neg'}">${fmtMoney(h.unrealizedPL)}</td>
        <td class="td-r ${h.unrealizedPct >= 0 ? 'pos' : 'neg'}">${h.unrealizedPct.toFixed(2)}%</td>
       </tr>`).join('')}</tbody></table>`;
  } catch (e) {
    wrap.innerHTML = `<div class="api-error-banner">${errMsg(e)}</div>`;
  }
}
async function refreshAllLivePrices() {
  const buttons = Array.from(document.querySelectorAll('[data-refresh-live-prices]'));
  const originalLabels = buttons.map((button) => button.textContent);
  buttons.forEach((button) => {
    button.disabled = true;
    button.textContent = 'Fetching prices & FX...';
  });
  toast('Fetching current prices and exchange rates...', 'info');
  try {
    const fx = await refreshLiveFxRates();
    await API.updateFxRates(fx.rates);
    const { holdings } = await API.holdings();
    const liveHoldings = holdings.filter((holding) => holding.ticker);
    if (!liveHoldings.length) {
      if (fx.updated) {
        const { nav } = await API.dashboard();
        if (Number(nav) > 0) await API.captureSnapshot(new Date().toISOString().slice(0, 10));
        await loadDash();
      }
      toast(`${fx.updated} FX rates updated${fx.failed ? `; ${fx.failed} unavailable` : ''}. No holdings have a market ticker to refresh.`, fx.failed ? 'warning' : 'info');
      return;
    }

    const thbPerUsd = fx.thbPerUsd;

    const outcomes = await Promise.all(liveHoldings.map(async (holding) => {
      try {
        const { data } = await API.marketIndicators(holding.ticker, true);
        let price = Number(data?.price);
        if (holding.assetType === 'เธซเธธเนเธเนเธ—เธข') {
          if (!Number.isFinite(thbPerUsd) || thbPerUsd <= 0) throw new Error('Exchange-rate quote unavailable');
          price /= thbPerUsd;
        }
        if (!Number.isFinite(price)) throw new Error('Invalid market price');
        if (price === Number(holding.currentPrice)) return 'unchanged';
        await API.updatePrice(holding.symbol, price);
        return 'updated';
      } catch {
        return 'failed';
      }
    }));

    const updated = outcomes.filter((outcome) => outcome === 'updated').length;
    const failed = outcomes.filter((outcome) => outcome === 'failed').length;
    await loadHoldings();
    if (updated || fx.updated) {
      await API.captureSnapshot(new Date().toISOString().slice(0, 10));
      await loadDash();
    }

    if (updated) {
      toast(`Updated ${updated} price${updated === 1 ? '' : 's'}; portfolio chart saved. ${fx.updated} FX rates updated${fx.failed ? ` (${fx.failed} unavailable)` : ''}${failed ? `; ${failed} tickers failed` : ''}`);
    } else if (failed) {
      toast(`No prices changed; ${failed} ticker${failed === 1 ? '' : 's'} could not be refreshed. ${fx.updated} FX rates updated${fx.failed ? ` (${fx.failed} unavailable)` : ''}`, 'warning');
    } else {
      toast(`Prices are unchanged; portfolio chart was not recalculated. ${fx.updated} FX rates updated${fx.failed ? ` (${fx.failed} unavailable)` : ''}`, fx.failed ? 'warning' : 'info');
    }
  } catch (e) {
    toast(errMsg(e), 'danger');
  } finally {
    buttons.forEach((button, index) => {
      button.disabled = false;
      button.textContent = originalLabels[index];
    });
  }
}

// ====== DASHBOARD ======
async function loadDash() {
  const errBox = document.getElementById('dashError');
  errBox.innerHTML = '';
  try {
    const d = await API.dashboard();
    document.getElementById('dashDate').textContent = 'As of ' + fmtDS(d.asOfDate || new Date().toISOString().split('T')[0]);
    renderDashStatsPanel(d);
    loadDashChart();
    document.getElementById('dashRecent').innerHTML = d.recentTransactions.length ? `<table>
      <thead><tr><th>Date</th><th>Symbol</th><th>Action</th><th class="td-r">Value</th></tr></thead>
      <tbody>${d.recentTransactions.map((t) => `<tr>
        <td style="font-size:12px">${fmtDS(t.date)}</td>
        <td class="mono">${t.symbol}</td>
        <td>${actBadge(t.action)}</td>
        <td class="td-r fw">${fmtMoney(t.qty * t.price)}</td>
      </tr>`).join('')}</tbody></table>` : '<div class="empty-state"><div class="empty-icon">•</div><p>No transactions yet</p></div>';
    const entries = Object.entries(d.byType);
    document.getElementById('dashByType').innerHTML = entries.length
      ? entries.map(([tp, v]) => `<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--cream-dark);font-size:14px"><span>${assetTypeLabel(tp)}</span><span class="fw">${fmtMoney(v)} <span class="tm">(${d.totalMV > 0 ? (v / d.totalMV * 100).toFixed(1) : 0}%)</span></span></div>`).join('')
      : '<p class="tm" style="text-align:center;padding:20px">No data yet</p>';
  } catch (e) {
    errBox.innerHTML = `<div class="api-error-banner">${errMsg(e)}</div>`;
  }
}

// ====== DCA PLANNER & REBALANCE ======
async function initDcaPlan() {
  try {
    const { config } = await API.dcaConfig();
    document.getElementById('dcaBudget').value = config.budget || '';
    document.getElementById('dcaVol').value = config.vol || '';
  } catch (e) { toast(errMsg(e), 'danger'); }
  await renderTargetAllocForm();
  await renderSmartDcaV2(false);
}
async function renderTargetAllocForm() {
  let alloc = {}, dcaSymbols = [], holdings = [];
  try {
    [{ targetAlloc: alloc, dcaSymbols }, { holdings }] = await Promise.all([API.targetAlloc(), API.holdings()]);
  } catch (e) { toast(errMsg(e), 'danger'); }
  const symbols = Array.from(new Set([...Object.keys(alloc), ...holdings.map((h) => h.symbol)]));
  const selectedDcaSymbols = new Set(dcaSymbols);
  const el = document.getElementById('targetAllocForm');
  if (!symbols.length) { el.innerHTML = '<p class="tm" style="font-size:13px;padding:8px 0">No assets yet</p>'; updateTargetSum(); return; }
  el.innerHTML = symbols.map((s) => `<div class="talloc-row" data-row="${s}">
    <span class="mono" style="width:70px">${s}</span>
    <input type="number" step="any" min="0" max="100" class="form-control talloc-inp" style="max-width:110px" value="${alloc[s] != null ? alloc[s] : 0}" oninput="updateTargetSum()" />
    <span class="tm" style="font-size:12px">%</span>
    <label title="Include in the DCA target mix" style="display:flex;align-items:center;gap:5px;white-space:nowrap"><input type="checkbox" class="talloc-dca" ${selectedDcaSymbols.has(s) ? 'checked' : ''} onchange="updateTargetSum()" /> DCA</label>
    <span class="mono talloc-effective" title="Normalized DCA weight" style="min-width:48px;text-align:right">0%</span>
    <button class="btn btn-outline btn-sm" style="margin-left:auto" onclick="this.closest('[data-row]').remove();updateTargetSum()">Remove</button>
  </div>`).join('');
  updateTargetSum();
}
async function addTargetRow() {
  const input = prompt('Symbol to add to the target allocation');
  if (!input) return;
  const { targetAlloc, dcaSymbols } = await API.targetAlloc();
  targetAlloc[input.trim().toUpperCase()] ??= 0;
  await API.saveTargetAlloc(targetAlloc, dcaSymbols);
  await renderTargetAllocForm();
}
function updateTargetSum() {
  const rows = Array.from(document.querySelectorAll('#targetAllocForm [data-row]'));
  const selectedRows = rows.filter((row) => row.querySelector('.talloc-dca').checked);
  const selectedWeight = selectedRows.reduce((total, row) => total + (parseFloat(row.querySelector('.talloc-inp').value) || 0), 0);
  rows.forEach((row) => {
    const inputWeight = parseFloat(row.querySelector('.talloc-inp').value) || 0;
    row.querySelector('.talloc-effective').textContent = row.querySelector('.talloc-dca').checked && selectedWeight > 0
      ? `${(inputWeight / selectedWeight * 100).toFixed(1)}%`
      : '—';
  });
  const label = document.getElementById('targetSumLbl');
  if (label) {
    label.textContent = selectedWeight > 0 ? `DCA target: 100% across ${selectedRows.length} selected` : 'No DCA target selected';
    label.className = selectedWeight > 0 ? 'pos fw' : 'tm';
  }
}
async function saveTargetAlloc() {
  const alloc = {};
  const dcaSymbols = [];
  document.querySelectorAll('#targetAllocForm [data-row]').forEach((row) => {
    const symbol = row.getAttribute('data-row');
    alloc[symbol] = parseFloat(row.querySelector('.talloc-inp').value) || 0;
    if (row.querySelector('.talloc-dca').checked) dcaSymbols.push(symbol);
  });
  try { await API.saveTargetAlloc(alloc, dcaSymbols); toast('Target allocation saved'); await renderSmartDcaV2(false); }
  catch (e) { toast(errMsg(e), 'danger'); }
}
async function saveDcaSettings() {
  const budget = parseFloat(document.getElementById('dcaBudget').value) || 0;
  const vol = parseFloat(document.getElementById('dcaVol').value) || 0;
  try {
    await API.saveDcaConfig({ budget, vol });
    toast('DCA budget saved');
    await renderSmartDcaV2(false);
  } catch (e) { toast(errMsg(e), 'danger'); }
}
function sigBadgeClass(sig) {
  if (sig.startsWith('SELL')) return 'b-sell';
  if (sig.startsWith('STRONG BUY') || sig.startsWith('BUY')) return 'b-buy';
  if (sig.startsWith('DCA')) return 'b-div';
  return 'b-other';
}
async function renderSmartDcaV2(fetchLive) {
  const wrap = document.getElementById('rebalTbl');
  const budget = parseFloat(document.getElementById('dcaBudget').value) || 0;
  wrap.innerHTML = '<div class="loading-inline">Calculating Smart-DCA v2...</div>';
  try {
    const data = await API.smartDcaV2(budget, fetchLive);
    const risk = data.risk;
    const riskText = `Risk: ${risk.level} | Score: ${risk.score} | Gate: ${risk.gate}`;
    const notInTargetHtml = data.notInTarget?.length
      ? `<div style="padding:12px 16px;border-top:1px solid var(--cream-dark)"><div class="fw" style="margin-bottom:8px">NOT IN TARGET</div><div class="tm" style="font-size:12px">Holdings without a target get no automatic DCA and are never auto-sold.</div>${data.notInTarget.map((stock) => `<div style="display:flex;justify-content:space-between;padding:7px 0"><span class="mono">${stock.ticker}</span><span>${(stock.currentWeight * 100).toFixed(2)}% ยท ${stock.action}</span></div>`).join('')}</div>`
      : '';
    wrap.innerHTML = `<div style="padding:12px 16px;border-bottom:1px solid var(--cream-dark);font-weight:600">${riskText}</div>
      <table><thead><tr><th>Ticker</th><th class="td-r">Current %</th><th class="td-r">Target %</th><th class="td-r">Hard max %</th><th class="td-r">Score</th><th>Action</th><th class="td-r">DCA (USD)</th><th>Reason</th></tr></thead>
      <tbody>${data.stocks.map((stock) => `<tr>
        <td class="mono">${stock.ticker}</td>
        <td class="td-r">${(stock.currentWeight * 100).toFixed(2)}%</td>
        <td class="td-r">${(stock.targetWeight * 100).toFixed(2)}%</td>
        <td class="td-r">${(stock.hardMaxWeight * 100).toFixed(2)}%</td>
        <td class="td-r fw">${stock.compositeScore.toFixed(1)}</td>
        <td><span class="badge ${sigBadgeClass(stock.action)}">${stock.action}</span></td>
        <td class="td-r fw">${fmtMoney(stock.dcaAmount)}</td>
        <td style="font-size:12px" title="${stock.reasons.join(' | ')}">${stock.reasons.join(' ยท ')}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr class="rpt-total-row"><td colspan="6" style="text-align:right">Allocated / cash remaining</td><td class="td-r fw">${fmtMoney(data.summary.totalAllocated)}</td><td class="td-r">Left ${fmtMoney(data.summary.cashRemaining)}</td></tr></tfoot></table>${notInTargetHtml}`;
  } catch (e) {
    wrap.innerHTML = `<div class="api-error-banner">${errMsg(e)}</div>`;
  }
}
async function exportSmartDcaTrainingData() {
  try {
    const file = await API.exportSmartDcaTrainingData();
    if (!file.size) { toast('No Smart-DCA training samples yet', 'warning'); return; }
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `smart-dca-training-${new Date().toISOString().slice(0, 10)}.jsonl`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  } catch (e) { toast(errMsg(e), 'danger'); }
}
// ====== DASHBOARD CHART ======
let dashChartInstance = null;
const PORTFOLIO_HISTORY_START_DATE = '2026-09-30';
function isPortfolioHistoryAnchor(date) {
  return date === PORTFOLIO_HISTORY_START_DATE || date.slice(8, 10) === '28';
}
async function captureSnapshot() {
  const btn = document.getElementById('btnCaptureSnap');
  btn.disabled = true; btn.textContent = 'Saving...';
  try {
    await API.captureSnapshot(new Date().toISOString().slice(0, 10));
    toast('Saved today\'s portfolio value');
    await loadDashChart();
  } catch (e) {
    toast(errMsg(e), 'danger');
  } finally {
    btn.disabled = false; btn.textContent = 'Save today\'s portfolio value';
  }
}
async function loadDashChart() {
  const wrap = document.getElementById('dashChartWrap');
  const empty = document.getElementById('dashChartEmpty');
  try {
    const data = await API.listSnapshots(36500);
    const validSnapshots = data.series.filter((point) => Number(point.portfolioValue) > 0);
    const earlierSnapshots = validSnapshots.filter((point) => point.date < PORTFOLIO_HISTORY_START_DATE);
    const availableSnapshots = validSnapshots.filter((point) => (
      point.date >= PORTFOLIO_HISTORY_START_DATE && Number(point.portfolioValue) > 0
    ));
    const historicalSeries = [
      ...earlierSnapshots,
      ...availableSnapshots.filter((point) => isPortfolioHistoryAnchor(point.date)),
    ];
    const latestSnapshot = availableSnapshots.at(-1);
    if (latestSnapshot && latestSnapshot.date > (historicalSeries.at(-1)?.date || '')) {
      historicalSeries.push(latestSnapshot);
    }
    if (historicalSeries.length < 2) {
      wrap.style.display = 'none'; empty.style.display = 'block';
      if (dashChartInstance) { dashChartInstance.destroy(); dashChartInstance = null; }
      return;
    }
    wrap.style.display = 'block'; empty.style.display = 'none';
    renderDashChart(historicalSeries);
  } catch (e) {
    wrap.style.display = 'none';
    empty.style.display = 'block';
    empty.querySelector('p').textContent = errMsg(e);
  }
}
function renderDashChart(series) {
  const ctx = document.getElementById('dashChart').getContext('2d');
  const labels = series.map((s) => fmtDS(s.date));
  const values = series.map((s) => s.portfolioValue);
  const latestSnapshotDate = series.at(-1)?.date;
  const isEmphasizedPoint = (point) => (
    point.date === PORTFOLIO_HISTORY_START_DATE ||
    (point.date === latestSnapshotDate && point.date >= PORTFOLIO_HISTORY_START_DATE)
  );
  const pointRadii = series.map((point) => (
    point.date < PORTFOLIO_HISTORY_START_DATE ? 2 : isPortfolioHistoryAnchor(point.date) || isEmphasizedPoint(point) ? 3 : 0
  ));
  const pointHoverRadii = series.map((point) => (
    point.date < PORTFOLIO_HISTORY_START_DATE ? 4 : isPortfolioHistoryAnchor(point.date) || isEmphasizedPoint(point) ? 5 : 0
  ));
  const pointBackgroundColors = series.map((point) => (
    isEmphasizedPoint(point) ? '#7A5C3E' : 'rgba(122,92,62,0.08)'
  ));
  if (dashChartInstance) dashChartInstance.destroy();
  dashChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Historical portfolio value (USD)',
        data: values,
        borderColor: '#7A5C3E',
        backgroundColor: 'rgba(122,92,62,0.08)',
        borderWidth: 2.5,
        pointRadius: pointRadii,
        pointHoverRadius: pointHoverRadii,
        pointBackgroundColor: pointBackgroundColors,
        pointHoverBackgroundColor: 'rgba(122,92,62,0.08)',
        tension: 0.15,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { callback: (v) => '$' + Number(v).toLocaleString('en-US') } },
      },
    },
  });
}
function renderDashStatsPanel(d) {
  const percentage = (value) => Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)}%` : null;
  const thbPerUsd = Number(d.thbPerUsd);
  const fmtStatsMoney = (value) => {
    const thbValue = Number(value) * thbPerUsd;
    const thbAmount = Number.isFinite(thbValue) && thbPerUsd > 0
      ? ` <span class="tm">(${fmtCurrency(thbValue, 'THB')})</span>`
      : '';
    return `${fmtMoney(value)}${thbAmount}`;
  };
  const benchmarkTicker = String(d.benchmarkTicker || '').replace(/[^A-Z0-9.^=_-]/gi, '') || 'Index';
  const metric = (label, value, detail = '') => `<div class="dashboard-stat"><div class="tm dashboard-stat-label">${label}</div><div class="fw dashboard-stat-value">${value}</div>${detail ? `<div class="tm dashboard-stat-detail">${detail}</div>` : ''}</div>`;
  const realizedAndDividends = (Number(d.realizedThisYear) || 0) + (Number(d.divThisYear) || 0);
  const advancedMetrics = [];
  const priceIrr = Number(d.priceIrr);
  if (Number.isFinite(priceIrr)) {
    advancedMetrics.push(metric('Price IRR / MWR', percentage(priceIrr), 'Annualized; dividends excluded'));
  }
  const benchmarkReturn = Number(d.benchmarkReturn);
  if (Number.isFinite(benchmarkReturn)) {
    advancedMetrics.push(metric(`${benchmarkTicker} price return`, percentage(benchmarkReturn), 'Recorded benchmark snapshots'));
  }

  const primaryMetricCards = [
    metric('Total Portfolio Value (NAV)', fmtStatsMoney(d.nav), 'Display in USD + THB conversion'),
    metric('Cash Balance', fmtStatsMoney(d.cashBalance), 'Liquid unallocated capital'),
    metric('Total Cost Basis', fmtStatsMoney(d.totalCost), 'Capital deployed in active holdings'),
    metric('Net Total Invested', fmtStatsMoney(d.netTotalInvested), 'True net external capital invested'),
    metric('Unrealized P/L', `<span class="${d.unrealizedPL >= 0 ? 'pos' : 'neg'}">${fmtMoney(d.unrealizedPL)} (${percentage(d.unrealizedPct) || '0.00%'})</span>`, 'Value + percentage'),
    metric('Realized P/L & Dividends', `<span class="${realizedAndDividends >= 0 ? 'pos' : 'neg'}">${fmtMoney(realizedAndDividends)}</span>`, 'Cumulative closed gains & income'),
  ].join('');

  const advancedSection = advancedMetrics.length
    ? `<div class="dashboard-stat-group"><div class="dashboard-stat-group-title">Analytics &amp; Benchmarks</div><div class="dashboard-stat-grid">${advancedMetrics.join('')}</div></div>`
    : '';

  document.getElementById('dashStatsPanel').innerHTML = `
   <div class="card-hdr"><span class="card-title">Stats Performance</span></div>
   <div class="dashboard-stat-grid">
    ${primaryMetricCards}
   </div>
   ${advancedSection}`;
}

// ====== SETTINGS ======
async function loadSettings() {
  try {
    const { settings } = await API.settings();
    document.getElementById('stName').value = settings.name || '';
    document.getElementById('stAddr').value = settings.address || '';
    document.getElementById('stBenchmarkTicker').value = settings.benchmarkTicker || 'SPY';
  } catch (e) { toast(errMsg(e), 'danger'); }
}
async function saveSettings() {
  try {
    await API.saveSettings({
      name: document.getElementById('stName').value.trim(),
      address: document.getElementById('stAddr').value.trim(),
      benchmarkTicker: document.getElementById('stBenchmarkTicker').value.trim(),
    });
    const name = document.getElementById('stName').value.trim();
    if (name) document.getElementById('sbCo').textContent = name;
    toast('Settings saved');
  } catch (e) { toast(errMsg(e), 'danger'); }
}
// ====== START ======
initApp();
