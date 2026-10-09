/* ===== Consulta rápida de estudiantes (Supabase) =====
   La pestaña BBDD se copia a la tabla public.bd_estudiantes (sincronización
   diaria o con el botón «Sincronizar»). Aquí solo se piden al servidor las
   filas de la página visible, así que abre al instante aunque haya ~40 mil
   matrículas. Todas las consultas son funciones RPC que reciben los filtros
   como un objeto: { ciclo:[], programa:[], ..., q:[palabras] }. */

const SB_URL = 'https://klmjmlhwuzhymrplemgw.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsbWptbGh3dXpoeW1ycGxlbWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTMyNjQsImV4cCI6MjA4NzE2OTI2NH0.xFWMvUJa9n9TBcBG1WSeqCGiWBaCAtCU9aY7GXk4W6E';
const POR_PAGINA = 100;
const TURNO_LABEL = { M: 'Mañana', T: 'Tarde', N: 'Noche', D: 'Diurno' };

const state = {
  ciclo: new Set(), programa: new Set(), curso: new Set(), seccion: new Set(),
  docente: new Set(), coordinador: new Set(), turno: new Set(), modulo: new Set(),
  modalidad: new Set(), sede: new Set(),
  q: '', vista: 'alumnos', pagina: 0, orden: 'alumno', dir: 'asc'
};
const CAMPOS = ['ciclo', 'programa', 'curso', 'seccion', 'docente', 'coordinador', 'turno', 'modulo', 'modalidad', 'sede'];
let OPCIONES = {};        // campo -> [[valor, n], ...] según los demás filtros
let totalFiltro = 0;
let consultaN = 0;        // descarta respuestas viejas si el usuario sigue escribiendo

