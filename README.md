# Smart-DCA v2 Investment Tracker

ระบบจัดการพอร์ตและวางแผน DCA แบบ full-stack ใช้ Node.js/Express, SQLite และหน้าเว็บ static โดย Smart-DCA v2 คำนวณการจัดสรรเงินใหม่จาก target allocation, ข้อจำกัดความเสี่ยง และข้อมูลตลาด

---

## Features

- Smart-DCA v2 พร้อมคะแนน 6 ปัจจัย: underweight, valuation, RSI, trend, MACD และ volatility
- Risk gate `PASS`, `CAUTION`, `REVIEW` และ `BLOCK`; ข้อมูลไม่ครบจะไม่จัดสรรเงิน
- `STOP_BUY` เมื่อถึง hard max และ `NOT_IN_TARGET` สำหรับสินทรัพย์ที่ไม่มี target หรือไม่ได้เลือกเข้าแผน DCA โดยไม่มี auto-sell
- Constrained allocation เคารพงบ, hard max และ single-stock cap
- บันทึก transaction, holdings, prices, settings และ portfolio snapshots ใน SQLite
- ดึงราคาและ indicators จาก Yahoo Finance พร้อม cache และ manual fallback
- อ่านสลิปซื้อขายหุ้น Dime ด้วย OCR ไทย/อังกฤษ และให้ตรวจทานก่อนบันทึก
- Dashboard แสดงมูลค่าพอร์ตและ historical snapshots จาก statement

## Quick Start

### Prerequisites

- Node.js `>=22.5.0` และ npm
- อินเทอร์เน็ตสำหรับดึงข้อมูล Yahoo Finance และดาวน์โหลด OCR language models ในการใช้งานครั้งแรก

### 1. Configure and start the backend

เปิด PowerShell ในโฟลเดอร์โปรเจกต์:

```powershell
cd backend
npm install
Copy-Item .env.example .env
```

แก้ `backend/.env` ก่อนเริ่มครั้งแรก: ตั้ง `JWT_SECRET` เป็นค่าสุ่มที่ยาว และกำหนด `SEED_ADMIN_PASSWORD` สำหรับบัญชี owner เริ่มต้น จากนั้นรัน:

```powershell
npm start
```

API จะเริ่มที่ `http://localhost:4000` ฐานข้อมูลเริ่มต้นอยู่ที่ `backend/data/investment.db` และ historical snapshots จะถูก seed แบบ idempotent

### 2. Start the frontend

เปิด PowerShell อีกหน้าต่าง:

```powershell
cd frontend
npx serve .
```

เปิด URL ที่คำสั่งแสดง แล้วเข้าสู่ระบบด้วย username/password ที่กำหนดไว้ใน `.env` ค่าเริ่มต้นของ seed คือ `admin` / `admin1234`; ตั้งรหัสผ่านใหม่ก่อนใช้งานจริง

Frontend เป็น static site ไม่มี build step หาก backend ใช้ host หรือ port อื่น ให้ตั้ง `window.API_BASE_URL` ใน `frontend/index.html` และเพิ่ม frontend origin ใน `CORS_ORIGINS` ของ backend

## Using the App

### Smart-DCA v2

กำหนด monthly budget และ target allocation ในหน้า DCA แล้วเลือก checkbox **DCA** เฉพาะสินทรัพย์ที่จะรวมในแผน ระบบ normalize target percentages ที่เป็นบวกของสินทรัพย์ที่เลือกให้รวมเป็น 100%; สินทรัพย์ที่เลือกแต่มี target เป็น 0 จะไม่มีน้ำหนักสำหรับ DCA ส่วนสินทรัพย์ที่ไม่เลือกจะไม่ถูกลบจากพอร์ตหรือ transactions แต่ได้สถานะ `NOT_IN_TARGET` และไม่รับ allocation กด **Save targets** ทุกครั้งที่เปลี่ยนการเลือกหรือน้ำหนักเพื่อบันทึกและคำนวณใหม่

ระบบคำนวณ action, score, risk, allocation และเงินคงเหลือ โดยยอดจัดสรรจริงยังขึ้นกับคะแนน, risk gate, hard max และ single-stock cap; ยอดรวมไม่เกิน available budget แม้ volatility multiplier สูงสุด 1.5x

### Transaction Slip OCR

ในหน้า **New transaction** เลือกรูป PNG, JPEG หรือ WebP ขนาดไม่เกิน 8 MB ระบบจะอ่านข้อมูลลงในฟอร์ม ให้ตรวจทานและกด Save เพื่อบันทึกผ่าน transaction API

