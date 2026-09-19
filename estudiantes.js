/* ===== Datos de estudiantes =====
   Fuente principal: hoja publicada (pub?output=csv) con una fila por estudiante.
   Teléfonos: telefonos.json (mapa DNI -> "tel1 / tel2"), armado de la base
   histórica; es parcial y solo aporta teléfono/nada más de esa base. */

const PUB_ID = '2PACX-1vQOcfT48JHQRSTdMuBn9xQ-ELOJuyYx4jr58xOYu3V0sLd_aaRIyDOd1wuyvAzkw6Sdgg9Xu8sWAzMe';
const GID_BBDD = '176624125';        // pestaña BBDD: todos los estudiantes y cursos
const GID_PROGRAMAS = '1903499557';  // catálogo CÓDIGO -> nombre de programa
const pubUrl = (gid) => 'https://docs.google.com/spreadsheets/d/e/' + PUB_ID +
  '/pub?gid=' + gid + '&single=true&output=csv&t=' + Date.now();
const CSV_URL = () => pubUrl(GID_BBDD);

/* Nombre de encabezado (normalizado) -> campo interno */
const HEADER_MAP = {
  'alumno': 'alumno', 'dni': 'dni', 'correo certus': 'correo',
  'ciclo lectivo': 'ciclo', 'programa': 'programaCod', 'seccion': 'seccion',
  'nrc': 'nrc', 'curso': 'curso', 'modulo': 'modulo', 'turno': 'turno',
  'dias': 'dias', 'hr ini': 'hi', 'hr fin': 'hf', 'sede': 'sede',
  'modalidad': 'modalidad', 'docente': 'docente', 'dni docente': 'dniDoc',
  'coordinador docente': 'coordinador'
};

const TURNO_LABEL = { M: 'Mañana', T: 'Tarde', N: 'Noche', D: 'Diurno' };

let DATA = [];
let TELS = {};            // DNI -> teléfono
let PROGRAMAS = {};       // código de programa -> nombre completo
let hayTelefono = false;

const state = {
  docentes: new Set(), cursos: new Set(), programa: new Set(),
  ciclo: new Set(), turno: new Set(), sede: new Set(),
  modalidad: new Set(), coord: new Set(),
  q: '', sortKey: 'alumno', sortDir: 1, abiertos: new Set(), groupBy: 'seccion'
};

/* ---------- utilidades ---------- */
const txt = v => (v == null ? '' : String(v)).trim();
const norm = s => txt(s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const esc = s => txt(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
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
    toast('Copiados ' + cuantos + ' ' + etiqueta);
    return true;
  } catch (e) {
    // respaldo para navegadores sin permiso de portapapeles
    const ta = document.createElement('textarea');
    ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
    toast(ok ? ('Copiados ' + cuantos + ' ' + etiqueta) : 'No se pudo copiar');
    return ok;
  }
}

/* ---------- carga ---------- */
async function cargarTelefonos() {
  try {
    const res = await fetch('telefonos.json?t=' + Date.now());
    if (!res.ok) return;
    TELS = await res.json();
    hayTelefono = Object.keys(TELS).length > 0;
    if (DATA.length) { DATA.forEach(r => { r.telefono = TELS[r.dni] || ''; }); render(); }
  } catch (e) { /* sin teléfonos el resto funciona igual */ }
}

async function cargarProgramas() {
  try {
    const res = await fetch(pubUrl(GID_PROGRAMAS));
    if (!res.ok) return;
    const rows = parseCSV(await res.text());
    rows.slice(1).forEach(r => { const cod = txt(r[0]); if (cod) PROGRAMAS[cod.toUpperCase()] = txt(r[1]) || cod; });
  } catch (e) { /* sin catálogo se muestra el código tal cual */ }
}