/* ---------- utilidades ---------- */
const txt = v => (v == null ? '' : String(v)).trim();
const norm = s => txt(s).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const esc = s => txt(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => Number(n || 0).toLocaleString('es-PE');

async function rpc(fn, args) {
  const res = await fetch(SB_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args || {})
  });
  if (!res.ok) {
    let msg = 'HTTP ' + res.status;
    try { const e = await res.json(); msg = e.message || msg; } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

function filtros(extra) {
  const f = {};
  CAMPOS.forEach(c => { if (state[c].size) f[c] = [...state[c]]; });
  const palabras = norm(state.q).split(/\s+/).filter(Boolean);
  if (palabras.length) f.q = palabras;
  return Object.assign(f, extra || {});
}

function setStatus(msg, kind) {
  const el = document.getElementById('status');
  if (!msg) { el.className = 'dash-status'; el.innerHTML = ''; return; }
  el.className = 'dash-status show ' + (kind || 'info');
  el.innerHTML = msg;
}

let toastTimer = null;
function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

async function copiar(texto, cuantos, etiqueta) {
  if (!texto) { toast('No hay ' + etiqueta + ' que copiar'); return false; }
  try {
    await navigator.clipboard.writeText(texto);
    toast('Copiados ' + fmt(cuantos) + ' ' + etiqueta);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
    toast(ok ? ('Copiados ' + fmt(cuantos) + ' ' + etiqueta) : 'No se pudo copiar');
    return ok;
  }
}
function marcarOk(btn) {
  btn.classList.add('ok');
  const html = btn.innerHTML; btn.innerHTML = '<i class="fas fa-check"></i> Copiado';
  setTimeout(() => { btn.classList.remove('ok'); btn.innerHTML = html; }, 1400);
}

/* ---------- multiselect con autocompletado ---------- */
function crearMultiselect(cont, { placeholder, hint, campo }) {
  const sel = state[campo];
  let opciones = [], activo = -1;
  cont.innerHTML = '<input type="text" placeholder="' + esc(placeholder) + '">' +
    '<button class="ms-clear" title="Quitar selección" style="display:none"><i class="fas fa-times"></i></button>' +
    '<div class="ms-list"></div>';
  const input = cont.querySelector('input');
  const lista = cont.querySelector('.ms-list');
  const btnClear = cont.querySelector('.ms-clear');

  function valores() {
    const m = new Map((OPCIONES[campo] || []).map(([v, n]) => [v, n]));
    [...sel].forEach(v => { if (!m.has(v)) m.set(v, 0); });
    return [...m.keys()].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
      .map(v => ({ label: v, norm: norm(v), n: m.get(v) }));
  }
  function pintarTags() {
    cont.querySelectorAll('.ms-tag').forEach(t => t.remove());
    [...sel].forEach(v => {
      const tag = document.createElement('span');
      tag.className = 'ms-tag';
      tag.innerHTML = '<span>' + esc(v) + '</span><button title="Quitar"><i class="fas fa-times"></i></button>';
      tag.querySelector('button').onclick = ev => { ev.stopPropagation(); sel.delete(v); pintarTags(); cambio(); };
      cont.insertBefore(tag, input);
    });
    btnClear.style.display = sel.size ? '' : 'none';
    input.placeholder = sel.size ? '' : placeholder;
  }
  function calcular(qRaw) {
    const q = norm(qRaw);
    const base = valores();
    if (!q) return base.slice(0, 80);
    const empieza = [], contiene = [];
    base.forEach(o => { const p = o.norm.indexOf(q); if (p === 0) empieza.push(o); else if (p > 0) contiene.push(o); });
    return empieza.concat(contiene).slice(0, 80);
  }
  function marcar(label, q) {
    if (!q) return esc(label);
    const p = norm(label).indexOf(norm(q));
    if (p < 0) return esc(label);
    return esc(label.slice(0, p)) + '<span class="mk">' + esc(label.slice(p, p + q.length)) + '</span>' + esc(label.slice(p + q.length));
  }
  function abrir() {
    opciones = calcular(input.value);
    activo = opciones.length ? 0 : -1;
    if (!opciones.length) lista.innerHTML = '<div class="ms-none">Sin coincidencias</div>';
    else lista.innerHTML = (hint ? '<div class="ms-hint">' + esc(hint) + '</div>' : '') +
      opciones.map((o, i) => '<div class="ms-opt' + (i === activo ? ' active' : '') + (sel.has(o.label) ? ' sel' : '') +
        '" data-i="' + i + '"><i class="fas ' + (sel.has(o.label) ? 'fa-square-check' : 'fa-square') + '"></i>' +
        '<span>' + marcar(o.label, input.value) + '</span><span class="n">' + fmt(o.n) + '</span></div>').join('');
    lista.querySelectorAll('.ms-opt').forEach(el => { el.onmousedown = ev => { ev.preventDefault(); elegir(parseInt(el.dataset.i, 10)); }; });
    lista.classList.add('open');
  }
  function cerrar() { lista.classList.remove('open'); activo = -1; }
  function elegir(i) {
    const o = opciones[i]; if (!o) return;
    if (sel.has(o.label)) sel.delete(o.label); else sel.add(o.label);
    input.value = ''; pintarTags(); cambio(); abrir(); input.focus();
  }
  input.addEventListener('focus', () => { cont.classList.add('focus'); abrir(); });
  input.addEventListener('blur', () => { cont.classList.remove('focus'); setTimeout(cerrar, 120); });
  input.addEventListener('input', abrir);
  input.addEventListener('keydown', ev => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault(); if (!opciones.length) return;
      activo = (activo + (ev.key === 'ArrowDown' ? 1 : -1) + opciones.length) % opciones.length;
      const els = lista.querySelectorAll('.ms-opt');
      els.forEach((el, i) => el.classList.toggle('active', i === activo));
      if (els[activo]) els[activo].scrollIntoView({ block: 'nearest' });
    } else if (ev.key === 'Enter') { ev.preventDefault(); elegir(activo); }
    else if (ev.key === 'Escape') { cerrar(); input.blur(); }
    else if (ev.key === 'Backspace' && !input.value && sel.size) { const u = [...sel].pop(); sel.delete(u); pintarTags(); cambio(); }
  });
  cont.addEventListener('click', ev => { if (ev.target === cont) input.focus(); });
  btnClear.onclick = () => { sel.clear(); pintarTags(); cambio(); };
  pintarTags();
  return { refrescar: pintarTags, abierto: () => lista.classList.contains('open'), reabrir: abrir };
}

