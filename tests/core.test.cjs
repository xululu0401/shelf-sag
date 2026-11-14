/* 摆书前压一压 · 核心测试。node --test tests/core.test.cjs
 * 锚点来自 evidence/手算锚点.py（Fraction 精确有理数、不读 core.js）。
 * 末尾一组把错误注入源码再跑同一批锚点，确认锚点够尖，能把每个错误抓出来。 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../core.js');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'core.js'), 'utf8');
const RAND = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'evidence', '随机对拍.json'), 'utf8'));
const near = (a, b, tol) => Math.abs(a - b) <= (tol || 1e-9) * Math.max(1, Math.abs(b));

function load(src) { const sb = { module: { exports: {} } }; sb.globalThis = sb; vm.runInNewContext(src, sb); return sb.module.exports; }
function anchors(M) {
  /* 返回 null 表示全部锚点通过；否则返回第一条不通过的原因 */
  const o = M.compute(M.defaultState());
  if (!o.ok) return '默认算不出来';
  const exp = [[3.51, 4.2932, 8.0497, false], [2.97, 2.7145, 5.0897, false], [2.8125, 1.5143, 2.2714, true], [4.725, 2.5706, 3.2132, false]];
  for (let i = 0; i < 4; i++) {
    const r = o.shelves[i], e = exp[i];
    if (!near(r.self, e[0], 1e-6) || Math.abs(r.d0 - e[1]) > 6e-5 || Math.abs(r.perM - e[2]) > 6e-5 || r.pass !== e[3]) return '第 ' + (i + 1) + ' 块：' + [r.self, r.d0, r.perM, r.pass].join('/');
  }
  const p = M.stateFromPreset('strip'), q = M.compute(p);
  if (!q.ok || Math.abs(q.shelves[0].perM - 1.7518) > 6e-5) return '木条预设 ' + (q.ok && q.shelves[0].perM);
  const s = M.defaultState(); s.shelves[0].mid = '1'; s.shelves[3].mid = '1';
  const m = M.compute(s);
  if (!m.ok || Math.abs(m.shelves[0].perM - 1.0062) > 6e-5) return '加支撑 ' + (m.ok && m.shelves[0].perM);
  if (Math.abs(m.shelves[3].bay - 600) > 1e-9 || Math.abs(m.shelves[3].kSup === 'pin' ? 0 : 1) > 0) return '钉死+支撑应按搁着';
  for (let k = 0; k < 60; k++) {
    const R = RAND[k], st = { creep: R.creep, lim: R.lim, shelves: [Object.assign({ name: 'x', mat: 'pb' }, R.in, { strip: R.strip ? '1' : '0', sh: R.strip ? R.strip[0] : '40', st: R.strip ? R.strip[1] : '20', sE: R.strip ? R.strip[2] : '8.5', srho: R.strip ? R.strip[3] : '450' })] };
    Object.keys(st.shelves[0]).forEach((kk) => { st.shelves[0][kk] = String(st.shelves[0][kk]); });
    const z = M.compute(st, true);
    if (!z.ok || !near(z.shelves[0].d0, +R.d0, 1e-8) || z.shelves[0].pass !== R.pass) return '随机 ' + k;
  }
  return null;
}
const mkState = (R) => {
  const s = Object.assign({ name: 'x', mat: 'pb' }, R.in, { strip: R.strip ? '1' : '0', sh: R.strip ? R.strip[0] : '40', st: R.strip ? R.strip[1] : '20', sE: R.strip ? R.strip[2] : '8.5', srho: R.strip ? R.strip[3] : '450' });
  Object.keys(s).forEach((k) => { s[k] = String(s[k]); });
  return { creep: R.creep, lim: R.lim, shelves: [s] };
};

test('A1 默认四块：自重、刚放上、长期 mm/m、过不过与 Python 锚点一致', () => {
  assert.equal(anchors(C), null);
  const o = C.compute(C.defaultState());
  assert.equal(o.pass, 1); assert.equal(o.fail, 3); assert.equal(o.worst, 0);
  assert.equal(C.fmtV(o.shelves[0].allow, 1), '2.0');
});

