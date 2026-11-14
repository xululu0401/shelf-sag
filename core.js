/* 摆书前压一压 · 计算核心（core.js）
 * 每块层板按「均布荷载的梁」算挠度：搁着 δ = 5wL⁴/(384EI)，两端钉死 δ = wL⁴/(384EI)（理想值）。
 * 长期下垂 = 刚放上去 × (1 + 蠕变系数)；按「每米下垂多少毫米」和你定的上限比。
 * 前封边木条按换算截面（E 加权）算组合惯性矩。中间支撑把一块板分成几段，每段按两端搁着单独算（偏保守）。
 * 纯计算，不碰 DOM。浏览器里挂 window.AppCore，Node 里 module.exports。
 * 材料 E 与密度、书的每米重量、蠕变系数、看得出来的上限都是本页的设计值，用来举例，不是规范或实测。 */
(function (root) {
  'use strict';

  var EPS = 1e-9, G = 9.80665;
  /* 判「过没过」用相对容差：绝对容差会把刚好越线的吞掉（批次 64 踩过） */
  function leTol(a, b) { return a <= b * (1 + 1e-12) + 1e-15; }

  /* 材料：E 取公开资料区间的下限或单值（Engineering ToolBox 木材与板材力学性能表），密度取常见值。都是可改的设计值。 */
  var MATERIALS = [
    { key: 'pb', name: '刨花板 / 颗粒板', E: 2.8, rho: 650 },
    { key: 'mdf', name: '中纤板（密度板）', E: 3.6, rho: 750 },
    { key: 'osb', name: '欧松板 OSB', E: 4.4, rho: 650 },
    { key: 'ply', name: '多层板 / 胶合板', E: 7, rho: 550 },
    { key: 'pine', name: '松木实木', E: 8.5, rho: 450 },
    { key: 'oak', name: '橡木实木', E: 10.3, rho: 650 }
  ];
  var SUPPORTS = { pin: '搁在层板钉上', fixed: '两端钉死（理想值）' };
  var COEF = { pin: 5, fixed: 1 };

  var SHELF_FIELDS = {
    L: { min: 100, max: 2500, label: '跨度 mm', int: false },
    b: { min: 50, max: 800, label: '进深 mm' },
    t: { min: 5, max: 60, label: '板厚 mm' },
    E: { min: 0.5, max: 30, label: '弹性模量 GPa' },
    rho: { min: 100, max: 1500, label: '板密度 kg/m³' },
    load: { min: 0, max: 200, label: '每米放多重 kg/m' },
    mid: { min: 0, max: 9, label: '中间支撑几根', int: true },
    sh: { min: 5, max: 200, label: '木条高 mm' },
    st: { min: 5, max: 60, label: '木条厚 mm' },
    sE: { min: 0.5, max: 30, label: '木条 E GPa' },
    srho: { min: 100, max: 1500, label: '木条密度 kg/m³' }
  };
  var SHELF_KEYS = ['L', 'b', 't', 'E', 'rho', 'load', 'mid'];
  var STRIP_KEYS = ['sh', 'st', 'sE', 'srho'];
  var GLOBAL_FIELDS = {
    creep: { min: 0, max: 2, label: '蠕变系数' },
    lim: { min: 0.5, max: 10, label: '看得出来的下垂 mm/m' }
  };
  var GLOBAL_KEYS = ['creep', 'lim'];
  var MAX_SHELVES = 12, NAME_MAX = 40, T_MAX = 60, SH_MAX = 200, MID_MAX = 9;
  var STRIP_DEFAULT = { st: '20', sE: '8.5', srho: '450' };

  function mat(k) { for (var i = 0; i < MATERIALS.length; i++) if (MATERIALS[i].key === k) return MATERIALS[i]; return null; }
  function shelf(name, m, L, b, t, load, sup, mid, strip) {
    var M = mat(m);
    var s = { name: name, mat: m, E: String(M.E), rho: String(M.rho), L: String(L), b: String(b), t: String(t), load: String(load), sup: sup, mid: String(mid || 0),
      strip: strip ? '1' : '0', sh: String(strip ? strip.sh : 40), st: STRIP_DEFAULT.st, sE: STRIP_DEFAULT.sE, srho: STRIP_DEFAULT.srho };
    return s;
  }
  var BASE = {
    creep: '0.5', lim: '2.5',
    shelves: [
      shelf('书柜第 2 层 · 小说', 'pb', 800, 300, 18, 30, 'pin', 0),
      shelf('书柜第 3 层 · 画册', 'ply', 800, 300, 18, 50, 'pin', 0),
      shelf('墙上松木搁板', 'pine', 1000, 250, 25, 30, 'pin', 0),
      shelf('电视柜下层 · 杂志', 'mdf', 1200, 350, 18, 25, 'fixed', 0)
    ]
  };
  var PRESETS = [
    { key: 'default', name: '一个家里的四块板（虚构）', note: '默认场景是虚构的：两块书柜层板、一块墙上搁板、一块电视柜层板。书的每米重量、材料 E、蠕变系数和「看得出来」的上限都是本页举例用的设计值，按你手上的板和书改。', state: BASE },
    { key: 'ikea', name: '一米长的颗粒板放满精装书', note: '虚构：1000 mm 跨度、18 mm 颗粒板、进深 300 mm，每米放 50 kg 精装书。看看该加几根中间支撑、或者前面贴多高的木条。', state: { creep: '0.5', lim: '2.5', shelves: [shelf('一米颗粒板', 'pb', 1000, 300, 18, 50, 'pin', 0)] } },
    { key: 'strip', name: '已经贴了前封边木条', note: '虚构：1200 mm 的中纤板层板前面已经贴了 20 × 60 mm 的松木条。对照一下有没有木条差多少。', state: { creep: '0.5', lim: '2.5', shelves: [shelf('带木条的长层板', 'mdf', 1200, 300, 18, 30, 'pin', 0, { sh: 60 }), shelf('同一块，不贴木条', 'mdf', 1200, 300, 18, 30, 'pin', 0)] } }
  ];

  function clone(s) { return JSON.parse(JSON.stringify(s)); }
  function defaultState() { return clone(BASE); }
  function stateFromPreset(key) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].key === key) return clone(PRESETS[i].state);
    return defaultState();
  }
  function presetKey(state) {
    var t = JSON.stringify(state);
    for (var i = 0; i < PRESETS.length; i++) if (JSON.stringify(PRESETS[i].state) === t) return PRESETS[i].key;
    return null;
  }
  function blankShelf(i) { return shelf('层板 ' + (i + 1), 'pb', 800, 300, 18, 30, 'pin', 0); }

  function fmtV(x, d) {
    if (typeof x !== 'number' || !isFinite(x)) return '—';
    var p = Math.pow(10, d), r = Math.round(x * p + (x >= 0 ? EPS : -EPS)) / p;
    if (Object.is(r, -0)) r = 0;
    return r.toFixed(d);
  }
  function parseNum(raw) {
    var t = String(raw == null ? '' : raw).trim();
    if (t === '') return { empty: true };
    if (!/^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(t)) return { nan: true };
    return { v: parseFloat(t) };
  }

  function checkField(spec, raw, label, field, errors, extra) {
    var p = parseNum(raw);
    if (p.empty) { errors.push(Object.assign({ code: 'empty', field: field, message: label + spec.label + '没填' }, extra)); return null; }
    if (p.nan) { errors.push(Object.assign({ code: 'nan', field: field, message: label + spec.label + '「' + raw + '」不是数字' }, extra)); return null; }
    if (spec.int && Math.floor(p.v) !== p.v) { errors.push(Object.assign({ code: 'int', field: field, message: label + spec.label + '要是整数，现在是 ' + p.v }, extra)); return null; }
    if (p.v < spec.min || p.v > spec.max) { errors.push(Object.assign({ code: 'range', field: field, message: label + spec.label + '要在 ' + spec.min + '–' + spec.max + ' 之间，现在是 ' + p.v }, extra)); return null; }
    return p.v;
  }

  function validate(state) {
    var errors = [], g = {}, list = [];
    GLOBAL_KEYS.forEach(function (k) { var v = checkField(GLOBAL_FIELDS[k], state[k], '', k, errors, {}); if (v != null) g[k] = v; });
    var arr = Array.isArray(state.shelves) ? state.shelves : [];
    if (!arr.length) errors.push({ code: 'none', field: 'shelves', message: '至少要有一块层板' });
    if (arr.length > MAX_SHELVES) errors.push({ code: 'toomany', field: 'shelves', message: '最多 ' + MAX_SHELVES + ' 块层板，现在是 ' + arr.length });
    arr.slice(0, MAX_SHELVES).forEach(function (s, i) {
      s = s || {};
      var v = { i: i }, nm = String(s.name == null ? '' : s.name).trim(), tag = '第 ' + (i + 1) + ' 块';
      if (!nm) errors.push({ code: 'name', field: 's' + i + '_name', shelf: i, message: tag + '没起名字' });
      else if (nm.length > NAME_MAX) errors.push({ code: 'namelen', field: 's' + i + '_name', shelf: i, message: tag + '的名字超过 ' + NAME_MAX + ' 个字' });
      var label = nm && nm.length <= NAME_MAX ? '「' + nm + '」的' : tag + '的';
      v.name = nm;
      SHELF_KEYS.forEach(function (k) { var x = checkField(SHELF_FIELDS[k], s[k], label, 's' + i + '_' + k, errors, { shelf: i }); if (x != null) v[k] = x; });
      if (s.sup !== 'pin' && s.sup !== 'fixed') errors.push({ code: 'sup', field: 's' + i + '_sup', shelf: i, message: label + '两端怎么固定没选' });
      else v.sup = s.sup;
      v.strip = s.strip === '1';
      if (v.strip) {
        STRIP_KEYS.forEach(function (k) { var x = checkField(SHELF_FIELDS[k], s[k], label, 's' + i + '_' + k, errors, { shelf: i }); if (x != null) v[k] = x; });
        /* 木条贴在板的正前面、上沿和板面齐平，所以至少要跟板一样高 */
        if (v.sh != null && v.t != null && v.sh < v.t) errors.push({ code: 'shlow', field: 's' + i + '_sh', shelf: i, message: label + '木条高 ' + v.sh + ' mm 比板厚 ' + v.t + ' mm 还矮：木条要贴满板的前沿，至少和板一样高' });
      }
      v.mat = s.mat;
      list.push(v);
    });
    return { errors: errors, g: g, shelves: list };
  }

  /* 截面：板 b×t，木条 st×sh 贴在正前方、上沿齐平。以板材 E 为基准做换算截面。
   * 返回 EI（N·mm²）、自重（kg/m）、中性轴距板面 ybar（mm）。 */
  function section(v) {
    var Eb = v.E * 1000, A1 = v.b * v.t, y1 = v.t / 2, I1 = v.b * Math.pow(v.t, 3) / 12;
    var self = v.rho * v.b * v.t / 1e6;
    if (!v.strip) return { EI: Eb * I1, I: I1, ybar: y1, self: self };
    var n = v.sE / v.E, A2 = n * v.st * v.sh, y2 = v.sh / 2;
    var ybar = (A1 * y1 + A2 * y2) / (A1 + A2);
    var I = I1 + A1 * Math.pow(y1 - ybar, 2) + n * v.st * Math.pow(v.sh, 3) / 12 + A2 * Math.pow(y2 - ybar, 2);
    self += v.srho * v.st * v.sh / 1e6;
    return { EI: Eb * I, I: I, ybar: ybar, self: self };
  }

  function shelfCalc(v, g) {
    var sec = section(v);
    var bay = v.L / (v.mid + 1);
    var wkg = v.load + sec.self, w = wkg * G / 1000; /* N/mm */
    /* 有中间支撑时，中间那几个支点挡不住转角，「钉死」只对两头那一点管用：每段一律按搁着算（偏保守） */
    var kSup = (v.sup === 'fixed' && v.mid === 0) ? 'fixed' : 'pin', k = COEF[kSup];
    var d0 = k * w * Math.pow(bay, 4) / (384 * sec.EI);
    var dl = d0 * (1 + g.creep);
    var perM = dl / (bay / 1000);
    var allow = g.lim * bay / 1000;
    var pass = leTol(dl, allow);
    /* 这个截面、这种固定方式下，每米最多放多重（书）——长期下垂刚好到上限 */
    var wMaxN = allow * 384 * sec.EI / (k * (1 + g.creep) * Math.pow(bay, 4));
    var loadMax = wMaxN * 1000 / G - sec.self;
    /* 这个截面、这么重的书，每段最多多长 */
    var bayMax = Math.pow(g.lim / 1000 * 384 * sec.EI / (k * (1 + g.creep) * w), 1 / 3);
    return {
      i: v.i, name: v.name, mat: v.mat, E: v.E, rho: v.rho, L: v.L, b: v.b, t: v.t, load: v.load, sup: v.sup, mid: v.mid, strip: v.strip,
      sh: v.sh, st: v.st, sE: v.sE, srho: v.srho,
      bay: bay, kSup: kSup, self: sec.self, wkg: wkg, EI: sec.EI, I: sec.I, ybar: sec.ybar,
      d0: d0, dl: dl, perM: perM, allow: allow, ratio: dl / allow, pass: pass,
      loadMax: loadMax, bayMax: bayMax
    };
  }

  function setS(state, i, patch) { var s = clone(state); Object.keys(patch).forEach(function (k) { s.shelves[i][k] = String(patch[k]); }); return s; }
  function passes(state, i) { var o = compute(state, true); return o.ok && o.shelves[i].pass ? o.shelves[i] : null; }

  /* 没过的板给改法：每条都把改动写回 state 重算，确实过了才给；并且再少一点就不过（最小性） */
  function actionsFor(state, rc) {
    var acts = [], i = rc.i, q;
    if (rc.pass) return acts;
    /* 1 加中间支撑 */
    for (var m = rc.mid + 1; m <= MID_MAX; m++) {
      q = passes(setS(state, i, { mid: m }), i);
      if (q) { acts.push({ shelf: i, kind: 'mid', patch: { mid: m }, after: q, text: '「' + rc.name + '」中间加到 ' + m + ' 根支撑（每段 ' + fmtV(q.bay, 0) + ' mm）：长期下垂 ' + fmtV(rc.perM, 1) + ' → ' + fmtV(q.perM, 1) + ' mm/m' }); break; }
    }
    /* 2 换厚板（木条在时木条不能比板矮） */
    for (var t = Math.floor(rc.t) + 1; t <= T_MAX; t++) {
      if (rc.strip && rc.sh < t) break;
      q = passes(setS(state, i, { t: t }), i);
      if (q) { acts.push({ shelf: i, kind: 't', patch: { t: t }, after: q, text: '「' + rc.name + '」板厚 ' + rc.t + ' → ' + t + ' mm（同材料）：长期下垂 ' + fmtV(q.perM, 1) + ' mm/m' }); break; }
    }
    /* 3 前面贴木条 / 木条加高 */
    var base = rc.strip ? {} : { strip: '1', st: STRIP_DEFAULT.st, sE: STRIP_DEFAULT.sE, srho: STRIP_DEFAULT.srho };
    var st0 = rc.strip ? Math.floor(rc.sh) + 1 : Math.max(Math.ceil(rc.t), 5);
    for (var h = st0; h <= SH_MAX; h++) {
      var patch = Object.assign({}, base, { sh: h });
      q = passes(setS(state, i, patch), i);
      if (q) {
        var stw = rc.strip ? rc.st : +STRIP_DEFAULT.st;
        acts.push({ shelf: i, kind: 'strip', patch: patch, after: q, text: '「' + rc.name + '」' + (rc.strip ? '木条加高 ' + rc.sh + ' → ' + h + ' mm' : '前沿贴一条 ' + stw + ' × ' + h + ' mm 的松木条（上沿和板面齐平）') + '：长期下垂 ' + fmtV(q.perM, 1) + ' mm/m' });
        break;
      }
    }
    /* 4 少放点：每米最多放多少（向下取 0.1 kg） */
    var lm = Math.floor(rc.loadMax * 10 + EPS) / 10;
    if (lm >= 0.1) {
      q = passes(setS(state, i, { load: lm }), i);
      if (q) acts.push({ shelf: i, kind: 'load', patch: { load: lm }, after: q, text: '「' + rc.name + '」不改板，每米最多放 ' + fmtV(lm, 1) + ' kg（现在 ' + rc.load + ' kg）' });
    }
    return acts;
  }

  function compute(state, noActions) {
    var val = validate(state);
    if (val.errors.length) return { ok: false, errors: val.errors };
    var g = val.g;
    var shelves = val.shelves.map(function (v) { return shelfCalc(v, g); });
    var warnings = [], actions = [];
    shelves.forEach(function (rc) {
      if (rc.sup === 'fixed' && rc.mid > 0) warnings.push({ code: 'fixedmid', shelf: rc.i, message: '「' + rc.name + '」有中间支撑，每段都按「搁着」算（两端钉死只管两头，中间支点挡不住转角）' });
      if (rc.kSup === 'fixed') warnings.push({ code: 'fixed', shelf: rc.i, message: '「' + rc.name + '」按「两端钉死」算的是理想值，下垂只有搁着的 1/5；真实的螺丝和榫接在两者之间，拿不准就按「搁着」算' });
      if (rc.loadMax < 0) warnings.push({ code: 'self', shelf: rc.i, message: '「' + rc.name + '」光自重就超过上限了（每段 ' + fmtV(rc.bay, 0) + ' mm 太长），只能加支撑或换板' });
      if (rc.load > 0 && rc.load < 10) warnings.push({ code: 'light', shelf: rc.i, message: '「' + rc.name + '」每米只放 ' + rc.load + ' kg：书一般比这重，放满一排平装书大约每米 30 kg 上下，确认一下' });
      if (!noActions) {
        var a = actionsFor(state, rc);
        if (!rc.pass && !a.length) warnings.push({ code: 'nofix', shelf: rc.i, message: '「' + rc.name + '」加到 ' + MID_MAX + ' 根支撑、板厚加到 ' + T_MAX + ' mm、木条加到 ' + SH_MAX + ' mm 都不够，也不能靠少放书解决：这块板这么用不行，换材料或者重新设计' });
        actions = actions.concat(a);
      }
    });
    var fail = shelves.filter(function (s) { return !s.pass; }).length;
    var worst = shelves.reduce(function (m, s) { return s.ratio > m.ratio ? s : m; }, shelves[0]);
    return { ok: true, g: g, shelves: shelves, fail: fail, pass: shelves.length - fail, worst: worst.i, warnings: warnings, actions: actions };
  }

  function applyAction(state, a) { return setS(state, a.shelf, a.patch); }

  function supName(k) { return SUPPORTS[k] || k; }
  function matName(s) {
    var M = mat(s.mat);
    if (M && +s.E === M.E && +s.rho === M.rho) return M.name;
    return '自定材料';
  }

  function csvCell(x) { var t = String(x == null ? '' : x); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }
  function toCSV(out, stamp, state) {
    var L = [['摆书前压一压', '导出 ' + stamp, '默认场景为虚构示例']];
    if (!out.ok) { L.push(['还算不出来']); out.errors.forEach(function (e) { L.push([e.message]); }); return L.map(function (r) { return r.map(csvCell).join(','); }).join('\n') + '\n'; }
    L.push(['蠕变系数', out.g.creep, '看得出来的下垂 mm/m', out.g.lim]);
    L.push(['层板', '材料', 'E GPa', '密度 kg/m³', '跨度 mm', '中间支撑', '每段 mm', '进深 mm', '板厚 mm', '前封边木条', '两端', '书 kg/m', '自重 kg/m', '刚放上 mm', '长期 mm', '长期 mm/m', '上限 mm', '结果', '每米最多放 kg', '每段最长 mm']);
    out.shelves.forEach(function (r) {
      var src = state && state.shelves && state.shelves[r.i];
      L.push([r.name, src ? matName(src) : '', r.E, r.rho, r.L, r.mid, fmtV(r.bay, 0), r.b, r.t, r.strip ? r.st + '×' + r.sh + ' mm，E ' + r.sE : '无', supName(r.sup), r.load, fmtV(r.self, 2),
        fmtV(r.d0, 2), fmtV(r.dl, 2), fmtV(r.perM, 2), fmtV(r.allow, 2), r.pass ? '过' : '会弯得看得出来', fmtV(Math.max(0, Math.floor(r.loadMax * 10 + EPS) / 10), 1), fmtV(Math.floor(r.bayMax), 0)]);
    });
    if (out.actions.length) { L.push([]); L.push(['改法']); out.actions.forEach(function (a) { L.push([a.text]); }); }
    return L.map(function (r) { return r.map(csvCell).join(','); }).join('\n') + '\n';
  }
  function toMD(out, stamp, state) {
    var L = ['# 摆书前压一压', '', '导出时间 ' + stamp + '。默认场景为虚构示例；材料 E、书的每米重量、蠕变系数和「看得出来」的上限都是可改的设计值，不是实测或规范。', ''];
    if (!out.ok) { L.push('## 还算不出来', ''); out.errors.forEach(function (e) { L.push('- ' + e.message); }); return L.join('\n') + '\n'; }
    L.push('## 检查单', '', out.shelves.length + ' 块层板，' + out.pass + ' 块过、' + out.fail + ' 块会弯得看得出来（上限 ' + out.g.lim + ' mm/m，长期按刚放上去的 ' + fmtV(1 + out.g.creep, 2) + ' 倍）。', '');
    out.shelves.forEach(function (r) {
      var src = state && state.shelves && state.shelves[r.i];
      L.push('- [' + (r.pass ? 'x' : ' ') + '] ' + r.name + '：长期下垂 ' + fmtV(r.dl, 1) + ' mm（' + fmtV(r.perM, 1) + ' mm/m，上限 ' + fmtV(r.allow, 1) + ' mm）');
      L.push('  - ' + (src ? matName(src) : '') + ' ' + r.t + ' mm，跨度 ' + r.L + ' mm' + (r.mid ? '（中间 ' + r.mid + ' 根支撑，每段 ' + fmtV(r.bay, 0) + ' mm）' : '') + '，进深 ' + r.b + ' mm，' + supName(r.sup) + (r.strip ? '，前封边木条 ' + r.st + ' × ' + r.sh + ' mm' : ''));
      L.push('  - 书 ' + r.load + ' kg/m + 自重 ' + fmtV(r.self, 2) + ' kg/m；刚放上去 ' + fmtV(r.d0, 2) + ' mm；每米最多放 ' + fmtV(Math.max(0, Math.floor(r.loadMax * 10 + EPS) / 10), 1) + ' kg；这么重的书每段最长 ' + fmtV(Math.floor(r.bayMax), 0) + ' mm');
    });
    L.push('');
    if (out.actions.length) { L.push('## 改法（每条都回填重算过）', ''); out.actions.forEach(function (a) { L.push('- ' + a.text); }); L.push(''); }
    if (out.warnings.length) { L.push('## 提醒', ''); out.warnings.forEach(function (w) { L.push('- ' + w.message); }); L.push(''); }
    return L.join('\n') + '\n';
  }

  var API = {
    MATERIALS: MATERIALS, SUPPORTS: SUPPORTS, SHELF_FIELDS: SHELF_FIELDS, SHELF_KEYS: SHELF_KEYS, STRIP_KEYS: STRIP_KEYS,
    GLOBAL_FIELDS: GLOBAL_FIELDS, GLOBAL_KEYS: GLOBAL_KEYS, PRESETS: PRESETS, MAX_SHELVES: MAX_SHELVES, NAME_MAX: NAME_MAX, G: G,
    STRIP_DEFAULT: STRIP_DEFAULT,
    defaultState: defaultState, stateFromPreset: stateFromPreset, presetKey: presetKey, blankShelf: blankShelf, mat: mat, matName: matName, supName: supName,
    fmtV: fmtV, parseNum: parseNum, validate: validate, section: section, compute: compute, applyAction: applyAction, toCSV: toCSV, toMD: toMD
  };
  if (typeof module === 'object' && module.exports) module.exports = API;
  root.AppCore = API;
})(typeof window !== 'undefined' ? window : globalThis);