/* ---------- chips ---------- */
function chips(contId, campo, etiqueta, orden) {
  const sel = state[campo];
  const m = new Map((OPCIONES[campo] || []).map(([v, n]) => [v, n]));
  [...sel].forEach(v => { if (!m.has(v)) m.set(v, 0); });
  let vals = [...m.keys()];
  vals = orden ? orden(vals, m) : vals.sort();
  const cont = document.getElementById(contId);
  cont.innerHTML = vals.map(v =>
    '<button class="chip' + (sel.has(v) ? ' on' : '') + '" data-v="' + esc(v) + '">' +
    esc(etiqueta ? etiqueta(v) : v) + '<span class="n">' + fmt(m.get(v)) + '</span></button>').join('') ||
    '<span class="hint">sin datos</span>';
  cont.querySelectorAll('.chip').forEach(b => {
    b.onclick = () => { const v = b.dataset.v; if (sel.has(v)) sel.delete(v); else sel.add(v); cambio(); };
  });
}
function pintarChips() {
  chips('fTurno', 'turno', v => TURNO_LABEL[v] || v,
    vals => ['M', 'T', 'N', 'D'].filter(t => vals.includes(t)).concat(vals.filter(t => !TURNO_LABEL[t]).sort()));
  chips('fModulo', 'modulo');
  chips('fModalidad', 'modalidad');
  chips('fSede', 'sede', null, (vals, m) => vals.sort((a, b) => m.get(b) - m.get(a)));
}

/* ---------- consultas ---------- */
let msList = [];
let timerCambio = null;
function cambio() {
  state.pagina = 0;
  clearTimeout(timerCambio);
  timerCambio = setTimeout(consultar, 250);
}

async function consultar() {
  const n = ++consultaN;
  const f = filtros();
  document.getElementById('tblBody').classList.add('cargando');
  try {
    const [opc, resumen] = await Promise.all([rpc('bd_est_opciones', { f }), rpc('bd_est_resumen', { f })]);
    if (n !== consultaN) return;
    OPCIONES = opc || {};
    pintarChips();
    msList.forEach(ms => { if (ms.abierto()) ms.reabrir(); });
    renderKpis(resumen || {});
    await cargarPagina(n);
    setStatus('');
  } catch (e) {
    if (n !== consultaN) return;
    setStatus('<b>No se pudo consultar la base de datos.</b> ' + esc(e.message), 'err');
  } finally {
    if (n === consultaN) document.getElementById('tblBody').classList.remove('cargando');
  }
}

async function cargarPagina(n) {
  n = n || ++consultaN;
  const f = filtros();
  const off = state.pagina * POR_PAGINA;
  let filas;
  if (state.vista === 'alumnos') {
    filas = await rpc('bd_est_alumnos', { f, lim: POR_PAGINA, off });
    if (n !== consultaN) return;
    totalFiltro = filas.length ? Number(filas[0].total) : (state.pagina ? totalFiltro : 0);
  } else {
    filas = await rpc('bd_est_matriculas', { f, lim: POR_PAGINA, off, orden: state.orden, dir: state.dir });
    if (n !== consultaN) return;
    totalFiltro = Number(document.getElementById('kpis').dataset.matriculas || 0);
  }
  renderTabla(filas);
}

/* ---------- render ---------- */
function renderKpis(r) {
  const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '0%';
  const kpi = (lab, val, sub, cls) => '<div class="kpi ' + (cls || '') + '"><div class="k-lab">' + lab +
    '</div><div class="k-val">' + val + '</div><div class="k-sub">' + sub + '</div></div>';
  const el = document.getElementById('kpis');
  el.dataset.matriculas = r.matriculas || 0;
  el.dataset.alumnos = r.alumnos || 0;
  el.innerHTML =
    kpi('Estudiantes', fmt(r.alumnos), fmt(r.matriculas) + ' matrículas', 'k-purple') +
    kpi('Correos', fmt(r.correos), 'únicos', 'k-blue') +
    kpi('Con teléfono', fmt(r.con_telefono), pct(r.con_telefono, r.alumnos) + ' de alumnos', 'k-green') +
    kpi('Secciones (NRC)', fmt(r.secciones), 'distintas', 'k-amber') +
    kpi('Cursos', fmt(r.cursos), 'distintos', '') +
    kpi('Docentes', fmt(r.docentes), 'asignados', '');
}