test('A2 随机 300 组与 Python 精确有理数对拍（d0 相对 1e-8、过不过一致）', () => {
  assert.equal(RAND.length, 300);
  let n = 0;
  RAND.forEach((R) => {
    const o = C.compute(mkState(R), true);
    assert.ok(o.ok, JSON.stringify(R.in));
    assert.ok(near(o.shelves[0].d0, +R.d0, 1e-8), R.d0 + ' vs ' + o.shelves[0].d0);
    assert.ok(near(o.shelves[0].dl, +R.dl, 1e-8));
    assert.equal(o.shelves[0].pass, R.pass); n++;
  });
  assert.equal(n, 300);
});

test('A3 常识比例：每米荷载不变时跨度×2 → 16 倍（总荷载也翻倍）；E×2 → 一半；只有自重时进深×2 不变；钉死 = 搁着的 1/5；蠕变 0 时长期 = 刚放上', () => {
  const base = { name: 'x', mat: 'pb', E: '2.8', rho: '100', L: '600', b: '300', t: '18', load: '30', sup: 'pin', mid: '0', strip: '0', sh: '40', st: '20', sE: '8.5', srho: '450' };
  const run = (p, g) => C.compute(Object.assign({ creep: '0.5', lim: '2.5', shelves: [Object.assign({}, base, p)] }, g || {}), true).shelves[0];
  const r0 = run({});
  assert.ok(near(run({ L: '1200' }).d0 / r0.d0, 16, 1e-12));
  assert.ok(near(run({ E: '5.6' }).d0 / r0.d0, 0.5, 1e-12));
  assert.ok(near(run({ load: '0', b: '600' }).d0 / run({ load: '0' }).d0, 1, 1e-12));
  /* 零荷载时下垂 ∝ ρ·t/t³ = 1/t²：板厚翻倍 → 1/4 */
  assert.ok(near(run({ load: '0', t: '36' }).d0 / run({ load: '0' }).d0, 0.25, 1e-12));
  assert.ok(near(run({ sup: 'fixed' }).d0 / r0.d0, 0.2, 1e-12));
  assert.ok(near(run({}, { creep: '0' }).dl, r0.d0, 1e-12));
});

test('A4 木条换算截面：木条与板同材料、同宽度时等于一块整截面；木条 E=板 E 时与 T 形截面手算一致', () => {
  /* 木条厚 = 进深、木条高 = 板厚 → 等于两块并排的矩形 = 宽 2b 的板 */
  const v = { E: 3.6, b: 300, t: 18, rho: 750, strip: true, sh: 18, st: 300, sE: 3.6, srho: 750 };
  const s = C.section(v);
  assert.ok(near(s.I, 600 * Math.pow(18, 3) / 12, 1e-12));
  assert.ok(near(s.ybar, 9, 1e-12));
  /* L 形：板 300×18 + 木条 20×50，同 E。手算：A1=5400,y1=9；A2=1000,y2=25；ybar=(48600+25000)/6400=11.5 */
  const s2 = C.section({ E: 3.6, b: 300, t: 18, rho: 750, strip: true, sh: 50, st: 20, sE: 3.6, srho: 450 });
  const I = 300 * 5832 / 12 + 5400 * 2.5 * 2.5 + 20 * 125000 / 12 + 1000 * 13.5 * 13.5;
  assert.ok(near(s2.ybar, 11.5, 1e-12)); assert.ok(near(s2.I, I, 1e-12));
  assert.ok(near(s2.self, 750 * 300 * 18 / 1e6 + 450 * 20 * 50 / 1e6, 1e-12));
});

