# API Gateway Technical Reference

เอกสารนี้อธิบาย HTTP API ที่ backend เปิดใช้งานจาก `backend/src/server.js` ใช้เป็น contract สำหรับ frontend, scripts และผู้พัฒนาระบบ

## Runtime and Conventions

- Base URL เริ่มต้น: `http://localhost:4000/api` เปลี่ยน port ได้ด้วย `PORT`
- Request/response ใช้ JSON และ `Content-Type: application/json` ยกเว้น download ของ Smart-DCA training data
- วันที่ใช้รูปแบบ `YYYY-MM-DD`; `created_at`, `updated_at`, `capturedAt` เป็น Unix milliseconds เว้นแต่ระบุเป็น ISO timestamp
- Transaction เก็บ `currency` และจำนวนเงินต้นฉบับ; `fx_rate` เป็น USD ต่อหนึ่งหน่วยสกุลเงิน ณ วันที่ทำรายการ. `prices`, `totalMV` และ `nav` แสดงเป็น USD
- Cash ledger และ snapshot เก็บยอดเงินสดแยกตามสกุลเงิน; `cashBalance`/`nav` แปลงยอดเหล่านั้นเป็น USD ด้วย FX rate ล่าสุด. `netTotalInvested` ยังคงใช้ FX rate ณ วันที่ฝาก/ถอน
- Market quote ใช้สกุลเงินตาม ticker และ API ไม่ทำ FX conversion อัตโนมัติ; หน้า Holdings แปลง quote หุ้นไทยก่อนบันทึก แต่ Smart-DCA `fetchLive=true` ยังบันทึกราคา indicator โดยตรง
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
| PUT | `/api/market/fx-rates` | Yes | บันทึก FX rates ล่าสุดสำหรับสถิติ |
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

ทุก transaction response ใช้ field แบบ `snake_case`: `id`, `date`, `asset_type`, `action`, `symbol`, `ticker`, `name`, `broker`, `qty`, `price`, `fee`, `tax`, `currency`, `fx_rate`, `note`, `created_by`, `created_at`. สำหรับรายการ non-USD ที่เพิ่มตรง SQLite และมี `fx_rate` เป็นค่า default `1`, `GET /api/transactions` ส่ง FX rate ล่าสุดที่บันทึกกลับเป็น fallback โดยไม่เขียนทับข้อมูลเดิม; dashboard ใช้ fallback เดียวกันกับ `netTotalInvested`. เนื่องจากระบบไม่ทราบเรทในวันที่ทำรายการ กรณีนี้จึงเป็นการประมาณ ไม่ใช่ FX rate ย้อนหลัง

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

หุ้นต้องมี `assetType`, `symbol`, `action` และ `qty > 0`; action ที่รองรับคือ `ซื้อ`, `ขาย`, `ปันผล`, `ดอกเบี้ย`, `ฝากเงิน`, `ถอนเงิน`. เงินเข้า/ออกใช้ `qty` เป็นจำนวนเงิน ไม่ต้องส่ง symbol/assetType และ backend จะบันทึกเป็นบัญชี `CASH` โดยมี price = 1. ค่าธรรมเนียม `fee` และภาษี `tax` เก็บแยกกัน โดยทั้งสองค่าต้องไม่ติดลบ.

