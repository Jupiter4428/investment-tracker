# Investment Tracker — Full-Stack Edition

ระบบบันทึกการลงทุน & จัดการภาษี (เดิมเป็นไฟล์ HTML เดี่ยวที่ใช้ localStorage) ถูกแยกออกเป็น
**backend** (Node.js/Express + SQLite ผ่านโมดูลในตัว `node:sqlite` — ไม่ต้อง compile native module ใดๆ)
และ **frontend** (static HTML/CSS/JS) ที่คุยกันผ่าน REST API

> **ต้องใช้ Node.js เวอร์ชัน 22.5 ขึ้นไป** (แนะนำ 22 LTS หรือใหม่กว่า) เพราะใช้ `node:sqlite` ซึ่งเป็นโมดูล built-in — ตอนรันจะเห็น warning `ExperimentalWarning: SQLite is an experimental feature` ซึ่งไม่เป็นอันตราย ใช้งานได้ปกติ
พร้อมทั้งพอร์ตระบบ DCA/Rebalance จริงจาก [Smart-DCA](https://github.com/Jupiter4428/Smart-DCA)
(RSI, MACD, EMA26, Volatility, และตรรกะ `get_action_signal()` แบบเต็ม) มาทำงานฝั่งเซิร์ฟเวอร์
พร้อมดึงราคา/อินดิเคเตอร์สดจาก Yahoo Finance

## โครงสร้างโปรเจกต์

```
investment-tracker/
├── backend/            Express API + SQLite DB + Smart-DCA engine
│   ├── src/
│   │   ├── server.js
│   │   ├── db.js
│   │   ├── seed.js
│   │   ├── constants.js
│   │   ├── middleware/auth.js
│   │   ├── routes/          (auth, transactions, holdings, dca, tax, users, settings, market)
│   │   └── services/
│   │       ├── portfolioEngine.js   average-cost holdings (ported from the original app)
│   │       ├── indicators.js        RSI/MACD/EMA/volatility  (ported from Smart-DCA/src/indicators.py)
│   │       ├── dcaEngine.js         rebalance + action signal (ported from Smart-DCA/src/portfolio.py)
│   │       └── marketData.js        live Yahoo Finance fetch + cache
│   ├── package.json
│   └── .env.example
└── frontend/           Static site (no build step)
    ├── index.html
    ├── css/style.css
    └── js/
        ├── api.js      fetch-based API client (replaces the old localStorage `DB` object)
        └── app.js       app logic / rendering

```

## 1) ติดตั้ง & รัน Backend

```bash
cd backend
npm install
cp .env.example .env
# แก้ .env: ตั้ง JWT_SECRET เป็นค่าสุ่มยาวๆ, ตั้งรหัสผ่าน admin เริ่มต้น (SEED_ADMIN_PASSWORD)
npm start
```

เซิร์ฟเวอร์จะรันที่ `http://localhost:4000` (แก้ `PORT` ใน `.env` ได้) และจะ:
- สร้างไฟล์ฐานข้อมูล SQLite ที่ `backend/data/investment.db` อัตโนมัติในการรันครั้งแรก
- สร้างบัญชีผู้ดูแลเริ่มต้นให้อัตโนมัติ (username/password ตามที่ตั้งใน `.env`, ค่าเริ่มต้นคือ `admin` / `admin1234`)
- ตั้งอัตราภาษีเริ่มต้นตามหลักเกณฑ์ทั่วไป (แก้ไขได้ภายหลังในหน้า "ตั้งค่า")

**สำคัญ:** เปลี่ยนรหัสผ่าน admin ทันทีหลังเข้าสู่ระบบครั้งแรก (หน้า "จัดการผู้ใช้")

### ตัวแปรสภาพแวดล้อมที่สำคัญ (`.env`)

| ตัวแปร | ความหมาย |
|---|---|
| `JWT_SECRET` | คีย์เซ็น JWT — **ต้องตั้งเป็นค่าสุ่มยาวๆ ก่อนใช้งานจริง** |
| `DB_PATH` | ตำแหน่งไฟล์ฐานข้อมูล SQLite |
| `CORS_ORIGINS` | โดเมน/พอร์ตของ frontend ที่อนุญาตให้เรียก API |
| `RSI_PERIOD`, `MACD_FAST/SLOW/SIGNAL`, `EMA_PERIOD`, `VOL_WINDOW`, `VOL_DCA_CAP` | พารามิเตอร์ของเอนจิน Smart-DCA (ค่าเริ่มต้นตรงกับ repo ต้นทาง) |
| `MARKET_CACHE_MINUTES` | ระยะเวลาแคชข้อมูลราคาที่ดึงจาก Yahoo Finance ต่อสัญลักษณ์ |

## 2) รัน Frontend

Frontend เป็นไฟล์ static ล้วนๆ ไม่มีขั้นตอน build — เสิร์ฟด้วยเครื่องมือใดก็ได้ เช่น:

```bash
cd frontend
npx serve .          # หรือ python3 -m http.server 5500 หรือเปิดผ่าน VSCode Live Server
```

เปิดเบราว์เซอร์ไปที่ URL ที่ได้ (เช่น `http://localhost:5500`) แล้ว login ด้วยบัญชี admin

ถ้า backend ไม่ได้รันที่ `http://localhost:4000` ให้แก้บรรทัดนี้ใน `frontend/index.html`:

```html
<script>
  window.API_BASE_URL = 'https://your-backend-domain.com/api';
</script>
```

และอย่าลืมเพิ่มโดเมนของ frontend ลงใน `CORS_ORIGINS` ฝั่ง backend ด้วย

## 3) ฟีเจอร์ที่เพิ่มจากระบบเดิม (พอร์ตจาก Smart-DCA)

หน้า **"แผน DCA & Rebalance"** ตอนนี้ใช้เอนจินจริงจาก Smart-DCA แทนสูตรแบบง่ายที่เคยฝังไว้ในไฟล์ HTML เดี่ยว:

- **Volatility-adjusted budget** — ถ้าความผันผวนรายปี > 25% ระบบปรับเพิ่มงบ DCA อัตโนมัติ (สูงสุด 1.5 เท่า) ตามสูตร `1 + vol/2`
- **Rebalance factor** ต่อสินทรัพย์ ตามส่วนต่างจากเป้าหมาย (underweight ได้น้ำหนักเพิ่ม, overweight ได้ลด)
- **Action signal แบบ multi-factor** (`getActionSignal`) พิจารณา: RSI overbought/oversold, MACD crossover, ระยะห่างจาก EMA26 (แนวรับ/แนวโน้มขาลงรุนแรง), P/E ถูก/แพง (แยกกลุ่มหุ้นเทค/หุ้น value), การ exit position, และสินทรัพย์ hedge (ทองคำ)
- ใส่ **Yahoo Finance Ticker** ให้แต่ละสินทรัพย์ตอนบันทึกธุรกรรม (เช่น `PTT.BK`, `AAPL`, `BTC-USD`, `GC=F`) แล้วกด **"📡 ดึงข้อมูลตลาดสด"** ในหน้า DCA หรือปุ่ม 📡 ในหน้า Holdings เพื่อดึง RSI/MACD/EMA26/P/E/ราคาจริงมาใช้คำนวณสัญญาณและอัปเดตราคา — ถ้าไม่มี ticker ก็ยังกรอก RSI/P-E เองในตารางได้เหมือนเดิม

## 4) ความปลอดภัย/สถาปัตยกรรมที่เปลี่ยนจากเดิม

| เดิม (ไฟล์ HTML เดี่ยว) | ใหม่ |
|---|---|
| เก็บข้อมูลทั้งหมดใน `localStorage` ของเบราว์เซอร์ | เก็บใน SQLite บนเซิร์ฟเวอร์ — ข้อมูลไม่หายเมื่อล้าง cache และใช้งานได้หลายเครื่อง |
| รหัสผ่านเข้ารหัสแบบ base64 (ไม่ปลอดภัย) | แฮชด้วย bcrypt |
| ไม่มี session จริง (เก็บ flag ใน localStorage) | JWT token พร้อมวันหมดอายุ |
| คำนวณ RSI/P-E ต้องกรอกเอง | ดึงข้อมูลสดจาก Yahoo Finance ได้ (ยังกรอกเองได้เมื่อไม่มี ticker) |

## 6) ติดตามผลงานพอร์ต (กราฟมูลค่าพอร์ตย้อนหลัง)

หน้า **"ภาพรวมพอร์ต" (Dashboard)** ตอนนี้มีกราฟมูลค่าพอร์ตย้อนหลังอยู่ด้านบน (แกน X = วันที่, แกน Y = มูลค่าพอร์ต)
พร้อมแถบสถิติด้านขวา (มูลค่าต้นทุนรวม / มูลค่าปัจจุบัน / กำไรขาดทุนยังไม่รับรู้ / กำไรรับรู้แล้วปีนี้)
ข้อมูลกราฟมาจากตาราง `portfolio_snapshots` — กดปุ่ม **"📸 บันทึกมูลค่าพอร์ตวันนี้"** เพื่อเก็บจุดข้อมูลใหม่

### ควรบันทึกบ่อยแค่ไหน?

ถ้าซื้อขายเฉลี่ยเดือนละ 2 ครั้ง แนะนำ:
- **สัปดาห์ละ 1 ครั้งแบบตายตัว** (เช่น ทุกวันศุกร์) — ให้กราฟมีความละเอียดพอเห็นทิศทาง/drawdown โดยไม่ต้องเสียเวลาทุกวัน
- **บวกทันทีหลังทำรายการซื้อ/ขายทุกครั้ง** — เพราะพอร์ตเปลี่ยนสัดส่วนจริง อยากให้กราฟสะท้อนจุดเปลี่ยนนั้น

รวมแล้วจะได้ประมาณ 4-6 จุดข้อมูลต่อเดือน ซึ่งเพียงพอสำหรับการดูเทรนด์และ drawdown ที่สำคัญ ไม่จำเป็นต้องบันทึกทุกวันด้วยมือ

### อยากได้กราฟละเอียดแบบรายวันอัตโนมัติ (ไม่ต้องกดเอง)

ตั้ง **Windows Task Scheduler** ให้เรียก API `/api/snapshots/capture` ทุกวันอัตโนมัติได้:

1. สร้างไฟล์สคริปต์ `capture-snapshot.ps1`:
   ```powershell
   $token = "<JWT token ที่ได้จาก login>"   # หรือเขียน login ก่อนแล้วอ่าน token จาก response
   Invoke-RestMethod -Method POST -Uri "http://localhost:4000/api/snapshots/capture" `
     -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body "{}"
   ```
2. เปิด **Task Scheduler** → Create Basic Task → ตั้งให้รันทุกวันตอนตลาดปิด (เช่น 05:00 ตามเวลาไทยสำหรับตลาดสหรัฐฯ) → Action: Start a program → `powershell.exe -File "C:\path\capture-snapshot.ps1"`

> หมายเหตุ: token จาก JWT มีวันหมดอายุ (`JWT_EXPIRES_IN` ใน `.env`, ค่าเริ่มต้น 12 ชั่วโมง) ถ้าจะรันอัตโนมัติระยะยาวจริงจัง ควรตั้งค่า `JWT_EXPIRES_IN` ให้ยาวขึ้น หรือเขียนสคริปต์ให้ login ใหม่ทุกครั้งก่อนเรียก capture

## 7) หมายเหตุ

- ตัวเลขภาษีที่คำนวณเป็นการประมาณการเบื้องต้นตามหลักเกณฑ์ทั่วไป **ไม่ใช่คำแนะนำทางภาษีอย่างเป็นทางการ**
- การดึงข้อมูลจาก Yahoo Finance ขึ้นกับ rate limit/ความพร้อมใช้งานของ Yahoo — ถ้าดึงไม่สำเร็จระบบจะ fallback ไปใช้ค่าที่กรอกเองหรือค่าที่แคชไว้ล่าสุด