async function cargar() {
  setStatus('<i class="fas fa-spinner fa-spin"></i> Leyendo base de datos de estudiantes...', 'info');
  cargarTelefonos();
  try {
    await cargarProgramas();
    const res = await fetch(CSV_URL());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = parseCSV(await res.text());
    if (!rows.length) throw new Error('la hoja llegó vacía');

    const idx = {};
    rows[0].forEach((h, i) => {
      const key = HEADER_MAP[norm(h).toLowerCase()];
      if (key && idx[key] === undefined) idx[key] = i;
    });

    DATA = rows.slice(1).filter(r => r.some(c => txt(c))).map(r => {
      const g = k => txt(r[idx[k]]);
      const dni = g('dni');
      const progCod = g('programaCod');
      const o = {
        alumno: g('alumno').toUpperCase().replace(/\s+/g, ' '),
        dni, correo: g('correo'),
        telefono: TELS[dni] || '',
        ciclo: g('ciclo'), programaCod: progCod,
        programa: PROGRAMAS[progCod.toUpperCase()] || progCod,
        seccion: g('seccion').toUpperCase(), nrc: g('nrc'),
        curso: g('curso').toUpperCase().replace(/\s+/g, ' '),
        modulo: norm(g('modulo')), turno: norm(g('turno')),
        dias: g('dias'), hi: g('hi'), hf: g('hf'),
        sede: norm(g('sede')), modalidad: norm(g('modalidad')),
        docente: g('docente').toUpperCase().replace(/\s+/g, ' '),
        coordinador: g('coordinador').toUpperCase().replace(/\s+/g, ' ')
      };
      o.buscable = norm([o.alumno, o.dni, o.correo, o.nrc, o.seccion, o.docente, o.programa, o.curso].join(' '));
      return o;
    }).filter(o => o.alumno || o.dni);

    setStatus('');
    construirFiltros();
    render();
  } catch (e) {
    setStatus('<b>No se pudo leer la hoja de estudiantes.</b> ' + esc(e.message) +
      ' — revisa que siga publicada (Archivo › Compartir › Publicar en la web).', 'err');
    document.getElementById('tblBody').innerHTML = '<tr><td colspan="13"><div class="empty">Sin datos</div></td></tr>';
    document.getElementById('grpWrap').innerHTML = '<div class="empty">Sin datos</div>';
  }
}

/* ---------- multiselect con autocompletado ---------- */
function crearMultiselect(cont, { placeholder, hint, valores, sel, onChange }) {
  let opciones = [], activo = -1;
  cont.innerHTML = '<input type="text" placeholder="' + esc(placeholder) + '">' +
    '<button class="ms-clear" title="Quitar selección" style="display:none"><i class="fas fa-times"></i></button>' +
    '<div class="ms-list"></div>';
  const input = cont.querySelector('input');
  const lista = cont.querySelector('.ms-list');
  const btnClear = cont.querySelector('.ms-clear');

  function pintarTags() {
    cont.querySelectorAll('.ms-tag').forEach(t => t.remove());
    [...sel].forEach(v => {
      const tag = document.createElement('span');
      tag.className = 'ms-tag';
      tag.innerHTML = '<span>' + esc(v) + '</span><button title="Quitar"><i class="fas fa-times"></i></button>';
      tag.querySelector('button').onclick = ev => { ev.stopPropagation(); sel.delete(v); pintarTags(); onChange(); };
      cont.insertBefore(tag, input);
    });
    btnClear.style.display = sel.size ? '' : 'none';
    input.placeholder = sel.size ? '' : placeholder;
  }

  function calcular(qRaw) {
    const q = norm(qRaw);
    const base = valores();
    if (!q) return base.slice(0, 60);
    const empieza = [], contiene = [];
    base.forEach(o => { const p = o.norm.indexOf(q); if (p === 0) empieza.push(o); else if (p > 0) contiene.push(o); });
    return empieza.concat(contiene).slice(0, 60);
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
        '<span>' + marcar(o.label, input.value) + '</span><span class="n">' + o.n + '</span></div>').join('');
    lista.querySelectorAll('.ms-opt').forEach(el => { el.onmousedown = ev => { ev.preventDefault(); elegir(parseInt(el.dataset.i, 10)); }; });
    lista.classList.add('open');
  }
  function cerrar() { lista.classList.remove('open'); activo = -1; }
  function elegir(i) {
    const o = opciones[i]; if (!o) return;
    if (sel.has(o.label)) sel.delete(o.label); else sel.add(o.label);
    input.value = ''; pintarTags(); onChange(); abrir(); input.focus();
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
    else if (ev.key === 'Backspace' && !input.value && sel.size) { const u = [...sel].pop(); sel.delete(u); pintarTags(); onChange(); }
  });
  cont.addEventListener('click', ev => { if (ev.target === cont) input.focus(); });
  btnClear.onclick = () => { sel.clear(); pintarTags(); onChange(); };
  pintarTags();
  return { refrescar: pintarTags };
}