const COLS_MAT = [
  ['alumno', 'Alumno'], ['dni', 'DNI'], ['telefono', 'Teléfono'], ['correo', 'Correo Certus'],
  ['programa', 'Programa'], ['seccion', 'Sección'], ['nrc', 'NRC'], ['curso', 'Curso'],
  ['turno', 'Turno'], ['sede', 'Sede'], ['modalidad', 'Modalidad'], ['docente', 'Docente'], ['ciclo', 'Periodo']
];
const COLS_ALU = [
  ['alumno', 'Alumno'], ['dni', 'DNI'], ['telefono', 'Teléfono'], ['correo', 'Correo Certus'],
  ['programa', 'Programa'], ['ciclo', 'Periodo'], ['sede', 'Sede'], ['turno', 'Turno'],
  ['cursos', 'Cursos'], ['secciones', 'Secciones (NRC)']
];
const celda = (k, r) => {
  const v = r[k];
  if (k === 'telefono' || k === 'correo') return '<td class="' + (k === 'correo' ? 'mail' : 'tel') + '">' + (v ? esc(v) : '<span class="no-dato">—</span>') + '</td>';
  if (k === 'turno') return '<td>' + esc(String(v || '').split(' / ').map(t => TURNO_LABEL[t] || t).join(' / ')) + '</td>';
  if (k === 'sede') return '<td><span class="pill pill-s">' + esc(v) + '</span></td>';
  if (k === 'alumno' || k === 'curso' || k === 'docente') return '<td class="name">' + esc(v) + '</td>';
  if (k === 'secciones') return '<td class="secs">' + esc(v) + '</td>';
  return '<td>' + esc(v) + '</td>';
};

function renderTabla(filas) {
  const cols = state.vista === 'alumnos' ? COLS_ALU : COLS_MAT;
  const ordenable = state.vista === 'matriculas';
  document.getElementById('tblHead').innerHTML = '<tr class="g1">' + cols.map(([k, h]) =>
    '<th' + (ordenable ? ' data-k="' + k + '" class="sortable"' : '') + '>' + h +
    (ordenable && state.orden === k ? ' <i class="fas fa-sort-' + (state.dir === 'asc' ? 'up' : 'down') + '"></i>' : '') +
    '</th>').join('') + '</tr>';
  if (ordenable) {
    document.querySelectorAll('#tblHead th[data-k]').forEach(th => {
      th.onclick = () => {
        const k = th.dataset.k;
        state.dir = state.orden === k && state.dir === 'asc' ? 'desc' : 'asc';
        state.orden = k; state.pagina = 0; cargarPagina();
      };
    });
  }

  const body = document.getElementById('tblBody');
  if (!filas.length) {
    body.innerHTML = '<tr><td colspan="' + cols.length + '"><div class="empty">' +
      (totalFiltro || state.pagina ? 'No hay más resultados' : 'Ningún estudiante coincide con los filtros') + '</div></td></tr>';
  } else {
    body.innerHTML = filas.map(r => '<tr class="clic" data-dni="' + esc(r.dni) + '" title="Ver ficha del estudiante">' +
      cols.map(([k]) => celda(k, r)).join('') + '</tr>').join('');
    body.querySelectorAll('tr.clic').forEach(tr => { tr.onclick = () => abrirAlumno(tr.dataset.dni); });
  }

  const desde = state.pagina * POR_PAGINA;
  const etiqueta = state.vista === 'alumnos' ? 'estudiantes' : 'matrículas';
  document.getElementById('tblCount').textContent = filas.length
    ? 'Mostrando ' + fmt(desde + 1) + '–' + fmt(desde + filas.length) + ' de ' + fmt(totalFiltro) + ' ' + etiqueta
    : '0 ' + etiqueta;
  const paginas = Math.max(1, Math.ceil(totalFiltro / POR_PAGINA));
  document.getElementById('pgInfo').textContent = 'Página ' + (state.pagina + 1) + ' de ' + fmt(paginas);
  document.getElementById('pgPrev').disabled = state.pagina === 0;
  document.getElementById('pgNext').disabled = state.pagina + 1 >= paginas;
}

