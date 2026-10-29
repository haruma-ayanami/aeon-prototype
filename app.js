(() => {
  const D = window.AEON;
  const $ = (id) => document.getElementById(id);
  const vp = $('vp'), world = $('world');
  const pageOf = Object.fromEntries(D.pages.map((p) => [p.id, p]));
  const byPage = {};
  for (const n of D.order) (byPage[D.boards[n].p] ||= []).push(n);

  // ---------- холст ----------
  let page = null, s = 1, tx = 0, ty = 0, swapTimer = 0, touched = false;
  const MAXS = 2;

  function tabs() {
    $('tabs').innerHTML = D.pages.map((p) =>
      `<a href="#/${p.id}" data-p="${p.id}">${p.name}<span class="n">${(byPage[p.id] || []).length}</span></a>`).join('');
  }

  function bounds(pid) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of byPage[pid]) { const b = D.boards[n]; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
    for (const t of D.notes) if (t.p === pid) { y0 = Math.min(y0, t.y); x0 = Math.min(x0, t.x); }
    return { x0, y0, x1, y1 };
  }

  function apply() {
    world.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    world.style.setProperty('--inv', 1 / s);
    $('zoomVal').textContent = Math.round(s * 100) + '%';
    clearTimeout(swapTimer);
    swapTimer = setTimeout(swapHiRes, 160);
  }

  function fit(mode) {
    const b = bounds(page), W = Math.max(vp.clientWidth, 320), H = Math.max(vp.clientHeight, 320), pad = innerWidth > 720 ? 48 : 20;
    const sw = (W - pad * 2) / (b.x1 - b.x0), sh = (H - pad * 2) / (b.y1 - b.y0 + 80);
    s = Math.min(MAXS, mode === 'all' ? Math.min(sw, sh) : (sh > sw * 0.6 ? Math.min(sw, sh) : sw));
    tx = pad - b.x0 * s + Math.max(0, (W - pad * 2 - (b.x1 - b.x0) * s) / 2);
    ty = pad - (b.y0 - 60) * s;
    apply();
  }

  function zoomAt(f, cx, cy) {
    touched = true;
    const b = bounds(page), W = vp.clientWidth, H = vp.clientHeight;
    const minS = Math.min((W - 96) / (b.x1 - b.x0), (H - 96) / (b.y1 - b.y0)) * 0.6;
    const ns = Math.min(MAXS, Math.max(minS, s * f));
    tx = cx - (cx - tx) * ns / s; ty = cy - (cy - ty) * ns / s; s = ns;
    apply();
  }

  function showPage(pid) {
    if (page === pid) return;
    page = pid; touched = false;
    for (const a of document.querySelectorAll('.tabs a')) {
      if (a.dataset.p === pid) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
    const cur = document.querySelector(`.tabs a[data-p="${pid}"]`);
    if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    let h = '';
    for (const t of D.notes) if (t.p === pid) h += `<div class="note" style="left:${t.x}px;top:${t.y}px">${esc(t.t)}</div>`;
    for (const n of byPage[pid]) {
      const b = D.boards[n];
      h += `<div class="board${D.proto[n] ? ' pr' : ''}" data-n="${n}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px" title="${esc(b.t)}">` +
        `<span class="bl">${D.proto[n] ? '▶ ' : ''}${esc(b.t)}</span><img alt="${esc(b.t)}" src="img/thumb/${n}.webp" draggable="false"></div>`;
    }
    world.innerHTML = h;
    document.title = `AEON — ${pageOf[pid].name}`;
    fit();
    requestAnimationFrame(() => { if (!touched) fit(); });
  }

  function swapHiRes() {
    const dpr = window.devicePixelRatio || 1, W = vp.clientWidth, H = vp.clientHeight;
    for (const el of world.querySelectorAll('.board')) {
      const img = el.lastElementChild;
      if (img.dataset.hi) continue;
      const r = el.getBoundingClientRect();
      if (r.right < 0 || r.left > W || r.bottom < 0 || r.top > H + 60) continue;
      if (r.width * dpr > 600) { img.dataset.hi = 1; img.src = `img/full/${el.dataset.n}.webp`; }
    }
  }

  // перетаскивание, колесо, щипок
  const ptr = new Map();
  let moved = 0, pinch = null;
  vp.addEventListener('pointerdown', (e) => {
    vp.setPointerCapture(e.pointerId);
    ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0;
    if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; }
    vp.classList.add('drag');
  });
  vp.addEventListener('pointermove', (e) => {
    const p = ptr.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (ptr.size === 2 && pinch) {
      const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = vp.getBoundingClientRect();
      zoomAt(d / pinch.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      pinch.d = d; moved += 10;
      return;
    }
    moved += Math.abs(dx) + Math.abs(dy); touched = true;
    tx += dx; ty += dy; apply();
    hint();
  });
  const up = (e) => {
    ptr.delete(e.pointerId);
    if (ptr.size < 2) pinch = null;
    if (!ptr.size) vp.classList.remove('drag');
  };
  vp.addEventListener('pointerup', (e) => {
    const wasClick = moved < 6 && ptr.size === 1;
    up(e);
    if (!wasClick) return;
    const el = document.elementsFromPoint(e.clientX, e.clientY).find((x) => x.classList && x.classList.contains('board'));
    if (el) go(D.proto[el.dataset.n] ? `#/proto/${el.dataset.n}/1` : `#/${page}/${el.dataset.n}`);
  });
  vp.addEventListener('pointercancel', up);
  vp.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = vp.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    else { tx -= e.deltaX; ty -= e.deltaY; apply(); }
    touched = true;
    hint();
  }, { passive: false });
  $('zoomIn').onclick = () => zoomAt(1.4, vp.clientWidth / 2, vp.clientHeight / 2);
  $('zoomOut').onclick = () => zoomAt(1 / 1.4, vp.clientWidth / 2, vp.clientHeight / 2);
  $('zoomFit').onclick = () => fit('all');
  window.addEventListener('resize', () => { if (page) touched ? apply() : fit(); layoutOverlay(); });
  let hinted = false;
  function hint() { if (!hinted) { hinted = true; setTimeout(() => $('hint').classList.add('off'), 1200); } }

  // ---------- просмотр артборда ----------
  let vName = null;
  const vStack = [];

  function fitFrame(frame, stage, w, h, maxScale) {
    const aw = stage.clientWidth - (innerWidth > 720 ? 32 : 16), ah = stage.clientHeight - (innerWidth > 720 ? 32 : 16);
    const width = h / w > 3 ? Math.min(aw, w * maxScale) : Math.min(aw, ah * w / h, w * maxScale);
    frame.style.width = Math.max(200, Math.floor(width)) + 'px';
  }

  function openViewer(n, push) {
    const b = D.boards[n];
    if (!b) return closeAll();
    if (push && vName && vName !== n) vStack.push(vName);
    vName = n;
    $('player').hidden = true;
    $('viewer').hidden = false;
    $('vPage').textContent = pageOf[b.p].name;
    $('vTitle').textContent = b.t;
    $('vBack').disabled = !vStack.length;
    const img = $('vImg');
    img.src = `img/thumb/${n}.webp`;
    const hi = new Image();
    hi.onload = () => { if (vName === n) img.src = hi.src; };
    hi.src = `img/full/${n}.webp`;
    img.alt = b.t;
    $('vHots').innerHTML = (b.l || []).filter((l) => D.boards[l[0]] && l[0] !== n).map((l) =>
      `<button class="hot lk" data-to="${l[0]}" title="Перейти: ${esc(D.boards[l[0]].t)}" aria-label="Перейти: ${esc(D.boards[l[0]].t)}" style="${pct(l, b)}"></button>`).join('');
    const list = byPage[b.p], i = list.indexOf(n);
    $('vPrev').disabled = i <= 0; $('vNext').disabled = i >= list.length - 1;
    $('vStage').scrollTop = 0;
    layoutOverlay();
    document.title = `AEON — ${b.t}`;
  }

  $('vHots').addEventListener('click', (e) => {
    const t = e.target.closest('[data-to]');
    if (!t) return;
    const to = t.dataset.to, b = D.boards[to];
    go(D.proto[to] ? `#/proto/${to}/1` : `#/${b.p}/${to}`, true);
  });
  $('vLinks').onchange = (e) => $('vHots').classList.toggle('on', e.target.checked);
  $('vBack').onclick = () => { const n = vStack.pop(); if (n) go(`#/${D.boards[n].p}/${n}`, false, true); };
  $('vPrev').onclick = () => step(-1);
  $('vNext').onclick = () => step(1);
  $('vClose').onclick = () => closeAll();
  function step(d) { const list = byPage[D.boards[vName].p], n = list[list.indexOf(vName) + d]; if (n) go(D.proto[n] ? `#/proto/${n}/1` : `#/${D.boards[n].p}/${n}`); }

  // ---------- плеер сценария ----------
  let pName = null, pStep = 1;

  function openPlayer(n, k) {
    const sc = D.proto[n];
    if (!sc) return closeAll();
    pName = n; pStep = Math.min(Math.max(k || 1, 1), sc.steps.length);
    const st = sc.steps[pStep - 1];
    $('viewer').hidden = true;
    $('player').hidden = false;
    $('pTitle').textContent = sc.title;
    $('pStep').textContent = `Шаг ${pStep} из ${sc.steps.length} · ${st.name}`;
    $('pSegs').innerHTML = sc.steps.map((x, i) =>
      `<button data-k="${i + 1}" class="${i < pStep ? 'done' : ''}" aria-label="Шаг ${i + 1}: ${esc(x.name)}"${i + 1 === pStep ? ' aria-current="step"' : ''}><span></span></button>`).join('');
    $('pBack').disabled = pStep === 1;
    $('pNext').disabled = pStep === sc.steps.length;
    const img = $('pImg');
    img.src = 'img/' + st.img;
    img.alt = `${sc.title}, шаг ${pStep}: ${st.name}`;
    $('pHots').innerHTML = st.hot.map((h) =>
      `<button class="hot" ${h.go ? `data-go="${h.go}"` : `data-to="${h.href}"`} aria-label="${esc(h.label || 'Дальше')}" title="${esc(h.label || '')}" style="${pct([0, ...h.r], st)}"></button>`).join('');
    $('pStage').scrollTop = 0;
    layoutOverlay();
    // предзагрузка следующих шагов
    for (const x of sc.steps.slice(pStep, pStep + 2)) new Image().src = 'img/' + x.img;
    document.title = `AEON — ${sc.title}`;
  }

  $('pHots').addEventListener('click', (e) => {
    const t = e.target.closest('.hot');
    if (!t) return;
    if (t.dataset.go) go(`#/proto/${pName}/${t.dataset.go}`);
    else { const sc = D.proto[pName]; go(`#/proto/${pName}/${Math.min(pStep + 1, sc.steps.length)}`); }
  });
  $('pSegs').addEventListener('click', (e) => { const t = e.target.closest('[data-k]'); if (t) go(`#/proto/${pName}/${t.dataset.k}`); });
  $('pBack').onclick = () => go(`#/proto/${pName}/${pStep - 1}`);
  $('pNext').onclick = () => go(`#/proto/${pName}/${pStep + 1}`);
  $('pRestart').onclick = () => go(`#/proto/${pName}/1`);
  $('pClose').onclick = () => closeAll();

  function layoutOverlay() {
    if (!$('viewer').hidden && vName) { const b = D.boards[vName]; fitFrame($('vFrame'), $('vStage'), b.w, b.h, b.w <= 600 ? 2 : 1); }
    if (!$('player').hidden && pName) { const st = D.proto[pName].steps[pStep - 1]; fitFrame($('pFrame'), $('pStage'), st.w, st.h, st.w <= 1000 ? 1.6 : 1); }
  }

  function closeAll() {
    vStack.length = 0; vName = null; pName = null;
    go(`#/${page || 'cover'}`);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (!$('viewer').hidden || !$('player').hidden)) closeAll();
    if (!$('player').hidden && e.key === 'ArrowRight' && !$('pNext').disabled) $('pNext').click();
    if (!$('player').hidden && e.key === 'ArrowLeft' && !$('pBack').disabled) $('pBack').click();
    if (!$('viewer').hidden && e.key === 'ArrowRight' && !$('vNext').disabled) $('vNext').click();
    if (!$('viewer').hidden && e.key === 'ArrowLeft' && !$('vPrev').disabled) $('vPrev').click();
  });

  // ---------- адрес ----------
  let pushNext = false, popNext = false;
  function go(hash, push, pop) { pushNext = !!push; popNext = !!pop; if (location.hash === hash) route(); else location.hash = hash; }

  function route() {
    const [a, b, c] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    const push = pushNext, pop = popNext;
    pushNext = popNext = false;
    if (a === 'proto' && D.proto[b]) {
      showPage('proto');
      openPlayer(b, +c || 1);
      return;
    }
    const pid = pageOf[a] ? a : (D.boards[a] ? D.boards[a].p : 'cover');
    showPage(pid);
    if (b && D.boards[b]) { if (!push && !pop) vStack.length = 0; openViewer(b, push); }
    else { $('viewer').hidden = true; $('player').hidden = true; vName = null; pName = null; vStack.length = 0; document.title = `AEON — ${pageOf[pid].name}`; }
  }

  function pct(l, b) {
    return `left:${(l[1] / b.w * 100).toFixed(3)}%;top:${(l[2] / b.h * 100).toFixed(3)}%;width:${(l[3] / b.w * 100).toFixed(3)}%;height:${(l[4] / b.h * 100).toFixed(3)}%`;
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  tabs();
  window.addEventListener('hashchange', route);
  route();
})();
