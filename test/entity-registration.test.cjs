const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * regression: entity ที่มีไฟล์อยู่แต่ไม่ได้ลงทะเบียนใน TypeORM `entities` จะพังเฉพาะตอนมีข้อมูลจริง
 * (เคยเกิดกับ TicketAttachmentTb → GET /api/tickets/:id/chat/user และ /chat/admin ตอบ 500
 *  "EntityMetadataNotFoundError: No metadata for \"TicketAttachmentTb\"" เมื่อมีข้อความแชทแล้ว)
 */

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name.endsWith('.entity.ts')) files.push(full);
  }
  return files;
}

test('every @Entity class is registered in the TypeORM entities array', () => {
  const srcRoot = path.join(__dirname, '..', 'src');
  const appModule = fs.readFileSync(path.join(srcRoot, 'app.module.ts'), 'utf8');

  const entitiesBlock = appModule.match(/entities:\s*\[([\s\S]*?)\]/);
  assert.ok(entitiesBlock, 'ต้องมี entities: [...] ใน app.module.ts');
  const registered = new Set(entitiesBlock[1].split(',').map((item) => item.trim()).filter(Boolean));

  const entityClasses = walk(srcRoot).map((file) => {
    const source = fs.readFileSync(file, 'utf8');
    const match = source.match(/@Entity\([\s\S]*?export class (\w+)/);
    assert.ok(match, `อ่านชื่อคลาสจาก ${path.basename(file)} ไม่ได้`);
    return { file: path.relative(srcRoot, file), className: match[1] };
  });

  assert.ok(entityClasses.length >= 10, `พบ entity ${entityClasses.length} ไฟล์`);
  const missing = entityClasses.filter((entity) => !registered.has(entity.className));
  assert.deepEqual(
    missing.map((entity) => `${entity.className} (${entity.file})`),
    [],
    'entity ที่ยังไม่ได้ลงทะเบียนจะทำให้ query ตอบ 500 ตอนมีข้อมูลจริง',
  );
});