/* ---------- ficha del estudiante ---------- */
async function abrirAlumno(dni) {
  if (!dni) return;
  const md = document.getElementById('mdAlumno');
  document.getElementById('alTitulo').textContent = 'DNI ' + dni;
  const cuerpo = document.getElementById('alCuerpo');
  cuerpo.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i><br>Cargando...</div>';
  md.classList.add('open');
  try {
    const filas = await rpc('bd_est_matriculas', { f: { dni: [dni] }, lim: 200, off: 0, orden: 'ciclo', dir: 'desc' });
    if (!filas.length) { cuerpo.innerHTML = '<div class="empty">Sin datos</div>'; return; }
    const a = filas[0];
    document.getElementById('alTitulo').innerHTML = '<i class="fas fa-user-graduate"></i> ' + esc(a.alumno);
    const dato = (lab, val, copiable) => '<div class="al-dato"><span class="f-label">' + lab + '</span><span>' +
      (val ? esc(val) : '<span class="no-dato">—</span>') + '</span>' +
      (copiable && val ? '<button class="cbtn" data-txt="' + esc(val) + '"><i class="fas fa-copy"></i></button>' : '') + '</div>';
    const progs = [...new Set(filas.map(r => r.programa).filter(Boolean))].join(' / ');
    cuerpo.innerHTML = '<div class="al-datos">' +
      dato('DNI', a.dni, true) + dato('Correo', a.correo, true) + dato('Teléfono', a.telefono, true) +
      dato('Programa', progs) + '</div>' +
      '<table class="dash-tbl al-tbl"><thead><tr class="g1"><th>Periodo</th><th>Curso</th><th>Sección</th><th>NRC</th><th>Mód.</th>' +
      '<th>Turno</th><th>Días y hora</th><th>Sede</th><th>Modalidad</th><th>Docente</th></tr></thead><tbody>' +
      filas.map(r => '<tr><td>' + esc(r.ciclo) + '</td><td class="name">' + esc(r.curso) + '</td><td>' + esc(r.seccion) +
        '</td><td>' + esc(r.nrc) + '</td><td>' + esc(r.modulo) + '</td><td>' + esc(TURNO_LABEL[r.turno] || r.turno) +
        '</td><td>' + esc([r.dias, r.hr_ini && r.hr_fin ? r.hr_ini + '–' + r.hr_fin : ''].filter(Boolean).join(' · ')) +
        '</td><td>' + esc(r.sede) + '</td><td>' + esc(r.modalidad) + '</td><td class="name">' + esc(r.docente) + '</td></tr>').join('') +
      '</tbody></table>';
    cuerpo.querySelectorAll('.cbtn[data-txt]').forEach(b => {
      b.onclick = async () => { if (await copiar(b.dataset.txt, 1, 'dato')) marcarOk(b); };
    });
  } catch (e) {
    cuerpo.innerHTML = '<div class="empty">No se pudo cargar: ' + esc(e.message) + '</div>';
  }
}

