# API Handbook

คู่มือ API สำหรับพัฒนาและทดสอบ backend ของ Investment Tracker

## Local Development

เริ่ม backend จากโฟลเดอร์ `backend`:

```powershell
npm install
Copy-Item .env.example .env
npm start
```

กำหนด `JWT_SECRET` และรหัสผ่าน seed owner ใน `.env` ก่อนเริ่มใช้งานครั้งแรก ค่าเริ่มต้นของ API คือ `http://localhost:4000`; เปลี่ยนได้ด้วย `PORT` และกำหนดตำแหน่ง SQLite ด้วย `DB_PATH`.

```text
Base URL: http://localhost:4000/api
Content-Type: application/json
```

ยกเว้น `GET /health` และ `POST /auth/login` ทุก endpoint ต้องแนบ JWT:

```http
Authorization: Bearer <token>
```

ตัวอย่าง PowerShell หลัง login:

```powershell
$base = 'http://localhost:4000/api'
$login = Invoke-RestMethod -Method Post -Uri "$base/auth/login" `
  -ContentType 'application/json' `
  -Body (@{ username = 'admin'; password = '<password>' } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.token)" }
Invoke-RestMethod -Uri "$base/holdings" -Headers $headers
```

## Endpoint Index

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | No | API health check |
| `POST` | `/auth/login` | No | Sign in and issue JWT |
| `GET` | `/auth/me` | Yes | Current user |
| `GET` | `/transactions` | Yes | List/filter transactions |
| `GET` | `/transactions/brokers` | Yes | Broker suggestions |
| `POST` | `/transactions` | Yes | Create transaction |
| `POST` | `/transactions/scan-slip` | Yes | OCR a supported slip image |
| `POST` | `/transactions/preview-sell` | Yes | Estimate sell gain |
| `PUT` | `/transactions/:id` | Yes | Update transaction |
| `DELETE` | `/transactions/:id` | Yes | Delete transaction |
| `GET` | `/holdings` | Yes | Holdings and current valuations |
| `PUT` | `/holdings/:symbol/price` | Yes | Set a manual price |
| `GET` | `/holdings/dashboard` | Yes | Dashboard totals and recent activity |
| `GET`, `PUT` | `/dca/config` | Yes | Read/write DCA budget configuration |
| `GET`, `PUT` | `/dca/target-alloc` | Yes | Read/write allocation targets and DCA membership |
| `GET` | `/dca/v2` | Yes | Calculate Smart-DCA v2 |
| `GET` | `/dca/v2/training-data` | Owner | Export training samples as JSONL |
| `GET` | `/settings` | Yes | Read profile settings |
| `PUT` | `/settings` | Owner | Update profile settings |
| `GET` | `/market/indicators/:ticker` | Yes | Fetch market indicators |
| `GET` | `/snapshots` | Yes | Read portfolio performance series |
| `POST` | `/snapshots/capture` | Yes | Capture/replace a date's portfolio snapshot |
| `DELETE` | `/snapshots/:date` | Yes | Delete a snapshot |

## Authentication

`POST /auth/login`

```json
{ "username": "admin", "password": "<password>" }
```

Success returns `{ "token": "...", "user": { "id", "username", "role", "name" } }`. Use the token as a Bearer token on authenticated routes. `GET /auth/me` returns `{ "user": { "id", "username", "role", "name" } }`.

Owner-only endpoints return `403` to staff accounts. Missing or invalid/expired tokens return `401`.

## Transactions

`GET /transactions` accepts optional query parameters:

| Query | Behavior |
|---|---|
| `q` | Case-insensitive symbol or name search |
| `from`, `to` | Inclusive date bounds (`YYYY-MM-DD`) |
| `type` | Exact asset type match |
| `action` | Exact action match |
| `broker` | Exact broker match |

Returns `{ "transactions": [...] }`. `GET /transactions/brokers` returns `{ "brokers": [...] }`.

`POST /transactions` requires `assetType`, `symbol`, `action`, and positive `qty`. Allowed actions are `ซื้อ`, `ขาย`, `ปันผล`, and `ดอกเบี้ย`. Optional fields: `date`, `ticker`, `name`, `broker`, `price`, `fee`, and `note`.

```json
{
  "date": "2026-10-06",
  "assetType": "หุ้นต่างประเทศ",
  "action": "ซื้อ",
  "symbol": "AAPL",
  "ticker": "AAPL",
  "name": "Apple Inc.",
  "broker": "Dime",
  "qty": 1.5,
  "price": 220,
  "fee": 0.01,
  "note": ""
}
```

