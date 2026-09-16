// ====== APP STATE ======
let editTxId = null;
let curTxFiltered = [];
let ASSET_TYPES = ['หุ้นไทย', 'หุ้นต่างประเทศ', 'กองทุนรวม', 'คริปโต', 'ทองคำ', 'พันธบัตร/ตราสารหนี้', 'อื่นๆ'];

function fmt(value) {
  return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQ(value) {
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 8 });
}

function fmtDS(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? String(value || '') : date.toLocaleDateString('th-TH');
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
  await renderSmartDcaV2(false);
}
async function renderTargetAllocForm() {
  let alloc = {}, holdings = [];
  try {
    [{ targetAlloc: alloc }, { holdings }] = await Promise.all([API.targetAlloc(), API.holdings()]);
  } catch (e) { toast(errMsg(e), 'danger'); }
  const symbols = Array.from(new Set([...Object.keys(alloc), ...holdings.map((h) => h.symbol)]));
  const el = document.getElementById('targetAllocForm');
  if (!symbols.length) { el.innerHTML = '<p class="tm" style="font-size:13px;padding:8px 0">ยังไม่มีสินทรัพย์</p>'; updateTargetSum(); return; }
  el.innerHTML = symbols.map((s) => `<div style="display:flex;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid var(--cream-dark)" data-row="${s}">
    <span class="mono" style="width:90px">${s}</span>
    <input type="number" step="any" min="0" max="100" class="form-control talloc-inp" style="max-width:110px" value="${alloc[s] != null ? alloc[s] : 0}" oninput="updateTargetSum()" />
    <span class="tm" style="font-size:12px">%</span>
    <button class="btn btn-outline btn-sm" style="margin-left:auto" onclick="this.closest('[data-row]').remove();updateTargetSum()">🗑️</button>
  </div>`).join('');
  updateTargetSum();
}
async function addTargetRow() {
  const input = prompt('สัญลักษณ์สินทรัพย์ที่ต้องการเพิ่มเป้าหมาย');
  if (!input) return;
  const { targetAlloc } = await API.targetAlloc();
  targetAlloc[input.trim().toUpperCase()] ??= 0;
  await API.saveTargetAlloc(targetAlloc);
  await renderTargetAllocForm();
}
function updateTargetSum() {
  const sum = Array.from(document.querySelectorAll('.talloc-inp')).reduce((total, input) => total + (parseFloat(input.value) || 0), 0);
  const label = document.getElementById('targetSumLbl');
  if (label) { label.textContent = 'รวม: ' + sum.toFixed(1) + '%'; label.className = Math.abs(sum - 100) < 0.05 ? 'pos fw' : sum > 100 ? 'neg fw' : 'tm'; }
}
async function saveTargetAlloc() {
  const alloc = {};
  document.querySelectorAll('[data-row]').forEach((row) => { alloc[row.getAttribute('data-row')] = parseFloat(row.querySelector('.talloc-inp').value) || 0; });
  try { await API.saveTargetAlloc(alloc); toast('บันทึกเป้าหมายสัดส่วนพอร์ตสำเร็จ'); await renderSmartDcaV2(false); }
  catch (e) { toast(errMsg(e), 'danger'); }
}
async function saveDcaSettings() {
  const budget = parseFloat(document.getElementById('dcaBudget').value) || 0;
  const vol = parseFloat(document.getElementById('dcaVol').value) || 0;
  try {
    await API.saveDcaConfig({ budget, vol });
    toast('✅ บันทึกงบ DCA สำเร็จ');
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
  wrap.innerHTML = '<div class="loading-inline">⏳ กำลังคำนวณ Smart-DCA v2...</div>';
  try {
    const data = await API.smartDcaV2(budget, fetchLive);
    const risk = data.risk;
    const riskText = `Risk: ${risk.level} | Score: ${risk.score} | Gate: ${risk.gate}`;
    const notInTargetHtml = data.notInTarget?.length
      ? `<div style="padding:12px 16px;border-top:1px solid var(--cream-dark)"><div class="fw" style="margin-bottom:8px">NOT IN TARGET</div><div class="tm" style="font-size:12px">หุ้นที่ถืออยู่แต่ไม่มี Target จะไม่ถูกจัดสรร DCA อัตโนมัติ และไม่มีการขายอัตโนมัติ</div>${data.notInTarget.map((stock) => `<div style="display:flex;justify-content:space-between;padding:7px 0"><span class="mono">${stock.ticker}</span><span>${(stock.currentWeight * 100).toFixed(2)}% · ${stock.action}</span></div>`).join('')}</div>`
      : '';
    wrap.innerHTML = `<div style="padding:12px 16px;border-bottom:1px solid var(--cream-dark);font-weight:600">${riskText}</div>
      <table><thead><tr><th>Ticker</th><th class="td-r">Current %</th><th class="td-r">Target %</th><th class="td-r">Hard Max %</th><th class="td-r">Score</th><th>Action</th><th class="td-r">DCA $</th><th>เหตุผล</th></tr></thead>
      <tbody>${data.stocks.map((stock) => `<tr>
        <td class="mono">${stock.ticker}</td>
        <td class="td-r">${(stock.currentWeight * 100).toFixed(2)}%</td>
        <td class="td-r">${(stock.targetWeight * 100).toFixed(2)}%</td>
        <td class="td-r">${(stock.hardMaxWeight * 100).toFixed(2)}%</td>
        <td class="td-r fw">${stock.compositeScore.toFixed(1)}</td>
        <td><span class="badge ${sigBadgeClass(stock.action)}">${stock.action}</span></td>
        <td class="td-r fw">$${fmt(stock.dcaAmount)}</td>
        <td style="font-size:12px" title="${stock.reasons.join(' | ')}">${stock.reasons.join(' · ')}</td>
      </tr>`).join('')}</tbody>
      <tfoot><tr class="rpt-total-row"><td colspan="6" style="text-align:right">จัดสรรรวม / เงินเหลือ</td><td class="td-r fw">$${fmt(data.summary.totalAllocated)}</td><td class="td-r">เหลือ $${fmt(data.summary.cashRemaining)}</td></tr></tfoot></table>${notInTargetHtml}`;
  } catch (e) {
    wrap.innerHTML = `<div class="api-error-banner">${errMsg(e)}</div>`;
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
    const historicalSeries = data.series.filter((point) => Number(point.portfolioValue) > 0);
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

// ====== SETTINGS ======
async function loadSettings() {
  try {
    const { settings } = await API.settings();
    document.getElementById('stName').value = settings.name || '';
    document.getElementById('stAddr').value = settings.address || '';
  } catch (e) { toast(errMsg(e), 'danger'); }
}
async function saveSettings() {
  try {
    await API.saveSettings({
      name: document.getElementById('stName').value.trim(),
      address: document.getElementById('stAddr').value.trim(),
      benchmarkTicker: 'SPY',
    });
    const name = document.getElementById('stName').value.trim();
    if (name) document.getElementById('sbCo').textContent = name;
    toast('✅ บันทึกการตั้งค่าสำเร็จ');
  } catch (e) { toast(errMsg(e), 'danger'); }
}
// ====== START ======
initApp();
