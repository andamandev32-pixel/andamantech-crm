/**
 * ย้ายข้อมูลเข้า DB / กู้จาก backup — แทนที่ทั้งเอกสาร
 *
 *   node scripts/import-json.js <ไฟล์.json | ไฟล์.html> [--yes]
 *
 * .json = ไฟล์จากปุ่ม "บันทึก JSON" ในแอป
 * .html = ไฟล์ที่ได้จาก "บันทึกเป็นไฟล์ HTML" (อ่าน <script id="seed-data">)
 *
 * ⚠ record ที่อยู่บน server แต่ไม่อยู่ในไฟล์นี้จะถูกลบ
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const fs = require('fs');

const COLLS = ['jobs', 'customers', 'contacts', 'activities', 'plans', 'discussions', 'owners'];

function readState(file) {
    const raw = fs.readFileSync(file, 'utf8');
    if (/\.html?$/i.test(file)) {
        const m = raw.match(/<script id="seed-data" type="application\/json">([\s\S]*?)<\/script>/);
        if (!m) throw new Error('ไม่พบ <script id="seed-data"> ในไฟล์ HTML');
        return JSON.parse(m[1]);
    }
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

(async () => {
    const file = process.argv[2];
    const yes = process.argv.includes('--yes');
    if (!file) { console.error('ใช้: node scripts/import-json.js <ไฟล์.json|.html> [--yes]'); process.exit(1); }

    const state = readState(file);
    if (!state || !state.meta || !state.meta.docId || !Array.isArray(state.jobs)) {
        throw new Error('ไฟล์นี้ไม่ใช่ข้อมูล Sales Pipeline (ไม่มี meta.docId / jobs[])');
    }
    const counts = COLLS.map(c => `${c}=${(state[c] || []).length}`).join('  ');
    console.log(`ไฟล์: ${path.basename(file)}\ndocId: ${state.meta.docId}  revision: ${state.meta.revision}  schema: ${state.schema}\n${counts}`);
    console.log(`ปลายทาง: ${process.env.DB_NAME} @ ${process.env.DB_HOST}`);
    if (!yes) { console.log('\nยังไม่ได้เขียนอะไร — ตรวจตัวเลขข้างบนแล้วรันซ้ำพร้อม --yes'); process.exit(0); }

    const store = require('../src/services/doc-store');
    const { pool } = require('../src/database/connection');
    const other = await store.firstDocId();
    if (other && other !== state.meta.docId) {
        console.warn(`⚠ server มีเอกสาร ${other} อยู่แล้ว — ไฟล์นี้เป็น ${state.meta.docId} จะกลายเป็นเอกสารล่าสุดแทน`);
    }
    // meta ที่มีความหมายเฉพาะตอนส่งไฟล์ต่อ ไม่ต้องยกขึ้น server
    state.meta.editsSinceSave = 0;
    const r = await store.replaceAll(state);
    console.log(`✅ นำเข้าแล้ว ${r.count} records  docId=${r.docId}  seq=${r.seq}`);
    await pool.end();
})().catch(e => { console.error('❌', e.message); process.exit(1); });
