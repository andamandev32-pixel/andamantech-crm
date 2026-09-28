const express = require('express');
const store = require('../services/doc-store');

const router = express.Router();

function fail(res, e) {
    if (!e.status) console.error('[sync]', e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'บันทึกลงฐานข้อมูลไม่สำเร็จ', code: e.code || 'SERVER_ERROR' });
}

// เอกสารทั้งก้อน — ใช้ตอนเปิดหน้า
router.get('/doc', async (req, res) => {
    try {
        const doc = await store.loadDoc(req.query.docId);
        if (!doc) return res.status(404).json({ error: 'ยังไม่มีข้อมูลบน server', code: 'NO_DOC' });
        res.json(doc);
    } catch (e) { fail(res, e); }
});

// ของใหม่ตั้งแต่ since — ใช้ตอน poll
router.get('/sync', async (req, res) => {
    try {
        const out = await store.pull(String(req.query.docId || ''), Number(req.query.since) || 0);
        if (!out) return res.status(404).json({ error: 'ไม่พบเอกสาร', code: 'NO_DOC' });
        res.json(out);
    } catch (e) { fail(res, e); }
});

// ส่งการแก้ไขขึ้นไป + รับของคนอื่นกลับมาในรอบเดียว
router.post('/sync', async (req, res) => {
    try { res.json(await store.push(req.body || {})); }
    catch (e) { fail(res, e); }
});

module.exports = router;