test('A5 改法：每条都回填重算真的过，且再少一点就不过（最小性）', () => {
  const st = C.defaultState(), o = C.compute(st);
  assert.equal(o.actions.length, 12);
  o.actions.forEach((a) => {
    const q = C.compute(C.applyAction(st, a));
    assert.ok(q.ok && q.shelves[a.shelf].pass, a.text);
    const back = JSON.parse(JSON.stringify(st));
    if (a.kind === 'mid') back.shelves[a.shelf].mid = String(a.patch.mid - 1);
    if (a.kind === 't') back.shelves[a.shelf].t = String(a.patch.t - 1);
    if (a.kind === 'strip') Object.assign(back.shelves[a.shelf], a.patch, { sh: String(a.patch.sh - 1) });
    if (a.kind === 'load') back.shelves[a.shelf].load = String(Math.round((a.patch.load + 0.1) * 10) / 10);
    Object.keys(back.shelves[a.shelf]).forEach((k) => { back.shelves[a.shelf][k] = String(back.shelves[a.shelf][k]); });
    const w = C.compute(back, true);
    if (a.kind === 'strip' && a.patch.sh - 1 < +st.shelves[a.shelf].t) return;
    assert.ok(w.ok && !w.shelves[a.shelf].pass, '少一点还过：' + a.text);
  });
  const t0 = o.actions.map((a) => a.text);
  assert.ok(t0.indexOf('「书柜第 2 层 · 小说」板厚 18 → 28 mm（同材料）：长期下垂 2.3 mm/m') >= 0);
  assert.ok(t0.indexOf('「书柜第 2 层 · 小说」前沿贴一条 20 × 36 mm 的松木条（上沿和板面齐平）：长期下垂 2.3 mm/m') >= 0);
  assert.ok(t0.indexOf('「书柜第 2 层 · 小说」不改板，每米最多放 6.8 kg（现在 30 kg）') >= 0);
});

test('A6 阈值两侧：书正好放到「每米最多」算过，多百万分之一就不过（相对容差）', () => {
  [0, 1, 3].forEach((i) => {
    const r = C.compute(C.defaultState(), true).shelves[i];
    const at = C.defaultState(); at.shelves[i].load = String(r.loadMax);
    assert.equal(C.compute(at, true).shelves[i].pass, true, r.name + ' 正好');
    const over = C.defaultState(); over.shelves[i].load = String(r.loadMax * (1 + 1e-6));
    assert.equal(C.compute(over, true).shelves[i].pass, false, r.name + ' 多一点');
  });
});

test('A7 每米最多放 / 每段最长两个反解回填刚好到上限', () => {
  const o = C.compute(C.defaultState(), true);
  o.shelves.forEach((r, i) => {
    if (r.loadMax > 0) {
      const s = C.defaultState(); s.shelves[i].load = String(r.loadMax);
      const q = C.compute(s, true).shelves[i]; assert.ok(near(q.dl, q.allow, 1e-9), r.name);
    }
    const s2 = C.defaultState(); s2.shelves[i].L = String(r.bayMax);
    const q2 = C.compute(s2, true).shelves[i]; assert.ok(near(q2.perM, o.g.lim, 1e-9), r.name);
  });
});

test('A8 非法输入：空、非数字、范围、非整数支撑、没选固定方式、木条比板矮、没名字、超长名字、零块、13 块', () => {
  const s = C.defaultState();
  s.shelves[0].L = ''; s.shelves[1].t = 'abc'; s.shelves[2].E = '0'; s.shelves[3].mid = '1.5'; s.creep = '3';
  let o = C.compute(s); assert.equal(o.ok, false);
  const codes = o.errors.map((e) => e.code + ':' + e.field).sort().join();
  assert.equal(codes, ['empty:s0_L', 'nan:s1_t', 'range:s2_E', 'int:s3_mid', 'range:creep'].sort().join());
  const s2 = C.defaultState(); s2.shelves[0].sup = 'x'; s2.shelves[1].strip = '1'; s2.shelves[1].sh = '10'; s2.shelves[2].name = ' '; s2.shelves[3].name = 'a'.repeat(41);
  o = C.compute(s2); assert.deepEqual(o.errors.map((e) => e.code).sort(), ['name', 'namelen', 'shlow', 'sup']);
  assert.ok(o.errors.filter((e) => e.code === 'shlow')[0].message.indexOf('比板厚 18 mm 还矮') > 0);
  assert.equal(C.compute({ creep: '0.5', lim: '2.5', shelves: [] }).errors[0].code, 'none');
  const many = C.defaultState(); for (let i = 0; i < 9; i++) many.shelves.push(C.blankShelf(4 + i));
  assert.equal(C.compute(many).errors[0].code, 'toomany');
  /* 不带木条时木条字段乱填也不报错（不用的输入不拦人） */
  const s3 = C.defaultState(); s3.shelves[0].sh = 'abc'; assert.equal(C.compute(s3).ok, true);
});

