/**
 * ที่เก็บเอกสาร CRM — record ละแถว (JSON) + เลข seq ต่อเอกสาร
 *
 * seq คือนาฬิกาของ server: ทุก batch ที่มีการเปลี่ยนแปลงได้ seq ใหม่หนึ่งค่า
 * client จำ seq ล่าสุดที่เห็นไว้ แล้วขอ "ทุกอย่างที่ seq > since" — ไม่ต้องเชื่อนาฬิกาเครื่องลูก
 * ชนกันระดับ record = batch ที่มาทีหลังชนะ (last-write-wins)
 */
const { pool } = require('../database/connection');

const COLLS = ['jobs', 'customers', 'contacts', 'activities', 'plans', 'discussions', 'owners'];

function parse(s, fallback) {
    try { return JSON.parse(s); } catch (e) { return fallback; }
}

async function firstDocId(conn) {
    const [rows] = await (conn || pool).query('SELECT doc_id FROM crm_doc ORDER BY updated_at DESC LIMIT 1');
    return rows.length ? rows[0].doc_id : null;
}

async function loadDoc(docId) {
    docId = docId || await firstDocId();
    if (!docId) return null;
    const [docs] = await pool.query('SELECT * FROM crm_doc WHERE doc_id = ?', [docId]);
    if (!docs.length) return null;
    const d = docs[0];
    const [rows] = await pool.query(
        'SELECT coll, data FROM crm_records WHERE doc_id = ? AND deleted = 0 ORDER BY coll, seq, id', [docId]);
    const records = {};
    COLLS.forEach(c => { records[c] = []; });
    rows.forEach(r => {
        if (!records[r.coll]) records[r.coll] = [];
        const v = parse(r.data, null);
        if (v) records[r.coll].push(v);
    });
    return { docId, seq: Number(d.seq), meta: parse(d.meta, {}), settings: parse(d.settings, {}), records };
}

async function changesSince(conn, docId, since, excludeSeq) {
    const [rows] = await conn.query(
        'SELECT coll, id, data, deleted, seq, updated_by FROM crm_records WHERE doc_id = ? AND seq > ? AND seq <> ? ORDER BY seq',
        [docId, since, excludeSeq || -1]);
    return rows.map(r => ({
        coll: r.coll, id: r.id, deleted: !!r.deleted,
        data: r.deleted ? null : parse(r.data, null), by: r.updated_by,
    }));
}

/** ดึงของใหม่ตั้งแต่ since — ใช้ตอน poll */
async function pull(docId, since) {
    const conn = await pool.getConnection();
    try {
        const [docs] = await conn.query('SELECT seq, meta, settings, meta_seq FROM crm_doc WHERE doc_id = ?', [docId]);
        if (!docs.length) return null;
        const d = docs[0];
        const out = { seq: Number(d.seq), records: [] };
        if (Number(d.seq) > since) {
            out.records = await changesSince(conn, docId, since);
            if (Number(d.meta_seq) > since) { out.meta = parse(d.meta, {}); out.settings = parse(d.settings, {}); }
        }
        return out;
    } finally {
        conn.release();
    }
}

/**
 * บันทึก batch จาก client ใน transaction เดียว
 * batch = { docId, since, by, upserts:{coll:[rec]}, deletes:{coll:[id]}, meta?, settings? }
 * คืน { seq, records } — records คือของคนอื่นที่เปลี่ยนหลัง since (ไม่รวมของ batch นี้)
 */
