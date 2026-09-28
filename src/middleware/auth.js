const jwt = require('jsonwebtoken');

// ค่า dev ใช้ได้เฉพาะในเครื่อง — production ต้องตั้ง env จริง ไม่งั้นใครเห็น repo ก็ปลอม token ได้
const DEV_SECRET = 'dev_only_change_me_andamantech_crm';
const JWT_SECRET = process.env.JWT_SECRET || DEV_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES || '30d';
const CRM_PIN = process.env.CRM_PIN || '';

if (process.env.NODE_ENV === 'production') {
    if (JWT_SECRET === DEV_SECRET) {
        console.error('[auth] ปฏิเสธการเริ่มระบบ: NODE_ENV=production แต่ไม่ได้ตั้ง JWT_SECRET');
        process.exit(1);
    }
    if (!CRM_PIN) {
        console.error('[auth] ปฏิเสธการเริ่มระบบ: ไม่ได้ตั้ง CRM_PIN');
        process.exit(1);
    }
}

function sign(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function requireAuth(req, res, next) {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'กรุณาใส่รหัสเข้าใช้งาน', code: 'NO_TOKEN' });
    try {
        req.user = jwt.verify(h.slice(7), JWT_SECRET);
        next();
    } catch (err) {
        const expired = err.name === 'TokenExpiredError';
        res.status(401).json({ error: expired ? 'หมดอายุการเข้าใช้งาน' : 'Token ไม่ถูกต้อง', code: expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN' });
    }
}

module.exports = { sign, requireAuth, CRM_PIN };
