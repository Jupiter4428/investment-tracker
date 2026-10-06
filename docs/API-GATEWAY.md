# API Gateway Technical Reference

เอกสารนี้อธิบาย HTTP API ที่ backend เปิดใช้งานจาก `backend/src/server.js` ใช้เป็น contract สำหรับ frontend, scripts และผู้พัฒนาระบบ

## Runtime and Conventions

- Base URL เริ่มต้น: `http://localhost:4000/api` เปลี่ยน port ได้ด้วย `PORT`
- Request/response ใช้ JSON และ `Content-Type: application/json` ยกเว้น download ของ Smart-DCA training data
- วันที่ใช้รูปแบบ `YYYY-MM-DD`; `created_at`, `updated_at`, `capturedAt` เป็น Unix milliseconds เว้นแต่ระบุเป็น ISO timestamp
- จำนวนเงินที่กรอกใน transaction และค่าที่แสดงใน portfolio snapshot ใช้ USD เป็นหน่วยกลาง แอปไม่เก็บ currency แยกต่อ transaction
- Backend ใช้ SQLite; routes เข้าถึงฐานข้อมูลโดยตรงและมี error handler กลางสำหรับ unexpected errors
- CORS ใช้รายการ comma-separated จาก `CORS_ORIGINS`; ถ้าไม่กำหนด จะอนุญาตทุก origin

## Authentication and Authorization

ทุก endpoint ต้องใช้ JWT ยกเว้น `GET /api/health` และ `POST /api/auth/login` ส่ง token ใน header:

```http
Authorization: Bearer <token>
```

Login ออก token ที่มี claims `sub`, `username`, `role`, `name` อายุ token กำหนดด้วย `JWT_EXPIRES_IN` (default `12h`) ผู้ใช้มี role `owner` หรือ `staff`:

- `owner`: ใช้ endpoint ที่จำกัด owner ได้ทั้งหมด
- `staff`: ใช้ endpoint ทั่วไป แต่ถูกปฏิเสธด้วย `403` ใน endpoint owner-only

Endpoint owner-only: `PUT /api/settings` และ `GET /api/dca/v2/training-data`.

## Endpoint Index

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | No | Health check |
| POST | `/api/auth/login` | No | Sign in และรับ JWT |
| GET | `/api/auth/me` | Yes | ข้อมูลผู้ใช้ปัจจุบัน |
| GET | `/api/transactions` | Yes | รายการธุรกรรมและ filters |
| GET | `/api/transactions/brokers` | Yes | รายชื่อ broker ที่เคยใช้ |
| POST | `/api/transactions` | Yes | สร้างธุรกรรม |
| PUT | `/api/transactions/:id` | Yes | แก้ธุรกรรมบาง field |
| DELETE | `/api/transactions/:id` | Yes | ลบธุรกรรม |
| POST | `/api/transactions/preview-sell` | Yes | ประมาณ realized gain ของการขาย |
| GET | `/api/holdings` | Yes | Holdings และ market valuation |
| PUT | `/api/holdings/:symbol/price` | Yes | บันทึกราคาปัจจุบันของ symbol |
| GET | `/api/holdings/dashboard` | Yes | Dashboard totals และสรุปกิจกรรม |
| GET, PUT | `/api/dca/config` | Yes | อ่าน/บันทึกงบ DCA และ volatility |
| GET, PUT | `/api/dca/target-alloc` | Yes | อ่าน/แทนที่ target weights และ membership |
| GET | `/api/dca/v2` | Yes | คำนวณ Smart-DCA v2 และบันทึก training samples |
| GET | `/api/dca/v2/training-data` | Owner | ดาวน์โหลด training samples เป็น JSONL |
| GET, PUT | `/api/settings` | Yes / Owner | อ่าน settings / แก้ไข settings |
| GET | `/api/market/indicators/:ticker` | Yes | Market indicators และราคา |
| GET | `/api/market/quote/:ticker` | Yes | Quote ปัจจุบัน |
| GET | `/api/snapshots` | Yes | Historical portfolio/benchmark series |
| POST | `/api/snapshots/capture` | Yes | สร้างหรือแทน snapshot ของวัน |
| DELETE | `/api/snapshots/:date` | Yes | ลบ snapshot ของวัน |

## Health and Authentication

### `GET /api/health`

ไม่ต้องใช้ token

```json
{ "ok": true, "time": "2026-10-06T12:00:00.000Z" }
```

### `POST /api/auth/login`

Request:

```json
{ "username": "admin", "password": "<password>" }
```

Success `200`:

```json
{
  "token": "<jwt>",
  "user": { "id": "u001", "username": "admin", "role": "owner", "name": "System Admin" }
}
```

ขาด username/password คืน `400`; credentials ไม่ถูกต้องคืน `401`.

### `GET /api/auth/me`

Response `200`: `{ "user": { "id", "username", "role", "name" } }`. คืน `404` หาก user ใน token ไม่มีอยู่แล้ว

## Transactions