/* ---------- correos ---------- */
const mc = { sep: '; ', tam: 100, grupo: 'no', datos: null };
async function abrirCorreos() {
  const md = document.getElementById('mdCorreos');
  md.classList.add('open');
  document.getElementById('mcBloques').innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i><br>Generando lista...</div>';
  try {
    const f = filtros();
    const [lista, grupos] = await Promise.all([
      rpc('bd_est_correos', { f, por_seccion: false }),
      rpc('bd_est_correos', { f, por_seccion: true })
    ]);
    mc.datos = { lista: lista || [], grupos: grupos || [] };
    pintarCorreos();
  } catch (e) {
    document.getElementById('mcBloques').innerHTML = '<div class="empty">No se pudo generar: ' + esc(e.message) + '</div>';
  }
}
function trozos(arr, tam) {
  if (!tam || arr.length <= tam) return [arr];
  const r = [];
  for (let i = 0; i < arr.length; i += tam) r.push(arr.slice(i, i + tam));
  return r;
}
function pintarCorreos() {
  if (!mc.datos) return;
  const sep = mc.sep;
  const bloques = [];
  if (mc.grupo === 'si') {
    mc.datos.grupos.forEach(g => {
      const partes = trozos(g.correos, mc.tam);
      partes.forEach((p, i) => bloques.push({ titulo: g.grupo + (partes.length > 1 ? ' — parte ' + (i + 1) + '/' + partes.length : ''), correos: p }));
    });
  } else {
    const partes = trozos(mc.datos.lista, mc.tam);
    partes.forEach((p, i) => bloques.push({ titulo: partes.length > 1 ? 'Bloque ' + (i + 1) + ' de ' + partes.length : 'Todos los correos', correos: p }));
  }
  document.getElementById('mcResumen').textContent = fmt(mc.datos.lista.length) + ' correos únicos · ' + bloques.length + ' bloque' + (bloques.length === 1 ? '' : 's');
  const cont = document.getElementById('mcBloques');
  if (!mc.datos.lista.length) { cont.innerHTML = '<div class="empty">No hay correos con los filtros actuales</div>'; return; }
  cont.innerHTML = (bloques.length > 1 ? '<div class="mc-todo"><button class="btn-mini" id="mcCopiarTodo"><i class="fas fa-copy"></i> Copiar los ' +
      fmt(mc.datos.lista.length) + ' correos juntos</button></div>' : '') +
    bloques.map((b, i) => '<div class="mc-bloque">' +
      '<div class="mc-bh"><span class="nm">' + esc(b.titulo) + '</span><span class="pill pill-t">' + fmt(b.correos.length) + ' correos</span>' +
      '<button class="cbtn" data-i="' + i + '"><i class="fas fa-copy"></i> Copiar</button></div>' +
      '<textarea readonly rows="3">' + esc(b.correos.join(sep)) + '</textarea></div>').join('');
  cont.querySelectorAll('.cbtn[data-i]').forEach(btn => {
    btn.onclick = async () => {
      const b = bloques[parseInt(btn.dataset.i, 10)];
      if (await copiar(b.correos.join(sep), b.correos.length, 'correos')) { marcarOk(btn); btn.closest('.mc-bloque').classList.add('hecho'); }
    };
  });
  const todo = document.getElementById('mcCopiarTodo');
  if (todo) todo.onclick = () => copiar(mc.datos.lista.join(sep), mc.datos.lista.length, 'correos');
}

