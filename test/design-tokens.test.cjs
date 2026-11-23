const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * ตรวจโทเคนตามสเปกข้อ 4 จาก styles.css จริง
 * เกณฑ์เข้าถึง: ข้อความปกติ ≥ 4.5:1, เส้นขอบ/วงแหวน focus ≥ 3:1
 */
const css = fs.readFileSync(
  path.join(__dirname, '..', '..', 'sjp-ticket-frontend', 'src', 'styles.css'),
  'utf8',
);

function lightBlock() {
  // ต้องหา selector จริงที่ขึ้นต้นบรรทัด เพราะคอมเมนต์หัวไฟล์ก็พูดถึง data-theme='light'
  const match = css.match(/^:root\[data-theme='light'\]\s*\{/m);
  assert.ok(match, 'ไม่พบบล็อกธีมสว่างใน styles.css');
  const open = css.indexOf('{', match.index);
  const end = css.indexOf('\n}', open);
  return css.slice(open, end);
}

const block = lightBlock();

function token(name) {
  const match = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  assert.ok(match, `ไม่พบโทเคน --${name}`);
  return match[1].trim();
}

function rgb(color) {
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

function luminance(color) {
  const [r, g, b] = rgb(color).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('spec 4: app surface, panel, text, divider and primary accent use the specified values', () => {
  assert.equal(token('color-bg'), '#f5f7fa');
  assert.equal(token('color-surface'), '#ffffff');
  assert.equal(token('color-text'), '#17212e');
  assert.equal(token('color-text-secondary'), '#475569');
  assert.equal(token('color-border'), '#e2e8f0');
  assert.equal(token('color-primary'), '#1d4ed8');
  assert.equal(token('color-row-active'), '#edf4ff');
});

test('spec 4: Noto Sans Thai is first with a system fallback', () => {
  assert.match(css, /font-family:\s*'Noto Sans Thai',[^;]*system-ui/);
});

test('spec 4: body and secondary text reach 4.5:1 on panel and app surfaces', () => {
  const surface = token('color-surface');
  assert.ok(contrast(token('color-text'), surface) >= 4.5, 'text on panel');
  assert.ok(contrast(token('color-text-secondary'), surface) >= 4.5, 'secondary text on panel');
  assert.ok(contrast(token('color-text'), token('color-bg')) >= 4.5, 'text on app surface');
});

test('spec 4: primary button and focus ring are legible', () => {
  assert.ok(contrast(token('on-primary'), token('color-primary')) >= 4.5, 'on-primary on primary');
  assert.ok(contrast(token('color-primary'), token('color-surface')) >= 3, 'focus ring vs panel');
});

test('spec 4: every status tone reaches 4.5:1 on its own chip background', () => {
  for (const status of ['open', 'in-progress', 'waiting', 'forwarded', 'pending-confirmation', 'closed']) {
    const ratio = contrast(token(`status-${status}-text`), token(`status-${status}-bg`));
    assert.ok(ratio >= 4.5, `${status} ต้องผ่าน 4.5:1 แต่ได้ ${ratio.toFixed(2)}`);
  }
});

test('spec 2.2: status labels follow the four-state model', () => {
  const shared = fs.readFileSync(
    path.join(__dirname, '..', 'shared', 'src', 'schemas', 'ticket.schema.ts'),
    'utf8',
  );
  for (const [key, label] of [
    ['open', 'ใหม่'],
    ['in_progress', 'กำลังดำเนินการ'],
    ['waiting', 'รอข้อมูลผู้แจ้ง'],
    ['pending_confirmation', 'แก้ไขแล้ว'],
  ]) {
    assert.ok(shared.includes(`${key}: '${label}'`), `สถานะ ${key} ต้องมีข้อความ "${label}"`);
  }
});
