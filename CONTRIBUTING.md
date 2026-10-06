# Developer and API Guide

คู่มือสำหรับตั้งค่าและรันระบบในเครื่อง รวมถึง architecture, configuration, API และการทดสอบของ Investment Tracker

## Commit Message Convention

ใช้รูปแบบ conventional commits เพื่อให้ชัดเจนว่าการเปลี่ยนแปลงเป็นประเภทใด:

```text
<type>(<scope>): <subject>
```

ตัวอย่าง:

```text
fix(portfolio): include snapshot cash in dashboard NAV
feat(transactions): support cash deposits and withdrawals
test(dashboard): add snapshot fallback regression
```

- `type` ใช้ `feat`, `fix`, `docs`, `test`, `refactor`, `chore`
- `scope` เป็นส่วนที่เปลี่ยน เช่น `portfolio`, `transactions`, `dashboard`, `snapshots`
- `subject` ควรเป็นคำสั่งในปัจจุบันและไม่ขึ้นต้นด้วยสรรพนาม
- ถ้าต้องอธิบายเพิ่มเติม ใส่ body พร้อม bullet list และระบุ issue/PR ถ้ามี

## Local Development

ต้องใช้ Node.js `>=22.5.0` และ npm อินเทอร์เน็ตจำเป็นสำหรับดึงข้อมูล Yahoo Finance

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

รายละเอียด endpoint และ API contracts ทั้งหมดอยู่ใน [เอกสาร API Gateway](docs/API-GATEWAY.md)

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

ก่อนเริ่มครั้งแรก ให้ตั้ง `JWT_SECRET` เป็นค่าสุ่มที่ยาว และกำหนด `SEED_ADMIN_PASSWORD` ใน `.env` ค่า seed เริ่มต้นคือ `admin` / `admin1234` หากไม่ได้กำหนดค่าอื่น; เปลี่ยนรหัสผ่านก่อนใช้งานจริง

### Start the Frontend

เปิด PowerShell อีกหน้าต่างจากโฟลเดอร์โปรเจกต์:

```powershell
cd frontend
npx serve .
```

เปิด URL ที่คำสั่งแสดงแล้วเข้าสู่ระบบ Frontend เป็น static site ไม่มี build step หาก backend ใช้ host หรือ port อื่น ให้ตั้ง `window.API_BASE_URL` ใน `frontend/index.html` และเพิ่ม frontend origin ใน `CORS_ORIGINS` ของ backend

## Architecture

```text
backend/
  src/
    config/smartDcaV2.js
    data/historicalStatements.js
    middleware/auth.js
    routes/                 auth, transactions, holdings, dca,
                            smartDcaV2, settings, market, snapshots
    services/                portfolio, market data, indicators
      smartDcaV2/            scoring, risk, allocation, projection
  test/
frontend/
  index.html
  css/style.css
  js/api.js
  js/app.js
```

Frontend เรียก REST API ด้วย JWT authentication; SQLite ใช้ `node:sqlite` ที่มากับ Node.js ไม่ต้องติดตั้ง native database module ฐานข้อมูลเริ่มต้นอยู่ที่ `backend/data/investment.db` และ historical snapshots จะถูก seed แบบ idempotent

## Configuration

ตั้งค่าใน `backend/.env` โดยดูค่าเริ่มต้นจาก [`backend/.env.example`](backend/.env.example)

| Variable | Purpose |
|---|---|
| `PORT` | API port; default `4000` |
| `JWT_SECRET` | Signing key สำหรับ JWT; ต้องเปลี่ยนก่อนใช้งานจริง |
| `JWT_EXPIRES_IN` | อายุ session; default `12h` |
| `DB_PATH` | ตำแหน่ง SQLite database |
| `CORS_ORIGINS` | comma-separated frontend origins |
| `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` | owner account ที่สร้างเมื่อยังไม่มีผู้ใช้ |
| `RSI_PERIOD`, `MACD_*`, `EMA_PERIOD`, `VOL_WINDOW` | พารามิเตอร์คำนวณ indicators และ volatility |
| `DATA_PERIOD` | ช่วงข้อมูลย้อนหลังจาก Yahoo Finance (`1mo`, `3mo`, `6mo`, `1y` หรือ `2y`) |
| `MARKET_CACHE_MINUTES` | อายุ cache ของ market data |

หมายเหตุ: `RSI_OVERSOLD`, `RSI_OVERBOUGHT`, `REBALANCE_TOLERANCE` และ `VOL_DCA_CAP` ยังอยู่ใน `.env.example` แต่ runtime ปัจจุบันไม่ได้อ่านตัวแปรเหล่านี้

