/* 封面 cover.svg（1200×1200），数字全部来自 core.js 默认场景的同一次 compute；再用浏览器截成 cover.png。
 * 字体名用单引号（SVG 是 XML，裸双引号会让整张图变错误页，批次 64 踩过）。 */
const fs = require('node:fs'), path = require('node:path');
const A = require('./core.js');
const st = A.defaultState(), o = A.compute(st);
if (!o.ok) throw new Error('默认场景算不出来');
const F = "-apple-system,'PingFang SC','Microsoft YaHei',sans-serif", M = 'ui-monospace,Menlo,Consolas,monospace';
const r0 = o.shelves[0];
const after = A.compute(A.applyAction(st, o.actions[0])).shelves[0];
/* 两条板：现在（红，弯）与加一根支撑后（木色，两段） */
const x0 = 140, x1 = 1060, sc = 120 / r0.dl;
const arc = (y, d, segs, color, w) => { let s = ''; const seg = (x1 - x0) / segs; for (let k = 0; k < segs; k++) { const a = x0 + k * seg; s += `<path d="M${a.toFixed(1)} ${y} Q${(a + seg / 2).toFixed(1)} ${(y + 2 * d * sc).toFixed(1)} ${(a + seg).toFixed(1)} ${y}" fill="none" stroke="${color}" stroke-width="${w}"/>`; } return s; };
const books = (y, d, segs) => { let s = ''; const seg = (x1 - x0) / segs; for (let x = x0 + 10; x < x1 - 30; x += 36) { const k = Math.min(segs - 1, Math.floor((x + 13 - x0) / seg)), u = (x + 13 - x0 - k * seg) / seg, yy = y + 4 * d * sc * u * (1 - u); s += `<rect x="${x}" y="${(yy - 80).toFixed(1)}" width="26" height="72" fill="#f3e6d2" stroke="#b7a07c" stroke-width="2"/>`; } return s; };
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <rect width="1200" height="1200" fill="#eef0ec"/>
  <rect x="60" y="60" width="1080" height="1080" rx="24" fill="#ffffff"/>
  <text x="140" y="200" font-family="${F}" font-size="104" font-weight="700" fill="#1f2420">摆书前压一压</text>
  <text x="140" y="268" font-family="${F}" font-size="36" fill="#848b84">这块层板放满书，放久了会弯多少</text>
  <rect x="${x0 - 22}" y="330" width="22" height="300" fill="#e7dccb" stroke="#a88b62" stroke-width="2"/>
  <rect x="${x1}" y="330" width="22" height="300" fill="#e7dccb" stroke="#a88b62" stroke-width="2"/>
  ${books(440, r0.dl, 1)}
  ${arc(440, r0.dl, 1, '#a33a26', 18)}
  <text x="600" y="640" text-anchor="middle" font-family="${M}" font-size="44" font-weight="700" fill="#a33a26">✗ 长期 ${A.fmtV(r0.dl, 1)} mm · ${A.fmtV(r0.perM, 1)} mm/m</text>
  <rect x="${x0 - 22}" y="720" width="22" height="240" fill="#e7dccb" stroke="#a88b62" stroke-width="2"/>
  <rect x="${x1}" y="720" width="22" height="240" fill="#e7dccb" stroke="#a88b62" stroke-width="2"/>
  <rect x="590" y="838" width="20" height="122" fill="#d5dcd2" stroke="#7c8a78" stroke-width="2"/>
  ${books(830, after.dl, 2)}
  ${arc(830, after.dl, 2, '#c8a06a', 18)}
  <text x="600" y="1010" text-anchor="middle" font-family="${M}" font-size="44" font-weight="700" fill="#2f6b3f">✓ 中间加 1 根支撑 · ${A.fmtV(after.perM, 1)} mm/m</text>
  <text x="140" y="1090" font-family="${F}" font-size="28" fill="#848b84">${r0.name} · 颗粒板 ${r0.t} mm · 跨 ${r0.L} mm · 每米 ${r0.load} kg · 虚构示例</text>
</svg>`;
fs.writeFileSync(path.join(__dirname, 'cover.svg'), svg);
console.log('cover.svg', fs.statSync(path.join(__dirname, 'cover.svg')).size, 'bytes');
