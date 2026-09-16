// ====== API CLIENT ======
// Talks to the backend (see backend/.env.example -> PORT). Configure the base URL
// below if the API isn't running on the same host at the default port.
const API_BASE = window.API_BASE_URL || 'http://localhost:4000/api';

const Auth = {
  get token() { return localStorage.getItem('it_token'); },
  set token(v) { v ? localStorage.setItem('it_token', v) : localStorage.removeItem('it_token'); },
  get me() { try { return JSON.parse(localStorage.getItem('it_me')) || null; } catch { return null; } },
  set me(v) { v ? localStorage.setItem('it_me', JSON.stringify(v)) : localStorage.removeItem('it_me'); },
};

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && Auth.token) headers.Authorization = 'Bearer ' + Auth.token;
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error('Could not reach the API (' + API_BASE + ') — make sure the backend is running');
  }
  if (res.status === 401) {
    Auth.token = null;
    Auth.me = null;
    if (location.hash !== '#login') {
      showLoginPage('Session expired. Please sign in again');
    }
    throw new Error('unauthorized');
  }
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

const API = {
  login: (username, password) => api('/auth/login', { method: 'POST', body: { username, password }, auth: false }),
  me: () => api('/auth/me'),

  listTx: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
    return api('/transactions' + (qs.toString() ? '?' + qs.toString() : ''));
  },
  listBrokers: () => api('/transactions/brokers'),
  createTx: (body) => api('/transactions', { method: 'POST', body }),
  updateTx: (id, body) => api('/transactions/' + id, { method: 'PUT', body }),
  deleteTx: (id) => api('/transactions/' + id, { method: 'DELETE' }),
  previewSell: (body) => api('/transactions/preview-sell', { method: 'POST', body }),

  holdings: () => api('/holdings'),
  dashboard: () => api('/holdings/dashboard'),
  updatePrice: (symbol, price) => api(`/holdings/${encodeURIComponent(symbol)}/price`, { method: 'PUT', body: { price } }),

  dcaConfig: () => api('/dca/config'),
  saveDcaConfig: (body) => api('/dca/config', { method: 'PUT', body }),
  targetAlloc: () => api('/dca/target-alloc'),
  saveTargetAlloc: (targetAlloc) => api('/dca/target-alloc', { method: 'PUT', body: { targetAlloc } }),
  smartDcaV2: (monthlyBudget, fetchLive = false) => api('/dca/v2?monthlyBudget=' + encodeURIComponent(monthlyBudget || 0) + (fetchLive ? '&fetchLive=true' : '')),

  settings: () => api('/settings'),
  saveSettings: (body) => api('/settings', { method: 'PUT', body }),

  marketIndicators: (ticker, refresh) => api(`/market/indicators/${encodeURIComponent(ticker)}${refresh ? '?refresh=true' : ''}`),

  captureSnapshot: (date, benchmarkTicker) => api('/snapshots/capture', { method: 'POST', body: { date, benchmarkTicker } }),
  listSnapshots: (days) => api('/snapshots?days=' + (days || 180)),
  deleteSnapshot: (date) => api('/snapshots/' + date, { method: 'DELETE' }),
};