test('A9 极值：最短最薄最轻 / 最长最重；零荷载；自重就超限的提醒', () => {
  const lo = C.compute({ creep: '0', lim: '0.5', shelves: [Object.assign(C.blankShelf(0), { L: '100', b: '50', t: '5', load: '0' })] });
  assert.ok(lo.ok && isFinite(lo.shelves[0].d0) && lo.shelves[0].d0 > 0);
  const hi = C.compute({ creep: '2', lim: '10', shelves: [Object.assign(C.blankShelf(0), { L: '2500', b: '800', t: '5', E: '0.5', load: '200' })] });
  assert.ok(hi.ok && hi.shelves[0].pass === false && isFinite(hi.shelves[0].perM));
  assert.ok(hi.warnings.some((w) => w.code === 'self'));
  /* 2.5 m、5 mm、E 0.5 GPa、每米 200 kg、上限 10 mm/m：只有贴一条很高的木条能救（首版测试以为没救，引擎是对的，改断言） */
  assert.deepEqual(hi.actions.map((a) => a.kind), ['strip']);
  assert.ok(C.compute(C.applyAction({ creep: '2', lim: '10', shelves: [Object.assign(C.blankShelf(0), { L: '2500', b: '800', t: '5', E: '0.5', load: '200' })] }, hi.actions[0])).shelves[0].pass);
  /* 上限收紧到 0.5 mm/m：四条改法都没有 → 必须明说「这么用不行」 */
  const no = C.compute({ creep: '2', lim: '0.5', shelves: [Object.assign(C.blankShelf(0), { L: '2500', b: '800', t: '5', E: '0.5', load: '200' })] });
  assert.equal(no.actions.length, 0);
  assert.ok(no.warnings.some((w) => w.code === 'nofix'));
  const s9 = { creep: '2', lim: '0.5', shelves: [Object.assign(C.blankShelf(0), { L: '2500', b: '800', t: '5', E: '0.5', load: '200', mid: '9' })] };
  assert.equal(C.compute(s9, true).shelves[0].pass, false, '确认 9 根支撑确实不够');
  /* 稍好一点的板（E 2.8、18 mm）有改法，每条都回填过 */
  const mid = { creep: '2', lim: '10', shelves: [Object.assign(C.blankShelf(0), { L: '2500', load: '200' })] }, mo = C.compute(mid);
  assert.ok(mo.actions.length > 0 && !mo.warnings.some((w) => w.code === 'nofix'));
  mo.actions.forEach((a) => assert.ok(C.compute(C.applyAction(mid, a)).shelves[0].pass, a.text));
  const z = C.compute({ creep: '0.5', lim: '2.5', shelves: [Object.assign(C.blankShelf(0), { load: '0' })] });
  assert.ok(z.ok && z.shelves[0].d0 > 0, '零荷载仍有自重下垂');
});

test('A10 钉死与中间支撑：钉死且无支撑按 1/5；钉死+支撑按搁着并提醒', () => {
  const s = C.defaultState(); const o = C.compute(s);
  assert.equal(o.shelves[3].kSup, 'fixed');
  assert.ok(o.warnings.some((w) => w.code === 'fixed' && w.shelf === 3));
  s.shelves[3].mid = '1'; const o2 = C.compute(s);
  assert.equal(o2.shelves[3].kSup, 'pin');
  assert.ok(o2.warnings.some((w) => w.code === 'fixedmid'));
  assert.ok(!o2.warnings.some((w) => w.code === 'fixed'));
});