/* ---------- exportaciones ---------- */
async function traerTodo(fn, extra, total) {
  const f = filtros();
  const filas = [];
  for (let off = 0; off < total; off += 1000) {
    setStatus('<i class="fas fa-spinner fa-spin"></i> Preparando Excel... ' + fmt(Math.min(off + 1000, total)) + ' de ' + fmt(total), 'info');
    const parte = await rpc(fn, Object.assign({ f, lim: 1000, off }, extra));
    filas.push(...parte);
    if (parte.length < 1000) break;
  }
  return filas;
}
function resumenFiltros() {
  const nombres = { ciclo: 'Periodo', programa: 'Programa', curso: 'Curso', seccion: 'Sección', docente: 'Docente', coordinador: 'Coordinador', turno: 'Turno', modulo: 'Módulo', modalidad: 'Modalidad', sede: 'Sede' };
  const p = CAMPOS.filter(c => state[c].size).map(c => nombres[c] + ': ' + [...state[c]].join(', '));
  if (state.q) p.push('Búsqueda: ' + state.q);
  return p.length ? p.join('  |  ') : 'Sin filtros (todos los estudiantes)';
}
function nombreArchivo() {
  const partes = ['estudiantes', state.vista];
  if (state.seccion.size === 1) partes.push([...state.seccion][0]);
  else if (state.curso.size === 1) partes.push([...state.curso][0].slice(0, 20));
  if (state.ciclo.size === 1) partes.push([...state.ciclo][0]);
  const d = new Date();
  partes.push('' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'));
  return partes.join('_').replace(/[^A-Za-z0-9_-]+/g, '_') + '.xlsx';
}
async function exportarExcel() {
  const btn = document.getElementById('btnXls');
  btn.disabled = true;
  try {
    const kp = document.getElementById('kpis').dataset;
    let filas, cols;
    if (state.vista === 'alumnos') {
      filas = await traerTodo('bd_est_alumnos', {}, Number(kp.alumnos || 0));
      cols = [['N°', (r, i) => i + 1], ['Alumno', r => r.alumno], ['DNI', r => r.dni], ['Teléfono', r => r.telefono],
        ['Correo Certus', r => r.correo], ['Programa', r => r.programa], ['Periodo', r => r.ciclo], ['Sede', r => r.sede],
        ['Turno', r => r.turno], ['Cursos', r => Number(r.cursos)], ['Secciones (NRC)', r => r.secciones]];
    } else {
      filas = await traerTodo('bd_est_matriculas', { orden: 'alumno', dir: 'asc' }, Number(kp.matriculas || 0));
      cols = [['N°', (r, i) => i + 1], ['Alumno', r => r.alumno], ['DNI', r => r.dni], ['Teléfono', r => r.telefono],
        ['Correo Certus', r => r.correo], ['Programa', r => r.programa], ['Sección', r => r.seccion], ['NRC', r => r.nrc],
        ['Curso', r => r.curso], ['Módulo', r => r.modulo], ['Turno', r => r.turno], ['Días', r => r.dias],
        ['Hora inicio', r => r.hr_ini], ['Hora fin', r => r.hr_fin], ['Sede', r => r.sede], ['Modalidad', r => r.modalidad],
        ['Docente', r => r.docente], ['Coordinador', r => r.coordinador], ['Periodo', r => r.ciclo], ['Cód. programa', r => r.programa_cod]];
    }
    if (!filas.length) { setStatus(''); toast('No hay estudiantes que exportar'); return; }
    const det = filas.map((r, i) => { const o = {}; cols.forEach(([h, fn]) => { o[h] = fn(r, i); }); return o; });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(det, { header: cols.map(c => c[0]) });
    ws['!cols'] = cols.map(([h]) => ({ wch: ['Alumno', 'Docente', 'Correo Certus', 'Curso', 'Programa', 'Secciones (NRC)'].includes(h) ? 30 : Math.max(8, h.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, state.vista === 'alumnos' ? 'Estudiantes' : 'Matrículas');
    const wsInfo = XLSX.utils.aoa_to_sheet([
      ['Reporte de estudiantes'], ['Generado', new Date().toLocaleString('es-PE')],
      ['Filtros', resumenFiltros()], ['Filas', det.length]
    ]);
    wsInfo['!cols'] = [{ wch: 14 }, { wch: 90 }];
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Info');
    XLSX.writeFile(wb, nombreArchivo());
    setStatus('');
  } catch (e) {
    setStatus('<b>No se pudo generar el Excel.</b> ' + esc(e.message), 'err');
  } finally {
    btn.disabled = false;
  }
}

async function copiarDnis() {
  try {
    const total = Number(document.getElementById('kpis').dataset.alumnos || 0);
    const filas = await traerTodo('bd_est_alumnos', {}, total);
    setStatus('');
    copiar(filas.map(r => r.dni).join('\n'), filas.length, 'DNIs');
  } catch (e) {
    setStatus('<b>No se pudieron copiar los DNIs.</b> ' + esc(e.message), 'err');
  }
}

/* ---------- sincronización ---------- */
async function leerSync() {
  const res = await fetch(SB_URL + '/rest/v1/bd_estudiantes_sync?id=eq.1&select=ultima,filas,estado,detalle', {
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return (await res.json())[0] || {};
}
function pintarSync(s) {
  const el = document.getElementById('syncInfo');
  const fecha = s.ultima ? new Date(s.ultima).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca';
  el.innerHTML = 'Copia de la hoja <b>BBDD</b> · actualizada ' + esc(fecha) + (s.filas != null ? ' · ' + fmt(s.filas) + ' filas' : '');
}
async function sincronizar() {
  const btn = document.getElementById('btnSync');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-rotate fa-spin"></i> Sincronizando';
  try {
    const antes = (await leerSync()).ultima;
    await rpc('bd_est_sync_solicitar');
    setStatus('<i class="fas fa-spinner fa-spin"></i> Copiando la hoja BBDD a la base de datos (suele tardar menos de un minuto)...', 'info');
    const limite = Date.now() + 4 * 60 * 1000;
    while (Date.now() < limite) {
      await new Promise(r => setTimeout(r, 4000));
      const s = await leerSync();
      if (s.estado === 'error') throw new Error(s.detalle || 'error desconocido');
      if (s.estado === 'ok' && s.ultima !== antes) {
        pintarSync(s);
        toast('Base actualizada: ' + fmt(s.filas) + ' filas');
        setStatus('');
        consultar();
        return;
      }
      if (s.estado === 'ok' && s.ultima === antes && antes && Date.now() - new Date(antes).getTime() < 60000) {
        setStatus(''); toast('La base se actualizó hace menos de un minuto'); return;
      }
    }
    throw new Error('la sincronización está tardando más de lo normal; vuelve a intentarlo en unos minutos');
  } catch (e) {
    setStatus('<b>No se pudo sincronizar.</b> ' + esc(e.message), 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-rotate"></i> Sincronizar';
  }
}

/* ---------- arranque ---------- */
function limpiar() {
  CAMPOS.forEach(c => state[c].clear());
  state.q = '';
  document.getElementById('q').value = '';
  msList.forEach(ms => ms.refrescar());
  cambio();
}

document.addEventListener('DOMContentLoaded', async () => {
  const ms = (id, campo, placeholder) => crearMultiselect(document.getElementById(id), { placeholder, hint: 'Puedes elegir varios', campo });
  msList = [
    ms('msCiclo', 'ciclo', 'Elige uno o varios periodos...'),
    ms('msPrograma', 'programa', 'Escribe el programa...'),
    ms('msCurso', 'curso', 'Escribe el curso...'),
    ms('msSeccion', 'seccion', 'Escribe la sección, p. ej. 101M...'),
    ms('msDocente', 'docente', 'Escribe p. ej. MAMANI...'),
    ms('msCoord', 'coordinador', 'Escribe el coordinador...')
  ];

  document.getElementById('q').addEventListener('input', e => { state.q = e.target.value; cambio(); });
  document.getElementById('btnClear').onclick = limpiar;
  document.getElementById('btnXls').onclick = exportarExcel;
  document.getElementById('btnDni').onclick = copiarDnis;
  document.getElementById('btnMail').onclick = abrirCorreos;
  document.getElementById('btnSync').onclick = sincronizar;
  document.getElementById('pgPrev').onclick = () => { if (state.pagina > 0) { state.pagina--; cargarPagina(); } };
  document.getElementById('pgNext').onclick = () => { state.pagina++; cargarPagina(); };

  document.querySelectorAll('#vista .chip').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('#vista .chip').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); state.vista = b.dataset.v; state.pagina = 0;
      cargarPagina();
    };
  });

  const grupoChips = (id, clave, conv) => document.querySelectorAll('#' + id + ' .chip').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('#' + id + ' .chip').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); mc[clave] = conv ? conv(b.dataset.v) : b.dataset.v; pintarCorreos();
    };
  });
  grupoChips('mcSep', 'sep');
  grupoChips('mcTam', 'tam', v => parseInt(v, 10));
  grupoChips('mcGrupo', 'grupo');

  document.querySelectorAll('.modal-bg').forEach(md => {
    md.addEventListener('click', ev => { if (ev.target === md || ev.target.closest('[data-close]')) md.classList.remove('open'); });
  });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') document.querySelectorAll('.modal-bg.open').forEach(m => m.classList.remove('open')); });

  try {
    const s = await leerSync();
    pintarSync(s);
    if (!s.ultima) setStatus('La base de datos aún no tiene estudiantes. Pulsa <b>Sincronizar</b> para copiar la hoja BBDD.', 'info');
  } catch (e) { /* el error real se muestra al consultar */ }
  consultar();
});