- รองรับสลิปซื้อขายหุ้น Dime; สลิปทอง, FX, โอนเงิน และรูปแบบอื่นยังไม่รองรับ
- สลิป pending หรืออ่านข้อมูลสำคัญไม่ครบจะไม่ถูกบันทึกอัตโนมัติ
- ภาพประมวลผลในหน่วยความจำและไม่เก็บเป็นไฟล์; OCR models ถูก cache ไว้ใน home directory
- ค่าพอร์ตและ transactions ปัจจุบันแสดงเป็น USD; transaction schema ยังไม่มี currency field หากสลิปเป็นสกุลอื่นให้แปลงราคาและค่าธรรมเนียมเป็น USD ก่อน Save

### Portfolio History

Historical statements จาก KKP Dime จำนวน 10 จุดถูกเก็บเป็น month-end snapshots ในหน่วย THB และยังไม่ได้แปลงเป็น USD หรือ transactions เพราะเอกสารไม่ได้ระบุรายการซื้อขายครบถ้วน Dashboard จะแสดง snapshot fallback พร้อมสัญลักษณ์ THB; เมื่อมี holdings จะแสดงมูลค่าปัจจุบันเป็น USD กดบันทึก snapshot จาก Dashboard เพื่อเพิ่มจุดข้อมูลปัจจุบัน

## Architecture

```text
backend/
  src/
    config/smartDcaV2.js
    data/historicalStatements.js
    middleware/auth.js
    routes/                 auth, transactions, holdings, dca,
                            smartDcaV2, settings, market, snapshots
    services/
      portfolioEngine.js
      marketData.js
      indicators.js
      slipOcr.js
      smartDcaV2/            scoring, risk, allocation, projection
  test/
frontend/
  index.html
  css/style.css
  js/api.js
  js/app.js
Smart-DCA-v2-logic-plan.txt
```

Frontend เรียก REST API ด้วย JWT authentication; SQLite ใช้ `node:sqlite` ในตัวของ Node.js ไม่ต้องติดตั้ง native database module

## API Overview

รายละเอียด endpoint, authentication, request/response examples และ error codes อยู่ใน [CONTRIBUTE.md](CONTRIBUTE.md).

## Configuration

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

ดูค่าเริ่มต้นทั้งหมดใน [`backend/.env.example`](backend/.env.example)
หมายเหตุ: `RSI_OVERSOLD`, `RSI_OVERBOUGHT`, `REBALANCE_TOLERANCE` และ `VOL_DCA_CAP` ยังอยู่ใน `.env.example` แต่ runtime ปัจจุบันไม่ได้อ่านตัวแปรเหล่านี้

## Tests

รันจากโฟลเดอร์ `backend`:

```powershell
node --test test/*.test.js
```

ครอบคลุม Smart-DCA scoring/allocation, การ normalize น้ำหนัก DCA และ migration ของรายการ target เดิม, risk gates, dashboard totals และการอ่านสลิปหุ้น, pending state และข้อมูลที่ไม่รองรับ

## Troubleshooting

**Backend exits with `Missing JWT_SECRET`**

ตรวจว่ามี `backend/.env` และกำหนด `JWT_SECRET` แล้ว

**Frontend ติดต่อ API ไม่ได้**

ตรวจว่า backend ทำงานที่ port ใน `PORT`, ค่า `window.API_BASE_URL` ใน `frontend/index.html` ถูกต้อง และ origin ของหน้าเว็บอยู่ใน `CORS_ORIGINS`

**OCR ใช้เวลานานในการสแกนครั้งแรก**

ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อดาวน์โหลด Thai/English language models; ครั้งถัดไปใช้ไฟล์ที่ cache ไว้

**ข้อมูลตลาดไม่อัปเดต**

Yahoo Finance อาจจำกัดการเรียกหรือไม่มีข้อมูลสำหรับ ticker นั้น ระบบจะ fallback ไปใช้ cache/manual data และ Smart-DCA ใช้ `REVIEW` เมื่อข้อมูลไม่พอ

## Notes

- ข้อมูล Yahoo Finance อาจล่าช้าหรือไม่พร้อมใช้งาน ระบบใช้ cache/manual data และเลือก `REVIEW` เมื่อข้อมูลตลาดไม่พอ
- ผลคำนวณเป็นข้อมูลประกอบการติดตามพอร์ต ไม่ใช่คำแนะนำการลงทุนหรือภาษี