/* ---------- chips ---------- */
function chips(contId, valores, sel, etiqueta) {
  const cont = document.getElementById(contId);
  cont.innerHTML = valores.map(v =>
    '<button class="chip' + (sel.has(v.v) ? ' on' : '') + '" data-v="' + esc(v.v) + '">' +
    esc(etiqueta ? etiqueta(v.v) : v.v) + '<span class="n">' + v.n + '</span></button>').join('') ||
    '<span class="hint">sin datos</span>';
  cont.querySelectorAll('.chip').forEach(b => {
    b.onclick = () => { const v = b.dataset.v; if (sel.has(v)) sel.delete(v); else sel.add(v); construirFiltros(); render(); };
  });
}
function conteo(campo, filas) {
  const m = new Map();
  filas.forEach(r => { const v = r[campo]; if (v) m.set(v, (m.get(v) || 0) + 1); });
  return m;
}

function construirFiltros() {
  const base = DATA;
  const mCiclo = conteo('ciclo', base);
  chips('fCiclo', [...mCiclo.keys()].sort().map(v => ({ v, n: mCiclo.get(v) })), state.ciclo);
  const mTur = conteo('turno', base);
  chips('fTurno', ['M', 'T', 'N', 'D'].filter(t => mTur.has(t)).concat([...mTur.keys()].filter(t => !['M', 'T', 'N', 'D'].includes(t)))
    .map(v => ({ v, n: mTur.get(v) })), state.turno, v => TURNO_LABEL[v] || v);
  const mSede = conteo('sede', base);
  chips('fSede', [...mSede.keys()].sort((a, b) => mSede.get(b) - mSede.get(a)).map(v => ({ v, n: mSede.get(v) })), state.sede);
  const mMod = conteo('modalidad', base);
  chips('fModalidad', [...mMod.keys()].sort().map(v => ({ v, n: mMod.get(v) })), state.modalidad);
  const mCoord = conteo('coordinador', base);
  chips('fCoord', [...mCoord.keys()].sort((a, b) => mCoord.get(b) - mCoord.get(a)).map(v => ({ v, n: mCoord.get(v) })), state.coord);
}

/* ---------- filtrado ---------- */
function pasa(r, st) {
  if (st.docentes.size && !st.docentes.has(r.docente)) return false;
  if (st.cursos.size && !st.cursos.has(r.curso)) return false;
  if (st.programa.size && !st.programa.has(r.programa)) return false;
  if (st.ciclo.size && !st.ciclo.has(r.ciclo)) return false;
  if (st.turno.size && !st.turno.has(r.turno)) return false;
  if (st.sede.size && !st.sede.has(r.sede)) return false;
  if (st.modalidad.size && !st.modalidad.has(r.modalidad)) return false;
  if (st.coord.size && !st.coord.has(r.coordinador)) return false;
  if (st.q && r.buscable.indexOf(st.q) < 0) return false;
  return true;
}
function filtrar() { return DATA.filter(r => pasa(r, state)); }

function opcionesDe(campo, selActual) {
  const otros = { ...state, [selActual]: new Set() };
  const campoDato = { docentes: 'docente', cursos: 'curso', programa: 'programa' }[selActual];
  const m = new Map();
  DATA.filter(r => pasa(r, otros)).forEach(r => { if (r[campoDato]) m.set(r[campoDato], (m.get(r[campoDato]) || 0) + 1); });
  [...state[selActual]].forEach(v => { if (!m.has(v)) m.set(v, 0); });
  return [...m.keys()].sort().map(v => ({ label: v, norm: norm(v), n: m.get(v) }));
}

