/**
 * npm run migrate — สร้าง database (ถ้ายังไม่มี) แล้วรัน schema.sql
 * schema.sql เขียนแบบ idempotent จึงรันซ้ำได้เสมอ
 */
const path  = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const mysql = require('mysql2/promise');
const fs    = require('fs');

const DB_NAME = process.env.DB_NAME;
if (!DB_NAME) { console.error('ไม่ได้ตั้ง DB_NAME'); process.exit(1); }
if (/^vms/i.test(DB_NAME)) { console.error('DB_NAME ชี้ไปที่ฐานของ VMS — ปฏิเสธ'); process.exit(1); }

(async () => {
    const c = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT, 10) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        multipleStatements: true,
    });
    try {
        console.log(`migrate → "${DB_NAME}" @ ${process.env.DB_HOST}`);
        await c.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await c.query(`USE \`${DB_NAME}\``);
        await c.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
        const [rows] = await c.query('SHOW TABLES');
        console.log('tables:', rows.map(r => Object.values(r)[0]).join(', '));
    } finally {
        await c.end();
    }
})().catch(e => { console.error('migrate ล้มเหลว:', e.message); process.exit(1); });
