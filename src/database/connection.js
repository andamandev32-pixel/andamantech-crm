const mysql = require('mysql2/promise');

// ห้ามมีค่า default ของ DB_NAME — host นี้ใช้ร่วมกับ VMS และระบบอื่น
// ถ้าลืมตั้ง env แล้วมี fallback แอปอาจไปเขียนใส่ฐานข้อมูลของระบบอื่นเงียบ ๆ
const DB_NAME = process.env.DB_NAME;
if (!DB_NAME) {
    console.error('[db] ปฏิเสธการเริ่มระบบ: ไม่ได้ตั้ง DB_NAME (คัดลอก .env.example เป็น .env ก่อน)');
    process.exit(1);
}

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: DB_NAME,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    enableKeepAlive: true,
});

async function testConnection() {
    try {
        const c = await pool.getConnection();
        c.release();
        return true;
    } catch (err) {
        console.error('❌ Database connection failed:', err.message);
        return false;
    }
}

module.exports = { pool, testConnection, DB_NAME };
