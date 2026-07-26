// ====== APP STATE ======
let editTxId = null, editUId = null;
let curTxFiltered = [];
let curRebalRows = [];
let ASSET_TYPES = ['หุ้นไทย', 'หุ้นต่างประเทศ', 'กองทุนรวม', 'คริปโต', 'ทองคำ', 'พันธบัตร/ตราสารหนี้', 'อื่นๆ'];
let taxRatesCache = null;

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
  if (!u || !p) { err.textContent = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'; err.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = 'กำลังเข้าสู่ระบบ...';
  try {
    const data = await API.login(u, p);
    Auth.token = data.token;
    Auth.me = data.user;
    showApp();
  } catch (e) {
    err.textContent = e.message === 'unauthorized' ? 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' : e.message;
    err.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ';
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
    document.getElementById('sbRole').textContent = u.role === 'owner' ? '🔑 เจ้าของ' : '👤 Staff';
    if (u.role !== 'owner') document.querySelectorAll('.owner-only').forEach((el) => (el.style.display = 'none'));
  }
  try {
    const { settings } = await API.settings();
    if (settings && settings.name) document.getElementById('sbCo').textContent = settings.name;
  } catch { /* non-fatal */ }
  navigate('dashboard');
}

// ====== NAVIGATION ======
function navigate(pg) {
  document.querySelectorAll('.pg-section').forEach((s) => (s.style.display = 'none'));
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
  const el = document.getElementById('page-' + pg);
  if (el) el.style.display = 'block';
  const nav = document.querySelector(`.nav-item[data-page="${pg}"]`);
  if (nav) nav.classList.add('active');
  if (pg === 'dashboard') loadDash();
  if (pg === 'new-tx') initTxForm();
  if (pg === 'transactions') initTxPage();
  if (pg === 'holdings') loadHoldings();
  if (pg === 'dcaplan') initDcaPlan();
  if (pg === 'tax') initTaxPage();
  if (pg === 'users') loadUsers();
  if (pg === 'settings') loadSettings();
}

// ====== HELPERS ======
function fmt(n) { return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtQ(n) { return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 4 }); }
function fmtDS(ds) {
  if (!ds) return '';
  const d = new Date(ds);
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + (d.getFullYear() + 543);
}
function actBadge(a) {
  const m = { 'ซื้อ': 'b-buy', 'ขาย': 'b-sell', 'ปันผล': 'b-div', 'ดอกเบี้ย': 'b-int' };
  return '<span class="badge ' + (m[a] || 'b-buy') + '">' + a + '</span>';
}
function toast(msg, type) {
  const t = document.getElementById('toast');
  const c = { success: '#4A7A4A', danger: '#C0392B', warning: '#D4831A', info: '#2980B9' };
  t.style.background = c[type] || c.success;
  t.textContent = msg; t.style.display = 'block'; t.style.opacity = '1';
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => (t.style.display = 'none'), 300); }, 3000);
}
function errMsg(e) { return (e && e.message) || 'เกิดข้อผิดพลาด'; }
function openM(id) { document.getElementById(id).classList.add('show'); }
function closeM(id) { document.getElementById(id).classList.remove('show'); }
document.querySelectorAll('.modal-overlay').forEach((m) => {
  m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('show'); });
});

// ====== NEW TX FORM ======
function initTxForm() {
  document.getElementById('fDate').value = new Date().toISOString().split('T')[0];
  resetTxForm();
  populateBrokerList();
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
  calcTx();
}
let calcTxDebounce = null;
function calcTx() {
  const action = document.getElementById('fAction').value;
  const qty = parseFloat(document.getElementById('fQty').value) || 0;
  const price = parseFloat(document.getElementById('fPrice').value) || 0;
  const fee = parseFloat(document.getElementById('fFee').value) || 0;
  const gross = qty * price;
  document.getElementById('dGross').textContent = '$ ' + fmt(gross);
  document.getElementById('dFee').textContent = '$ ' + fmt(fee);
  const net = action === 'ซื้อ' ? gross + fee : gross - fee;
  document.getElementById('dNet').textContent = '$ ' + fmt(net);
  document.getElementById('dNetLbl').textContent = action === 'ซื้อ' ? 'ยอดที่ต้องชำระ' : action === 'ขาย' ? 'ยอดรับสุทธิ' : 'ยอดรับ';
  document.getElementById('lblPrice').innerHTML = action === 'ปันผล' || action === 'ดอกเบี้ย' ? 'จำนวนเงินต่อหน่วย <span class="req">*</span>' : 'ราคาต่อหน่วย <span class="req">*</span>';
  const rb = document.getElementById('realizedBox');
  const symbol = document.getElementById('fSymbol').value.trim().toUpperCase();
  if (action === 'ขาย' && symbol && qty > 0) {
    clearTimeout(calcTxDebounce);
    calcTxDebounce = setTimeout(async () => {
      try {
        const r = await API.previewSell({ symbol, qty, price, fee });
        rb.style.display = 'block';
        const gain = r.estimatedGain;
        rb.innerHTML = `ต้นทุนเฉลี่ยปัจจุบัน: <b>$${fmt(r.avgCost)}</b>/หน่วย (คงเหลือ ${fmtQ(r.remainingQty)} หน่วย)<br>
          กำไร/ขาดทุนโดยประมาณจากรายการนี้: <b class="${gain >= 0 ? 'pos' : 'neg'}">$${fmt(gain)}</b>`;
      } catch { /* ignore preview errors while typing */ }
    }, 350);
  } else {
    rb.style.display = 'none';
  }
}
document.getElementById('fSymbol')?.addEventListener('input', calcTx);