ทุก transaction response ใช้ field จาก SQLite แบบ `snake_case`: `id`, `date`, `asset_type`, `action`, `symbol`, `ticker`, `name`, `broker`, `qty`, `price`, `fee`, `note`, `created_by`, `created_at`.

### `GET /api/transactions`

Query parameters เป็น optional และใช้ร่วมกันแบบ AND:

| Query | Behavior |
|---|---|
| `q` | ค้น symbol หรือ name แบบ case-insensitive |
| `from`, `to` | กรองวันที่แบบ inclusive |
| `type` | ตรงกับ `asset_type` |
| `action` | ตรงกับ action |
| `broker` | ตรงกับ broker |

เรียงตาม `date DESC, id DESC`. Response: `{ "transactions": [...] }`.

### `GET /api/transactions/brokers`

Response: `{ "brokers": ["Dime", "Broker B"] }` เรียงตามตัวอักษรและไม่รวมค่าว่าง

### `POST /api/transactions`

Request ต้องมี `assetType`, `symbol`, `action` และ `qty > 0`; `action` ที่ schema รองรับคือ `ซื้อ`, `ขาย`, `ปันผล`, `ดอกเบี้ย`. Optional fields: `date`, `ticker`, `name`, `broker`, `price`, `fee`, `note`.

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

ส่ง `date` ปัจจุบันเมื่อไม่ระบุ, แปลง `symbol` เป็นตัวพิมพ์ใหญ่ และ default `price`/`fee` เป็น `0`. การขายจะถูกปฏิเสธด้วย `400` หากจำนวนที่ถือไม่พอ เมื่อสร้าง transaction ระบบอัปเดตตาราง `prices` ของ symbol ด้วย `price` จาก request ด้วย Success `201`: `{ "transaction": {...} }`.

### `PUT /api/transactions/:id`

รับ field ชุดเดียวกับการสร้างแบบ partial update; field ที่ละไว้คงค่าเดิม Success `200`: `{ "transaction": {...} }`; ไม่พบ ID คืน `404`.

### `DELETE /api/transactions/:id`

Success `200`: `{ "ok": true }`; ไม่พบ ID คืน `404`.

### `POST /api/transactions/preview-sell`

คำนวณประมาณการเท่านั้น ไม่บันทึกธุรกรรม Request: `{ "symbol": "AAPL", "qty": 1, "price": 220, "fee": 0.01 }`.

Response: `{ "avgCost": 200, "remainingQty": 3, "estimatedGain": 19.99 }`.

## Holdings and Dashboard

### `GET /api/holdings`

Response `{ "holdings": [...] }`. แต่ละ holding มี `assetType`, `symbol`, `ticker`, `name`, `qty`, `costBasis`, `realized`, `brokers`, `avgCost`, `currentPrice`, `marketValue`, `unrealizedPL`, `unrealizedPct`. ใช้ราคาจากตาราง `prices`; หากยังไม่มีราคา ใช้ average cost ต่อหน่วย

### `PUT /api/holdings/:symbol/price`

Request `{ "price": 123.45 }`. บันทึก/แทนราคาของ symbol และตอบ `{ "ok": true }`; ค่า price ที่แปลงเป็น `NaN` คืน `400`.

### `GET /api/holdings/dashboard`

Response fields: `totalCost`, `totalMV`, `unrealizedPL`, `unrealizedPct`, `realizedThisYear`, `divThisYear`, `assetCount`, `recentTransactions`, `byType`, `asOfDate`. เมื่อมี holdings ค่ามาจาก holdings ปัจจุบัน; เมื่อไม่มี holdings ใช้ snapshot ล่าสุดเป็น fallback

## DCA

### `GET /api/dca/config`

Response `{ "config": { "budget": 0, "vol": 0 } }`.

### `PUT /api/dca/config`

Request `{ "budget": 200, "vol": 0.2 }`; field ที่ไม่ส่งหรือแปลงไม่ได้ถูกแทนเป็น `0`. Response `{ "ok": true }`.

### `GET /api/dca/target-alloc`

Response:

```json
{
  "targetAlloc": { "AAPL": 40, "MSFT": 60 },
  "dcaSymbols": ["AAPL", "MSFT"]
}
```

หากยังไม่เคยกำหนด config จะคืน target defaults จาก Smart-DCA v2 และเลือก symbol ใน defaults ทั้งหมด

### `PUT /api/dca/target-alloc`

Request:

```json
{
  "targetAlloc": { "AAPL": 40, "MSFT": 60, "TSM": 0 },
  "dcaSymbols": ["AAPL", "MSFT"]
}
```

แทนที่รายการ target ทั้งหมดแบบ transaction เดียว ค่า target เป็น percentage; เมื่อไม่ส่ง `dcaSymbols` จะเลือกทุก symbol ใน `targetAlloc`. Response `{ "ok": true }`.

## Smart-DCA v2

### `GET /api/dca/v2`

Query parameters:

