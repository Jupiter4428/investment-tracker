# Smart-DCA v2 Investment Tracker

ระบบติดตามพอร์ตและวางแผน DCA สำหรับนักลงทุนรายบุคคล ช่วยบันทึกธุรกรรม ดูมูลค่าพอร์ต และใช้ข้อมูลตลาดประกอบการจัดสรรเงินลงทุนรายเดือน

วิธีติดตั้งและเปิดใช้งานในเครื่องอยู่ใน [คู่มือพัฒนา](CONTRIBUTING.md#local-development)

## Features

- Smart-DCA v2 ใช้คะแนน 6 ปัจจัย: สัดส่วนที่ต่ำกว่าเป้าหมาย, valuation, RSI, trend, MACD และ volatility
- Risk gate แสดง `PASS`, `CAUTION`, `REVIEW` หรือ `BLOCK`; เมื่อข้อมูลไม่ครบจะไม่จัดสรรเงิน
- `STOP_BUY` เมื่อถึง hard max และ `NOT_IN_TARGET` สำหรับสินทรัพย์ที่ไม่ได้เลือกเข้าแผน DCA โดยไม่มี auto-sell
- Constrained allocation เคารพงบ, hard max และ single-stock cap
- บันทึก transactions, holdings, prices, settings และ portfolio snapshots
- ดึงราคาและ indicators จาก Yahoo Finance พร้อม cache และ manual fallback
- อ่านสลิปซื้อขายหุ้น Dime ด้วย OCR ไทย/อังกฤษ และให้ตรวจทานก่อนบันทึก
- Dashboard แสดงมูลค่าพอร์ตและ historical snapshots จาก statement

## Using the App

### Smart-DCA v2

ตั้งงบรายเดือนและ target allocation แล้วเลือก **DCA** เฉพาะสินทรัพย์ที่ต้องการให้พิจารณาซื้อ ระบบปรับสัดส่วน target ที่เป็นบวกของสินทรัพย์ที่เลือกให้รวมเป็น 100% สินทรัพย์ที่ไม่ได้เลือกยังคงอยู่ในพอร์ตและประวัติธุรกรรม แต่จะไม่รับเงินจัดสรร สินทรัพย์ที่เลือกแต่มี target เป็น 0 ก็ไม่มีน้ำหนักสำหรับ DCA กด **Save targets** หลังแก้การเลือกหรือสัดส่วน

คะแนนทั้ง 6 ปัจจัยใช้จัดลำดับการพิจารณา จากนั้น risk gate และข้อจำกัด hard max/single-stock cap จะกำหนดวงเงินซื้อจริง ยอดรวมไม่เกินงบที่ใช้ได้ แม้ volatility multiplier สูงสุด 1.5x หากข้อมูลไม่ครบ ระบบจะไม่จัดสรรเงินและอาจให้สถานะ `REVIEW`; เมื่อชนเพดานจะเป็น `STOP_BUY` ไม่มีการขายอัตโนมัติ

คำแนะนำและคะแนนเป็นเครื่องมือช่วยวางแผน ไม่ใช่การคาดการณ์ผลตอบแทนหรือคำแนะนำการลงทุน

### Transaction Slip OCR

ในหน้า **New transaction** เลือกรูป PNG, JPEG หรือ WebP ขนาดไม่เกิน 8 MB ระบบจะอ่านข้อมูลลงในฟอร์ม ให้ตรวจทานและกด Save เพื่อบันทึก

- รองรับสลิปซื้อขายหุ้น Dime; สลิปทอง, FX, โอนเงิน และรูปแบบอื่นยังไม่รองรับ
- สลิป pending หรืออ่านข้อมูลสำคัญไม่ครบจะไม่ถูกบันทึกอัตโนมัติ
- ภาพประมวลผลในหน่วยความจำและไม่เก็บเป็นไฟล์; OCR models ถูก cache ไว้ใน home directory

### Portfolio History

Historical statements จาก KKP Dime จำนวน 10 จุดถูกเก็บเป็น month-end snapshots ในหน่วย THB และยังไม่ได้แปลงเป็น USD หรือ transactions เพราะเอกสารไม่ได้ระบุรายการซื้อขายครบถ้วน Dashboard จะแสดง snapshot fallback พร้อมสัญลักษณ์ THB; เมื่อมี holdings จะแสดงมูลค่าปัจจุบันเป็น USD กดบันทึก snapshot จาก Dashboard เพื่อเพิ่มจุดข้อมูลปัจจุบัน

## ข้อจำกัดและแนวทางต่อยอด

ข้อมูลราคาจาก Yahoo Finance อาจล่าช้าหรือไม่มีสำหรับบาง ticker ระบบจึงใช้ cache/manual data และให้ `REVIEW` เมื่อข้อมูลตลาดไม่พอ ปัจจุบัน transactions ใช้ USD และยังไม่มีช่องเก็บ currency แยก หากสลิปเป็นสกุลอื่นให้แปลงราคาและค่าธรรมเนียมเป็น USD ก่อนบันทึก ส่วน historical snapshots จาก statement เป็น THB และไม่ถูกแปลงอัตโนมัติ

การนำเข้า/ส่งออก transaction และการรองรับหลายสกุลเงินเป็นแนวทางต่อยอดที่ยังไม่มีในระบบ รายละเอียดการประเมินฟีเจอร์อยู่ใน [บันทึกเปรียบเทียบ Getquin Portfolio Exporter](docs/getquin-exporter-comparison.md)

ผลคำนวณเป็นข้อมูลประกอบการติดตามพอร์ต ไม่ใช่คำแนะนำการลงทุนหรือภาษี