async function saveTx(e) {
  e.preventDefault();
  const body = {
    date: document.getElementById('fDate').value,
    assetType: document.getElementById('fAssetType').value,
    action: document.getElementById('fAction').value,
    symbol: document.getElementById('fSymbol').value.trim().toUpperCase(),
    ticker: document.getElementById('fTicker').value.trim(),
    name: document.getElementById('fName').value.trim(),
    broker: document.getElementById('fBroker').value.trim(),
    qty: parseFloat(document.getElementById('fQty').value) || 0,
    price: parseFloat(document.getElementById('fPrice').value) || 0,
    fee: parseFloat(document.getElementById('fFee').value) || 0,
    note: document.getElementById('fNote').value.trim(),
  };
  if (!body.assetType || !body.symbol || body.qty <= 0) { toast('กรุณากรอกข้อมูลให้ครบถ้วน', 'danger'); return false; }
  try {
    await API.createTx(body);
    toast('✅ บันทึกธุรกรรมสำเร็จ');
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
  sel.innerHTML = '<option value="">ทั้งหมด</option>' + ASSET_TYPES.map((a) => `<option value="${a}">${a}</option>`).join('');
  try {
    const { brokers } = await API.listBrokers();
    document.getElementById('sBroker').innerHTML = '<option value="">ทั้งหมด</option>' + brokers.map((b) => `<option value="${b}">${b}</option>`).join('');
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
  document.getElementById('txTbl').innerHTML = '<div class="loading-inline">⏳ กำลังโหลด...</div>';
  try {
    const { transactions } = await API.listTx(params);
    curTxFiltered = transactions;
    document.getElementById('txSub').textContent = `ทั้งหมด ${transactions.length} รายการ`;
    renderTxTbl(transactions);
  } catch (e) {
    document.getElementById('txTbl').innerHTML = `<div class="api-error-banner">${errMsg(e)}</div>`;
  }
}
function renderTxTbl(list) {
  const wrap = document.getElementById('txTbl');
  if (!list.length) { wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>ยังไม่มีธุรกรรม</p></div>'; return; }
  wrap.innerHTML = `<table>
   <thead><tr><th>วันที่</th><th>สินทรัพย์</th><th>สัญลักษณ์</th><th>โบรกเกอร์</th><th>รายการ</th><th class="td-r">จำนวน</th><th class="td-r">ราคา</th><th class="td-r">ค่าธรรมเนียม</th><th class="td-r">มูลค่าสุทธิ</th><th class="td-c">จัดการ</th></tr></thead>
   <tbody>${list.map((t) => {
    const gross = t.qty * t.price;
    const net = t.action === 'ซื้อ' ? gross + t.fee : gross - t.fee;
    return `<tr>
      <td style="font-size:12px">${fmtDS(t.date)}</td>
      <td style="font-size:12px">${t.asset_type}</td>
      <td class="mono">${t.symbol}${t.ticker ? `<span class="ticker-chip">${t.ticker}</span>` : ''}</td>
      <td style="font-size:12px">${t.broker || '<span class="tm">—</span>'}</td>
      <td>${actBadge(t.action)}</td>
      <td class="td-r">${fmtQ(t.qty)}</td>
      <td class="td-r">${fmt(t.price)}</td>
      <td class="td-r">${fmt(t.fee)}</td>
      <td class="td-r fw">$${fmt(net)}</td>
      <td class="td-c"><button class="btn btn-outline btn-sm" onclick="openEditTx('${t.id}')">✏️</button></td>
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
    note: document.getElementById('eNote').value.trim(),
  };
  try {
    await API.updateTx(editTxId, body);
    closeM('mEditTx'); await filterTx(); toast('✅ บันทึกการแก้ไขสำเร็จ');
  } catch (e) { toast(errMsg(e), 'danger'); }
}
async function deleteTxFromModal() {
  if (!confirm('ต้องการลบธุรกรรมนี้?')) return;
  try {
    await API.deleteTx(editTxId);
    closeM('mEditTx'); await filterTx(); toast('✅ ลบสำเร็จ');
  } catch (e) { toast(errMsg(e), 'danger'); }
}

// ====== HOLDINGS ======
async function loadHoldings() {
  const wrap = document.getElementById('holdTbl');
  wrap.innerHTML = '<div class="loading-inline">⏳ กำลังโหลด...</div>';
  try {
    const { holdings } = await API.holdings();
    if (!holdings.length) { wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>ยังไม่มีสินทรัพย์คงเหลือ</p></div>'; return; }
    wrap.innerHTML = `<table>
     <thead><tr><th>สัญลักษณ์</th><th>ประเภท</th><th>โบรกเกอร์</th><th class="td-r">จำนวนคงเหลือ</th><th class="td-r">ต้นทุนเฉลี่ย</th><th class="td-r">มูลค่าต้นทุน</th><th class="td-r">ราคาปัจจุบัน</th><th class="td-r">มูลค่าปัจจุบัน</th><th class="td-r">กำไร/ขาดทุน</th><th class="td-r">%</th></tr></thead>
     <tbody>${holdings.map((h) => `<tr>
        <td class="mono">${h.symbol}${h.ticker ? `<span class="ticker-chip">${h.ticker}</span>` : ''}<div class="tm" style="font-size:11px">${h.name || ''}</div></td>
        <td style="font-size:12px">${h.assetType}</td>
        <td style="font-size:12px">${(h.brokers && h.brokers.length) ? h.brokers.join(', ') : '<span class="tm">—</span>'}</td>
        <td class="td-r">${fmtQ(h.qty)}</td>
        <td class="td-r">$${fmt(h.avgCost)}</td>
        <td class="td-r">$${fmt(h.costBasis)}</td>
        <td class="td-r">
          <input type="number" step="any" value="${h.currentPrice}" style="width:100px;padding:5px 7px;border:1.5px solid var(--brown-light);border-radius:6px;text-align:right" onchange="updatePrice('${h.symbol}',this.value)" />
          ${h.ticker ? `<button class="btn btn-outline btn-sm" style="padding:4px 8px;margin-left:4px" title="ดึงราคาสดจาก ${h.ticker}" onclick="fetchLivePrice('${h.symbol}','${h.ticker}')">📡</button>` : ''}
        </td>
        <td class="td-r fw">$${fmt(h.marketValue)}</td>
        <td class="td-r fw ${h.unrealizedPL >= 0 ? 'pos' : 'neg'}">$${fmt(h.unrealizedPL)}</td>
        <td class="td-r ${h.unrealizedPct >= 0 ? 'pos' : 'neg'}">${h.unrealizedPct.toFixed(2)}%</td>
       </tr>`).join('')}</tbody></table>`;
  } catch (e) {
    wrap.innerHTML = `<div class="api-error-banner">${errMsg(e)}</div>`;
  }
}
async function updatePrice(symbol, val) {
  try {
    await API.updatePrice(symbol, parseFloat(val) || 0);
    await loadHoldings();
  } catch (e) { toast(errMsg(e), 'danger'); }
}
async function fetchLivePrice(symbol, ticker) {
  toast('📡 กำลังดึงราคาสด...', 'info');
  try {
    const { data } = await API.marketIndicators(ticker);
    await API.updatePrice(symbol, data.price);
    await loadHoldings();
    toast(`✅ อัปเดตราคา ${symbol} เป็น ${fmt(data.price)} จาก ${ticker}`);
  } catch (e) { toast(errMsg(e), 'danger'); }
}

// ====== DASHBOARD ======
async function loadDash() {
  const errBox = document.getElementById('dashError');
  errBox.innerHTML = '';
  document.getElementById('dashDate').textContent = 'ข้อมูล ณ วันที่ ' + fmtDS(new Date().toISOString().split('T')[0]);
  try {
    const d = await API.dashboard();
    renderDashStatsPanel(d);
    loadDashChart();
    document.getElementById('dashRecent').innerHTML = d.recentTransactions.length ? `<table>
      <thead><tr><th>วันที่</th><th>สัญลักษณ์</th><th>รายการ</th><th class="td-r">มูลค่า</th></tr></thead>
      <tbody>${d.recentTransactions.map((t) => `<tr>
        <td style="font-size:12px">${fmtDS(t.date)}</td>
        <td class="mono">${t.symbol}</td>
        <td>${actBadge(t.action)}</td>
        <td class="td-r fw">$${fmt(t.qty * t.price)}</td>
      </tr>`).join('')}</tbody></table>` : '<div class="empty-state"><div class="empty-icon">📋</div><p>ยังไม่มีธุรกรรม</p></div>';
    const entries = Object.entries(d.byType);
    document.getElementById('dashByType').innerHTML = entries.length
      ? entries.map(([tp, v]) => `<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--cream-dark);font-size:14px"><span>${tp}</span><span class="fw">$ ${fmt(v)} <span class="tm">(${d.totalMV > 0 ? (v / d.totalMV * 100).toFixed(1) : 0}%)</span></span></div>`).join('')
      : '<p class="tm" style="text-align:center;padding:20px">ยังไม่มีข้อมูล</p>';
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
  await renderRebalTbl(false);
}
async function renderTargetAllocForm() {
  let alloc = {}, holdings = [];
  try {
    [{ targetAlloc: alloc }, { holdings }] = await Promise.all([API.targetAlloc(), API.holdings()]);
  } catch (e) { toast(errMsg(e), 'danger'); }
  const holdSymbols = holdings.map((h) => h.symbol);
  const symbols = Array.from(new Set([...Object.keys(alloc), ...holdSymbols]));
  const el = document.getElementById('targetAllocForm');
  if (!symbols.length) {
    el.innerHTML = '<p class="tm" style="font-size:13px;padding:8px 0">ยังไม่มีสินทรัพย์ กด "+ เพิ่มสินทรัพย์" หรือบันทึกธุรกรรมก่อน</p>';
    updateTargetSum();
    return;
  }
  el.innerHTML = symbols.map((s) => `
   <div style="display:flex;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--cream-dark)" data-row="${s}">
     <span class="mono" style="width:90px">${s}</span>
     <input type="number" step="any" min="0" max="100" class="form-control talloc-inp" style="max-width:110px" value="${alloc[s] != null ? alloc[s] : 0}" oninput="updateTargetSum()" />
     <span class="tm" style="font-size:12px">%</span>
     <button class="btn btn-outline btn-sm" style="margin-left:auto" onclick="this.closest('[data-row]').remove();updateTargetSum()">🗑️</button>
   </div>`).join('');
  updateTargetSum();
}
async function addTargetRow() {
  const s = prompt('สัญลักษณ์สินทรัพย์ที่ต้องการเพิ่มเป้าหมาย (เช่น PTT, AAPL, BTC)');
  if (!s) return;
  try {
    const { targetAlloc } = await API.targetAlloc();
    const sym = s.trim().toUpperCase();
    if (targetAlloc[sym] == null) targetAlloc[sym] = 0;
    await API.saveTargetAlloc(targetAlloc);
    await renderTargetAllocForm();
  } catch (e) { toast(errMsg(e), 'danger'); }
}
function updateTargetSum() {
  let sum = 0;
  document.querySelectorAll('.talloc-inp').forEach((i) => (sum += parseFloat(i.value) || 0));
  const lbl = document.getElementById('targetSumLbl');
  lbl.textContent = 'รวม: ' + sum.toFixed(1) + '%';
  lbl.className = Math.abs(sum - 100) < 0.05 ? 'pos fw' : sum > 100 ? 'neg fw' : 'tm';
}
async function saveTargetAlloc() {
  const alloc = {};
  document.querySelectorAll('[data-row]').forEach((row) => {
    const s = row.getAttribute('data-row');
    alloc[s] = parseFloat(row.querySelector('.talloc-inp').value) || 0;
  });
  try {
    await API.saveTargetAlloc(alloc);
    toast('✅ บันทึกเป้าหมายสัดส่วนพอร์ตสำเร็จ');
    await renderRebalTbl(false);
  } catch (e) { toast(errMsg(e), 'danger'); }
}
async function saveDcaSettings() {
  const budget = parseFloat(document.getElementById('dcaBudget').value) || 0;
  const vol = parseFloat(document.getElementById('dcaVol').value) || 0;
  try {
    await API.saveDcaConfig({ budget, vol });
    toast('✅ บันทึกงบ DCA สำเร็จ');
    await renderRebalTbl(false);
  } catch (e) { toast(errMsg(e), 'danger'); }
}
function sigBadgeClass(sig) {
  if (sig.startsWith('SELL')) return 'b-sell';
  if (sig.startsWith('STRONG BUY') || sig.startsWith('BUY')) return 'b-buy';
  if (sig.startsWith('DCA')) return 'b-div';
  return 'b-other';
}
async function renderRebalTbl(fetchLive) {
  const wrap = document.getElementById('rebalTbl');
  const btn = document.getElementById('btnFetchLive');
  if (fetchLive && btn) { btn.disabled = true; btn.innerHTML = '<span class="spin">📡</span> กำลังดึงข้อมูล...'; }
  wrap.innerHTML = '<div class="loading-inline">⏳ กำลังคำนวณ...</div>';

  // Manual RSI/P-E overrides typed into the table on a previous render (kept across
  // re-render so the user doesn't lose what they typed when clicking "recalculate").
  const overrides = {};
  document.querySelectorAll('[data-rsi-for]').forEach((inp) => {
    const s = inp.getAttribute('data-rsi-for');
    overrides[s] = overrides[s] || {};
    if (inp.value !== '') overrides[s].rsi = inp.value;
  });
  document.querySelectorAll('[data-pe-for]').forEach((inp) => {
    const s = inp.getAttribute('data-pe-for');
    overrides[s] = overrides[s] || {};
    if (inp.value !== '') overrides[s].pe = inp.value;
  });

  try {
    const data = await API.rebalance(fetchLive, overrides);
    curRebalRows = data.rows;
    if (!data.rows.length) {
      wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">🎯</div><p>${data.message || 'กรุณาตั้งเป้าหมายสัดส่วนพอร์ตก่อน'}</p></div>`;
      return;
    }
    wrap.innerHTML = `<table>
     <thead><tr><th>สัญลักษณ์</th><th>ประเภท</th><th class="td-r">สัดส่วนปัจจุบัน</th><th class="td-r">เป้าหมาย</th><th class="td-r">ส่วนต่าง</th><th class="td-r">RSI</th><th class="td-r">P/E</th><th class="td-r">แนะนำซื้อเดือนนี้</th><th>สัญญาณ</th></tr></thead>
     <tbody>${data.rows.map((r) => `<tr>
       <td class="mono">${r.symbol}${r.ticker ? `<span class="ticker-chip">${r.ticker}</span>` : ''}</td>
       <td style="font-size:12px">${r.assetType}</td>
       <td class="td-r">${r.currentPct.toFixed(2)}%</td>
       <td class="td-r">${r.targetPct.toFixed(2)}%</td>
       <td class="td-r ${r.diffPct < 0 ? 'neg' : 'pos'}">${r.diffPct >= 0 ? '+' : ''}${r.diffPct.toFixed(2)}%</td>
       <td class="td-r">${r.indicators && r.indicators.rsi != null
        ? `${r.indicators.rsi.toFixed(1)}<span class="live-badge">LIVE</span>`
        : `<input type="number" data-rsi-for="${r.symbol}" step="any" min="0" max="100" style="width:70px;padding:5px;border:1.5px solid var(--brown-light);border-radius:6px;text-align:right" onchange="renderRebalTbl(false)" />`}
       </td>
       <td class="td-r">${r.indicators && r.indicators.pe != null
        ? `${r.indicators.pe.toFixed(1)}<span class="live-badge">LIVE</span>`
        : `<input type="number" data-pe-for="${r.symbol}" step="any" min="0" style="width:70px;padding:5px;border:1.5px solid var(--brown-light);border-radius:6px;text-align:right" onchange="renderRebalTbl(false)" />`}
       </td>
       <td class="td-r fw">$${fmt(r.suggestBuy)}</td>
       <td><span class="badge ${sigBadgeClass(r.signal)}" title="${r.note}">${r.signal}</span></td>
     </tr>`).join('')}</tbody>
     <tfoot><tr class="rpt-total-row"><td colspan="7" style="text-align:right;padding:10px 12px">งบ DCA ที่ใช้${data.volAdjusted ? ' (ปรับเพิ่มตามความผันผวน)' : ''}</td><td class="td-r fw" colspan="2">$${fmt(data.budgetUsed)}</td></tr></tfoot>
     </table>
     <p class="tm" style="font-size:11px;padding:10px 16px">ℹ️ สัญลักษณ์ที่มี Yahoo Finance Ticker (ตั้งค่าตอนบันทึกธุรกรรม) จะดึง RSI/MACD/EMA26/P-E สดได้เมื่อกด "ดึงข้อมูลตลาดสด" — ที่เหลือกรอก RSI/P-E เองได้ (ไม่บังคับ)</p>`;
  } catch (e) {
    wrap.innerHTML = `<div class="api-error-banner">${errMsg(e)}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '📡 ดึงข้อมูลตลาดสด (RSI/MACD/EMA/P-E)'; }
  }
}

// ====== DASHBOARD CHART (มูลค่าพอร์ตย้อนหลัง) ======
let dashChartInstance = null;
async function captureSnapshot() {
  const btn = document.getElementById('btnCaptureSnap');
  btn.disabled = true; btn.textContent = '⏳ กำลังบันทึก...';
  try {
    await API.captureSnapshot(new Date().toISOString().slice(0, 10));
    toast('✅ บันทึกมูลค่าพอร์ตวันนี้สำเร็จ');
    await loadDashChart();
  } catch (e) {
    toast(errMsg(e), 'danger');
  } finally {
    btn.disabled = false; btn.textContent = '📸 บันทึกมูลค่าพอร์ตวันนี้';
  }
}
async function loadDashChart() {
  const wrap = document.getElementById('dashChartWrap');
  const empty = document.getElementById('dashChartEmpty');
  try {
    const data = await API.listSnapshots(365);
    if (!data.series.length || data.series.length < 2) {
      wrap.style.display = 'none'; empty.style.display = 'block';
      if (dashChartInstance) { dashChartInstance.destroy(); dashChartInstance = null; }
      return;
    }
    wrap.style.display = 'block'; empty.style.display = 'none';
    renderDashChart(data.series);
  } catch { /* non-fatal — dashboard still works without history */ }
}
function renderDashChart(series) {
  const ctx = document.getElementById('dashChart').getContext('2d');
  const labels = series.map((s) => fmtDS(s.date));
  const values = series.map((s) => s.portfolioValue);
  if (dashChartInstance) dashChartInstance.destroy();
  dashChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'มูลค่าพอร์ต',
        data: values,
        borderColor: '#7A5C3E',
        backgroundColor: 'rgba(122,92,62,0.08)',
        borderWidth: 2.5,
        pointRadius: 2,
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
        y: { ticks: { callback: (v) => '$' + Number(v).toLocaleString('th-TH') } },
      },
    },
  });
}
function renderDashStatsPanel(d) {
  document.getElementById('dashStatsPanel').innerHTML = `
   <div><div class="tm" style="font-size:12px">มูลค่าต้นทุนรวม</div><div class="fw" style="font-size:19px">$${fmt(d.totalCost)}</div></div>
   <div><div class="tm" style="font-size:12px">มูลค่าปัจจุบัน</div><div class="fw" style="font-size:19px">$${fmt(d.totalMV)}</div></div>
   <div><div class="tm" style="font-size:12px">กำไร/ขาดทุนยังไม่รับรู้</div><div class="fw ${d.unrealizedPL >= 0 ? 'pos' : 'neg'}" style="font-size:19px">$${fmt(d.unrealizedPL)} <span style="font-size:13px">(${d.unrealizedPct.toFixed(2)}%)</span></div></div>
   <div><div class="tm" style="font-size:12px">กำไรรับรู้แล้ว (ปีนี้)</div><div class="fw ${d.realizedThisYear >= 0 ? 'pos' : 'neg'}" style="font-size:19px">$${fmt(d.realizedThisYear)}</div></div>`;
}

// ====== TAX ======
function initTaxPage() {
  document.getElementById('taxYear').value = new Date().getFullYear() + 543;
  loadTaxReport();
}
async function loadTaxReport() {
  const beY = parseInt(document.getElementById('taxYear').value, 10);
  const out = document.getElementById('taxOut');
  if (!beY) return;
  out.innerHTML = '<div class="loading-inline">⏳ กำลังคำนวณ...</div>';
  try {
    const data = await API.taxReport(beY);
    const rowsHtml = data.rows.map((v) => `<tr>
      <td>${v.assetType}</td>
      <td class="td-r ${v.realized >= 0 ? 'pos' : 'neg'} fw">$${fmt(v.realized)}</td>
      <td class="td-r">$${fmt(v.div)}</td>
      <td class="td-r">$${fmt(v.int)}</td>
      <td class="td-r">$${fmt(v.taxOnGain)}</td>
      <td class="td-r">$${fmt(v.whtDiv + v.whtInt)}</td>
      <td><span class="badge ${(v.taxOnGain > 0) ? 'b-taxed' : 'b-exempt'}">${v.gainNote}</span></td>
    </tr>`).join('');
    out.innerHTML = `
     <div class="stats-grid">
      <div class="stat-card ${data.totals.realized >= 0 ? 'green' : 'red'}"><div class="stat-label">กำไรรับรู้สุทธิ (จากการขาย)</div><div class="stat-value ${data.totals.realized >= 0 ? 'pos' : 'neg'}" style="font-size:18px">$${fmt(data.totals.realized)}</div></div>
      <div class="stat-card blue"><div class="stat-label">เงินปันผลรวม</div><div class="stat-value" style="font-size:18px">$${fmt(data.totals.div)}</div></div>
      <div class="stat-card"><div class="stat-label">ดอกเบี้ยรวม</div><div class="stat-value" style="font-size:18px">$${fmt(data.totals.int)}</div></div>
      <div class="stat-card orange"><div class="stat-label">ภาระภาษี/หัก ณ ที่จ่าย โดยประมาณ</div><div class="stat-value" style="font-size:18px">$${fmt(data.totals.tax)}</div></div>
     </div>
     <div class="card" style="padding:0"><div class="tbl-wrap">
     <table><thead><tr><th>ประเภทสินทรัพย์</th><th class="td-r">กำไร(ขาดทุน)รับรู้</th><th class="td-r">เงินปันผล</th><th class="td-r">ดอกเบี้ย</th><th class="td-r">ภาษีกำไร</th><th class="td-r">ภาษีหัก ณ ที่จ่าย</th><th>สถานะภาษี</th></tr></thead>
     <tbody>${rowsHtml || '<tr><td colspan="7" class="empty-state">ไม่มีข้อมูลในปีนี้</td></tr>'}</tbody></table>
     </div></div>`;
  } catch (e) {
    out.innerHTML = `<div class="api-error-banner">${errMsg(e)}</div>`;
  }
}

// ====== USERS ======
async function loadUsers() {
  const wrap = document.getElementById('usersTbl');
  wrap.innerHTML = '<div class="loading-inline">⏳ กำลังโหลด...</div>';
  try {
    const { users } = await API.users();
    if (!users.length) { wrap.innerHTML = '<div class="empty-state">ไม่มีผู้ใช้</div>'; return; }
    wrap.innerHTML = `<table>
      <thead><tr><th>#</th><th>ชื่อ</th><th>ชื่อผู้ใช้</th><th>บทบาท</th><th class="td-c">จัดการ</th></tr></thead>
      <tbody>${users.map((u, i) => `<tr>
        <td class="td-c tm">${i + 1}</td>
        <td class="fw">${u.name}</td>
        <td class="mono">${u.username}</td>
        <td><span class="badge ${u.role === 'owner' ? 'b-owner' : 'b-staff'}">${u.role === 'owner' ? '🔑 เจ้าของ' : '👤 Staff'}</span></td>
        <td class="td-c"><div style="display:flex;gap:6px;justify-content:center">
          <button class="btn btn-outline btn-sm" onclick="openEditUser('${u.id}')">✏️ แก้ไข</button>
          ${u.id !== 'u001' ? `<button class="btn btn-danger btn-sm" onclick="delUser('${u.id}')">🗑️</button>` : ''}
        </div></td>
      </tr>`).join('')}</tbody>
    </table>`;
    window._usersCache = users;
  } catch (e) {
    wrap.innerHTML = `<div class="api-error-banner">${errMsg(e)}</div>`;
  }
}
function openAddUser() {
  editUId = null;
  document.getElementById('mUserTitle').textContent = '+ เพิ่มผู้ใช้';
  ['uName', 'uUser', 'uPass'].forEach((id) => (document.getElementById(id).value = ''));
  document.getElementById('uRole').value = 'staff';
  openM('mUser');
}
function openEditUser(id) {
  const u = (window._usersCache || []).find((x) => x.id === id); if (!u) return;
  editUId = id;
  document.getElementById('mUserTitle').textContent = '✏️ แก้ไขผู้ใช้';
  document.getElementById('uName').value = u.name;
  document.getElementById('uUser').value = u.username;
  document.getElementById('uPass').value = '';
  document.getElementById('uRole').value = u.role;
  openM('mUser');
}
async function saveUser() {
  const name = document.getElementById('uName').value.trim();
  const username = document.getElementById('uUser').value.trim();
  const password = document.getElementById('uPass').value;
  const role = document.getElementById('uRole').value;
  if (!name || !username) { toast('กรุณากรอกชื่อและชื่อผู้ใช้', 'danger'); return; }
  try {
    if (editUId) {
      await API.updateUser(editUId, { name, username, role, password: password || undefined });
    } else {
      if (!password) { toast('กรุณากรอกรหัสผ่าน', 'danger'); return; }
      await API.createUser({ name, username, role, password });
    }
    closeM('mUser'); await loadUsers(); toast('✅ บันทึกสำเร็จ');
  } catch (e) { toast(errMsg(e), 'danger'); }
}
async function delUser(id) {
  if (!confirm('ต้องการลบผู้ใช้นี้?')) return;
  try {
    await API.deleteUser(id); await loadUsers(); toast('✅ ลบสำเร็จ');
  } catch (e) { toast(errMsg(e), 'danger'); }
}

// ====== SETTINGS ======
async function loadSettings() {
  try {
    const { settings } = await API.settings();
    document.getElementById('stName').value = settings.name || '';
    document.getElementById('stAddr').value = settings.address || '';
    document.getElementById('stTax').value = settings.taxId || '';
  } catch (e) { toast(errMsg(e), 'danger'); }
  await renderTaxRatesForm();
}
async function saveSettings() {
  try {
    await API.saveSettings({
      name: document.getElementById('stName').value.trim(),
      address: document.getElementById('stAddr').value.trim(),
      taxId: document.getElementById('stTax').value.trim(),
    });
    const name = document.getElementById('stName').value.trim();
    if (name) document.getElementById('sbCo').textContent = name;
    toast('✅ บันทึกการตั้งค่าสำเร็จ');
  } catch (e) { toast(errMsg(e), 'danger'); }
}
async function renderTaxRatesForm() {
  const el = document.getElementById('taxRatesForm');
  el.innerHTML = '<div class="loading-inline">⏳ กำลังโหลด...</div>';
  try {
    const { rates } = await API.taxRates();
    taxRatesCache = rates;
    el.innerHTML = ASSET_TYPES.map((a) => {
      const r = rates[a] || { gainRate: 0, divRate: 0, intRate: 0 };
      return `<div style="padding:10px 0;border-bottom:1px solid var(--cream-dark)">
        <div class="fw" style="font-size:13px;margin-bottom:6px">${a}</div>
        <div class="f-row three">
         <div class="form-group" style="margin-bottom:0"><label class="form-label">ภาษีกำไร %</label><input type="number" step="any" class="form-control" id="tr_${a}_gain" value="${r.gainRate}" /></div>
         <div class="form-group" style="margin-bottom:0"><label class="form-label">หัก ณ ที่จ่ายปันผล %</label><input type="number" step="any" class="form-control" id="tr_${a}_div" value="${r.divRate}" /></div>
         <div class="form-group" style="margin-bottom:0"><label class="form-label">หัก ณ ที่จ่ายดอกเบี้ย %</label><input type="number" step="any" class="form-control" id="tr_${a}_int" value="${r.intRate}" /></div>
        </div>
       </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = `<div class="api-error-banner">${errMsg(e)}</div>`;
  }
}
async function saveTaxRates() {
  const rates = taxRatesCache ? JSON.parse(JSON.stringify(taxRatesCache)) : {};
  ASSET_TYPES.forEach((a) => {
    rates[a] = rates[a] || {};
    rates[a].gainRate = parseFloat(document.getElementById('tr_' + a + '_gain').value) || 0;
    rates[a].divRate = parseFloat(document.getElementById('tr_' + a + '_div').value) || 0;
    rates[a].intRate = parseFloat(document.getElementById('tr_' + a + '_int').value) || 0;
  });
  try {
    await API.saveTaxRates(rates);
    toast('✅ บันทึกอัตราภาษีสำเร็จ');
  } catch (e) { toast(errMsg(e), 'danger'); }
}

// ====== START ======
initApp();
