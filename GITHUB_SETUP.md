# การอัปโหลดโปรเจกต์ขึ้น GitHub

## 1) เตรียมเครื่อง (ทำครั้งเดียว)

ตรวจสอบว่ามี Git ติดตั้งแล้ว:
```powershell
git --version
```
ถ้ายังไม่มี ดาวน์โหลดที่ https://git-scm.com/download/win แล้วติดตั้งตามค่า default

ตั้งค่าชื่อ/อีเมลที่จะใช้ผูกกับ commit (ใช้อีเมลเดียวกับบัญชี GitHub):
```powershell
git config --global user.name "ชื่อของคุณ"
git config --global user.email "your-email@example.com"
```

## 2) สร้าง repository บน GitHub

1. เข้า https://github.com/new
2. ตั้งชื่อ repo เช่น `investment-tracker`
3. เลือก **Private** (แนะนำ เพราะมีข้อมูลการลงทุนส่วนตัว)
4. **อย่าติ๊ก** "Add a README file" / .gitignore / license (เพราะเรามีของเราเองแล้ว จะได้ไม่ conflict)
5. กด **Create repository**
6. หน้าจะโชว์ URL ของ repo ประมาณ `https://github.com/<username>/investment-tracker.git` — เก็บไว้ใช้ขั้นตอนถัดไป

## 3) เชื่อมโปรเจกต์ในเครื่องกับ GitHub แล้ว push

เปิด PowerShell ที่โฟลเดอร์โปรเจกต์ (ตัวบนสุดที่มี `backend/`, `frontend/`, `README.md`):

```powershell
cd "C:\Users\U S E R\Desktop\investment-tracker"

git init
git add .
git commit -m "Initial commit: investment tracker full-stack app"
git branch -M main
git remote add origin https://github.com/<username>/investment-tracker.git
git push -u origin main
```

แทน `<username>` ด้วยชื่อบัญชี GitHub ของคุณ ครั้งแรกที่ push ระบบอาจเด้งให้ login ผ่านเบราว์เซอร์ (Sign in with your browser) — login แล้วกด Authorize ตามปกติ

## 4) ตรวจสอบว่าไฟล์สำคัญไม่หลุดขึ้นไป

`.gitignore` ที่แนบมาให้แล้วกันไฟล์เหล่านี้ไม่ให้ถูก push โดยอัตโนมัติ:
- `node_modules/` (ติดตั้งใหม่ได้ด้วย `npm install` ไม่จำเป็นต้องเก็บ)
- `.env` (มีความลับ เช่น `JWT_SECRET` — **ห้ามขึ้น GitHub เด็ดขาด**)
- `backend/data/` (ไฟล์ฐานข้อมูล SQLite ที่มีข้อมูลธุรกรรมจริงของคุณ)

เช็คก่อน push ได้ด้วย:
```powershell
git status
```
ถ้าเห็น `.env` หรือ `data/` อยู่ในรายการที่จะ commit ให้หยุดก่อน แล้วตรวจสอบว่ามีไฟล์ `.gitignore` อยู่ในโฟลเดอร์บนสุดจริง

## 5) หลังจากนี้ — วิธี push การเปลี่ยนแปลงครั้งถัดไป

ทุกครั้งที่แก้โค้ดแล้วอยากอัปเดตขึ้น GitHub:
```powershell
git add .
git commit -m "อธิบายว่าแก้อะไร"
git push
```

## 6) การ clone ไปใช้งานที่เครื่องอื่น

```powershell
git clone https://github.com/<username>/investment-tracker.git
cd investment-tracker\backend
npm install
copy .env.example .env
# แก้ .env ใส่ JWT_SECRET ใหม่ (ห้ามใช้ค่าเดียวกันซ้ำข้ามเครื่อง/production)
npm start
```

frontend ก็เสิร์ฟตามปกติด้วย `npx serve` หรือ `python -m http.server` (ดูรายละเอียดใน `README.md`)

---

**ข้อควรระวัง:** ถ้า repo เป็น Public ห้าม commit ไฟล์ `.env` หรือไฟล์ `backend/data/*.db` เด็ดขาด เพราะจะมีข้อมูลรหัสผ่านที่แฮชไว้และข้อมูลการลงทุนจริงของคุณอยู่ในนั้น ถ้าพลาด push ไปแล้วให้รีบเปลี่ยน `JWT_SECRET` และรหัสผ่านผู้ใช้ทุกคนทันที แล้วลบไฟล์ออกจาก git history (ใช้ `git filter-repo` หรือปรึกษาผมได้)
