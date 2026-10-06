# Smart-DCA v2 Investment Tracker

ระบบติดตามพอร์ตและวางแผน DCA สำหรับนักลงทุนรายบุคคล ช่วยบันทึกธุรกรรม ดูมูลค่าพอร์ต และใช้ข้อมูลตลาดประกอบการจัดสรรเงินลงทุนรายเดือน

วิธีติดตั้งและเปิดใช้งานในเครื่องอยู่ใน [คู่มือพัฒนา](CONTRIBUTING.md#local-development)

ดู endpoint, authentication และ request/response contracts ได้ที่ [เอกสาร API Gateway](docs/API-GATEWAY.md)

## Features

- Smart-DCA v2 ใช้คะแนน 6 ปัจจัย: สัดส่วนที่ต่ำกว่าเป้าหมาย, valuation, RSI, trend, MACD และ volatility
- Risk gate แสดง `PASS`, `CAUTION`, `REVIEW` หรือ `BLOCK`; เมื่อข้อมูลไม่ครบจะไม่จัดสรรเงิน
- `STOP_BUY` เมื่อถึง hard max และ `NOT_IN_TARGET` สำหรับสินทรัพย์ที่ไม่ได้เลือกเข้าแผน DCA โดยไม่มี auto-sell
- Constrained allocation เคารพงบ, hard max และ single-stock cap
- บันทึก transactions, holdings, prices, settings และ portfolio snapshots
- ดึงราคาและ indicators จาก Yahoo Finance พร้อม cache และ manual fallback
- รีเฟรชราคาตลาดของ holdings ที่มี ticker ทั้งหมดจาก Dashboard หรือ Holdings และบันทึก snapshot เมื่อมีราคาเปลี่ยน
- Export Smart-DCA training samples เป็น JSONL ได้โดย owner; outcome ยังเป็น `null` ไม่ใช่ผลตอบแทนที่สังเกตจริง
- Dashboard แสดงมูลค่าพอร์ตและ historical snapshots จาก statement

## Using the App

### Smart-DCA v2

ตั้งงบรายเดือนและ target allocation แล้วเลือก **DCA** เฉพาะสินทรัพย์ที่ต้องการให้พิจารณาซื้อ ระบบปรับสัดส่วน target ที่เป็นบวกของสินทรัพย์ที่เลือกให้รวมเป็น 100% สินทรัพย์ที่ไม่ได้เลือกยังคงอยู่ในพอร์ตและประวัติธุรกรรม แต่จะไม่รับเงินจัดสรร สินทรัพย์ที่เลือกแต่มี target เป็น 0 ก็ไม่มีน้ำหนักสำหรับ DCA กด **Save targets** หลังแก้การเลือกหรือสัดส่วน

#### Scoring ที่ใช้ในโค้ด

ระบบคำนวณคะแนนแต่ละปัจจัยในช่วง 0–100 แล้วรวมเป็น composite score ตามน้ำหนักนี้:

| ปัจจัย | น้ำหนัก | วิธีคิด |
|---|---:|---|
| Underweight | 30% | เทียบน้ำหนักปัจจุบันกับ target; ยิ่งต่ำกว่า target คะแนนยิ่งสูง |
| Valuation | 20% | เทียบ P/E จริงกับ manual reference P/E ราย ticker; เป็นสัญญาณเปรียบเทียบ ไม่ใช่ fair value |
| RSI | 15% | RSI ต่ำได้คะแนนสะสมสูง; RSI ตั้งแต่ 70 ขึ้นไปลดคะแนน ไม่ใช่สัญญาณขาย |
| Trend | 15% | เทียบราคากับ EMA26; ราคาต่ำกว่า EMA มากได้คะแนนสูงกว่า |
| MACD | 10% | ใช้ MACD histogram (`MACD - signal`); histogram ติดลบได้คะแนนสูงกว่า |
| Volatility | 10% | ใช้ annualized volatility จาก log returns รายวัน 20 วันล่าสุด; ค่าสูงเพิ่มคะแนนโอกาสสะสม แต่มี risk gate แยกต่างหาก |

ค่าตั้งต้นของ indicator คือ RSI 14 วันแบบ Wilder, EMA 26 วัน และ MACD 12/26/9; ปรับได้ผ่าน environment variables ตามที่ระบุในคู่มือพัฒนา ค่า P/E reference ตั้งด้วยมือใน config และเป็นสมมติฐานของกลยุทธ์ ไม่ใช่มูลค่ายุติธรรมที่ระบบประเมินให้

รายละเอียดช่วงคะแนนที่โค้ดใช้:

- Underweight: `50 + ((target - current) / target * 50)` แล้วจำกัดคะแนนไว้ที่ 0–100; ถ้าไม่มี target ได้ 0
- Valuation: ใช้อัตราส่วน `P/E / reference P/E`; ยิ่งต่ำกว่า reference ยิ่งได้คะแนนสูง (100 ที่ไม่เกิน 0.5x, 90 ที่ไม่เกิน 0.7x, 75 ที่ไม่เกิน 0.85x, 65 ที่ไม่เกิน 1x, 50 ที่ไม่เกิน 1.15x, 35 ที่ไม่เกิน 1.3x, 20 ที่ไม่เกิน 1.5x และ 10 เมื่อสูงกว่านั้น) ถ้า P/E ไม่เป็นบวกได้ 50
- RSI: `<30` ได้ 100, `<40` ได้ 85, `<50` ได้ 70, `<60` ได้ 55, `<70` ได้ 35, `<80` ได้ 15 และตั้งแต่ 80 ได้ 5
- Trend: วัดระยะ `(price - EMA26) / EMA26`; ต่ำกว่า EMA อย่างน้อย 20% ได้ 100, ต่ำกว่า 10% ได้ 90, ต่ำกว่า 5% ได้ 80, อยู่ระหว่าง -5% ถึง +5% ได้ 65, สูงกว่า EMA ไม่เกิน 10% ได้ 45, ไม่เกิน 20% ได้ 25 และสูงกว่า 20% ได้ 10
- MACD histogram ติดลบ/เท่ากับศูนย์/เป็นบวก ได้ 80/60/40 ตามลำดับ
- Annualized volatility: ไม่เป็นบวกได้ 50; `<10%` ได้ 35, `<15%` ได้ 45, `<25%` ได้ 60, `<40%` ได้ 75, `<60%` ได้ 85 และตั้งแต่ 60% ได้ 90

Composite score คือผลรวมคะแนนถ่วงน้ำหนักของทั้ง 6 ปัจจัย

#### ลำดับตัดสินใจและจัดสรร

1. ถ้าไม่มี target ให้สถานะ `NOT_IN_TARGET` และจัดสรร 0; ระบบไม่ขายสินทรัพย์นั้นอัตโนมัติ
2. ถ้าข้อมูลที่จำเป็นไม่ครบ (ราคา, RSI, EMA26, P/E หรือ volatility) ให้ `REVIEW`; ถ้าน้ำหนักถึง hard max ให้ `STOP_BUY`; ถ้าน้ำหนักเกิน target แต่ยังไม่ถึง hard max ให้ `PAUSE`
3. สำหรับรายการที่ผ่านเงื่อนไขข้างต้น ใช้ composite score จัด action: ตั้งแต่ 75 เป็น `ACCUMULATE`, 60 เป็น `BUY`, 45 เป็น `DCA`, 30 เป็น `HOLD`; ต่ำกว่า 30 เป็น `PAUSE`
4. Risk gate ตรวจคุณภาพข้อมูลและความเสี่ยงพอร์ตจาก concentration, AI infrastructure exposure, drawdown และ volatility; ข้อมูลตลาดผิดปกติให้ gate เป็น `BLOCK` และเปลี่ยน action หุ้นเป็น `REVIEW` ยกเว้น `NOT_IN_TARGET`/`AT_HARD_MAX` ที่คงสถานะเดิม; drawdown ตั้งแต่ 30% หรือ risk score ตั้งแต่ 85 ให้ `REVIEW`, risk score ตั้งแต่ 60 ให้ `CAUTION` นอกนั้นเป็น `PASS`
5. Allocator กระจายงบตาม score, underweight และ risk score โดยจำกัดไม่เกิน monthly budget, hard max และ 30% ของงบต่อหุ้น พร้อมกระจายเงินคงเหลือไปยังหุ้นที่ยังมี capacity; ไม่มีการ auto-sell

โค้ดคำนวณ volatility multiplier สูงสุด 1.5x แต่จำกัด adjusted budget ไม่ให้เกิน monthly budget ที่ตั้งไว้ ดังนั้นยอดซื้อรวมจะไม่เกินงบรายเดือน

คำแนะนำและคะแนนเป็นเครื่องมือช่วยวางแผน ไม่ใช่การคาดการณ์ผลตอบแทนหรือคำแนะนำการลงทุน

### Portfolio History

Historical statements จาก KKP Dime จำนวน 11 จุดถูกเก็บเป็น month-end snapshots ในหน่วย USD โดยแปลงจาก THB ด้วยอัตรา USD/THB ใกล้วันรายงาน ข้อมูลไม่ได้ถูกแปลงเป็น transactions เพราะเอกสารไม่ได้ระบุรายการซื้อขายครบถ้วน Dashboard และกราฟแสดงมูลค่าเป็น USD เมื่อกด refresh prices จาก Dashboard หรือ Holdings ระบบจะแปลง quote ของหุ้นไทยด้วย `THB=X` ก่อนบันทึกราคา และสร้าง snapshot ของวันเมื่อมีราคาเปลี่ยน อย่างไรก็ตาม `GET /market/quote/:ticker` คืนราคาตามสกุลของ ticker และ Smart-DCA ที่เรียกด้วย `fetchLive=true` ยังบันทึกราคา indicator โดยไม่แปลง FX; อย่าใช้เส้นทาง Smart-DCA นี้รีเฟรชราคาหุ้นไทยในฐานข้อมูล USD จนกว่าจะเพิ่มการแปลงสกุลเงิน

กราฟ Portfolio value history คง snapshots และ marker ก่อนเดือน ต.ค. 2026 ตามเดิม โดยปักวันที่ 30 ก.ย. ไว้บนเส้นเป็นจุดตั้งต้นของรอบใหม่ จากนั้นเริ่มปัก marker รายเดือนในวันที่ 28 ต.ค. และทุกวันที่ 28 ของเดือนถัดไป เมื่อ refresh ราคาในวันอื่น กราฟจะต่อเส้นถึง snapshot ล่าสุดและแสดง marker ทึบแบบเดียวกับจุด 30 ก.ย. ที่ปลายขวาสุด

## ข้อจำกัดและแนวทางต่อยอด

ข้อมูลราคาจาก Yahoo Finance อาจล่าช้าหรือไม่มีสำหรับบาง ticker ระบบจึงใช้ cache/manual data และให้ `REVIEW` เมื่อข้อมูลตลาดไม่พอ ปัจจุบัน transactions ใช้ USD และยังไม่มีช่องเก็บ currency แยก หากสลิปเป็นสกุลอื่นให้แปลงราคาและค่าธรรมเนียมเป็น USD ก่อนบันทึก ราคาหุ้นไทยจากการดึง live จะถูกแปลงเป็น USD ด้วยอัตราปัจจุบัน ส่วนค่าธุรกรรมเดิมที่บันทึกก่อนหน้านี้ไม่สามารถตรวจสกุลเงินย้อนหลังได้อย่างแน่นอน

การนำเข้า/ส่งออก transaction และการรองรับหลายสกุลเงินเป็นแนวทางต่อยอดที่ยังไม่มีในระบบ รายละเอียดการประเมินฟีเจอร์อยู่ใน [บันทึกเปรียบเทียบ Getquin Portfolio Exporter](docs/getquin-exporter-comparison.md)

ผลคำนวณเป็นข้อมูลประกอบการติดตามพอร์ต ไม่ใช่คำแนะนำการลงทุนหรือภาษี
