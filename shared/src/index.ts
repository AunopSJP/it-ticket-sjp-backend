// ticket.schema.ts รวม department/user schema ไว้ในตัวเองแล้ว (ดูเหตุผลที่คอมเมนต์บนของไฟล์นั้น -
// Vite/Rollup resolve extension-less relative import ข้ามไฟล์ schema ไม่ได้) จึง export แค่ไฟล์เดียวพอ
export * from './schemas/ticket.schema';