/* ---------- render ---------- */
function render() {
  const filas = filtrar();
  renderKpis(filas);
  renderGrupos(filas);
  renderTabla(filas);
  window.__FILAS = filas;
}

function renderKpis(filas) {
  const alum = new Set(filas.map(r => r.dni).filter(Boolean));
  const conTelU = new Set(filas.filter(r => r.telefono).map(r => r.dni));
  const conMailU = new Set(filas.filter(r => r.correo).map(r => r.dni));
  const cursos = new Set(filas.map(r => r.curso).filter(Boolean));
  const docs = new Set(filas.map(r => r.docente).filter(Boolean));
  const progs = new Set(filas.map(r => r.programa).filter(Boolean));
  const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '0%';
  const kpi = (lab, val, sub, cls) => '<div class="kpi ' + (cls || '') + '"><div class="k-lab">' + lab +
    '</div><div class="k-val">' + val + '</div><div class="k-sub">' + sub + '</div></div>';
  document.getElementById('kpis').innerHTML =
    kpi('Estudiantes', alum.size, filas.length.toLocaleString('es-PE') + ' matrículas', 'k-purple') +
    kpi('Con teléfono', conTelU.size, pct(conTelU.size, alum.size) + ' de alumnos', 'k-green') +
    kpi('Con correo', conMailU.size, pct(conMailU.size, alum.size) + ' de alumnos', 'k-blue') +
    kpi('Cursos', cursos.size, 'distintos', 'k-amber') +
    kpi('Docentes', docs.size, 'asignados', '') +
    kpi('Programas', progs.size, 'distintos', '');
}

const GRP_CAMPO = { seccion: r => (r.curso + ' · ' + r.seccion + ' (NRC ' + r.nrc + ')'), docente: r => r.docente || '(sin docente)', programa: r => r.programa || '(sin programa)', curso: r => r.curso || '(sin curso)' };

