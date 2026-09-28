require('dotenv').config();
const express = require('express');
const path = require('path');
const { testConnection } = require('./database/connection');
const { requireAuth } = require('./middleware/auth');

const app = express();
app.set('trust proxy', 1);                       // Render อยู่หลัง proxy — req.ip ต้องเป็น IP จริงของผู้ใช้ (ใช้จำกัดการเดา PIN)
app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' }));        // import Excel ทั้งชุดส่งขึ้นมาใน batch เดียว

app.use((req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    res.set('Referrer-Policy', 'no-referrer');
    // Google Identity Services (ปฏิทิน) เปิด popup — same-origin ธรรมดาจะตัดการสื่อสารกับ popup
    res.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
});

// health ต้องไม่ติด auth — Render ใช้เป็น healthCheckPath ถ้าโดน 401 จะรีสตาร์ตวน
app.get('/api/health', async (req, res) => {
    const dbOk = await testConnection();
    res.status(dbOk ? 200 : 503).json({ status: dbOk ? 'ok' : 'database_error', timestamp: new Date().toISOString() });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api', requireAuth, require('./routes/sync'));
app.use('/api', (req, res) => res.status(404).json({ error: 'ไม่พบ API นี้', code: 'NOT_FOUND' }));

app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));
app.use(express.static(path.join(__dirname, '..', 'public'), {
    setHeaders: (res, p) => { if (p.endsWith('.html')) res.set('Cache-Control', 'no-cache'); },
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`AndamanTech CRM running on http://localhost:${PORT}`);
    console.log((await testConnection()) ? '✅ Database connected' : '⚠ Database not reachable');
});