## Troubleshooting

**Backend exits with `Missing JWT_SECRET`**

ตรวจว่ามี `backend/.env` และกำหนด `JWT_SECRET` แล้ว

**Frontend ติดต่อ API ไม่ได้**

ตรวจว่า backend ทำงานที่ port ใน `PORT`, ค่า `window.API_BASE_URL` ใน `frontend/index.html` ถูกต้อง และ origin ของหน้าเว็บอยู่ใน `CORS_ORIGINS`

**ข้อมูลตลาดไม่อัปเดต**

Yahoo Finance อาจจำกัดการเรียกหรือไม่มีข้อมูลสำหรับ ticker นั้น ระบบจะ fallback ไปใช้ cache/manual data และ Smart-DCA ใช้ `REVIEW` เมื่อข้อมูลไม่พอ

ราคา quote จาก API ใช้สกุลเงินของ ticker โดยตรง การ refresh ราคาหุ้นไทยจากหน้า Holdings จะแปลงเป็น USD ก่อนบันทึก แต่ Smart-DCA `fetchLive=true` ยังไม่แปลง FX; ให้หลีกเลี่ยงการใช้ flow หลังกับหุ้นไทยจนกว่าจะมีการแก้ไข

## Endpoint Index

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | No | API health check |
| `POST` | `/auth/login` | No | Sign in and issue JWT |
| `GET` | `/auth/me` | Yes | Current user |
| `GET` | `/transactions` | Yes | List/filter transactions |
| `GET` | `/transactions/brokers` | Yes | Broker suggestions |
| `POST` | `/transactions` | Yes | Create transaction |
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
| `GET` | `/market/quote/:ticker` | Yes | Fetch the current market quote |
| `PUT` | `/market/fx-rates` | Yes | Save current currency-per-USD rates |
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

`POST /transactions` requires `action` and positive `qty`; security transactions also require `assetType` and `symbol`. Allowed actions are `ซื้อ`, `ขาย`, `ปันผล`, `ดอกเบี้ย`, `ฝากเงิน`, and `ถอนเงิน`. `currency` defaults to USD; `fxRate` is optional and, if supplied, is USD per one unit of that currency. If omitted, the backend uses the latest rate saved by `PUT /market/fx-rates`; it returns `400` when no saved rate exists. The transaction endpoint does not fetch live quotes. Amounts, fees, and taxes use the selected transaction currency. Cash entries are stored with their original currency and revalued for dashboard USD totals using the latest saved FX rates. `netTotalInvested` uses the rate saved on the transaction.

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

`GET /market/indicators/:ticker` returns `{ "data": { "ticker", "price", "rsi", "macd", "signal", "ema26", "volatility", "historicalGrowth", "pe", "fetchedAt" } }`. Add `?refresh=true` to bypass the fresh cache. `GET /market/quote/:ticker` returns `{ "quote": { "ticker", "price" } }` using a current quote. The frontend calls this endpoint only from **↻ Fetch all current prices**, not on currency selection or transaction save. If no usable data is available, returns `502`. `PUT /market/fx-rates` accepts `{ "rates": { "THB": 36.5, "EUR": 0.92 } }`, where each rate is currency units per USD. The refresh action saves FX quotes here, converts Thai stock prices to USD, and recalculates dashboard cash and snapshots.

## Portfolio Snapshots

`GET /snapshots?days=365` returns `series`, `portfolioMetrics`, `benchmarkMetrics`, and `benchmarkTicker`. Portfolio values and historical statement snapshots are stored in USD; captured snapshots also retain cash balances by native currency for later revaluation. `days` defaults to 365.

`POST /snapshots/capture` accepts optional `{ "date": "YYYY-MM-DD", "benchmarkTicker": "SPY" }`. It uses the latest saved FX rates. Re-capturing a date overwrites that date's snapshot. Returns `201 { "snapshot": {...} }`; returns `400` when there is no portfolio value to capture.

`DELETE /snapshots/:date` deletes a snapshot by `YYYY-MM-DD` date and returns `{ "ok": true }`, or `404` if it does not exist.

## Error Responses

Most API errors use `{ "error": "..." }`.

| Status | Meaning |
|---|---|
| `400` | Invalid or missing request data / business rule rejected |
| `401` | Missing, invalid, or expired JWT |
| `403` | Authenticated user lacks owner permission |
| `404` | Requested transaction or snapshot not found |
| `502` | Market data could not be fetched |
| `500` | Unexpected server error |

## Tests

Run backend tests from `backend`:

```powershell
node --test test/*.test.js
```