async function push(batch) {
    const docId = String(batch.docId || '').slice(0, 40);
    if (!docId) throw Object.assign(new Error('ไม่มี docId'), { status: 400 });
    const since = Number(batch.since) || 0;
    const by = batch.by ? String(batch.by).slice(0, 80) : null;
    const upserts = batch.upserts || {};
    const deletes = batch.deletes || {};

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [docs] = await conn.query('SELECT seq, meta_seq FROM crm_doc WHERE doc_id = ? FOR UPDATE', [docId]);
        let seq;
        if (!docs.length) {
            if (!batch.meta || !batch.settings) throw Object.assign(new Error('ยังไม่มีเอกสารนี้บน server'), { status: 404, code: 'NO_DOC' });
            seq = 0;
            await conn.query(
                'INSERT INTO crm_doc (doc_id, meta, settings, seq, meta_seq, updated_at) VALUES (?, ?, ?, 0, 0, NOW(3))',
                [docId, JSON.stringify(batch.meta), JSON.stringify(batch.settings)]);
        } else {
            seq = Number(docs[0].seq);
        }

        const rows = [];
        Object.keys(upserts).forEach(coll => {
            if (!COLLS.includes(coll)) return;
            (upserts[coll] || []).forEach(rec => {
                if (rec && rec.id) rows.push([coll, String(rec.id), JSON.stringify(rec), 0]);
            });
        });
        Object.keys(deletes).forEach(coll => {
            if (!COLLS.includes(coll)) return;
            (deletes[coll] || []).forEach(id => { if (id) rows.push([coll, String(id), 'null', 1]); });
        });
        const docChanged = !!(batch.meta || batch.settings);

        let newSeq = seq;
        if (rows.length || docChanged) {
            newSeq = seq + 1;
            // ทีละก้อน กัน packet ใหญ่เกิน max_allowed_packet ตอน import ทั้งชุด
            for (let i = 0; i < rows.length; i += 200) {
                const chunk = rows.slice(i, i + 200);
                await conn.query(
                    `INSERT INTO crm_records (doc_id, coll, id, data, deleted, seq, updated_by, updated_at) VALUES ?
                     ON DUPLICATE KEY UPDATE data = VALUES(data), deleted = VALUES(deleted), seq = VALUES(seq),
                       updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)`,
                    [chunk.map(r => [docId, r[0], r[1], r[2], r[3], newSeq, by, new Date()])]);
            }
            const sets = ['seq = ?', 'updated_at = NOW(3)'];
            const vals = [newSeq];
            if (batch.meta)     { sets.push('meta = ?');     vals.push(JSON.stringify(batch.meta)); }
            if (batch.settings) { sets.push('settings = ?'); vals.push(JSON.stringify(batch.settings)); }
            if (docChanged)     { sets.push('meta_seq = ?'); vals.push(newSeq); }
            vals.push(docId);
            await conn.query(`UPDATE crm_doc SET ${sets.join(', ')} WHERE doc_id = ?`, vals);
        }

        const out = { seq: newSeq, records: await changesSince(conn, docId, since, newSeq) };
        const metaSeq = docs.length ? Number(docs[0].meta_seq) : 0;
        if (!docChanged && metaSeq > since) {
            const [d] = await conn.query('SELECT meta, settings FROM crm_doc WHERE doc_id = ?', [docId]);
            out.meta = parse(d[0].meta, {}); out.settings = parse(d[0].settings, {});
        }
        await conn.commit();
        return out;
    } catch (e) {
        await conn.rollback().catch(() => {});
        throw e;
    } finally {
        conn.release();
    }
}

/** แทนที่ทั้งเอกสาร — ใช้โดย scripts/import-json.js ตอนย้ายข้อมูล/กู้จาก backup */
async function replaceAll(state) {
    const docId = state.meta.docId;
    // หน้าเว็บต้องรู้ schema ของข้อมูล ไม่งั้น migrate() จะแปลงซ้ำ (เช่น ย้ายรหัสขั้นการขาย) — เก็บไว้ใน meta
    const meta = Object.assign({}, state.meta, { _schema: state.schema || 4 });
    delete meta.updatedAt; delete meta.editsSinceSave;
    state = Object.assign({}, state, { meta });
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [docs] = await conn.query('SELECT seq FROM crm_doc WHERE doc_id = ? FOR UPDATE', [docId]);
        const newSeq = (docs.length ? Number(docs[0].seq) : 0) + 1;
        if (docs.length) {
            await conn.query('UPDATE crm_doc SET meta = ?, settings = ?, seq = ?, meta_seq = ?, updated_at = NOW(3) WHERE doc_id = ?',
                [JSON.stringify(state.meta), JSON.stringify(state.settings || {}), newSeq, newSeq, docId]);
        } else {
            await conn.query('INSERT INTO crm_doc (doc_id, meta, settings, seq, meta_seq, updated_at) VALUES (?, ?, ?, ?, ?, NOW(3))',
                [docId, JSON.stringify(state.meta), JSON.stringify(state.settings || {}), newSeq, newSeq]);
        }
        // record ที่ไม่อยู่ในชุดใหม่ = ถูกลบ (tombstone ให้เครื่องที่เปิดค้างอยู่รู้)
        await conn.query('UPDATE crm_records SET deleted = 1, data = ?, seq = ?, updated_at = NOW(3) WHERE doc_id = ? AND deleted = 0',
            ['null', newSeq, docId]);
        const rows = [];
        COLLS.forEach(coll => (state[coll] || []).forEach(rec => {
            if (rec && rec.id) rows.push([docId, coll, String(rec.id), JSON.stringify(rec), 0, newSeq, 'import', new Date()]);
        }));
        for (let i = 0; i < rows.length; i += 200) {
            await conn.query(
                `INSERT INTO crm_records (doc_id, coll, id, data, deleted, seq, updated_by, updated_at) VALUES ?
                 ON DUPLICATE KEY UPDATE data = VALUES(data), deleted = 0, seq = VALUES(seq),
                   updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)`,
                [rows.slice(i, i + 200)]);
        }
        await conn.commit();
        return { docId, seq: newSeq, count: rows.length };
    } catch (e) {
        await conn.rollback().catch(() => {});
        throw e;
    } finally {
        conn.release();
    }
}

module.exports = { COLLS, loadDoc, pull, push, replaceAll, firstDocId };