function renderGrupos(filas) {
  const cont = document.getElementById('grpWrap');
  if (state.groupBy === 'none') {
    cont.innerHTML = '<div class="empty">Agrupación desactivada — usa el detalle de abajo o los botones «Copiar».</div>';
    document.getElementById('grpCount').textContent = filas.length + ' estudiantes';
    return;
  }
  const clave = GRP_CAMPO[state.groupBy];
  const mapa = new Map();
  filas.forEach(r => { const k = clave(r); if (!mapa.has(k)) mapa.set(k, []); mapa.get(k).push(r); });
  const grupos = [...mapa.keys()].sort();
  document.getElementById('grpCount').textContent = grupos.length + ' bloque' + (grupos.length === 1 ? '' : 's') + ' · ' + filas.length + ' estudiantes';
  if (!grupos.length) { cont.innerHTML = '<div class="empty">Ningún estudiante coincide con los filtros</div>'; return; }

  cont.innerHTML = grupos.map(k => {
    const rs = mapa.get(k).slice().sort((a, b) => a.alumno.localeCompare(b.alumno));
    const abierto = state.abiertos.has(k);
    const conTel = rs.filter(r => r.telefono).length;
    return '<div class="grp' + (abierto ? ' open' : '') + '" data-k="' + esc(k) + '">' +
      '<div class="grp-h"><i class="fas fa-chevron-' + (abierto ? 'down' : 'right') + ' cx"></i>' +
      '<span class="nm">' + esc(k) + '</span>' +
      '<span class="meta">' +
        '<span class="pill pill-t">' + rs.length + ' est.</span>' +
        '<span class="pill pill-s">' + conTel + ' con tel.</span>' +
      '</span>' +
      '<span class="copybtns">' +
        '<button class="cbtn" data-copy="dni"><i class="fas fa-copy"></i> DNIs</button>' +
        '<button class="cbtn" data-copy="mail"><i class="fas fa-envelope"></i> Correos</button>' +
      '</span></div>' +
      '<div class="grp-b"><table class="grp-tbl"><thead><tr>' +
        '<th>Alumno</th><th>DNI</th><th>Teléfono</th><th>Correo Certus</th>' +
        '<th>Programa</th><th>Turno</th><th>Sede</th><th>Modalidad</th>' +
      '</tr></thead><tbody>' +
      rs.map(r => '<tr><td class="doc">' + esc(r.alumno) + '</td><td>' + esc(r.dni) + '</td>' +
        '<td class="tel">' + (r.telefono ? esc(r.telefono) : '<span class="no-dato">—</span>') + '</td>' +
        '<td class="mail">' + (r.correo ? esc(r.correo) : '<span class="no-dato">—</span>') + '</td>' +
        '<td>' + esc(r.programa) + '</td><td>' + esc(TURNO_LABEL[r.turno] || r.turno) + '</td>' +
        '<td>' + esc(r.sede) + '</td><td>' + esc(r.modalidad) + '</td></tr>').join('') +
      '</tbody></table></div></div>';
  }).join('');

  cont.querySelectorAll('.grp-h').forEach(h => {
    const grp = h.parentNode, k = grp.dataset.k, rs = mapa.get(k);
    h.querySelector('.cx').onclick = h.onclick = (ev) => {
      if (ev.target.closest('.cbtn')) return;
      const ab = grp.classList.toggle('open');
      h.querySelector('.cx').className = 'fas fa-chevron-' + (ab ? 'down' : 'right') + ' cx';
      if (ab) state.abiertos.add(k); else state.abiertos.delete(k);
    };
    h.querySelectorAll('.cbtn').forEach(btn => {
      btn.onclick = async (ev) => {
        ev.stopPropagation();
        if (btn.dataset.copy === 'dni') {
          const lista = [...new Set(rs.map(r => r.dni).filter(Boolean))];
          if (await copiar(lista.join('\n'), lista.length, 'DNIs')) marcarOk(btn);
        } else {
          const lista = [...new Set(rs.map(r => r.correo).filter(Boolean))];
          if (await copiar(lista.join('\n'), lista.length, 'correos')) marcarOk(btn);
        }
      };
    });
  });
}
function marcarOk(btn) {
  btn.classList.add('ok');
  const html = btn.innerHTML; btn.innerHTML = '<i class="fas fa-check"></i> Copiado';
  setTimeout(() => { btn.classList.remove('ok'); btn.innerHTML = html; }, 1400);
}

function renderTabla(filas) {
  const k = state.sortKey, dir = state.sortDir;
  const ord = filas.slice().sort((a, b) => txt(a[k]).localeCompare(txt(b[k]), 'es', { numeric: true }) * dir);
  const body = document.getElementById('tblBody');
  if (!ord.length) {
    body.innerHTML = '<tr><td colspan="13"><div class="empty">Ningún estudiante coincide con los filtros</div></td></tr>';
  } else {
    body.innerHTML = ord.map(r =>
      '<tr><td class="name">' + esc(r.alumno) + '</td><td>' + esc(r.dni) + '</td>' +
      '<td class="tel">' + (r.telefono ? esc(r.telefono) : '<span class="no-dato">—</span>') + '</td>' +
      '<td class="mail">' + (r.correo ? esc(r.correo) : '<span class="no-dato">—</span>') + '</td>' +
      '<td>' + esc(r.programa) + '</td><td>' + esc(r.seccion) + '</td><td>' + esc(r.nrc) + '</td>' +
      '<td class="name">' + esc(r.curso) + '</td>' +
      '<td>' + esc(TURNO_LABEL[r.turno] || r.turno) + '</td>' +
      '<td><span class="pill pill-s">' + esc(r.sede) + '</span></td><td>' + esc(r.modalidad) + '</td>' +
      '<td class="name">' + esc(r.docente) + '</td>' +
      '<td>' + esc(r.ciclo) + '</td></tr>').join('');
  }
  document.getElementById('tblCount').textContent = ord.length + ' de ' + DATA.length + ' estudiantes' +
    (hayTelefono ? '' : ' · (teléfonos aún no cargados)');
}

