const express = require('express');
const crypto = require('crypto');
const { sign, CRM_PIN } = require('../middleware/auth');

const router = express.Router();

// PIN 5 หลักมีแค่ 100,000 แบบ — ต้องจำกัดการเดา ไม่งั้นยิงไล่ครบได้ในไม่กี่นาที
// เก็บในหน่วยความจำพอ (instance เดียวบน Render free) รีสตาร์ตแล้วนับใหม่
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;
const fails = new Map();   // ip -> { n, until }

function blocked(ip) {
    const f = fails.get(ip);
    if (!f) return false;
    if (Date.now() > f.until) { fails.delete(ip); return false; }
    return f.n >= MAX_FAILS;
}
function recordFail(ip) {
    const f = fails.get(ip);
    if (!f || Date.now() > f.until) fails.set(ip, { n: 1, until: Date.now() + WINDOW_MS });
    else f.n++;
}

function samePin(got) {
    if (!CRM_PIN) return false;
    const a = Buffer.from(String(got || ''));
    const b = Buffer.from(CRM_PIN);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post('/pin', (req, res) => {
    const ip = req.ip;
    if (blocked(ip)) return res.status(429).json({ error: 'ใส่รหัสผิดหลายครั้งเกินไป ลองใหม่ใน 15 นาที', code: 'TOO_MANY' });
    if (!samePin(req.body && req.body.pin)) {
        recordFail(ip);
        return res.status(401).json({ error: 'รหัสไม่ถูกต้อง', code: 'BAD_PIN' });
    }
    fails.delete(ip);
    res.json({ token: sign({ sub: 'team' }) });
});

module.exports = router;
