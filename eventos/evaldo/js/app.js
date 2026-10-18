/* Desempeño docente · Contabilidad y Pensamiento Lógico
   Reporte interactivo estilo Power BI. Requiere d3 v7 y los datos de docentes:
   un bloque <script id="app-data" type="application/json"> en la página, o data/docentes.js (window.DOCENTES). */
(() => {
  'use strict';

  // ---------- Montaje de la página ----------
  const tplMarkup = document.getElementById('app-markup');
  const mountRoot = document.getElementById('app-root');
  if (tplMarkup && mountRoot && !mountRoot.children.length) mountRoot.replaceChildren(tplMarkup.content.cloneNode(true));

  // ---------- Datos y edición ----------
  const LS_KEY = 'desempeno-docente-ediciones';
  const EDITABLE = ['linea', 'contrato', 'sede', 'horas_contrato', 'carga_asignada'];
  // Supabase: si hay URL y clave, las ediciones se leen y guardan en la tabla. La clave anon es pública: la protección real es la política RLS (ver supabase/schema.sql).
  const SUPABASE = { url: '', key: '', table: 'docentes_ediciones' };
  const SB_ON = !!(SUPABASE.url && SUPABASE.key);
  const sb = (path, opts = {}) => fetch(`${SUPABASE.url}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: SUPABASE.key, Authorization: 'Bearer ' + SUPABASE.key, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  }).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text().then((t) => (t ? JSON.parse(t) : null)); });
  const dataEl = document.getElementById('app-data');
  let SRC = [];
  try { SRC = dataEl ? JSON.parse(dataEl.textContent) : (window.DOCENTES || []); } catch (e) { SRC = window.DOCENTES || []; }
  // Publicado en Claude: los cambios se guardan como nueva versión de la página. Fuera de Claude (GitHub o archivo local): en este navegador.
  const IN_CLAUDE = !!(window.claude && typeof window.claude.use === 'function' && dataEl && document.getElementById('app-js'));
  const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { return {}; } };
  const lsSet = (v) => { try { localStorage.setItem(LS_KEY, JSON.stringify(v)); return true; } catch (e) { return false; } };
  let saved = IN_CLAUDE ? {} : lsGet(); // ediciones locales ya guardadas (solo fuera de Claude)
  let pending = {}; // ediciones sin guardar: { id: { campo: valor } }
  const EDIT = { can: !IN_CLAUDE, art: null, busy: false };
  const baseRows = () => SRC.map((d) => ({ ...d, ...(saved[d.id] || {}), ...(pending[d.id] || {}) }));
  const derive = (rows) => rows.map((d) => ({ ...d, sede: d.sede || 'Sin sede', cat: d.categoria_2026 || 'Sin Evaldo 2026' }));
  let RAW = [];
  let DELETED = []; // docentes eliminados (borrado lógico): no aparecen en el reporte y se pueden restaurar
  const rebuild = () => { const all = derive(baseRows()); RAW = all.filter((d) => !d.eliminado); DELETED = all.filter((d) => d.eliminado); };
  rebuild();
  const CONTRATOS = ['PTC', 'PTC IN', 'PTD', 'PTP', 'PPH', 'TCxH', 'Otro'];
  const FIJOS = ['PTC', 'PTC IN', 'PTD'];
  const CATS = [
    { k: 'Eficiente', c: 'var(--ok)' },
    { k: 'Puede mejorar', c: 'var(--yellow)' },
    { k: 'Debe mejorar', c: 'var(--orange)' },
    { k: 'No eficiente', c: 'var(--red)' },
    { k: 'Sin Evaldo 2026', c: 'var(--gray)' },
  ];
  const CAT_COLOR = Object.fromEntries(CATS.map((x) => [x.k, x.c]));
  const SERIE = { 'PTC': 'var(--c1)', 'PTC IN': 'var(--c2)', 'PTD': 'var(--c3)', 'PTP': 'var(--c4)', 'PPH': 'var(--c5)', 'TCxH': 'var(--c6)', 'Otro': 'var(--gray)' };
  const YEARS = [2023, 2024, 2025, 2026];
  const YEAR_LABEL = { 2023: '2023-II', 2024: '2024-2', 2025: '2025', 2026: '2026' };
  const COMP = [
    { f: 'encuesta_2026', name: 'Encuesta', long: 'Encuesta estudiantil', w: 0.5 },
    { f: 'asistencia_2026', name: 'Asistencia', long: 'Asistencia y puntualidad', w: 0.15 },
    { f: 'notas_2026', name: 'Notas', long: 'Ingreso de notas', w: 0.15 },
    { f: 'reuniones_2026', name: 'Reuniones', long: 'Reuniones académicas', w: 0.1 },
    { f: 'capacitacion_2026', name: 'Capacitación', long: 'Capacitaciones', w: 0.1 },
  ];
  const META = 0.85;

  const num = (v) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));
  const mean = (arr, f) => {
    const v = arr.map((d) => num(typeof f === 'function' ? f(d) : d[f])).filter((x) => x != null);
    return v.length ? d3.mean(v) : null;
  };
  const p0 = (v) => (v == null ? '—' : d3.format('.0%')(v));
  const p1 = (v) => (v == null ? '—' : d3.format('.1%')(v));
  const int = d3.format(',');
  const pts = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + d3.format('.1f')(Math.abs(v)) + ' pts';
  const scoreColor = (v) => (v == null ? 'var(--gray)' : v >= META ? 'var(--ok)' : v >= 0.75 ? 'var(--yellow)' : v >= 0.6 ? 'var(--orange)' : 'var(--red)');
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  const ctx = document.createElement('canvas').getContext('2d');
  const tw = (s, size = 12, weight = 400) => { ctx.font = `${weight} ${size}px "Segoe UI","Open Sans",sans-serif`; return ctx.measureText(String(s)).width; };
  const fit = (s, max, size = 12) => {
    if (tw(s, size) <= max) return s;
    let t = String(s);
    while (t.length > 3 && tw(t + '…', size) > max) t = t.slice(0, -1);
    return t + '…';
  };

  // ---------- Estado y filtros ----------
  const S = { page: 'resumen', linea: 'Todas', contratos: new Set(), sedes: new Set(), cats: new Set(), fijo: 'PTC', q: '', sort: { key: 'evaldo_2026', dir: 1 } };
  const pass = (d, skip) =>
    (S.linea === 'Todas' || d.linea === S.linea) &&
    (skip === 'contratos' || !S.contratos.size || S.contratos.has(d.contrato)) &&
    (skip === 'sedes' || !S.sedes.size || S.sedes.has(d.sede)) &&
    (skip === 'cats' || !S.cats.size || S.cats.has(d.cat));
  const rows = (skip) => RAW.filter((d) => pass(d, skip));

  // Power BI-like selection: click = only this one (or clear if it was the only one); Ctrl/Cmd + click = add/remove
  function pick(setName, value, ev) {
    const s = S[setName];
    if (ev && (ev.ctrlKey || ev.metaKey)) { s.has(value) ? s.delete(value) : s.add(value); }
    else if (s.size === 1 && s.has(value)) s.clear();
    else { s.clear(); s.add(value); }
    render();
  }

  // ---------- Tooltip ----------
  const tip = $('tip');
  function showTip(ev, title, lines) {
    tip.replaceChildren(el('div', 't', title));
    lines.forEach(([color, label, value]) => {
      const r = el('div', 'r');
      const a = el('span');
      if (color) { const i = el('i'); i.style.background = color; a.append(i); }
      a.append(label);
      r.append(a, el('span', null, value));
      tip.append(r);
    });
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + w > window.innerWidth - 8) x = ev.clientX - w - 14;
    if (y + h > window.innerHeight - 8) y = ev.clientY - h - 14;
    tip.style.left = Math.max(8, x) + 'px';
    tip.style.top = Math.max(8, y) + 'px';
  }
  const hideTip = () => { tip.hidden = true; };

  const emptyBox = (box, msg) => { box.replaceChildren(el('div', 'empty', msg || 'Sin datos para los filtros seleccionados')); };
  const svgIn = (box, W, H) => d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);

  // ---------- Filtros (slicers) ----------
  function renderSlicers() {
    document.querySelectorAll('#sl-linea button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === S.linea)));
    const list = (id, setName, values, countRows, key, swatch) => {
      const box = document.querySelector(`#${id} .checks`);
      const counts = d3.rollup(countRows, (v) => v.length, (d) => d[key]);
      box.replaceChildren(...values.map((v) => {
        const n = counts.get(v) || 0;
        const b = el('button', 'chk' + (n ? '' : ' zero'));
        b.type = 'button';
        b.setAttribute('aria-pressed', String(S[setName].has(v)));
        const label = el('span');
        if (swatch) { const s = el('i', 'sw'); s.style.background = swatch(v); label.append(s); }
        label.append(v);
        b.append(el('span', 'box'), label, el('span', 'n', int(n)));
        b.addEventListener('click', (ev) => pick(setName, v, ev));
        return b;
      }));
      document.querySelector(`#${id} [data-clear]`).hidden = !S[setName].size;
    };
    list('sl-contrato', 'contratos', CONTRATOS.filter((c) => RAW.some((d) => d.contrato === c)), rows('contratos'), 'contrato', (v) => SERIE[v]);
    list('sl-cat', 'cats', CATS.map((c) => c.k), rows('cats'), 'cat', (v) => CAT_COLOR[v]);
    const sedes = [...new Set(RAW.map((d) => d.sede))].sort((a, b) => (a === 'Sin sede') - (b === 'Sin sede') || a.localeCompare(b, 'es'));
    list('sl-sede', 'sedes', sedes, rows('sedes'), 'sede');

    // Applied filters bar
    const ap = $('applied');
    const chips = [];
    const chip = (label, val, onX) => { const c = el('button', 'chip'); c.type = 'button'; const b = el('b', null, val); c.append(label + ': ', b, '  ×'); c.setAttribute('aria-label', `Quitar filtro ${label} ${val}`); c.addEventListener('click', onX); chips.push(c); };
    if (S.linea !== 'Todas') chip('Línea', S.linea, () => { S.linea = 'Todas'; render(); });
    S.contratos.forEach((v) => chip('Contrato', v, () => { S.contratos.delete(v); render(); }));
    S.cats.forEach((v) => chip('Categoría', v, () => { S.cats.delete(v); render(); }));
    S.sedes.forEach((v) => chip('Sede', v, () => { S.sedes.delete(v); render(); }));
    ap.replaceChildren(chips.length ? el('span', null, 'Filtros aplicados:') : el('span', null, 'Sin filtros · mostrando ambas líneas, todos los contratos y sedes'), ...chips);
  }

  // ---------- KPI cards ----------
  function kpi(box, value, label, delta, deltaCls) {
    box.replaceChildren(el('div', 'v', value), el('div', 'l', label));
    if (delta != null) box.append(el('div', 'd' + (deltaCls ? ' ' + deltaCls : ''), delta));
  }
  function deltaVs2025(set) {
    const a = mean(set, 'evaldo_2026'), b = mean(set, 'evaldo_2025');
    if (a == null || b == null) return [null, null];
    const d = (a - b) * 100;
    return [(d >= 0 ? '▲ ' : '▼ ') + pts(d).replace('+', '').replace('−', '') + ' vs 2025', d >= 0 ? 'up' : 'down'];
  }
  function renderKPIs() {
    const R = rows();
    const ev = R.filter((d) => num(d.evaldo_2026) != null);
    const efi = ev.filter((d) => d.cat === 'Eficiente').length;
    const conCarga = R.filter((d) => d.carga_asignada === 'Sí').length;
    kpi($('kpi-doc'), int(R.length), 'Docentes', `${int(conCarga)} con carga 2026-2`);
    kpi($('kpi-ev'), int(ev.length), 'Con Evaldo 2026', R.length ? `${p0(ev.length / R.length)} de cobertura` : null);
    const [dt, dc] = deltaVs2025(ev);
    kpi($('kpi-prom'), p1(mean(ev, 'evaldo_2026')), 'Promedio Evaldo 2026', dt, dc);
    kpi($('kpi-efi'), ev.length ? p0(efi / ev.length) : '—', 'Docentes eficientes', `${int(efi)} de ${int(ev.length)} evaluados`);
    const riesgo = ev.filter((d) => d.cat === 'Debe mejorar' || d.cat === 'No eficiente').length;
    kpi($('kpi-riesgo'), int(riesgo), 'Debe mejorar + No eficiente', 'requieren plan de mejora');
    const box = $('kpi-fijos');
    const trio = el('div', 'trio');
    FIJOS.forEach((c) => {
      const n = ev.filter((d) => d.contrato === c && d.cat !== 'Eficiente').length;
      const t = R.filter((d) => d.contrato === c).length;
      const dv = el('div'); dv.append(el('span', 'v', int(n)), el('small', null, c), el('small', null, `de ${t}`)); trio.append(dv);
    });
    box.replaceChildren(trio, el('div', 'l', 'Fijos por debajo de Eficiente'));
  }

  // ---------- Visual: barras apiladas por contrato ----------
  function chartContrato() {
    const box = $('ch-contrato');
    $('lg-cat').replaceChildren(...CATS.map((c) => { const s = el('span'); const i = el('i'); i.style.background = c.c; s.append(i, c.k); return s; }));
    box.replaceChildren();
    const R = rows('contratos');
    const data = CONTRATOS.map((c) => {
      const s = R.filter((d) => d.contrato === c);
      const o = { c, n: s.length, prom: mean(s, 'evaldo_2026') };
      CATS.forEach((k) => { o[k.k] = s.filter((d) => d.cat === k.k).length; });
      return o;
    }).filter((d) => d.n);
    if (!data.length) return emptyBox(box);
    const W = Math.max(300, box.clientWidth), rowH = 38;
    const m = { t: 4, r: tw('prom. 100%', 11) + 14, b: 24, l: d3.max(data, (d) => tw(d.c, 12, 600)) + 14 };
    const H = m.t + m.b + data.length * rowH;
    const svg = svgIn(box, W, H);
    const x = d3.scaleLinear([0, d3.max(data, (d) => d.n)], [m.l, W - m.r]).nice();
    const y = d3.scaleBand(data.map((d) => d.c), [m.t, H - m.b]).padding(0.28);
    const ticks = x.ticks(Math.max(2, Math.floor((W - m.l - m.r) / 80))).filter(Number.isInteger);
    svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', x).attr('x2', x).attr('y1', m.t).attr('y2', H - m.b).style('stroke', 'var(--line-2)');
    svg.append('g').selectAll('text').data(ticks).join('text').attr('x', x).attr('y', H - 6).attr('text-anchor', 'middle').style('fill', 'var(--ink-3)').style('font-size', '11px').text(int);
    const sel = S.contratos;
    data.forEach((d) => {
      const g = svg.append('g').style('cursor', 'pointer').style('opacity', sel.size && !sel.has(d.c) ? 0.3 : 1)
        .attr('tabindex', 0).attr('role', 'button').attr('aria-label', `Filtrar por ${d.c}`)
        .on('click', (ev) => pick('contratos', d.c, ev))
        .on('keydown', (ev) => { if (ev.key === 'Enter') pick('contratos', d.c, ev); })
        .on('mousemove', (ev) => showTip(ev, `${d.c} · ${int(d.n)} docentes`, [...CATS.map((k) => [k.c, k.k, int(d[k.k])]), [null, 'Promedio 2026', p1(d.prom)]]))
        .on('mouseleave', hideTip);
      g.append('rect').attr('x', 0).attr('y', y(d.c) - 5).attr('width', W).attr('height', y.bandwidth() + 10).style('fill', 'transparent');
      g.append('text').attr('x', m.l - 10).attr('y', y(d.c) + y.bandwidth() / 2).attr('dy', '0.35em').attr('text-anchor', 'end').style('fill', 'var(--ink)').style('font-size', '12px').style('font-weight', 600).text(d.c);
      let acc = 0;
      CATS.forEach((k) => {
        const v = d[k.k]; if (!v) return;
        const x0 = x(acc), x1 = x(acc + v);
        g.append('rect').attr('x', x0).attr('y', y(d.c)).attr('width', Math.max(1, x1 - x0 - 1)).attr('height', y.bandwidth()).style('fill', k.c);
        if (x1 - x0 > 20) g.append('text').attr('x', (x0 + x1) / 2).attr('y', y(d.c) + y.bandwidth() / 2).attr('dy', '0.35em').attr('text-anchor', 'middle')
          .style('fill', k.k === 'Sin Evaldo 2026' ? 'var(--ink)' : '#ffffff').style('font-size', '11px').style('font-weight', 600).text(v);
        acc += v;
      });
      g.append('text').attr('x', x(acc) + 6).attr('y', y(d.c) + y.bandwidth() / 2).attr('dy', '0.35em').style('fill', 'var(--ink-2)').style('font-size', '11px').text('prom. ' + p0(d.prom));
    });
  }

  // ---------- Visual: dona por categoría ----------
  function chartDonut() {
    const box = $('ch-donut');
    box.replaceChildren();
    const R = rows('cats');
    const data = CATS.map((c) => ({ ...c, n: R.filter((d) => d.cat === c.k).length })).filter((d) => d.n);
    if (!data.length) return emptyBox(box);
    const total = d3.sum(data, (d) => d.n);
    const W = Math.max(300, box.clientWidth);
    const legendW = Math.min(190, W * 0.46);
    const size = Math.min(230, W - legendW - 16);
    const H = Math.max(size, data.length * 30 + 10);
    const svg = svgIn(box, W, H);
    const r = size / 2, cx = r, cy = H / 2;
    const arc = d3.arc().innerRadius(r * 0.62).outerRadius(r);
    const pie = d3.pie().value((d) => d.n).sort(null).padAngle(0.012);
    const sel = S.cats;
    const g = svg.append('g').attr('transform', `translate(${cx},${cy})`);
    g.selectAll('path').data(pie(data)).join('path').attr('d', arc).style('fill', (d) => d.data.c)
      .style('opacity', (d) => (sel.size && !sel.has(d.data.k) ? 0.25 : 1)).style('cursor', 'pointer')
      .on('click', (ev, d) => pick('cats', d.data.k, ev))
      .on('mousemove', (ev, d) => showTip(ev, d.data.k, [[d.data.c, 'Docentes', int(d.data.n)], [null, 'Participación', p1(d.data.n / total)]]))
      .on('mouseleave', hideTip);
    const ev = R.filter((d) => num(d.evaldo_2026) != null);
    const efi = ev.length ? ev.filter((d) => d.cat === 'Eficiente').length / ev.length : null;
    g.append('text').attr('text-anchor', 'middle').attr('dy', '-0.1em').style('font-family', 'var(--font-num)').style('font-size', Math.round(r * 0.36) + 'px').style('font-weight', 500).style('fill', 'var(--ink)').text(p0(efi));
    g.append('text').attr('text-anchor', 'middle').attr('dy', '1.4em').style('font-size', '11px').style('fill', 'var(--ink-3)').text('eficientes');
    // legend with values
    const lx = size + 18;
    const lg = svg.append('g');
    data.forEach((d, i) => {
      const yy = cy - (data.length * 30) / 2 + i * 30 + 15;
      const row = lg.append('g').style('cursor', 'pointer').style('opacity', sel.size && !sel.has(d.k) ? 0.4 : 1).on('click', (e) => pick('cats', d.k, e));
      row.append('circle').attr('cx', lx + 5).attr('cy', yy).attr('r', 5).style('fill', d.c);
      const val = `${int(d.n)} · ${p0(d.n / total)}`;
      row.append('text').attr('x', lx + 16).attr('y', yy).attr('dy', '0.35em').style('font-size', '12px').style('fill', 'var(--ink)').text(fit(d.k, W - lx - 30 - tw(val, 12)));
      row.append('text').attr('x', W - 2).attr('y', yy).attr('dy', '0.35em').attr('text-anchor', 'end').style('font-size', '12px').style('fill', 'var(--ink-2)').text(val);
    });
  }

  // ---------- Visual: líneas 2023–2026 por contrato ----------
  function chartTrend() {
    const box = $('ch-trend');
    box.replaceChildren();
    const R = rows();
    const series = CONTRATOS.filter((c) => c !== 'Otro').map((c) => ({
      c, pts: YEARS.map((y) => { const s = R.filter((d) => d.contrato === c && num(d['evaldo_' + y]) != null); return { y, v: s.length ? mean(s, 'evaldo_' + y) : null, n: s.length }; }).filter((p) => p.v != null),
    })).filter((s) => s.pts.length);
    $('lg-trend').replaceChildren(...series.map((s) => { const sp = el('span'); const i = el('i'); i.style.background = SERIE[s.c]; sp.append(i, s.c); return sp; }));
    if (!series.length) return emptyBox(box);
    const W = Math.max(300, box.clientWidth), H = 260;
    const ends = series.map((s) => ({ c: s.c, last: s.pts[s.pts.length - 1] }));
    const endW = d3.max(ends, (e) => tw(`${p0(e.last.v)} ${e.c}`, 11, 600));
    const m = { t: 10, r: endW + 16, b: 26, l: tw('100%', 11) + 10 };
    const allV = series.flatMap((s) => s.pts.map((p) => p.v));
    const lo = Math.min(0.6, Math.floor((d3.min(allV) - 0.04) * 20) / 20);
    const x = d3.scalePoint(YEARS, [m.l + 14, W - m.r - 4]);
    const y = d3.scaleLinear([lo, 1], [H - m.b, m.t]);
    const svg = svgIn(box, W, H);
    const yt = y.ticks(5);
    svg.append('g').selectAll('line').data(yt).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).style('stroke', 'var(--line-2)');
    svg.append('g').selectAll('text').data(yt).join('text').attr('x', m.l - 6).attr('y', y).attr('dy', '0.35em').attr('text-anchor', 'end').style('fill', 'var(--ink-3)').style('font-size', '11px').text(d3.format('.0%'));
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(META)).attr('y2', y(META)).style('stroke', 'var(--ink-3)').attr('stroke-dasharray', '4 4');
    svg.append('g').selectAll('text').data(YEARS).join('text').attr('x', x).attr('y', H - 6).attr('text-anchor', 'middle').style('fill', 'var(--ink-3)').style('font-size', '11px').text((d) => YEAR_LABEL[d]);
    const line = d3.line().x((p) => x(p.y)).y((p) => y(p.v));
    const rule = svg.append('line').attr('y1', m.t).attr('y2', H - m.b).style('stroke', 'var(--ink-3)').attr('opacity', 0);
    const focus = {};
    series.forEach((s) => {
      const dim = S.contratos.size && !S.contratos.has(s.c);
      svg.append('path').datum(s.pts).attr('d', line).style('fill', 'none').style('stroke', SERIE[s.c]).attr('stroke-width', 2.25).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round').style('opacity', dim ? 0.25 : 1);
      svg.append('g').selectAll('circle').data(s.pts).join('circle').attr('cx', (p) => x(p.y)).attr('cy', (p) => y(p.v)).attr('r', 3.2).style('fill', SERIE[s.c]).style('opacity', dim ? 0.25 : 1);
      focus[s.c] = svg.append('circle').attr('r', 5.5).style('fill', SERIE[s.c]).style('stroke', 'var(--visual)').attr('stroke-width', 2).attr('opacity', 0);
    });
    const lab = ends.map((e) => ({ ...e, yy: y(e.last.v) })).sort((a, b) => a.yy - b.yy);
    for (let i = 1; i < lab.length; i++) if (lab[i].yy - lab[i - 1].yy < 13) lab[i].yy = lab[i - 1].yy + 13;
    const over = lab.length ? lab[lab.length - 1].yy - (H - m.b) : 0;
    if (over > 0) lab.forEach((l) => { l.yy -= over; });
    lab.forEach((l) => svg.append('text').attr('x', W - m.r + 8).attr('y', l.yy).attr('dy', '0.35em').style('fill', SERIE[l.c]).style('font-size', '11px').style('font-weight', 600).text(`${p0(l.last.v)} ${l.c}`));
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).style('fill', 'transparent')
      .on('mousemove', (ev) => {
        const [px] = d3.pointer(ev);
        const yr = YEARS.reduce((a, b) => (Math.abs(x(b) - px) < Math.abs(x(a) - px) ? b : a));
        rule.attr('x1', x(yr)).attr('x2', x(yr)).attr('opacity', 0.6);
        const lines = [];
        series.forEach((s) => {
          const p = s.pts.find((q) => q.y === yr);
          if (p) { focus[s.c].attr('cx', x(yr)).attr('cy', y(p.v)).attr('opacity', 1); lines.push([SERIE[s.c], `${s.c} (${p.n})`, p1(p.v)]); }
          else focus[s.c].attr('opacity', 0);
        });
        showTip(ev, 'Evaldo ' + YEAR_LABEL[yr], lines);
      })
      .on('mouseleave', () => { rule.attr('opacity', 0); Object.values(focus).forEach((f) => f.attr('opacity', 0)); hideTip(); });
  }

  // ---------- Visual: sedes ----------
  function chartSede() {
    const box = $('ch-sede');
    box.replaceChildren();
    const R = rows('sedes');
    const data = d3.groups(R, (d) => d.sede).map(([s, v]) => {
      const ev = v.filter((d) => num(d.evaldo_2026) != null);
      return { s, n: v.length, ev: ev.length, prom: mean(ev, 'evaldo_2026') };
    }).filter((d) => d.ev).sort((a, b) => b.prom - a.prom);
    if (!data.length) return emptyBox(box);
    const W = Math.max(300, box.clientWidth), rowH = 26;
    const m = { t: 4, r: tw('100% · n=99', 11) + 12, b: 22, l: d3.max(data, (d) => tw(d.s, 12)) + 12 };
    const H = m.t + m.b + data.length * rowH;
    const svg = svgIn(box, W, H);
    const x = d3.scaleLinear([0, 1], [m.l, W - m.r]);
    const y = d3.scaleBand(data.map((d) => d.s), [m.t, H - m.b]).padding(0.25);
    [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
      svg.append('line').attr('x1', x(t)).attr('x2', x(t)).attr('y1', m.t).attr('y2', H - m.b).style('stroke', 'var(--line-2)');
      svg.append('text').attr('x', x(t)).attr('y', H - 5).attr('text-anchor', 'middle').style('fill', 'var(--ink-3)').style('font-size', '11px').text(d3.format('.0%')(t));
    });
    const sel = S.sedes;
    data.forEach((d) => {
      const g = svg.append('g').style('cursor', 'pointer').style('opacity', sel.size && !sel.has(d.s) ? 0.3 : 1)
        .on('click', (ev) => pick('sedes', d.s, ev))
        .on('mousemove', (ev) => showTip(ev, d.s, [[null, 'Docentes', int(d.n)], [null, 'Con Evaldo 2026', int(d.ev)], [scoreColor(d.prom), 'Promedio 2026', p1(d.prom)]]))
        .on('mouseleave', hideTip);
      g.append('rect').attr('x', 0).attr('y', y(d.s) - 3).attr('width', W).attr('height', y.bandwidth() + 6).style('fill', 'transparent');
      g.append('text').attr('x', m.l - 8).attr('y', y(d.s) + y.bandwidth() / 2).attr('dy', '0.35em').attr('text-anchor', 'end').style('fill', 'var(--ink)').style('font-size', '12px').text(d.s);
      g.append('rect').attr('x', x(0)).attr('y', y(d.s)).attr('width', Math.max(1, x(d.prom) - x(0))).attr('height', y.bandwidth()).style('fill', d.prom >= META ? 'var(--c1)' : d.prom >= 0.75 ? 'var(--yellow)' : 'var(--red)');
      g.append('text').attr('x', x(d.prom) + 6).attr('y', y(d.s) + y.bandwidth() / 2).attr('dy', '0.35em').style('fill', 'var(--ink-2)').style('font-size', '11px').text(`${p0(d.prom)} · n=${d.ev}`);
    });
    svg.append('line').attr('x1', x(META)).attr('x2', x(META)).attr('y1', m.t - 2).attr('y2', H - m.b).style('stroke', 'var(--ink-2)').attr('stroke-dasharray', '3 3');
  }

  // ---------- Visual: matriz con formato condicional ----------
  const heat = d3.scaleLinear().domain([0.6, 0.8, 1]).range(['#f8696b', '#ffeb84', '#63be7b']).clamp(true);
  function matrix() {
    const t = $('t-matriz');
    const R = rows();
    const groups = CONTRATOS.map((c) => [c, R.filter((d) => d.contrato === c)]).filter(([, s]) => s.length);
    const head = el('thead'); const hr = el('tr');
    ['Contrato', 'Docentes', 'Evaluados', ...COMP.map((c) => c.name), 'Ponderado 2026', 'Δ vs 2025'].forEach((h, i) => { const th = el('th', i > 0 && i < 3 ? 'num hide-sm' : null, h); hr.append(th); });
    head.append(hr);
    const body = el('tbody');
    const mk = (label, s, total) => {
      const tr = el('tr', total ? 'total' : null);
      const ev = s.filter((d) => num(d.evaldo_2026) != null);
      tr.append(el('td', null, label), el('td', 'num hide-sm', int(s.length)), el('td', 'num hide-sm', int(ev.length)));
      [...COMP.map((c) => mean(ev, c.f)), mean(ev, 'evaldo_2026')].forEach((v) => {
        const td = el('td', 'num' + (v != null ? ' cf' : ''), p0(v));
        if (v != null) td.style.background = heat(v);
        tr.append(td);
      });
      const a = mean(ev, 'evaldo_2026'), b = mean(ev, 'evaldo_2025');
      const d = a != null && b != null ? (a - b) * 100 : null;
      tr.append(el('td', 'num delta ' + (d == null ? 'flat' : d > 0.05 ? 'up' : d < -0.05 ? 'down' : 'flat'), d == null ? '—' : (d > 0 ? '▲ ' : d < 0 ? '▼ ' : '') + pts(d).replace(/^[+−]/, '')));
      if (!total) { tr.style.cursor = 'pointer'; tr.title = ''; tr.addEventListener('click', (ev2) => pick('contratos', label, ev2)); }
      return tr;
    };
    groups.forEach(([c, s]) => body.append(mk(c, s, false)));
    if (groups.length) body.append(mk('Total', R, true));
    t.replaceChildren(head, body);
  }

  // ---------- Página: contratos fijos ----------
  function pageFijos() {
    document.querySelectorAll('#sl-fijo button').forEach((b) => {
      const n = rows('contratos').filter((d) => d.contrato === b.dataset.v).length;
      b.textContent = `${b.dataset.v} · ${n}`;
      b.setAttribute('aria-pressed', String(b.dataset.v === S.fijo));
    });
    const R = rows('contratos').filter((d) => d.contrato === S.fijo);
    const ev = R.filter((d) => num(d.evaldo_2026) != null);
    const bajo = ev.filter((d) => d.cat !== 'Eficiente');
    kpi($('kf-doc'), int(R.length), `Docentes ${S.fijo}`, `${int(R.filter((d) => d.carga_asignada === 'Sí').length)} con carga 2026-2`);
    kpi($('kf-ev'), int(ev.length), 'Con Evaldo 2026', R.length ? `${p0(ev.length / R.length)} de cobertura` : null);
    const [dt, dc] = deltaVs2025(ev);
    kpi($('kf-prom'), p1(mean(ev, 'evaldo_2026')), 'Promedio Evaldo 2026', dt, dc);
    kpi($('kf-bajo'), int(bajo.length), 'Por debajo de Eficiente', ev.length ? `${p0(bajo.length / ev.length)} de los evaluados` : null);
    $('rank-t').textContent = `Ranking Evaldo 2026 · ${S.fijo}`;
    $('lg-rank').replaceChildren(...CATS.map((c) => { const s = el('span'); const i = el('i'); i.style.background = c.c; s.append(i, c.k); return s; }));

    // Ranking chart
    const box = $('ch-rank');
    box.replaceChildren();
    const list = R.slice().sort((a, b) => {
      const va = num(a.evaldo_2026), vb = num(b.evaldo_2026);
      if (va == null && vb == null) return a.docente.localeCompare(b.docente, 'es');
      if (va == null) return 1; if (vb == null) return -1; return va - vb;
    });
    if (!list.length) emptyBox(box, `No hay docentes ${S.fijo} con los filtros seleccionados`);
    else {
      const W = Math.max(300, box.clientWidth), rowH = 24;
      const nameW = Math.min(W * 0.46, d3.max(list, (d) => tw(d.docente, 12)) + 4);
      const m = { t: 4, r: tw('Sin Evaldo', 11) + 10, b: 22, l: nameW + 10 };
      const H = m.t + m.b + list.length * rowH;
      const svg = svgIn(box, W, H);
      const x = d3.scaleLinear([0, 1], [m.l, W - m.r]);
      const y = d3.scaleBand(list.map((d) => d.id), [m.t, H - m.b]).padding(0.22);
      [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
        svg.append('line').attr('x1', x(t)).attr('x2', x(t)).attr('y1', m.t).attr('y2', H - m.b).style('stroke', 'var(--line-2)');
        svg.append('text').attr('x', x(t)).attr('y', H - 5).attr('text-anchor', 'middle').style('fill', 'var(--ink-3)').style('font-size', '11px').text(d3.format('.0%')(t));
      });
      list.forEach((d) => {
        const v = num(d.evaldo_2026);
        const g = svg.append('g').style('cursor', 'pointer').attr('tabindex', 0).attr('role', 'button').attr('aria-label', `Ver ficha de ${d.docente}`)
          .on('click', () => openFicha(d.id)).on('keydown', (ev) => { if (ev.key === 'Enter') openFicha(d.id); })
          .on('mousemove', (ev) => showTip(ev, d.docente, [[null, 'Línea', d.linea], [null, 'Sede', d.sede], [null, 'Evaldo 2025', p0(num(d.evaldo_2025))], [CAT_COLOR[d.cat], 'Evaldo 2026', p1(v)], [null, 'Categoría', d.cat]]))
          .on('mouseleave', hideTip);
        g.append('rect').attr('x', 0).attr('y', y(d.id) - 2).attr('width', W).attr('height', y.bandwidth() + 4).style('fill', 'transparent');
        g.append('text').attr('x', m.l - 8).attr('y', y(d.id) + y.bandwidth() / 2).attr('dy', '0.35em').attr('text-anchor', 'end').style('fill', 'var(--ink)').style('font-size', '12px').text(fit(d.docente, nameW));
        if (v != null) {
          g.append('rect').attr('x', x(0)).attr('y', y(d.id)).attr('width', Math.max(1, x(v) - x(0))).attr('height', y.bandwidth()).style('fill', CAT_COLOR[d.cat] || scoreColor(v));
          g.append('text').attr('x', x(v) + 5).attr('y', y(d.id) + y.bandwidth() / 2).attr('dy', '0.35em').style('fill', 'var(--ink-2)').style('font-size', '11px').text(p0(v));
        } else {
          g.append('text').attr('x', x(0) + 4).attr('y', y(d.id) + y.bandwidth() / 2).attr('dy', '0.35em').style('fill', 'var(--ink-3)').style('font-size', '11px').text('Sin Evaldo 2026');
        }
      });
      svg.append('line').attr('x1', x(META)).attr('x2', x(META)).attr('y1', m.t - 2).attr('y2', H - m.b).style('stroke', 'var(--ink-2)').attr('stroke-dasharray', '3 3');
      svg.append('text').attr('x', x(META) + 4).attr('y', m.t + 8).style('fill', 'var(--ink-3)').style('font-size', '10px').text('85 %');
    }

    // Table
    const t = $('t-fijos');
    const head = el('thead'); const hr = el('tr');
    [['Docente', ''], ['2024', 'num hide-sm'], ['2025', 'num'], ['2026', 'num'], ['Δ', 'num']].forEach(([h, c]) => hr.append(el('th', c || null, h)));
    head.append(hr);
    const body = el('tbody');
    list.forEach((d) => {
      const tr = el('tr'); tr.tabIndex = 0; tr.dataset.id = d.id;
      const a = num(d.evaldo_2026), b = num(d.evaldo_2025);
      const dd = a != null && b != null ? (a - b) * 100 : null;
      tr.append(el('td', 'name', d.docente), el('td', 'num hide-sm', p0(num(d.evaldo_2024))), el('td', 'num', p0(b)), dataBarTd(a, d.cat),
        el('td', 'num delta ' + (dd == null ? 'flat' : dd > 0.05 ? 'up' : dd < -0.05 ? 'down' : 'flat'), dd == null ? '—' : (dd > 0 ? '▲ ' : dd < 0 ? '▼ ' : '') + d3.format('.0f')(Math.abs(dd))));
      body.append(tr);
    });
    t.replaceChildren(head, body);
  }

  function dataBarTd(v, cat) {
    const td = el('td', 'num');
    const w = el('div', 'dbar');
    if (v != null) { const k = el('span', 'trk'); const b = el('b'); b.style.width = Math.max(0, Math.min(1, v)) * 100 + '%'; b.style.background = CAT_COLOR[cat] || scoreColor(v); k.append(b); w.append(k); }
    w.append(el('span', null, p0(v)));
    td.append(w);
    return td;
  }

  // ---------- Página: detalle ----------
  const COLS = [
    { k: 'docente', h: 'Docente', cls: 'name' },
    { k: 'linea', h: 'Línea', cls: 'hide-sm' },
    { k: 'contrato', h: 'Contrato' },
    { k: 'sede', h: 'Sede', cls: 'hide-sm' },
    { k: 'carga_asignada', h: 'Carga 2026-2', cls: 'hide-sm' },
    { k: 'evaldo_2023', h: '2023-II', cls: 'num hide-sm', n: true },
    { k: 'evaldo_2024', h: '2024-2', cls: 'num hide-sm', n: true },
    { k: 'evaldo_2025', h: '2025', cls: 'num', n: true },
    { k: 'evaldo_2026', h: 'Evaldo 2026', cls: 'num', n: true },
    { k: 'cat', h: 'Categoría 2026' },
  ];
  function pageDetalle() {
    const R = rows();
    const q = S.q.trim().toLowerCase();
    let list = R.filter((d) => !q || `${d.docente} ${d.sede}`.toLowerCase().includes(q));
    const col = COLS.find((c) => c.k === S.sort.key) || COLS[8];
    list = list.slice().sort((a, b) => {
      let va = a[col.k], vb = b[col.k];
      if (col.n) { va = num(va); vb = num(vb); if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1; return (va - vb) * S.sort.dir; }
      va = va == null ? '' : String(va); vb = vb == null ? '' : String(vb);
      return va.localeCompare(vb, 'es') * S.sort.dir;
    });
    const t = $('t-detalle');
    const head = el('thead'); const hr = el('tr');
    COLS.forEach((c) => {
      const th = el('th', c.cls && c.cls !== 'name' ? c.cls : null, c.h);
      th.tabIndex = 0;
      if (c.k === S.sort.key) th.setAttribute('aria-sort', S.sort.dir > 0 ? 'ascending' : 'descending');
      const go = () => { S.sort = S.sort.key === c.k ? { key: c.k, dir: -S.sort.dir } : { key: c.k, dir: c.n ? 1 : 1 }; pageDetalle(); };
      th.addEventListener('click', go);
      th.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      hr.append(th);
    });
    head.append(hr);
    const body = el('tbody');
    list.forEach((d) => {
      const tr = el('tr'); tr.tabIndex = 0; tr.dataset.id = d.id;
      COLS.forEach((c) => {
        if (c.k === 'evaldo_2026') tr.append(dataBarTd(num(d.evaldo_2026), d.cat));
        else if (c.k === 'cat') { const td = el('td'); const p = el('span', 'pill'); const i = el('i'); i.style.background = CAT_COLOR[d.cat]; p.append(i, d.cat); td.append(p); tr.append(td); }
        else if (c.n) tr.append(el('td', c.cls, p0(num(d[c.k]))));
        else tr.append(el('td', c.cls, d[c.k] == null ? '—' : d[c.k]));
      });
      body.append(tr);
    });
    t.replaceChildren(head, body);
    $('t-count').textContent = `${int(list.length)} de ${int(R.length)} docentes`;
  }

  // ---------- Ficha (drill-through) ----------
  let lastFocus = null;
  let fichaId = null;
  function openFicha(id, refresh) {
    const d = RAW.find((x) => x.id === id);
    if (!d) { if (refresh && fichaId === id) closeFicha(); return; }
    hideTip();
    fichaId = id;
    if (!refresh) $('f-edit').hidden = true;
    const grupo = RAW.filter((x) => x.linea === d.linea && x.contrato === d.contrato && num(x.evaldo_2026) != null);
    const gProm = mean(grupo, 'evaldo_2026');
    $('f-nom').textContent = d.docente;
    const fact = (l, v) => { const s = el('span'); s.append(l + ' '); s.append(el('b', null, v)); return s; };
    $('f-facts').replaceChildren(fact('Línea', d.linea), fact('Contrato', d.contrato), fact('Sede', d.sede),
      fact('Horas de contrato', d.horas_contrato == null ? '—' : d.horas_contrato + ' h'), fact('Carga 2026-2', d.carga_asignada || '—'));
    const v = num(d.evaldo_2026);
    kpi($('f-k1'), p0(v), 'Evaldo 2026', d.cat);
    $('f-k1').querySelector('.d').style.color = CAT_COLOR[d.cat] === 'var(--gray)' ? 'var(--ink-3)' : CAT_COLOR[d.cat];
    if (v != null && gProm != null) {
      const dd = (v - gProm) * 100;
      kpi($('f-k2'), (dd >= 0 ? '+' : '−') + d3.format('.0f')(Math.abs(dd)), `Puntos vs promedio ${d.contrato} (${p0(gProm)})`, `${grupo.length} evaluados en ${d.linea}`, dd >= 0 ? 'up' : 'down');
      $('f-k2').querySelector('.v').style.color = dd >= 0 ? 'var(--ok)' : 'var(--red)';
    } else { kpi($('f-k2'), '—', 'Puntos vs su grupo', 'sin Evaldo 2026'); $('f-k2').querySelector('.v').style.color = ''; }
    if (v != null) {
      const losses = COMP.map((c) => ({ c, l: num(d[c.f]) == null ? 0 : (1 - num(d[c.f])) * c.w * 100 })).sort((a, b) => b.l - a.l);
      const tot = d3.sum(losses, (x) => x.l);
      kpi($('f-k3'), d3.format('.1f')(tot), 'Puntos que deja de sumar', losses[0].l > 0.05 ? `Mayor pérdida: ${losses[0].c.long} (${d3.format('.1f')(losses[0].l)})` : 'Sin pérdidas');
      $('f-k3').querySelector('.v').style.color = tot >= 15 ? 'var(--red)' : '';
    } else { kpi($('f-k3'), '—', 'Puntos que deja de sumar', 'sin Evaldo 2026'); $('f-k3').querySelector('.v').style.color = ''; }
    $('f-grupo').textContent = `Barra: docente · marca negra: promedio ${d.contrato} de ${d.linea}`;
    $('f-pend').hidden = !pending[id];
    refreshEditUI();
    if (refresh) { requestAnimationFrame(() => fichaCharts(d, grupo)); return; }
    lastFocus = document.activeElement;
    $('ficha').hidden = false;
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(() => { fichaCharts(d, grupo); $('f-back').focus(); });
  }
  function fichaCharts(d, grupo) {
    // History columns
    const box = $('f-hist');
    box.replaceChildren();
    const W = Math.max(260, box.clientWidth), H = 230, m = { t: 18, r: 6, b: 24, l: 6 };
    const svg = svgIn(box, W, H);
    const x = d3.scaleBand(YEARS, [m.l, W - m.r]).padding(0.35);
    const y = d3.scaleLinear([0, 1], [H - m.b, m.t]);
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0)).style('stroke', 'var(--line)');
    YEARS.forEach((yr) => {
      const v = num(d['evaldo_' + yr]);
      svg.append('text').attr('x', x(yr) + x.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').style('fill', 'var(--ink-3)').style('font-size', '11px').text(YEAR_LABEL[yr]);
      if (v == null) { svg.append('text').attr('x', x(yr) + x.bandwidth() / 2).attr('y', y(0) - 8).attr('text-anchor', 'middle').style('fill', 'var(--ink-3)').style('font-size', '10.5px').text('Sin eval.'); return; }
      svg.append('rect').attr('x', x(yr)).attr('y', y(v)).attr('width', x.bandwidth()).attr('height', y(0) - y(v)).style('fill', scoreColor(v));
      svg.append('text').attr('x', x(yr) + x.bandwidth() / 2).attr('y', y(v) - 5).attr('text-anchor', 'middle').style('fill', 'var(--ink)').style('font-size', '12px').style('font-weight', 600).text(p0(v));
    });
    svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(META)).attr('y2', y(META)).style('stroke', 'var(--ink-3)').attr('stroke-dasharray', '4 4');

    // Components vs group
    const cb = $('f-comp');
    cb.replaceChildren();
    $('f-lg').replaceChildren();
    if (num(d.evaldo_2026) == null) return emptyBox(cb, 'No tiene Evaldo 2026, así que no hay componentes que mostrar');
    const lg = $('f-lg');
    const s1 = el('span'); const i1 = el('i'); i1.style.background = 'var(--c1)'; s1.append(i1, 'Docente');
    const s2 = el('span'); const i2 = el('i'); i2.style.background = 'var(--ink)'; i2.style.borderRadius = '1px'; i2.style.width = '3px'; s2.append(i2, `Promedio ${d.contrato}`);
    lg.append(s1, s2);
    const W2 = Math.max(300, cb.clientWidth), rowH = 40;
    const lw = d3.max(COMP, (c) => tw(c.long, 12)) + 12;
    const m2 = { t: 4, r: tw('100%  −10.0', 11) + 16, b: 22, l: Math.min(lw, W2 * 0.4) };
    const H2 = m2.t + m2.b + COMP.length * rowH;
    const svg2 = svgIn(cb, W2, H2);
    const x2 = d3.scaleLinear([0, 1], [m2.l, W2 - m2.r]);
    const y2 = d3.scaleBand(COMP.map((c) => c.f), [m2.t, H2 - m2.b]).padding(0.38);
    [0, 0.5, 1].forEach((t) => {
      svg2.append('line').attr('x1', x2(t)).attr('x2', x2(t)).attr('y1', m2.t).attr('y2', H2 - m2.b).style('stroke', 'var(--line-2)');
      svg2.append('text').attr('x', x2(t)).attr('y', H2 - 5).attr('text-anchor', 'middle').style('fill', 'var(--ink-3)').style('font-size', '11px').text(d3.format('.0%')(t));
    });
    COMP.forEach((c) => {
      const v = num(d[c.f]); const a = mean(grupo, c.f);
      const yy = y2(c.f), bh = y2.bandwidth();
      svg2.append('text').attr('x', m2.l - 10).attr('y', yy + bh / 2 - 6).attr('text-anchor', 'end').style('fill', 'var(--ink)').style('font-size', '12px').text(fit(c.long, m2.l - 14));
      svg2.append('text').attr('x', m2.l - 10).attr('y', yy + bh / 2 + 9).attr('text-anchor', 'end').style('fill', 'var(--ink-3)').style('font-size', '10.5px').text(`pesa ${Math.round(c.w * 100)} %`);
      svg2.append('rect').attr('x', x2(0)).attr('y', yy).attr('width', x2(1) - x2(0)).attr('height', bh).style('fill', 'var(--line-2)');
      if (v != null) svg2.append('rect').attr('x', x2(0)).attr('y', yy).attr('width', Math.max(1, x2(v) - x2(0))).attr('height', bh).style('fill', v < (a ?? 1) - 0.05 ? 'var(--red)' : 'var(--c1)');
      if (a != null) svg2.append('rect').attr('x', x2(a) - 1.5).attr('y', yy - 5).attr('width', 3).attr('height', bh + 10).style('fill', 'var(--ink)');
      const loss = v == null ? null : (1 - v) * c.w * 100;
      const t = svg2.append('text').attr('x', W2 - m2.r + 10).attr('y', yy + bh / 2).attr('dy', '0.35em').style('font-size', '11.5px');
      t.append('tspan').style('fill', 'var(--ink)').style('font-weight', 600).text(p0(v));
      if (loss != null && loss >= 0.05) t.append('tspan').attr('dx', 6).style('fill', loss >= 2 ? 'var(--red)' : 'var(--ink-3)').text('−' + d3.format('.1f')(loss));
      svg2.append('rect').attr('x', 0).attr('y', yy - 6).attr('width', W2).attr('height', bh + 12).style('fill', 'transparent')
        .on('mousemove', (ev) => showTip(ev, c.long, [['var(--c1)', 'Docente', p1(v)], ['var(--ink)', `Promedio ${d.contrato}`, p1(a)], [null, 'Puntos que deja de sumar', loss == null ? '—' : d3.format('.1f')(loss)]]))
        .on('mouseleave', hideTip);
    });
  }
  function closeFicha() {
    $('ficha').hidden = true;
    $('f-edit').hidden = true;
    fichaId = null;
    document.documentElement.style.overflow = '';
    hideTip();
    refreshEditUI();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  // ---------- Edición de datos ----------
  const SKELETON = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>';
  const PAGE_TOP = '<title>Desempeño Docente 2026</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@400;500;600&family=Open+Sans:wght@400;600;700&display=swap">\n';
  const D3_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js';
  const pendingCount = () => Object.keys(pending).length;
  const original = (id) => ({ ...(SRC.find((x) => x.id === id) || {}), ...(saved[id] || {}) });
  const isDeleted = (id) => (pending[id] && 'eliminado' in pending[id] ? !!pending[id].eliminado : !!original(id).eliminado);

  function setStatus(msg, kind) { ['save-status', 'f-status'].forEach((id) => { const s = $(id); s.textContent = msg || ''; s.dataset.kind = kind || ''; }); }
  function refreshEditUI() {
    const n = pendingCount();
    const save = $('btn-save');
    save.hidden = !EDIT.can || !n;
    save.disabled = EDIT.busy;
    save.textContent = EDIT.busy ? 'Guardando…' : `Guardar cambios (${n})`;
    const fs = $('f-save');
    fs.hidden = save.hidden;
    fs.disabled = EDIT.busy;
    fs.textContent = save.textContent;
    $('btn-discard').hidden = !EDIT.can || !n || EDIT.busy;
    $('btn-download').hidden = IN_CLAUDE || !EDIT.can || n > 0 || !Object.keys(saved).length;
    $('f-edit-btn').hidden = !EDIT.can || !fichaId;
    const fd = $('f-delete');
    const isDel = !!fichaId && isDeleted(fichaId);
    fd.hidden = !EDIT.can || !fichaId;
    fd.textContent = isDel ? 'Restaurar docente' : 'Eliminar docente';
    fd.classList.toggle('danger', !isDel);
    $('detalle-sub').textContent = 'Clic en un docente para ver su ficha · clic en un encabezado para ordenar' + (EDIT.can ? ' · para corregir un dato, abre la ficha y usa Editar datos' : '');
  }
  function openEdit() {
    const d = RAW.find((x) => x.id === fichaId);
    if (!d) return;
    $('e-linea').value = d.linea;
    $('e-contrato').value = d.contrato;
    $('e-sede').value = d.sede === 'Sin sede' ? '' : d.sede;
    $('e-horas').value = d.horas_contrato == null ? '' : d.horas_contrato;
    $('e-carga').value = d.carga_asignada || '';
    const sedes = [...new Set(RAW.map((x) => x.sede).filter((s) => s !== 'Sin sede'))].sort((a, b) => a.localeCompare(b, 'es'));
    $('e-sedes').replaceChildren(...sedes.map((s) => { const o = document.createElement('option'); o.value = s; return o; }));
    $('e-note').textContent = '';
    $('f-edit').hidden = false;
    $('e-sede').focus();
  }
  function applyEdit() {
    const id = fichaId;
    if (!id) return;
    const horasTxt = String($('e-horas').value).trim();
    const horas = horasTxt === '' ? null : Number(horasTxt);
    if (horasTxt !== '' && (!Number.isInteger(horas) || horas < 0 || horas > 60)) { $('e-note').textContent = 'Las horas deben ser un número entero entre 0 y 60.'; $('e-horas').focus(); return; }
    const sede = $('e-sede').value.trim().replace(/\s+/g, ' ').toUpperCase();
    const next = { linea: $('e-linea').value, contrato: $('e-contrato').value, sede: sede || null, horas_contrato: horas, carga_asignada: $('e-carga').value || null };
    const orig = original(id);
    const diff = {};
    EDITABLE.forEach((k) => { const a = orig[k] == null ? null : orig[k]; const b = next[k] == null ? null : next[k]; if (a !== b) diff[k] = b; });
    const keep = pending[id] && 'eliminado' in pending[id] ? { eliminado: pending[id].eliminado } : {};
    const merged = { ...keep, ...diff };
    if (Object.keys(merged).length) pending[id] = merged; else delete pending[id];
    rebuild();
    $('f-edit').hidden = true;
    render();
    openFicha(id, true);
    setStatus(Object.keys(diff).length ? `Cambio aplicado a ${orig.docente}. Falta guardarlo.` : 'Sin cambios para este docente.', 'info');
    $('f-edit-btn').focus();
  }
  // Eliminar o restaurar: cambia solo el campo "eliminado" y queda pendiente hasta guardar
  function setDeleted(id, flag) {
    const d = RAW.concat(DELETED).find((x) => x.id === id);
    if (!d) return;
    if (flag && !window.confirm(`¿Eliminar a ${d.docente} del reporte? Se puede restaurar después desde "Docentes eliminados".`)) return;
    const base = !!original(id).eliminado;
    const p = { ...(pending[id] || {}) };
    if (!!flag === base) delete p.eliminado; else p.eliminado = !!flag;
    if (Object.keys(p).length) pending[id] = p; else delete pending[id];
    rebuild();
    if (flag && fichaId === id) closeFicha();
    render();
    if (fichaId) openFicha(fichaId, true);
    refreshEditUI();
    setStatus(flag ? `${d.docente} eliminado. Falta guardarlo.` : `${d.docente} restaurado. Falta guardarlo.`, 'info');
  }
  function discard() {
    pending = {};
    rebuild();
    render();
    if (fichaId) openFicha(fichaId, true);
    setStatus('Cambios descartados.', 'info');
  }
  function buildDocument(rows) {
    const SC = '<' + '/script>';
    const json = JSON.stringify(rows).replace(/</g, '\\u003c');
    return SKELETON + '\n' + PAGE_TOP +
      '<style id="app-css">' + $('app-css').textContent + '</style>\n' +
      '<template id="app-markup">' + tplMarkup.innerHTML + '</template>\n' +
      '<div id="app-root"></div>\n' +
      '<script id="app-data" type="application/json">' + json + SC + '\n' +
      '<script src="' + D3_SRC + '">' + SC + '\n' +
      '<script id="app-js">' + $('app-js').textContent + SC + '\n</body></html>';
  }
  async function loadSupabase() {
    try {
      const data = await sb(`${SUPABASE.table}?select=id,cambios`);
      saved = {};
      (data || []).forEach((r) => { saved[r.id] = r.cambios || {}; });
      rebuild();
      render();
      if (fichaId) openFicha(fichaId, true);
    } catch (e) {
      setStatus('No se pudieron cargar las ediciones guardadas. Se muestran los datos base.', 'err');
    }
  }
  async function saveSupabase() {
    const ids = Object.keys(pending);
    const rows = ids.map((id) => ({ id, cambios: { ...(saved[id] || {}), ...pending[id] }, actualizado: new Date().toISOString() }));
    EDIT.busy = true;
    refreshEditUI();
    setStatus('Guardando…', 'info');
    try {
      await sb(`${SUPABASE.table}?on_conflict=id`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
      ids.forEach((id) => { saved[id] = rows.find((r) => r.id === id).cambios; });
      pending = {};
      rebuild();
      render();
      if (fichaId) openFicha(fichaId, true);
      setStatus('Guardado para todos.', 'ok');
    } catch (e) {
      setStatus('No se pudo guardar en la base de datos. Tus cambios siguen pendientes; vuelve a intentarlo.', 'err');
    } finally {
      EDIT.busy = false;
      refreshEditUI();
    }
  }
  async function save() {
    if (!pendingCount() || EDIT.busy) return;
    if (SB_ON) { await saveSupabase(); return; }
    if (!IN_CLAUDE) {
      Object.entries(pending).forEach(([id, ch]) => { saved[id] = { ...(saved[id] || {}), ...ch }; });
      pending = {};
      rebuild();
      render();
      if (fichaId) openFicha(fichaId, true);
      const ok = lsSet(saved);
      setStatus(ok ? 'Guardado en este navegador. Usa "Descargar datos" para actualizar data/docentes.js en el repositorio.' : 'No se pudo guardar en este navegador.', ok ? 'ok' : 'err');
      refreshEditUI();
      return;
    }
    if (!EDIT.art) { setStatus('Guardar no está disponible en esta vista.', 'err'); return; }
    EDIT.busy = true;
    refreshEditUI();
    setStatus('Guardando…', 'info');
    try { sessionStorage.setItem(LS_KEY, JSON.stringify(pending)); } catch (e) { /* sin sessionStorage */ }
    try {
      await EDIT.art.publish(buildDocument(baseRows()));
      setStatus('Guardado. Actualizando la página…', 'ok');
    } catch (e) {
      const code = e && e.code;
      if (code === 'conflict') setStatus('Había una versión más reciente. La página se está actualizando con tus cambios pendientes; revísalos y vuelve a guardar.', 'err');
      else if (['not_writer', 'not_granted', 'consent_required', 'capability_disabled', 'capability_removed', 'not_declared'].includes(code)) { EDIT.can = false; setStatus('Esta vista es de solo lectura: los cambios no se pueden guardar.', 'err'); }
      else if (code === 'rate_limited') setStatus('Se guardó varias veces seguidas. Espera un momento y vuelve a intentarlo.', 'err');
      else if (code === 'too_large') setStatus('La página quedó demasiado grande para guardarse.', 'err');
      else setStatus('No se pudo guardar. Vuelve a intentarlo en unos segundos.', 'err');
      try { if (code !== 'conflict') sessionStorage.removeItem(LS_KEY); } catch (e2) { /* nada */ }
    } finally {
      EDIT.busy = false;
      refreshEditUI();
    }
  }
  function downloadData() {
    const txt = '/* Docentes de Contabilidad y Pensamiento Lógico — base 2026-2 + Evaldo 2023-II a 2026. Sin DNI, teléfonos ni correos. */\nwindow.DOCENTES = ' + JSON.stringify(baseRows()) + ';\n';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/javascript' }));
    a.download = 'docentes.js';
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    setStatus('Reemplaza data/docentes.js en el repositorio con el archivo descargado.', 'ok');
  }
  function initEditing() {
    if (SB_ON) { EDIT.can = true; refreshEditUI(); loadSupabase(); return; }
    if (!IN_CLAUDE) { refreshEditUI(); return; }
    // Cambios que quedaron sin guardar por un conflicto: se recuperan solo si siguen siendo distintos de los datos actuales
    try {
      const st = JSON.parse(sessionStorage.getItem(LS_KEY) || 'null');
      sessionStorage.removeItem(LS_KEY);
      if (st && typeof st === 'object') {
        Object.entries(st).forEach(([id, ch]) => {
          const orig = original(id); const diff = {};
          Object.entries(ch || {}).forEach(([k, v]) => { if ((EDITABLE.includes(k) || k === 'eliminado') && (orig[k] == null ? null : orig[k]) !== v) diff[k] = v; });
          if (Object.keys(diff).length && orig.id) pending[id] = diff;
        });
        if (pendingCount()) { rebuild(); render(); setStatus('Recuperamos cambios que no se guardaron. Revísalos y guarda.', 'info'); }
      }
    } catch (e) { /* sin sessionStorage */ }
    refreshEditUI();
    Promise.all([window.claude.use('artifact'), window.claude.use('user')]).then(async ([art, user]) => {
      if (!art || !user) return;
      let ok = false;
      try { ok = await user.canEdit(); } catch (e) { ok = false; }
      EDIT.art = art;
      EDIT.can = !!ok;
      refreshEditUI();
    }).catch(() => { /* vista de solo lectura */ });
  }

  // ---------- Render ----------
  function renderDeleted() {
    const box = $('del-wrap');
    box.hidden = !EDIT.can && !DELETED.length;
    $('del-toggle').textContent = `Docentes eliminados (${DELETED.length})`;
    $('del-list').replaceChildren(...DELETED.map((d) => {
      const r = el('div', 'del-row');
      r.append(el('span', null, `${d.docente} · ${d.linea} · ${d.contrato}`));
      if (EDIT.can) { const b = el('button', 'pb-btn', 'Restaurar'); b.type = 'button'; b.dataset.restore = d.id; r.append(b); }
      return r;
    }));
    if (!DELETED.length) $('del-list').replaceChildren(el('p', 'pb-fnote', 'No hay docentes eliminados.'));
  }
  function render() {
    renderSlicers();
    renderDeleted();
    if (S.page === 'resumen') { renderKPIs(); chartContrato(); chartDonut(); chartTrend(); chartSede(); matrix(); }
    if (S.page === 'fijos') pageFijos();
    if (S.page === 'detalle') pageDetalle();
  }
  function setPage(p) {
    S.page = p;
    const order = ['resumen', 'fijos', 'detalle'];
    document.querySelectorAll('.pb-page').forEach((s) => { s.hidden = s.dataset.page !== p; });
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.p === p)));
    $('pg').textContent = `Página ${order.indexOf(p) + 1} de 3`;
    try { history.replaceState(null, '', '#' + p); } catch (e) { /* sin historial */ }
    render();
    window.scrollTo({ top: 0 });
  }

  // ---------- Eventos ----------
  $('sl-linea').addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (b) { S.linea = b.dataset.v; render(); } });
  document.querySelectorAll('[data-clear]').forEach((b) => b.addEventListener('click', () => { S[b.dataset.clear].clear(); render(); }));
  const resetAll = () => { S.linea = 'Todas'; S.contratos.clear(); S.sedes.clear(); S.cats.clear(); S.q = ''; $('q').value = ''; render(); };
  $('clear-all').addEventListener('click', resetAll);
  $('btn-reset').addEventListener('click', resetAll);
  $('btn-filtros').addEventListener('click', () => {
    const f = $('filtros'); const open = !f.classList.contains('open');
    f.classList.toggle('open', open); $('btn-filtros').setAttribute('aria-expanded', String(open));
  });
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => setPage(b.dataset.p)));
  $('sl-fijo').addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (b) { S.fijo = b.dataset.v; pageFijos(); } });
  $('q').addEventListener('input', (e) => { S.q = e.target.value; pageDetalle(); });
  ['t-fijos', 't-detalle'].forEach((id) => {
    const t = $(id);
    t.addEventListener('click', (e) => { const r = e.target.closest('tbody tr[data-id]'); if (r) openFicha(r.dataset.id); });
    t.addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; const r = e.target.closest('tbody tr[data-id]'); if (r) openFicha(r.dataset.id); });
  });
  $('f-back').addEventListener('click', closeFicha);
  $('ficha').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeFicha(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || $('ficha').hidden) return;
    if (!$('f-edit').hidden) { $('f-edit').hidden = true; $('f-edit-btn').focus(); } else closeFicha();
  });
  $('f-edit-btn').addEventListener('click', openEdit);
  $('f-delete').addEventListener('click', () => { if (fichaId) setDeleted(fichaId, !isDeleted(fichaId)); });
  $('del-list').addEventListener('click', (e) => { const b = e.target.closest('button[data-restore]'); if (b) setDeleted(b.dataset.restore, false); });
  $('del-toggle').addEventListener('click', () => { const l = $('del-list'); const open = l.hidden; l.hidden = !open; $('del-toggle').setAttribute('aria-expanded', String(open)); });
  $('e-ok').addEventListener('click', applyEdit);
  $('e-cancel').addEventListener('click', () => { $('f-edit').hidden = true; $('f-edit-btn').focus(); });
  $('f-edit').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); applyEdit(); } });
  $('btn-save').addEventListener('click', save);
  $('f-save').addEventListener('click', save);
  $('btn-discard').addEventListener('click', discard);
  $('btn-download').addEventListener('click', downloadData);
  initEditing();

  let rt;
  const ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(render, 120); });
  ro.observe($('canvas'));

  const start = location.hash.slice(1);
  setPage(['resumen', 'fijos', 'detalle'].includes(start) ? start : 'resumen');
})();