test('A11 导出：CSV/MD 用同一次 out，数字与引擎同口径；预设识别；材料名识别', () => {
  const st = C.defaultState(), o = C.compute(st);
  const csv = C.toCSV(o, 'X', st), md = C.toMD(o, 'X', st);
  assert.ok(csv.indexOf('书柜第 2 层 · 小说,刨花板 / 颗粒板,2.8,650,800,0,800,300,18,无,搁在层板钉上,30,3.51,4.29,6.44,8.05,2.00,会弯得看得出来,6.8,541') >= 0, csv);
  assert.ok(md.indexOf('4 块层板，1 块过、3 块会弯得看得出来') > 0);
  assert.ok(md.indexOf('- [x] 墙上松木搁板') > 0 && md.indexOf('- [ ] 书柜第 2 层') > 0);
  assert.equal(C.presetKey(st), 'default');
  st.shelves[0].E = '3'; assert.equal(C.matName(st.shelves[0]), '自定材料'); assert.equal(C.presetKey(st), null);
  const bad = C.compute(Object.assign(C.defaultState(), { lim: 'x' }));
  assert.ok(C.toCSV(bad, 'X').indexOf('还算不出来') > 0 && C.toMD(bad, 'X').indexOf('## 还算不出来') > 0);
  assert.ok(near(C.G, 9.80665, 0));
});

test('A12 注入错误：每个错误都让锚点不通过（锚点够尖）', () => {
  const MUT = [
    ['简支系数 5→4', "var COEF = { pin: 5, fixed: 1 }", "var COEF = { pin: 4, fixed: 1 }"],
    ['固支系数 1→2', "var COEF = { pin: 5, fixed: 1 }", "var COEF = { pin: 5, fixed: 2 }"],
    ['分母 384→348', "(384 * sec.EI)", "(348 * sec.EI)"],
    ['L⁴→L³', "Math.pow(bay, 4) / (384 * sec.EI)", "Math.pow(bay, 3) / (384 * sec.EI)"],
    ['惯性矩 /12→/6', "var Eb = v.E * 1000, A1 = v.b * v.t, y1 = v.t / 2, I1 = v.b * Math.pow(v.t, 3) / 12", "var Eb = v.E * 1000, A1 = v.b * v.t, y1 = v.t / 2, I1 = v.b * Math.pow(v.t, 3) / 6"],
    ['GPa 换算漏 ×1000', "var Eb = v.E * 1000", "var Eb = v.E * 100"],
    ['重力加速度用 10', "G = 9.80665", "G = 10"],
    ['忘了自重', "var wkg = v.load + sec.self", "var wkg = v.load"],
    ['自重密度单位错', "var self = v.rho * v.b * v.t / 1e6", "var self = v.rho * v.b * v.t / 1e5"],
    ['蠕变乘而不是 1+', "var dl = d0 * (1 + g.creep)", "var dl = d0 * g.creep"],
    ['每段长按总跨', "var bay = v.L / (v.mid + 1)", "var bay = v.L"],
    ['分段数少 1', "var bay = v.L / (v.mid + 1)", "var bay = v.L / Math.max(1, v.mid)"],
    ['上限按总跨', "var allow = g.lim * bay / 1000", "var allow = g.lim * v.L / 1000"],
    ['钉死+支撑仍按钉死', "(v.sup === 'fixed' && v.mid === 0) ? 'fixed' : 'pin'", "(v.sup === 'fixed') ? 'fixed' : 'pin'"],
    ['木条平行轴项漏', "+ A2 * Math.pow(y2 - ybar, 2)", ""],
    ['木条没按 E 换算', "var n = v.sE / v.E", "var n = 1"],
    ['木条中性轴用板中', "var ybar = (A1 * y1 + A2 * y2) / (A1 + A2)", "var ybar = y1"],
    ['木条自重漏', "self += v.srho * v.st * v.sh / 1e6", ""],
    ['过不过判反', "var pass = leTol(dl, allow)", "var pass = !leTol(dl, allow)"],
    ['用刚放上的判', "var pass = leTol(dl, allow)", "var pass = leTol(d0, allow)"]
  ];
  const caught = [];
  MUT.forEach(([name, a, b]) => {
    assert.ok(SRC.indexOf(a) >= 0, '注入点找不到：' + name);
    let M; try { M = load(SRC.replace(a, b)); } catch (e) { caught.push(name); return; }
    let r; try { r = anchors(M); } catch (e) { r = '抛错 ' + e.message; }
    assert.notEqual(r, null, '锚点没抓到：' + name);
    caught.push(name);
  });
  assert.equal(caught.length, MUT.length);
  assert.equal(anchors(load(SRC)), null, '原样源码应全部通过');
});
