-- AndamanTech CRM — idempotent (รันซ้ำได้เสมอ)
--
-- เก็บ record เป็น JSON ทั้งก้อนแทนการแตกคอลัมน์ โดยตั้งใจ:
-- หน้าเว็บ (public/index.html) เป็นเจ้าของรูปร่างข้อมูล (SP.Store.migrate, schema 4)
-- และมีหลายจุดที่แก้ state ตรง ๆ — server จึงเป็นแค่ที่เก็บ record ตาม id
-- รายงานผ่าน SQL ใช้ JSON_EXTRACT(data, '$.stage') ได้

CREATE TABLE IF NOT EXISTS crm_doc (
  doc_id     VARCHAR(40)  NOT NULL PRIMARY KEY,
  meta       LONGTEXT     NOT NULL,     -- JSON ของ SP.state.meta
  settings   LONGTEXT     NOT NULL,     -- JSON ของ SP.state.settings
  seq        BIGINT       NOT NULL DEFAULT 0,   -- เลขลำดับการเปลี่ยนแปลงล่าสุดของทั้งเอกสาร
  meta_seq   BIGINT       NOT NULL DEFAULT 0,   -- seq ครั้งล่าสุดที่ meta/settings เปลี่ยน
  updated_at DATETIME(3)  NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_records (
  doc_id     VARCHAR(40)  NOT NULL,
  coll       VARCHAR(16)  NOT NULL,     -- jobs|customers|contacts|activities|plans|discussions|owners
  id         VARCHAR(64)  NOT NULL,     -- id จาก SP.U.uid() เช่น C-mu9jzm7yqjfs
  data       LONGTEXT     NOT NULL,     -- JSON ของ record
  deleted    TINYINT(1)   NOT NULL DEFAULT 0,   -- tombstone ให้เครื่องอื่นรู้ว่าถูกลบ
  seq        BIGINT       NOT NULL,
  updated_by VARCHAR(80)  NULL,
  updated_at DATETIME(3)  NOT NULL,
  PRIMARY KEY (doc_id, coll, id),
  KEY ix_doc_seq (doc_id, seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