Returns `201 { "transaction": {...} }`. A sell is rejected with `400` if current units are insufficient. New transactions also update the stored price for that symbol.

`PUT /transactions/:id` accepts the same fields as a partial update and returns `{ "transaction": {...} }`. `DELETE /transactions/:id` returns `{ "ok": true }`, or `404` when the ID does not exist.

`POST /transactions/preview-sell` accepts `{ "symbol": "AAPL", "qty": 1, "price": 220, "fee": 0.01 }` and returns `{ "avgCost", "remainingQty", "estimatedGain" }` without saving a transaction.

`POST /transactions/scan-slip` uses `multipart/form-data` with one file field named `slip`. Accepted formats are PNG, JPEG, and WebP, up to 8 MB. The response contains `fields`, `status`, `canSave`, `missing`, `currency`, and OCR `confidence`; OCR only fills a draft, so the client must review and separately call `POST /transactions` to save it. Unsupported slips return `status: "unsupported"`.

## Holdings, Prices, and Dashboard

- `GET /holdings` returns `{ "holdings": [...] }` with quantity, cost basis, current price, market value, and unrealized P/L.
- `PUT /holdings/:symbol/price` accepts `{ "price": 123.45 }` and returns `{ "ok": true }`.
- `GET /holdings/dashboard` returns portfolio totals, realized gain/dividend totals for the current year, asset count, recent transactions, values by asset type, and `asOfDate`.

## DCA and Smart-DCA

`GET /dca/config` returns `{ "config": { "budget": 0, "vol": 0 } }`. `PUT /dca/config` accepts `{ "budget": 200, "vol": 0.2 }` and returns `{ "ok": true }`.

`GET /dca/target-alloc` returns:

```json
{
  "targetAlloc": { "AAPL": 40, "MSFT": 60 },
  "dcaSymbols": ["AAPL", "MSFT"]
}
```

`PUT /dca/target-alloc` accepts the same shape. `targetAlloc` values are percentages; `dcaSymbols` identifies which assets participate in DCA. Returns `{ "ok": true }`.

`GET /dca/v2` accepts optional `monthlyBudget` and `fetchLive=true` query parameters, for example `/dca/v2?monthlyBudget=200&fetchLive=true`. It returns `portfolio`, `risk`, per-stock recommendations in `stocks`, `notInTarget`, and allocation `summary`. When live market data is unavailable, the backend falls back to cached market indicators and then stored prices where available. Each calculation stores one training sample per returned stock.

`GET /dca/v2/training-data` is owner-only and downloads `application/x-ndjson` (`smart-dca-training.jsonl`). Each line is a JSON object containing model input features, the generated recommendation, and an `outcome` field. Outcomes are currently `null`; they are not observed investment results.

## Settings and Market Data

`GET /settings` returns `{ "settings": { "name", "address", "benchmarkTicker" } }`. Owner-only `PUT /settings` accepts any of those fields and returns `{ "ok": true }`.

`GET /market/indicators/:ticker` returns `{ "data": { "ticker", "price", "rsi", "macd", "signal", "ema26", "volatility", "historicalGrowth", "pe", "fetchedAt" } }`. Add `?refresh=true` to bypass the fresh cache. If no usable data is available, returns `502`.

## Portfolio Snapshots

`GET /snapshots?days=365` returns `series`, `portfolioMetrics`, `benchmarkMetrics`, and `benchmarkTicker`. `days` defaults to 365.

`POST /snapshots/capture` accepts optional `{ "date": "YYYY-MM-DD", "benchmarkTicker": "SPY" }`. Re-capturing a date overwrites that date's snapshot. Returns `201 { "snapshot": {...} }`; returns `400` when there is no portfolio value to capture.

`DELETE /snapshots/:date` deletes a snapshot by `YYYY-MM-DD` date and returns `{ "ok": true }`, or `404` if it does not exist.

## Error Responses

Most API errors use `{ "error": "..." }`.

| Status | Meaning |
|---|---|
| `400` | Invalid or missing request data / business rule rejected |
| `401` | Missing, invalid, or expired JWT |
| `403` | Authenticated user lacks owner permission |
| `404` | Requested transaction or snapshot not found |
| `413` | Slip upload exceeds 8 MB |
| `502` | Market data could not be fetched |
| `500` | Unexpected server error |

## Tests

Run backend tests from `backend`:

```powershell
node --test test/*.test.js
```
