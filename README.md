# AndamanTech CRM — Sales Pipeline

เว็บแอป Sales Pipeline ที่เก็บข้อมูลลงฐานข้อมูลกลาง เปิดจาก URL ไหนก็เห็นข้อมูลชุดเดียวกัน

- **หน้าเว็บ:** `public/index.html` (มาจาก `sale-pipeline.html` + บล็อก SYNC)
- **API:** Express `src/server.js`
- **ฐานข้อมูล:** MariaDB `141.98.17.115` database `andamantech_crm` (เซิร์ฟเวอร์เดียวกับ VMS คนละ database)

## รันในเครื่อง

```bash
cp .env.example .env     # ใส่ DB_PASSWORD, JWT_SECRET, CRM_PIN
npm install
npm run migrate          # สร้าง database + ตาราง (รันซ้ำได้)
npm run dev              # http://localhost:3000
```

## ย้ายข้อมูล / กู้จากสำรอง

ในแอปเดิมกด "ดาวน์โหลด JSON" (หรือใช้ไฟล์ HTML ที่ export ไว้) แล้ว:

```bash
node scripts/import-json.js <ไฟล์.json|.html>          # ดูตัวเลขก่อน ยังไม่เขียน
node scripts/import-json.js <ไฟล์.json|.html> --yes    # แทนที่ข้อมูลบน server ทั้งชุด
```

## วิธีเก็บข้อมูล

- `crm_doc` = meta + settings ของเอกสาร และเลข `seq` ล่าสุด
- `crm_records` = record ละแถว (`coll`, `id`, `data` JSON, `deleted`, `seq`, `updated_by`)
- หน้าเว็บจำภาพล่าสุดที่ server รับแล้ว ทุก autosave จะส่งเฉพาะ record ที่ต่าง (`POST /api/sync`)
  และ poll ของคนอื่นทุก 20 วินาที ชนกันระดับ record = ใครส่งทีหลังชนะ
- เน็ตหลุด: แก้ต่อได้ เก็บในเครื่องก่อน แล้วส่งขึ้นเองเมื่อกลับมาออนไลน์ (รอดการรีโหลด)
- "บันทึกเป็นไฟล์ HTML" ยังใช้ได้ ได้ไฟล์สำรองที่เปิดแบบออฟไลน์ได้ (ไม่ต่อ server)

## Deploy (Render)

ดู `render.yaml` · secret ที่ต้องตั้งเองใน dashboard: `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `CRM_PIN`