/* ---------- exportaciones ---------- */
const COLS = [
  ['N°', (r, i) => i + 1], ['Alumno', r => r.alumno], ['DNI', r => r.dni],
  ['Teléfono', r => r.telefono], ['Correo Certus', r => r.correo],
  ['Programa', r => r.programa], ['Sección', r => r.seccion], ['NRC', r => r.nrc],
  ['Curso', r => r.curso], ['Módulo', r => r.modulo], ['Turno', r => r.turno],
  ['Sede', r => r.sede], ['Modalidad', r => r.modalidad], ['Docente', r => r.docente],
  ['Coordinador', r => r.coordinador], ['Ciclo lectivo', r => r.ciclo], ['Cód. programa', r => r.programaCod]
];
function filasReporte() {
  const ord = (window.__FILAS || []).slice().sort((a, b) => a.alumno.localeCompare(b.alumno, 'es'));
  return ord.map((r, i) => { const o = {}; COLS.forEach(([h, f]) => { o[h] = f(r, i); }); return o; });
}
function resumenFiltros() {
  const p = [];
  const add = (lab, set) => { if (set.size) p.push(lab + ': ' + [...set].join(', ')); };
  add('Docentes', state.docentes); add('Cursos', state.cursos); add('Programa', state.programa);
  add('Ciclo lectivo', state.ciclo);
  if (state.turno.size) p.push('Turno: ' + [...state.turno].map(t => TURNO_LABEL[t] || t).join(', '));
  add('Sede', state.sede); add('Modalidad', state.modalidad); add('Coordinador', state.coord);
  if (state.q) p.push('Búsqueda: ' + state.q);
  return p.length ? p.join('  |  ') : 'Sin filtros (todos los estudiantes)';
}
function nombreArchivo(ext) {
  const partes = ['estudiantes'];
  if (state.docentes.size === 1) partes.push([...state.docentes][0].split(' ')[0]);
  if (state.programa.size === 1) partes.push([...state.programa][0].slice(0, 16).replace(/[^A-Za-z0-9]+/g, '_'));
  const d = new Date();
  partes.push('' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'));
  return partes.join('_') + '.' + ext;
}
function exportarExcel() {
  const det = filasReporte();
  if (!det.length) { toast('No hay estudiantes que exportar'); return; }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(det, { header: COLS.map(c => c[0]) });
  ws['!cols'] = COLS.map(c => ({ wch: c[0] === 'Alumno' || c[0] === 'Docente' || c[0] === 'Correo Certus' ? 30 : Math.max(8, c[0].length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Estudiantes');
  const wsInfo = XLSX.utils.aoa_to_sheet([
    ['Reporte de estudiantes'], ['Generado', new Date().toLocaleString('es-PE')],
    ['Filtros', resumenFiltros()], ['Filas', det.length]
  ]);
  wsInfo['!cols'] = [{ wch: 14 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Info');
  XLSX.writeFile(wb, nombreArchivo('xlsx'));
}
function exportarPdf() {
  const det = filasReporte();
  if (!det.length) { toast('No hay estudiantes que exportar'); return; }
  if (det.length > 800 && !confirm('Vas a generar un PDF con ' + det.length + ' filas (unas ' +
      Math.ceil(det.length / 28) + ' páginas).\n\n¿Continuar? Puedes filtrar antes.')) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  doc.setFillColor(113, 75, 103); doc.rect(0, 0, ancho, 44, 'F');
  doc.setTextColor(255); doc.setFontSize(13); doc.text('Reporte de estudiantes', 32, 22);
  doc.setFontSize(8); doc.text(new Date().toLocaleString('es-PE'), 32, 35);
  doc.setTextColor(60); doc.setFontSize(8);
  const lineas = doc.splitTextToSize(resumenFiltros(), ancho - 64);
  doc.text(lineas, 32, 58);
  const cols = ['Alumno', 'DNI', 'Teléfono', 'Correo Certus', 'Programa', 'Sección', 'NRC', 'Turno', 'Sede', 'Docente'];
  const fns = { Alumno: r => r.alumno, DNI: r => r.dni, 'Teléfono': r => r.telefono, 'Correo Certus': r => r.correo, Programa: r => r.programa, 'Sección': r => r.seccion, NRC: r => r.nrc, Turno: r => r.turno, Sede: r => r.sede, Docente: r => r.docente };
  doc.autoTable({
    startY: 58 + lineas.length * 10 + 6,
    head: [cols],
    body: (window.__FILAS || []).slice().sort((a, b) => a.alumno.localeCompare(b.alumno, 'es')).map(r => cols.map(c => String(fns[c](r) ?? ''))),
    styles: { fontSize: 6.5, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [113, 75, 103], textColor: 255, fontSize: 6.5 },
    alternateRowStyles: { fillColor: [246, 244, 246] },
    columnStyles: { 0: { cellWidth: 120 }, 3: { cellWidth: 130 }, 9: { cellWidth: 110 } },
    margin: { left: 20, right: 20 },
    didDrawPage: () => { doc.setFontSize(7); doc.setTextColor(120); doc.text('Página ' + doc.internal.getNumberOfPages(), ancho - 60, doc.internal.pageSize.getHeight() - 12); }
  });
  doc.save(nombreArchivo('pdf'));
}

/* ---------- arranque ---------- */
let msDocente, msCurso, msPrograma;
function limpiar() {
  ['docentes', 'cursos', 'programa', 'ciclo', 'turno', 'sede', 'modalidad', 'coord'].forEach(k => state[k].clear());
  state.q = ''; state.abiertos.clear();
  document.getElementById('q').value = '';
  msDocente.refrescar(); msCurso.refrescar(); msPrograma.refrescar();
  construirFiltros(); render();
}

document.addEventListener('DOMContentLoaded', () => {
  const alCambiar = () => { construirFiltros(); render(); };
  msDocente = crearMultiselect(document.getElementById('msDocente'), {
    placeholder: 'Escribe p. ej. MAMANI y elige uno o varios docentes...', hint: 'Puedes elegir varios docentes',
    valores: () => opcionesDe('docente', 'docentes'), sel: state.docentes, onChange: alCambiar
  });
  msCurso = crearMultiselect(document.getElementById('msCurso'), {
    placeholder: 'Escribe el curso...', hint: 'Puedes elegir varios cursos',
    valores: () => opcionesDe('curso', 'cursos'), sel: state.cursos, onChange: alCambiar
  });
  msPrograma = crearMultiselect(document.getElementById('msPrograma'), {
    placeholder: 'Escribe el programa...', hint: 'Puedes elegir varios programas',
    valores: () => opcionesDe('programa', 'programa'), sel: state.programa, onChange: alCambiar
  });

  document.getElementById('q').addEventListener('input', e => { state.q = norm(e.target.value); render(); });
  document.getElementById('btnClear').onclick = limpiar;
  document.getElementById('btnReload').onclick = cargar;
  document.getElementById('btnXls').onclick = exportarExcel;
  document.getElementById('btnPdf').onclick = exportarPdf;
  document.getElementById('btnDni').onclick = () => {
    const l = [...new Set((window.__FILAS || []).map(r => r.dni).filter(Boolean))];
    copiar(l.join('\n'), l.length, 'DNIs');
  };
  document.getElementById('btnMail').onclick = () => {
    const l = [...new Set((window.__FILAS || []).map(r => r.correo).filter(Boolean))];
    copiar(l.join('\n'), l.length, 'correos');
  };

  document.querySelectorAll('#grpBy .chip').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('#grpBy .chip').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); state.groupBy = b.dataset.v; state.abiertos.clear();
      renderGrupos(filtrar());
    };
  });

  document.querySelectorAll('#tbl thead th[data-k]').forEach(th => {
    th.onclick = () => {
      const k = th.dataset.k;
      state.sortDir = state.sortKey === k ? -state.sortDir : 1; state.sortKey = k;
      renderTabla(filtrar());
    };
  });

  cargar();
});
