/* 摆书前压一压 · 界面（ui.js）
 * 把输入读成 state → 交给 AppCore.compute → 把同一次输出画出来。页面不自己算数。
 * 层板卡片只在块数变化 / 换预设 / 恢复 / 点改法 / 切换材料或木条时重建；打字时只刷新读数，不丢光标。 */
(function () {
  'use strict';
  var A = window.AppCore;
  var KEY = 'shelf-sag:v1';
  var $ = function (id) { return document.getElementById(id); };
  var ALLK = ['name', 'mat', 'sup', 'strip'].concat(A.SHELF_KEYS, A.STRIP_KEYS);
  var state = load() || A.defaultState();
  var out = null;

  function str(v) { return String(v == null ? '' : v); }
  function sanitize(s) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.shelves)) return null;
    var d = A.defaultState();
    A.GLOBAL_KEYS.forEach(function (k) { if (s[k] != null) d[k] = str(s[k]); });
    d.shelves = s.shelves.slice(0, A.MAX_SHELVES).map(function (r, i) {
      var b = A.blankShelf(i); if (!r || typeof r !== 'object') return b;
      ALLK.forEach(function (k) { if (r[k] != null) b[k] = str(r[k]); });
      return b;
    });
    return d.shelves.length ? d : null;
  }
  function load() {
    try { var t = localStorage.getItem(KEY); if (!t) return null; var j = JSON.parse(t); return sanitize(j && j.state); } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ state: state })); $('saveTag').textContent = '· 已存到本机'; }
    catch (e) { $('saveTag').textContent = '· 没能存到本机'; }
  }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var f0 = function (x) { return A.fmtV(x, 0); }, f1 = function (x) { return A.fmtV(x, 1); }, f2 = function (x) { return A.fmtV(x, 2); };

  function renderPresets() {
    var k = A.presetKey(state);
    $('presets').innerHTML = A.PRESETS.map(function (p) {
      return '<button type="button" class="chip" id="preset_' + p.key + '" data-p="' + p.key + '" aria-pressed="' + (k === p.key) + '">' + esc(p.name) + '</button>';
    }).join('');
    var cur = A.PRESETS.filter(function (p) { return p.key === k; })[0];
    $('presetNote').textContent = cur ? cur.note : '已按你的输入计算（不是预设）。';
  }
  $('presets').addEventListener('click', function (e) {
    var b = e.target.closest('[data-p]'); if (!b) return;
    state = A.stateFromPreset(b.getAttribute('data-p')); rebuild();
  });

  var LABELS = { L: '跨度 mm', b: '进深 mm', t: '板厚 mm', E: '弹性模量 GPa', rho: '板密度 kg/m³', load: '每米放多重 kg', mid: '中间支撑几根', sh: '木条高 mm', st: '木条厚 mm', sE: '木条 E GPa', srho: '木条密度 kg/m³' };
  function inp(i, k) { return '<div class="f" id="f_s' + i + '_' + k + '"><label for="s' + i + '_' + k + '">' + LABELS[k] + '</label><input id="s' + i + '_' + k + '" data-i="' + i + '" data-k="' + k + '" inputmode="decimal"></div>'; }
  function buildShelves() {
    $('shelves').innerHTML = state.shelves.map(function (s, i) {
      var opts = A.MATERIALS.map(function (m) { return '<option value="' + m.key + '">' + esc(m.name) + '</option>'; }).join('') + '<option value="custom">自定材料（自己填 E 和密度）</option>';
      var sups = Object.keys(A.SUPPORTS).map(function (k) { return '<option value="' + k + '">' + esc(A.SUPPORTS[k]) + '</option>'; }).join('');
      var strip = s.strip === '1';
      return '<section class="card" id="shelf_' + i + '"><div class="shelf">' +
        '<div><svg class="side" id="side_' + i + '" viewBox="0 0 440 230" role="img" aria-label="层板侧视图（下垂放大画）"></svg><p class="muted" id="sideNote_' + i + '" style="margin:4px 0 0"></p></div>' +
        '<div><h3 id="title_' + i + '"></h3><div class="big" id="big_' + i + '"></div><p class="read" id="read_' + i + '"></p><div class="calc" id="calc_' + i + '"></div>' +
        '<div class="grid" style="margin-top:8px">' +
        '<div class="f name" id="f_s' + i + '_name" style="grid-column:1/-1"><label for="s' + i + '_name">这块板叫什么</label><input id="s' + i + '_name" data-i="' + i + '" data-k="name" maxlength="60"></div>' +
        '<div class="f" id="f_s' + i + '_mat" style="grid-column:span 2"><label for="s' + i + '_mat">材料</label><select id="s' + i + '_mat" data-i="' + i + '" data-k="mat" data-rebuild="1">' + opts + '</select></div>' +
        '<div class="f" id="f_s' + i + '_sup" style="grid-column:span 2"><label for="s' + i + '_sup">两端怎么固定</label><select id="s' + i + '_sup" data-i="' + i + '" data-k="sup">' + sups + '</select></div>' +
        A.SHELF_KEYS.map(function (k) { return inp(i, k); }).join('') +
        '<label class="tog"><input type="checkbox" id="s' + i + '_strip" data-i="' + i + '" data-k="strip" data-rebuild="1"' + (strip ? ' checked' : '') + '> 前沿贴了一条木条（竖着贴、上沿和板面齐平）</label>' +
        (strip ? A.STRIP_KEYS.map(function (k) { return inp(i, k); }).join('') : '') +
        '</div>' +
        '<div class="bar"><button type="button" class="btn mini del" id="del_' + i + '" data-del="' + i + '"' + (state.shelves.length < 2 ? ' disabled' : '') + '>删掉这块板</button></div>' +
        '</div></div></section>';
    }).join('');
    state.shelves.forEach(function (s, i) {
      ['name', 'sup'].concat(A.SHELF_KEYS, s.strip === '1' ? A.STRIP_KEYS : []).forEach(function (k) { $('s' + i + '_' + k).value = s[k]; });
      var M = A.mat(s.mat);
      $('s' + i + '_mat').value = (M && +s.E === M.E && +s.rho === M.rho) ? s.mat : 'custom';
    });
    A.GLOBAL_KEYS.forEach(function (k) { $(k).value = state[k]; });
    $('addShelf').disabled = state.shelves.length >= A.MAX_SHELVES;
    $('shelfCount').textContent = state.shelves.length + ' / ' + A.MAX_SHELVES + ' 块';
  }
  function onField(e) {
    var t = e.target, k = t.getAttribute('data-k'); if (!k) return;
    var i = +t.getAttribute('data-i'), s = state.shelves[i];
    if (k === 'strip') { s.strip = t.checked ? '1' : '0'; rebuild(); return; }
    if (k === 'mat') {
      var M = A.mat(t.value);
      if (M) { s.mat = M.key; s.E = String(M.E); s.rho = String(M.rho); } else { s.mat = 'custom'; }
      rebuild(); return;
    }
    s[k] = t.value;
    /* 手改 E / 密度后，材料下拉跟着显示「自定」（不重建，免得丢光标） */
    if (k === 'E' || k === 'rho') { var M2 = A.mat(s.mat); $('s' + i + '_mat').value = (M2 && +s.E === M2.E && +s.rho === M2.rho) ? s.mat : 'custom'; }
    update();
  }
  $('shelves').addEventListener('input', function (e) { if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') onField(e); });
  $('shelves').addEventListener('change', function (e) { if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox') onField(e); });
  $('shelves').addEventListener('click', function (e) {
    var b = e.target.closest('[data-del]'); if (!b || b.disabled) return;
    state.shelves.splice(+b.getAttribute('data-del'), 1); rebuild();
  });
  $('addShelf').addEventListener('click', function () {
    if (state.shelves.length >= A.MAX_SHELVES) return;
    state.shelves.push(A.blankShelf(state.shelves.length)); rebuild();
  });
  A.GLOBAL_KEYS.forEach(function (k) { $(k).addEventListener('input', function () { state[k] = $(k).value; update(); }); });

  /* 侧视图：板画成一条带厚度的弧，下垂按同一个放大倍数画（标出倍数），上限画成虚线 */
  function side(r, g) {
    var W = 440, H = 230, x0 = 30, x1 = W - 30, top = 70, span = x1 - x0;
    var segs = r.mid + 1, seg = span / segs;
    var scale = 60 / Math.max(r.dl, r.allow); /* 像素 / mm：最大的那个画成 60 px */
    var px = function (mm) { return mm * scale; };
    var thick = Math.max(6, Math.min(16, r.t / 2));
    var s = '';
    /* 两端立板 */
    s += '<rect x="' + (x0 - 14) + '" y="30" width="14" height="170" fill="#e7dccb" stroke="#a88b62"/>';
    s += '<rect x="' + x1 + '" y="30" width="14" height="170" fill="#e7dccb" stroke="#a88b62"/>';
    /* 上限虚线（每段一条）与弧线 */
    var path = 'M' + x0 + ' ' + top, lim = '';
    for (var k = 0; k < segs; k++) {
      var a = x0 + k * seg, b = a + seg, m = (a + b) / 2;
      path += ' Q' + m.toFixed(1) + ' ' + (top + 2 * px(r.dl)).toFixed(1) + ' ' + b.toFixed(1) + ' ' + top;
      lim += '<path d="M' + a.toFixed(1) + ' ' + top + ' Q' + m.toFixed(1) + ' ' + (top + 2 * px(r.allow)).toFixed(1) + ' ' + b.toFixed(1) + ' ' + top + '" fill="none" stroke="#2f6b3f" stroke-width="1.5" stroke-dasharray="5 5"/>';
      if (k > 0) s += '<rect x="' + (a - 5).toFixed(1) + '" y="' + (top + thick) + '" width="10" height="' + (200 - top - thick) + '" fill="#d5dcd2" stroke="#7c8a78"/>';
    }
    s += '<path d="M' + x0 + ' ' + top + ' L' + x1 + ' ' + top + '" stroke="#b8beb5" stroke-width="1" stroke-dasharray="2 4"/>';
    s += lim;
    s += '<path d="' + path + '" fill="none" stroke="' + (r.pass ? '#c8a06a' : '#a33a26') + '" stroke-width="' + thick + '" stroke-linecap="butt"/>';
    if (r.strip) s += '<path d="' + path + '" fill="none" stroke="#7a5a2e" stroke-width="2"/>';
    /* 书：几本竖着的小方块，跟着弧 */
    var y = function (x) { var k = Math.min(segs - 1, Math.floor((x - x0) / seg)), a = x0 + k * seg, u = (x - a) / seg; return top + 4 * px(r.dl) * u * (1 - u); };
    for (var xb = x0 + 8; xb < x1 - 16; xb += 22) {
      var yy = y(xb + 8);
      s += '<rect x="' + xb.toFixed(1) + '" y="' + (yy - thick / 2 - 38).toFixed(1) + '" width="16" height="38" fill="#f3e6d2" stroke="#b7a07c" stroke-width="1"/>';
    }
    var mx = x0 + seg / 2;
    s += '<text x="' + mx.toFixed(1) + '" y="' + (top + 2 * px(Math.max(r.dl, r.allow)) / 2 + thick + 40).toFixed(1) + '" font-size="15" text-anchor="middle" fill="' + (r.pass ? '#2f6b3f' : '#a33a26') + '">' + f1(r.dl) + ' mm</text>';
    s += '<text x="' + (W / 2) + '" y="222" font-size="14" text-anchor="middle" fill="#4f5850">' + r.L + ' mm' + (r.mid ? '（' + segs + ' 段 × ' + f0(r.bay) + '）' : '') + '</text>';
    return { svg: s, scale: scale };
  }

  function markErrors() {
    document.querySelectorAll('.f.bad').forEach(function (f) { f.classList.remove('bad'); });
    (out.errors || []).forEach(function (e) { if ($('f_' + e.field)) $('f_' + e.field).classList.add('bad'); });
  }
  function render() {
    var bad = !out.ok;
    $('errBox').classList.toggle('hide', !bad);
    $('checkCard').classList.toggle('hide', bad);
    if (bad) {
      $('errBox').innerHTML = '<b>还算不出来</b>，先把这些改对（原文都保留着）：<ul>' + out.errors.map(function (e) { return '<li>' + esc(e.message) + '</li>'; }).join('') + '</ul>';
      state.shelves.forEach(function (s, i) {
        $('title_' + i).textContent = s.name || ('层板 ' + (i + 1));
        $('big_' + i).textContent = '—'; $('big_' + i).className = 'big';
        $('read_' + i).textContent = '先把上面红框里的问题改好'; $('calc_' + i).textContent = '';
        $('side_' + i).innerHTML = ''; $('sideNote_' + i).textContent = '';
      });
      return;
    }
    var g = out.g;
    $('score').innerHTML = '<span style="color:var(--ok)">' + out.pass + ' 过</span> · <span style="color:var(--no)">' + out.fail + ' 不过</span>';
    $('checkMeta').textContent = '看得出来的上限 ' + g.lim + ' mm/m · 长期按刚放上去的 ' + f2(1 + g.creep) + ' 倍';
    $('check').innerHTML = out.shelves.map(function (r) {
      return '<li id="ck_' + r.i + '"><div class="mk ' + (r.pass ? 'ok">✓' : 'no">✗') + '</div><div class="nm">' + esc(r.name) +
        '<small>' + esc(A.matName(state.shelves[r.i])) + ' ' + r.t + ' mm · ' + r.L + ' mm' + (r.mid ? ' · ' + r.mid + ' 根支撑' : '') + (r.strip ? ' · 带木条' : '') + ' · ' + r.load + ' kg/m</small></div>' +
        '<div class="v">' + f1(r.perM) + ' mm/m<small>长期 ' + f1(r.dl) + ' / 上限 ' + f1(r.allow) + ' mm</small></div></li>';
    }).join('');
    $('actsBlock').classList.toggle('hide', !out.actions.length);
    $('acts').innerHTML = out.actions.map(function (a, i) { return '<button type="button" class="act" id="act_' + a.shelf + '_' + a.kind + '" data-a="' + i + '">→ ' + esc(a.text) + '</button>'; }).join('');
    $('warnBox').classList.toggle('hide', !out.warnings.length);
    $('warnBox').innerHTML = '<ul>' + out.warnings.map(function (w) { return '<li>' + esc(w.message) + '</li>'; }).join('') + '</ul>';

    out.shelves.forEach(function (r) {
      var i = r.i;
      $('title_' + i).textContent = r.name;
      $('big_' + i).className = 'big ' + (r.pass ? 'ok' : 'no');
      $('big_' + i).textContent = (r.pass ? '✓ 看不出来' : '✗ 会弯得看得出来') + ' · 长期 ' + f1(r.dl) + ' mm';
      $('read_' + i).innerHTML = '刚放上去 <b>' + f2(r.d0) + ' mm</b>，放久了 <b>' + f2(r.dl) + ' mm</b>（每米 <b>' + f1(r.perM) + ' mm</b>，上限 ' + g.lim + '）。' +
        '这块板每米最多放 <b>' + (r.loadMax <= 0 ? '0 kg（光自重就超了）' : r.loadMax > A.SHELF_FIELDS.load.max ? '超过 ' + A.SHELF_FIELDS.load.max + ' kg（本页输入上限）' : f1(Math.floor(r.loadMax * 10 + 1e-9) / 10) + ' kg') + '</b>；按现在的重量，每段最长 <b>' + (r.bayMax > A.SHELF_FIELDS.L.max ? '超过 ' + A.SHELF_FIELDS.L.max + ' mm' : f0(Math.floor(r.bayMax)) + ' mm') + '</b>。';
      $('calc_' + i).textContent = (r.kSup === 'fixed' ? '1' : '5') + ' × (' + r.load + ' + 自重 ' + f2(r.self) + ') kg/m × 9.80665 × ' + f0(r.bay) + '⁴ mm ÷ (384 × ' + r.E + ' GPa × I ' + f0(r.I) + ' mm⁴) = ' + f2(r.d0) + ' mm；× (1 + ' + g.creep + ') = ' + f2(r.dl) + ' mm';
      var sv = side(r, g);
      $('side_' + i).innerHTML = sv.svg;
      $('sideNote_' + i).textContent = '下垂放大约 ' + f0(sv.scale) + ' 倍画；绿色虚线是上限（' + f1(r.allow) + ' mm）。';
    });
  }
  $('acts').addEventListener('click', function (e) {
    var b = e.target.closest('[data-a]'); if (!b) return;
    state = A.applyAction(state, out.actions[+b.getAttribute('data-a')]); rebuild();
  });

  function update() { out = A.compute(state); markErrors(); render(); renderPresets(); save(); }
  function rebuild() { buildShelves(); update(); }

  /* ── 导出 ── */
  function stamp() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function download(name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  $('dlCsv').addEventListener('click', function () { download('摆书前压一压.csv', new Blob(['\ufeff' + A.toCSV(out, stamp(), state)], { type: 'text/csv;charset=utf-8' })); });
  $('dlMd').addEventListener('click', function () { download('摆书前压一压.md', new Blob([A.toMD(out, stamp(), state)], { type: 'text/markdown;charset=utf-8' })); });
  $('dlJson').addEventListener('click', function () {
    download('摆书前压一压-备份.json', new Blob([JSON.stringify({ app: '摆书前压一压', slug: 'shelf-sag', version: 1, exported_at: stamp(), state: state, out: out }, null, 2)], { type: 'application/json' }));
  });
  $('impJson').addEventListener('click', function () { $('impFile').click(); });
  $('impFile').addEventListener('change', function () {
    var f = this.files && this.files[0]; if (!f) return;
    var r = new FileReader(); r.onload = function () { importText(String(r.result)); }; r.readAsText(f); this.value = '';
  });
  function importText(t) {
    var s = null;
    try { var j = JSON.parse(t); s = sanitize(j && j.state ? j.state : j); } catch (e) { s = null; }
    if (!s) { $('saveTag').textContent = '· 这个文件读不出来，没改动'; return false; }
    state = s; rebuild(); return true;
  }
  $('reset').addEventListener('click', function () { state = A.defaultState(); rebuild(); });

  /* PNG 检查卡 1080×1350：所有文字取自 out */
  function wrapText(ctx, text, maxW) {
    var toks = String(text).match(/[0-9.]+ (?:mm\/m|mm|kg)|[0-9A-Za-z.:+\-×%\/°²]+|\s|./g) || [];
    var merged = [];
    toks.forEach(function (tk) { if (merged.length && /^[，。、；：）」%,.;:)]$/.test(tk)) merged[merged.length - 1] += tk; else merged.push(tk); });
    var lines = [], cur = '';
    merged.forEach(function (tk) {
      if (cur && ctx.measureText(cur + tk).width > maxW) { lines.push(cur.replace(/\s+$/, '')); cur = /^\s$/.test(tk) ? '' : tk; }
      else cur += tk;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function drawCard() {
    var W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    var F = '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif', M = 'ui-monospace,Menlo,Consolas,monospace';
    g.fillStyle = '#eef0ec'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffffff'; g.fillRect(56, 48, W - 112, H - 96);
    var L = 104, R = W - 104, maxW = R - L, y = 136;
    function para(t, size, color, lh, max, bold) {
      g.font = (bold ? '700 ' : '') + size + 'px ' + F; g.fillStyle = color;
      var ls = wrapText(g, t, maxW); if (max && ls.length > max) { ls = ls.slice(0, max); ls[max - 1] = ls[max - 1].slice(0, -1) + '…'; }
      ls.forEach(function (l) { g.fillText(l, L, y); y += lh; });
    }
    function rule() { g.strokeStyle = '#dde2dc'; g.lineWidth = 2; g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke(); }
    g.font = '700 50px ' + F; g.fillStyle = '#1f2420'; g.fillText('摆书前压一压 · 检查单', L, y); y += 44;
    g.font = '22px ' + F; g.fillStyle = '#848b84'; g.fillText('导出 ' + stamp() + ' · 默认场景为虚构示例', L, y); y += 34;
    if (!out.ok) {
      y += 20; para('还算不出来', 44, '#a33a26', 60, 1, true);
      out.errors.slice(0, 12).forEach(function (e) { para('· ' + e.message, 26, '#4f5850', 38, 2); });
      return cv;
    }
    g.font = '700 34px ' + F; g.fillStyle = '#2f6b3f'; g.fillText(out.pass + ' 块过', L, y + 30);
    var wp = g.measureText(out.pass + ' 块过').width; g.fillStyle = '#a33a26'; g.fillText('  ' + out.fail + ' 块会弯得看得出来', L + wp, y + 30);
    y += 76; g.font = '22px ' + F; g.fillStyle = '#848b84'; g.fillText('上限 ' + out.g.lim + ' mm/m · 长期按刚放上去的 ' + f2(1 + out.g.creep) + ' 倍', L, y); y += 30;
    rule(); y += 18;
    var rows = out.shelves.slice(0, 8);
    rows.forEach(function (r) {
      y += 50;
      g.fillStyle = r.pass ? '#e3f0e5' : '#f8e3dd'; g.fillRect(L, y - 36, 46, 46);
      g.font = '700 32px ' + F; g.fillStyle = r.pass ? '#2f6b3f' : '#a33a26'; g.textAlign = 'center'; g.fillText(r.pass ? '✓' : '✗', L + 23, y - 2); g.textAlign = 'left';
      g.font = '28px ' + F; g.fillStyle = '#1f2420';
      var nm = r.name; while (g.measureText(nm).width > 520 && nm.length > 1) nm = nm.slice(0, -1); if (nm !== r.name) nm = nm.slice(0, -1) + '…';
      g.fillText(nm, L + 64, y);
      g.font = '700 30px ' + M; g.textAlign = 'right'; g.fillStyle = r.pass ? '#2f6b3f' : '#a33a26'; g.fillText(f1(r.perM) + ' mm/m', R, y); g.textAlign = 'left';
      y += 32; g.font = '21px ' + F; g.fillStyle = '#848b84';
      var sub = A.matName(state.shelves[r.i]) + ' ' + r.t + ' mm · 跨 ' + r.L + (r.mid ? '（' + r.mid + ' 根支撑）' : '') + (r.strip ? ' · 木条 ' + r.st + '×' + r.sh : '') + ' · ' + r.load + ' kg/m · 长期 ' + f1(r.dl) + ' / ' + f1(r.allow) + ' mm';
      while (g.measureText(sub).width > maxW - 64 && sub.length > 1) sub = sub.slice(0, -1);
      g.fillText(sub, L + 64, y);
    });
    if (out.shelves.length > rows.length) { y += 40; para('…另有 ' + (out.shelves.length - rows.length) + ' 块，见 CSV', 22, '#848b84', 30, 1); }
    y += 30;
    if (out.actions.length && y < H - 240) {
      rule(); y += 44; g.font = '700 26px ' + F; g.fillStyle = '#1f2420'; g.fillText('改法（每条都回填重算过）', L, y); y += 40;
      /* 每块没过的板挑第一条改法（加支撑），放不下就停 */
      var seen = {};
      out.actions.forEach(function (a) { if (!seen[a.shelf] && y < H - 170) { seen[a.shelf] = 1; para('→ ' + a.text, 23, '#1e3d52', 32, 2); y += 6; } });
      var more = out.actions.length - Object.keys(seen).length;
      if (more > 0 && y < H - 150) para('另有 ' + more + ' 条改法（换厚板、贴木条、少放书），见 MD', 21, '#848b84', 30, 1);
    }
    /* 剩下的空白画最弯那块的侧视图（同一次 out 的长期下垂与上限，下垂按标注倍数放大） */
    var wr = out.shelves[out.worst];
    /* 版面：说明行 y+36 → 弧线顶 y+76 → 弧最深 top+amp → 两行标注 +40/+70 → 页脚 H-84 上方留 30 */
    var top = y + 76, amp = Math.min(160, (H - 84 - 52) - 70 - top);
    if (amp >= 40) {
      g.font = '22px ' + F; g.fillStyle = '#848b84';
      var segs = wr.mid + 1, seg = maxW / segs, sc = amp / Math.max(wr.dl, wr.allow);
      g.fillText('最弯的「' + wr.name.slice(0, 14) + (wr.name.length > 14 ? '…' : '') + '」侧视图（下垂放大约 ' + f0(sc / (maxW / wr.L)) + ' 倍）', L, y + 36);
      g.strokeStyle = '#b8beb5'; g.setLineDash([3, 6]); g.lineWidth = 2; g.beginPath(); g.moveTo(L, top); g.lineTo(R, top); g.stroke();
      /* 二次贝塞尔的最低点是控制点深度的一半，所以控制点放在 2 倍深度 */
      g.strokeStyle = '#2f6b3f'; g.setLineDash([8, 8]);
      for (var k = 0; k < segs; k++) { var a0 = L + k * seg; g.beginPath(); g.moveTo(a0, top); g.quadraticCurveTo(a0 + seg / 2, top + 2 * wr.allow * sc, a0 + seg, top); g.stroke(); }
      g.setLineDash([]); g.strokeStyle = wr.pass ? '#c8a06a' : '#a33a26'; g.lineWidth = 12;
      for (var k2 = 0; k2 < segs; k2++) { var a1 = L + k2 * seg; g.beginPath(); g.moveTo(a1, top); g.quadraticCurveTo(a1 + seg / 2, top + 2 * wr.dl * sc, a1 + seg, top); g.stroke(); }
      g.lineWidth = 2; g.textAlign = 'center';
      g.font = '700 26px ' + M; g.fillStyle = wr.pass ? '#2f6b3f' : '#a33a26'; g.fillText('长期 ' + f1(wr.dl) + ' mm', L + seg / 2, top + amp + 40);
      g.font = '21px ' + F; g.fillStyle = '#2f6b3f'; g.fillText('虚线 = 上限 ' + f1(wr.allow) + ' mm', L + seg / 2, top + amp + 70);
      g.textAlign = 'left';
    }
    g.font = '21px ' + F; g.fillStyle = '#848b84';
    g.fillText('均布荷载的梁估算，不是实测；材料 E 和上限都是可改的设计值', L, H - 84);
    return cv;
  }
  $('dlPng').addEventListener('click', function () {
    drawCard().toBlob(function (b) { if (b) download('摆书前压一压-1080x1350.png', b); }, 'image/png');
  });

  window.__shelfUi = {
    state: function () { return JSON.parse(JSON.stringify(state)); },
    out: function () { return out; },
    importText: importText, drawCard: drawCard, storageKey: KEY
  };

  rebuild();
})();