- `monthlyBudget`: งบคำนวณรอบนี้; หากไม่ส่งใช้ค่าที่บันทึกไว้หรือ default `200`
- `fetchLive=true`: ขอ market indicators สำหรับ holding ที่มี Yahoo ticker; นอกกรณีนี้ใช้ cache/ราคาที่บันทึกไว้

Response หลักประกอบด้วย:

- `portfolio`: `{ value, monthlyBudget }`
- `risk`: `{ level, score, concentration, infrastructure, drawdown, volatility, dataQuality, gate }`
- `stocks`: ผลต่อ symbol รวม `price`, `marketValue`, weights, `scores`, `compositeScore`, `status`, `action`, `dataValid`, `underweight`, `dcaAmount`, `reasons` และ market indicators ที่มี
- `notInTarget`: รายการที่ไม่มี target พร้อม `ticker`, `currentWeight`, `action`, `dcaAmount`
- `summary`: `{ totalAllocated, cashRemaining }`

Risk gate: `PASS`, `CAUTION`, `REVIEW`, `BLOCK`; action ที่ใช้กับ stock: `ACCUMULATE`, `BUY`, `DCA`, `HOLD`, `PAUSE`, `STOP_BUY`, `NOT_IN_TARGET`, `REVIEW`. ทุก request บันทึก training sample ของ stocks ที่คำนวณ

### `GET /api/dca/v2/training-data`

Owner-only download แบบ `application/x-ndjson`, filename `smart-dca-training.jsonl`; หนึ่ง JSON object ต่อบรรทัด มี `schemaVersion`, `runId`, `capturedAt`, `calculationMode`, `features`, `recommendation`, `outcome`.

## Settings

### `GET /api/settings`

Response `{ "settings": { "name": "", "address": "", "benchmarkTicker": "SPY" } }`.

### `PUT /api/settings`

Owner-only Request รองรับ `name`, `address`, `benchmarkTicker`; ค่า text ถูก trim และ ticker ถูกแปลงเป็น uppercase. หากไม่ส่ง ticker ค่าเดิมจะคงอยู่. Response `{ "ok": true }`.

## Market Data

### `GET /api/market/indicators/:ticker`

Response `{ "data": { "ticker", "price", "rsi", "macd", "signal", "ema26", "volatility", "historicalGrowth", "pe", "fetchedAt" } }`. Query `refresh=true` ข้าม fresh cache; หากดึงไม่ได้หรือไม่มีข้อมูลที่ใช้ได้คืน `502`.

### `GET /api/market/quote/:ticker`

ดึง quote ล่าสุดโดยตรง ไม่ใช้ indicator cache. Response `{ "quote": { "ticker": "THB=X", "price": 33.5 } }`; หาก quote ใช้ไม่ได้คืน `502`.

## Portfolio Snapshots

### `POST /api/snapshots/capture`

Request optional: `{ "date": "2026-10-06", "benchmarkTicker": "SPY" }`. ค่า default date คือวันปัจจุบันและ benchmark คือ setting `benchmarkTicker` หรือ `SPY`. คำนวณมูลค่าจาก transactions กับราคาที่บันทึกไว้; บันทึกไม่เกินหนึ่งแถวต่อวัน โดย capture ซ้ำจะเขียนทับวันเดิม

Response `201`:

```json
{
  "snapshot": {
    "date": "2026-10-06",
    "totalValue": 12500,
    "totalCost": 11000,
    "benchmarkTicker": "SPY",
    "benchmarkPrice": 500
  }
}
```

หากไม่มีมูลค่าพอร์ตคืน `400`. ดึง benchmark ไม่สำเร็จยังบันทึก snapshot ได้โดย `benchmarkPrice: null`.

### `GET /api/snapshots?days=365`

`days` default `365`. คืน `{ "series", "portfolioMetrics", "benchmarkMetrics", "benchmarkTicker" }`. แต่ละ series item มี `date`, `portfolioValue`, `totalCost`, `benchmarkValue`; benchmark ถูก normalize ให้เริ่มจาก portfolio value จุดแรก. Metrics มี `cumReturn`, `vol`, `sharpe`, `maxDrawdown`, `points`; ถ้าข้อมูลไม่พอ metrics คืนค่า 0 ตามจำนวน points

### `DELETE /api/snapshots/:date`

ลบ snapshot ตามวันที่ `YYYY-MM-DD`. Success `{ "ok": true }`; ไม่พบวันที่คืน `404`.

## Error Responses

Application errors ใช้ JSON `{ "error": "message" }`:

| Status | Meaning |
|---|---|
| `400` | Input ไม่ครบ/ไม่ถูกต้อง หรือ business rule ไม่ผ่าน |
| `401` | ไม่มี JWT, session หมดอายุ หรือ login ไม่ถูกต้อง |
| `403` | role ไม่มีสิทธิ์ owner |
| `404` | ไม่พบ resource |
| `500` | Unexpected backend error; global handler ส่ง `{ "error": "Internal server error" }` |
| `502` | Market quote/indicators ใช้งานไม่ได้ |

ไม่มี custom JSON 404 handler สำหรับ path ที่ไม่ตรง route; Express จะใช้ default not-found response