`currency` default เป็น `USD`; `fxRate` เป็น optional และถ้าส่งมาจะหมายถึง USD ต่อหนึ่งหน่วยของ currency (ตัวอย่าง THB/USD = 0.0274). หากไม่ส่ง backend ใช้เรทล่าสุดที่บันทึกผ่าน `PUT /api/market/fx-rates`; ถ้ายังไม่มีเรทจะคืน `400` ให้กด **↻ Fetch all current prices** ก่อน. Endpoint บันทึก transaction ไม่เรียก quote API. Cash transaction คงจำนวนเงินในสกุลเดิมไว้สำหรับ ledger; dashboard แปลงยอด cash สุทธิเป็น USD ด้วยเรทล่าสุด. `netTotalInvested` ใช้ `fxRate` ที่บันทึกกับรายการ.

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
  "tax": 0,
  "note": ""
}
```

ต้องส่งวันที่ `YYYY-MM-DD`; ระบบแปลง `symbol` เป็นตัวพิมพ์ใหญ่และอัปเดตตาราง `prices` เฉพาะรายการหลักทรัพย์. การขายถูกปฏิเสธด้วย `400` หากจำนวนที่ถือไม่พอ. ตัวอย่างเงินฝาก: `{ "date":"2026-10-06", "action":"ฝากเงิน", "qty":100, "fee":0, "tax":0 }`. Success `201`: `{ "transaction": {...} }`.

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

Request `{ "price": 123.45 }`. บันทึก/แทนราคาของ symbol และตอบ `{ "ok": true }`; ค่า price ที่แปลงเป็น `NaN` คืน `400`. แอปตีความค่าที่บันทึกเป็น USD จึงต้องแปลงราคาตลาดสกุลอื่นก่อนเรียก endpoint นี้.

### `GET /api/holdings/dashboard`

Response fields: `totalCost`, `totalMV` (มูลค่าหุ้น), `cashBalance`, `nav` (หุ้น + เงินสด), `netTotalInvested` (เงินฝากลบเงินถอนนับจากวันที่เปิด cash ledger), `unrealizedPL`, `unrealizedPct`, `realizedThisYear`, `divThisYear`, `priceIrr`, `benchmarkTicker`, `benchmarkReturn`, `stockWinRate`, `assetCount`, `recentTransactions`, `byType`, `asOfDate`. Cash ledger เริ่มนับตั้งแต่เปิดใช้ schema ใหม่; ธุรกรรมเดิมไม่ถูกตีความเป็นรายการเงินสดโดยอัตโนมัติ จึงควรบันทึกยอดเงินสดคงเหลือ ณ วันเริ่มใช้งานเป็น Deposit เพื่อให้ NAV ตรงกับบัญชีจริง. `netTotalInvested` ก่อนวันเปิด ledger ไม่มีข้อมูลย้อนหลังและไม่ควรตีความเป็นเงินต้นสะสมตลอดอายุพอร์ต.

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

ดึง quote ล่าสุดโดยตรง ไม่ใช้ indicator cache และไม่แปลงสกุลเงิน. Response `{ "quote": { "ticker": "THB=X", "price": 33.5 } }`; `price` อยู่ในสกุลเงินที่ Yahoo Finance ใช้กับ ticker นั้น หาก quote ใช้ไม่ได้คืน `502`.

### `PUT /api/market/fx-rates`

บันทึกเรทในรูปแบบหน่วย currency ต่อ 1 USD เช่น `{ "rates": { "THB": 36.5, "EUR": 0.92 } }`. รองรับ `THB`, `EUR`, `JPY`, `GBP` และ `USD` (ซึ่งต้องเป็น `1`). Response `{ "rates": {...} }`.

ปุ่ม **↻ Fetch all current prices** บน Dashboard และ Holdings เป็นจุดเดียวที่ frontend ขอ live FX quotes: ส่งเรทผ่าน `PUT /api/market/fx-rates`, แปลงราคา ticker หุ้นไทยเป็น USD, บันทึกผ่าน `PUT /api/holdings/:symbol/price` และ capture snapshot เมื่อมีการอัปเดตราคา/FX. การเลือก currency และการ Save transaction ไม่เรียก quote API; transaction ใช้เรทล่าสุดที่บันทึกไว้. Snapshot เก็บ cash balances แยกสกุล จึงตีมูลค่า cash ใหม่ได้เมื่อเรท USD เปลี่ยน. ในทางกลับกัน `GET /api/dca/v2?fetchLive=true` บันทึกราคา indicator ที่ดึงมาโดยตรงโดยไม่แปลง FX จึงไม่ควรใช้ flow นี้ refresh ราคาหุ้นไทยในฐานข้อมูลที่แอปตีความเป็น USD.

## Portfolio Snapshots

### `POST /api/snapshots/capture`

Request optional: `{ "date": "2026-10-06", "benchmarkTicker": "SPY" }`. ค่า default date คือวันปัจจุบันและ benchmark คือ setting `benchmarkTicker` หรือ `SPY`. คำนวณมูลค่าจาก transactions, ราคาที่บันทึกไว้ และ FX rates ล่าสุด; บันทึกยอด cash แยกสกุลและไม่เกินหนึ่งแถวต่อวัน โดย capture ซ้ำจะเขียนทับวันเดิม

Response `201`:

```json
{
  "snapshot": {
    "date": "2026-10-06",
    "totalValue": 12500,
    "totalCost": 11000,
    "cashBalance": 1500,
    "cashBalances": { "USD": 1000, "THB": 18250 },
    "benchmarkTicker": "SPY",
    "benchmarkPrice": 500
  }
}
```

หากไม่มีมูลค่าพอร์ตคืน `400`. ดึง benchmark ไม่สำเร็จยังบันทึก snapshot ได้โดย `benchmarkPrice: null`.

### `GET /api/snapshots?days=365`

`days` default `365`. คืน `{ "series", "portfolioMetrics", "benchmarkMetrics", "benchmarkTicker" }`. แต่ละ series item มี `date`, `portfolioValue` (NAV), `totalCost`, `cashBalance`, `netTotalInvested`, `benchmarkValue`; benchmark ถูก normalize ให้เริ่มจาก NAV จุดแรก. ค่า benchmark เริ่มต้นคือ `^GSPC` (S&P 500 price index). Metrics มี `cumReturn`, `vol`, `sharpe`, `maxDrawdown`, `points`; ถ้าข้อมูลไม่พอ metrics คืนค่า 0 ตามจำนวน points

Endpoint นี้ส่ง snapshots ทั้งหมดในช่วงวันที่ที่ร้องขอโดยไม่กรองตามรอบรายเดือน. การเลือกจุดบนกราฟเป็น frontend behavior: snapshots และ marker ก่อนเดือน ต.ค. 2026 แสดงตามเดิม โดย `2026-09-30` ยังคงเป็น marker บนเส้นและเป็นจุดตั้งต้น; รอบ marker รายเดือนใหม่เริ่ม `2026-10-28` แล้วใช้วันที่ 28 ของแต่ละเดือน. Snapshot ล่าสุดตั้งแต่จุดเริ่มต้นจะแสดง marker ทึบแบบเดียวกับ `2026-09-30` ที่ปลายขวาสุดของกราฟ

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
