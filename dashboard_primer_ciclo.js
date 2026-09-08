/* ===== Tablero de cursos y docentes =====
   Fuente: Google Sheet "Analisis de cargas asignadas" (una fila por carga asignada).
   Es la misma hoja que alimenta horario.js, por eso se lee el mismo gid. */

const SHEET_ID = '1kNqEDwXe5Iqj9m54E--_WEe2wKxjTschDLgYnXeBS7w';
const SHEET_GID = '1470879596';
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit#gid=' + SHEET_GID;
const CSV_URL = () => 'https://docs.google.com/spreadsheets/d/' + SHEET_ID +
  '/export?format=csv&gid=' + SHEET_GID + '&t=' + Date.now();

/* Indices de respaldo por si cambian los encabezados de la hoja. */
const COL_FALLBACK = { carga:0, dni:1, docente:2, curso:4, seccion:5, modulo:6, nrc:7,
  horas:8, periodo:11, turno:12, sede:13, ciclo:14, modalidad:15, dias:16, horasTxt:17,
  tipo:19 };

/* Cada encabezado de la hoja y su nombre interno. La hoja repite "Sede"/"SEDE",
   por eso se toma la primera aparicion de cada nombre. */
const HEADER_MAP = {
  'carga':'carga', 'dni':'dni', 'nombres y apellidos':'docente', 'curso':'curso',
  'seccion':'seccion', 'modulo':'modulo', 'nrc':'nrc', 'horas':'horas',
  'periodo':'periodo', 'turno':'turno', 'sede':'sede', 'ciclo':'ciclo',
  'modalidad':'modalidad', 'horario (dias)':'dias', 'horario (horas)':'horasTxt',
  'tipo':'tipo'
};

const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO',
               'SETIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const MES_ALIAS = { JUN:'JUNIO', AGO:'AGOSTO', SET:'SETIEMBRE', SEP:'SETIEMBRE',
                    SEPTIEMBRE:'SETIEMBRE', OCT:'OCTUBRE', NOV:'NOVIEMBRE', DIC:'DICIEMBRE',
                    ENE:'ENERO', FEB:'FEBRERO', MAR:'MARZO', ABR:'ABRIL', MAY:'MAYO', JUL:'JULIO' };
const CICLO_ORDEN = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];
const TURNO_LABEL = { M:'Mañana', T:'Tarde', N:'Noche', D:'Diurno' };
const SIN_TIPO = 'OTROS';   /* filas sin COT ni PLN en la columna TIPO */

let DATA = [];
/* aulas.json: { "<NRC>": { "LUNES": "A302A", ... } }
   Se arma con el portal de horarios (horarioacademico.certus.edu.pe), que da el
   aula por NRC y por dia; la hoja de cargas no la trae. */
let AULAS = {};
const state = {
  cursos: new Set(), docentes: new Set(), ciclo: new Set(), periodo: new Set(),
  turno: new Set(), sede: new Set(), modalidad: new Set(), tipo: new Set(),
  q: '', sortKey: 'curso', sortDir: 1, abiertos: new Set()
};

/* ---------- utilidades ---------- */
const txt = v => (v == null ? '' : String(v)).trim();
const norm = s => txt(s).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const esc = s => txt(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));

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

/* Periodo real = mes + modulo. "REGULAR" vale para ambos modulos. */
function mesNormalizado(p) {
  const s = norm(p);
  return MES_ALIAS[s] || (MESES.includes(s) ? s : s);
}
function periodosDeFila(r) {
  if (!r.mes) return [];
  if (r.modulo === 'REGULAR') return [r.mes + ' 1', r.mes + ' 2'];
  if (!r.modulo) return [];
  return [r.mes + ' ' + r.modulo];
}
function ordenPeriodo(p) {
  const [mes, mod] = p.split(' ');
  return MESES.indexOf(mes) * 10 + (parseInt(mod, 10) || 0);
}

/* ---------- carga ---------- */
async function cargar() {
  setStatus('<i class="fas fa-spinner fa-spin"></i> Leyendo “Análisis de cargas asignadas”...', 'info');
  cargarAulas();
  try {
    const res = await fetch(CSV_URL());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = parseCSV(await res.text());
    if (!rows.length) throw new Error('la hoja llegó vacía');

    const idx = {};
    rows[0].forEach((h, i) => {
      const key = HEADER_MAP[norm(h).toLowerCase()];
      if (key && idx[key] === undefined) idx[key] = i;
    });
    Object.keys(COL_FALLBACK).forEach(k => { if (idx[k] === undefined) idx[k] = COL_FALLBACK[k]; });

    DATA = rows.slice(1).map(r => {
      const g = k => txt(r[idx[k]]);
      const docente = g('docente').toUpperCase().replace(/\s+/g, ' ');
      const curso = g('curso').toUpperCase().replace(/\s+/g, ' ');
      if (!docente && !curso) return null;
      const mes = mesNormalizado(g('periodo'));
      const modulo = norm(g('modulo'));
      const o = {
        carga: g('carga'), dni: g('dni'), docente, curso,
        seccion: g('seccion').toUpperCase(), nrc: g('nrc'),
        horas: parseFloat(g('horas').replace(',', '.')) || 0,
        mes, modulo, periodo: mes && modulo ? (mes + ' ' + modulo) : mes,
        turno: norm(g('turno')), sede: norm(g('sede')), tipo: norm(g('tipo')) || SIN_TIPO,
        ciclo: norm(g('ciclo')), modalidad: norm(g('modalidad')),
        dias: g('dias'), horasTxt: g('horasTxt')
      };
      o.periodos = periodosDeFila(o);
      o.aula = aulaDeFila(o);
      o.buscable = norm([o.docente, o.curso, o.seccion, o.nrc, o.dni, o.sede, o.ciclo, o.tipo, o.aula].join(' '));
      return o;
    }).filter(Boolean);

    setStatus('');
    construirFiltros();
    render();
  } catch (e) {
    setStatus('<b>No se pudo leer la hoja.</b> ' + esc(e.message) +
      ' — revisa que “Análisis de cargas asignadas” siga compartida como <i>cualquiera con el enlace</i>.', 'err');
    document.getElementById('tblBody').innerHTML =
      '<tr><td colspan="14"><div class="empty">Sin datos</div></td></tr>';
    document.getElementById('grpWrap').innerHTML = '<div class="empty">Sin datos</div>';
  }
}

/* El tablero funciona igual si el archivo no está: la columna Aula queda vacía. */
async function cargarAulas() {
  try {
    const res = await fetch('aulas.json?t=' + Date.now());
    if (!res.ok) return;
    AULAS = await res.json();
    if (DATA.length) { DATA.forEach(r => { r.aula = aulaDeFila(r); }); render(); }
  } catch (e) { /* sin aulas.json el resto del tablero sigue funcionando */ }
}

/* El aula cambia por dia: (LUNES)(SABADO) -> "A302A/L401A", igual que el reporte. */
function aulaDeFila(r) {
  const dias = (r.dias.match(/\(([^)]*)\)/g) || []).map(x => norm(x.slice(1, -1)));
  const mapa = AULAS[r.nrc];
  if (!mapa) return r.modalidad === 'VIRTUAL' ? 'Virtual' : '';
  if (!dias.length) return [...new Set(Object.values(mapa))].join('/');
  const partes = dias.map(d => mapa[d] || '—');
  /* un curso virtual no necesita una "Virtual" por dia */
  if (partes.every(a => a === 'Virtual')) return 'Virtual';
  return partes.join('/');
}

/* ---------- multiselect con autocompletado ---------- */
function crearMultiselect(cont, { placeholder, hint, valores, sel, onChange }) {
  let opciones = [];
  let activo = -1;

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
      tag.querySelector('button').onclick = ev => {
        ev.stopPropagation(); sel.delete(v); pintarTags(); onChange();
      };
      cont.insertBefore(tag, input);
    });
    btnClear.style.display = sel.size ? '' : 'none';
    input.placeholder = sel.size ? '' : placeholder;
  }

  /* Busqueda tolerante: sin tildes, primero los que empiezan por lo escrito. */
  function calcular(qRaw) {
    const q = norm(qRaw);
    const base = valores();
    if (!q) return base.slice(0, 60);
    const empieza = [], contiene = [];
    base.forEach(o => {
      const p = o.norm.indexOf(q);
      if (p === 0) empieza.push(o); else if (p > 0) contiene.push(o);
    });
    return empieza.concat(contiene).slice(0, 60);
  }

  function marcar(label, q) {
    if (!q) return esc(label);
    const p = norm(label).indexOf(norm(q));
    if (p < 0) return esc(label);
    return esc(label.slice(0, p)) + '<span class="mk">' + esc(label.slice(p, p + q.length)) +
           '</span>' + esc(label.slice(p + q.length));
  }

  function abrir() {
    opciones = calcular(input.value);
    activo = opciones.length ? 0 : -1;
    if (!opciones.length) {
      lista.innerHTML = '<div class="ms-none">Sin coincidencias</div>';
    } else {
      lista.innerHTML = (hint ? '<div class="ms-hint">' + esc(hint) + '</div>' : '') +
        opciones.map((o, i) =>
          '<div class="ms-opt' + (i === activo ? ' active' : '') + (sel.has(o.label) ? ' sel' : '') +
          '" data-i="' + i + '">' +
          '<i class="fas ' + (sel.has(o.label) ? 'fa-square-check' : 'fa-square') + '"></i>' +
          '<span>' + marcar(o.label, input.value) + '</span>' +
          '<span class="n">' + o.n + '</span></div>').join('');
      lista.querySelectorAll('.ms-opt').forEach(el => {
        el.onmousedown = ev => { ev.preventDefault(); elegir(parseInt(el.dataset.i, 10)); };
      });
    }
    lista.classList.add('open');
  }
  function cerrar() { lista.classList.remove('open'); activo = -1; }

  function elegir(i) {
    const o = opciones[i];
    if (!o) return;
    if (sel.has(o.label)) sel.delete(o.label); else sel.add(o.label);
    input.value = '';
    pintarTags(); onChange(); abrir(); input.focus();
  }

  input.addEventListener('focus', () => { cont.classList.add('focus'); abrir(); });
  input.addEventListener('blur', () => { cont.classList.remove('focus'); setTimeout(cerrar, 120); });
  input.addEventListener('input', abrir);
  input.addEventListener('keydown', ev => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (!opciones.length) return;
      activo = (activo + (ev.key === 'ArrowDown' ? 1 : -1) + opciones.length) % opciones.length;
      const els = lista.querySelectorAll('.ms-opt');
      els.forEach((el, i) => el.classList.toggle('active', i === activo));
      if (els[activo]) els[activo].scrollIntoView({ block: 'nearest' });
    } else if (ev.key === 'Enter') {
      ev.preventDefault(); elegir(activo);
    } else if (ev.key === 'Escape') {
      cerrar(); input.blur();
    } else if (ev.key === 'Backspace' && !input.value && sel.size) {
      const ultimo = [...sel].pop(); sel.delete(ultimo); pintarTags(); onChange();
    }
  });
  cont.addEventListener('click', ev => { if (ev.target === cont) input.focus(); });
  btnClear.onclick = () => { sel.clear(); pintarTags(); onChange(); };

  pintarTags();
  return { refrescar: pintarTags };
}

/* ---------- filtros de chips ---------- */
function chips(contId, valores, sel, etiqueta) {
  const cont = document.getElementById(contId);
  cont.innerHTML = valores.map(v =>
    '<button class="chip' + (sel.has(v.v) ? ' on' : '') + '" data-v="' + esc(v.v) + '">' +
    esc(etiqueta ? etiqueta(v.v) : v.v) + '<span class="n">' + v.n + '</span></button>').join('') ||
    '<span class="hint">sin datos</span>';
  cont.querySelectorAll('.chip').forEach(b => {
    b.onclick = () => {
      const v = b.dataset.v;
      if (sel.has(v)) sel.delete(v); else sel.add(v);
      construirFiltros(); render();
    };
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
  const ciclos = [...mCiclo.keys()].sort((a, b) => {
    const ia = CICLO_ORDEN.indexOf(a), ib = CICLO_ORDEN.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  }).map(v => ({ v, n: mCiclo.get(v) }));
  chips('fCiclo', ciclos, state.ciclo);

  const mPer = new Map();
  base.forEach(r => r.periodos.forEach(p => mPer.set(p, (mPer.get(p) || 0) + 1)));
  const periodos = [...mPer.keys()].sort((a, b) => ordenPeriodo(a) - ordenPeriodo(b))
    .map(v => ({ v, n: mPer.get(v) }));
  chips('fPeriodo', periodos, state.periodo);

  const mTur = conteo('turno', base);
  const turnos = ['M', 'T', 'N', 'D'].filter(t => mTur.has(t))
    .concat([...mTur.keys()].filter(t => !['M', 'T', 'N', 'D'].includes(t)))
    .map(v => ({ v, n: mTur.get(v) }));
  chips('fTurno', turnos, state.turno, v => TURNO_LABEL[v] || v);

  const mSede = conteo('sede', base);
  const sedes = [...mSede.keys()].sort((a, b) => mSede.get(b) - mSede.get(a))
    .map(v => ({ v, n: mSede.get(v) }));
  chips('fSede', sedes, state.sede);

  const mMod = conteo('modalidad', base);
  const mods = [...mMod.keys()].sort().map(v => ({ v, n: mMod.get(v) }));
  chips('fModalidad', mods, state.modalidad);

  const mTipo = conteo('tipo', base);
  const tipos = ['COT', 'PLN'].filter(t => mTipo.has(t))
    .concat([...mTipo.keys()].filter(t => t !== 'COT' && t !== 'PLN').sort())
    .map(v => ({ v, n: mTipo.get(v) }));
  chips('fTipo', tipos, state.tipo);
}

/* ---------- filtrado ---------- */
function filtrar() {
  return DATA.filter(r => {
    if (state.cursos.size && !state.cursos.has(r.curso)) return false;
    if (state.docentes.size && !state.docentes.has(r.docente)) return false;
    if (state.ciclo.size && !state.ciclo.has(r.ciclo)) return false;
    if (state.periodo.size && !r.periodos.some(p => state.periodo.has(p))) return false;
    if (state.turno.size && !state.turno.has(r.turno)) return false;
    if (state.sede.size && !state.sede.has(r.sede)) return false;
    if (state.modalidad.size && !state.modalidad.has(r.modalidad)) return false;
    if (state.tipo.size && !state.tipo.has(r.tipo)) return false;
    if (state.q && r.buscable.indexOf(state.q) < 0) return false;
    return true;
  });
}

/* Los desplegables muestran solo lo compatible con el resto de filtros,
   igual que el selector de docentes del horario. */
function opcionesCurso() {
  const otros = { ...state, cursos: new Set() };
  const m = new Map();
  DATA.filter(r => pasa(r, otros)).forEach(r => m.set(r.curso, (m.get(r.curso) || 0) + 1));
  [...state.cursos].forEach(c => { if (!m.has(c)) m.set(c, 0); });
  return [...m.keys()].sort().map(v => ({ label: v, norm: norm(v), n: m.get(v) }));
}
function opcionesDocente() {
  const otros = { ...state, docentes: new Set() };
  const m = new Map();
  DATA.filter(r => pasa(r, otros)).forEach(r => m.set(r.docente, (m.get(r.docente) || 0) + 1));
  [...state.docentes].forEach(d => { if (!m.has(d)) m.set(d, 0); });
  return [...m.keys()].sort().map(v => ({ label: v, norm: norm(v), n: m.get(v) }));
}
function pasa(r, st) {
  if (st.cursos.size && !st.cursos.has(r.curso)) return false;
  if (st.docentes.size && !st.docentes.has(r.docente)) return false;
  if (st.ciclo.size && !st.ciclo.has(r.ciclo)) return false;
  if (st.periodo.size && !r.periodos.some(p => st.periodo.has(p))) return false;
  if (st.turno.size && !st.turno.has(r.turno)) return false;
  if (st.sede.size && !st.sede.has(r.sede)) return false;
  if (st.modalidad.size && !st.modalidad.has(r.modalidad)) return false;
  if (st.tipo.size && !st.tipo.has(r.tipo)) return false;
  if (st.q && r.buscable.indexOf(st.q) < 0) return false;
  return true;
}

/* ---------- render ---------- */
function render() {
  const filas = filtrar();
  const sub = document.getElementById('hSub');
  if (sub) {
    const cs = [...state.ciclo];
    sub.textContent = !cs.length ? '— todos los ciclos'
      : cs.length === 1 && cs[0] === 'I' ? '— Primer ciclo'
      : '— Ciclo' + (cs.length > 1 ? 's' : '') + ' ' + cs.join(', ');
  }
  renderKpis(filas);
  renderCharts(filas);
  renderGrupos(filas);
  renderTabla(filas);
}

function renderKpis(filas) {
  const cursos = new Set(filas.map(r => r.curso).filter(Boolean));
  const docentes = new Set(filas.map(r => r.docente).filter(Boolean));
  const nrcs = new Set(filas.map(r => r.nrc).filter(Boolean));
  const sedes = new Set(filas.map(r => r.sede).filter(Boolean));
  const horas = filas.reduce((a, r) => a + r.horas, 0);
  const kpi = (lab, val, sub, cls) =>
    '<div class="kpi ' + (cls || '') + '"><div class="k-lab">' + lab + '</div>' +
    '<div class="k-val">' + val + '</div><div class="k-sub">' + sub + '</div></div>';
  document.getElementById('kpis').innerHTML =
    kpi('Cursos', cursos.size, 'distintos', 'k-purple') +
    kpi('Secciones', filas.length, nrcs.size + ' NRC', 'k-blue') +
    kpi('Docentes', docentes.size, 'asignados', 'k-green') +
    kpi('Horas', horas.toLocaleString('es-PE'), 'semanales', 'k-amber') +
    kpi('Sedes', sedes.size, [...sedes].sort().join(' · ') || '—', '') +
    kpi('Docentes/curso', cursos.size ? (docentes.size / cursos.size).toFixed(1) : '0', 'promedio', '');
}

function barras(contId, mapa, sel, etiqueta, limite) {
  const cont = document.getElementById(contId);
  let items = [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  if (limite) items = items.slice(0, limite);
  if (!items.length) { cont.innerHTML = '<div class="empty">Sin datos</div>'; return; }
  const max = items[0][1] || 1;
  cont.innerHTML = items.map(([v, n]) =>
    '<div class="bar-row' + (sel.size && !sel.has(v) ? ' off' : '') + '" data-v="' + esc(v) + '">' +
    '<div class="bar-lab"><span>' + esc(etiqueta ? etiqueta(v) : v) + '</span><span class="v">' + n + '</span></div>' +
    '<div class="bar-track"><div class="bar-fill" style="width:' + (n / max * 100) + '%;background:#2a78d6"></div></div>' +
    '</div>').join('');
  cont.querySelectorAll('.bar-row').forEach(el => {
    el.onclick = () => {
      const v = el.dataset.v;
      if (sel.has(v)) sel.delete(v); else sel.add(v);
      construirFiltros(); msCurso.refrescar(); msDocente.refrescar(); render();
    };
  });
}

function renderCharts(filas) {
  const porCiclo = new Map();
  CICLO_ORDEN.forEach(c => { const n = filas.filter(r => r.ciclo === c).length; if (n) porCiclo.set(c, n); });
  filas.forEach(r => { if (r.ciclo && !CICLO_ORDEN.includes(r.ciclo)) porCiclo.set(r.ciclo, (porCiclo.get(r.ciclo) || 0) + 1); });
  barras('chCiclo', porCiclo, state.ciclo);
  barras('chSede', conteo('sede', filas), state.sede);
  barras('chTurno', conteo('turno', filas), state.turno, v => TURNO_LABEL[v] || v);
  barras('chCurso', conteo('curso', filas), state.cursos, null, 8);
}

function renderGrupos(filas) {
  const cont = document.getElementById('grpWrap');
  const mapa = new Map();
  filas.forEach(r => {
    if (!mapa.has(r.curso)) mapa.set(r.curso, []);
    mapa.get(r.curso).push(r);
  });
  const cursos = [...mapa.keys()].sort();
  document.getElementById('grpCount').textContent =
    cursos.length + ' curso' + (cursos.length === 1 ? '' : 's') + ' · ' + filas.length + ' secciones';

  if (!cursos.length) { cont.innerHTML = '<div class="empty">Ningún curso coincide con los filtros</div>'; return; }

  cont.innerHTML = cursos.map(curso => {
    const rs = mapa.get(curso).slice().sort((a, b) =>
      a.docente.localeCompare(b.docente) || a.seccion.localeCompare(b.seccion));
    const docs = new Set(rs.map(r => r.docente));
    const ciclos = [...new Set(rs.map(r => r.ciclo).filter(Boolean))].sort(
      (a, b) => CICLO_ORDEN.indexOf(a) - CICLO_ORDEN.indexOf(b));
    const horas = rs.reduce((a, r) => a + r.horas, 0);
    const abierto = state.abiertos.has(curso);
    return '<div class="grp' + (abierto ? ' open' : '') + '" data-c="' + esc(curso) + '">' +
      '<div class="grp-h"><i class="fas fa-chevron-' + (abierto ? 'down' : 'right') + ' cx"></i>' +
      '<span class="nm">' + esc(curso) + '</span>' +
      '<span class="meta">' +
        '<span class="pill pill-c">Ciclo ' + esc(ciclos.join('/') || '—') + '</span>' +
        '<span class="pill pill-t">' + docs.size + ' docente' + (docs.size === 1 ? '' : 's') + '</span>' +
        '<span class="pill pill-s">' + rs.length + ' secc.</span>' +
        '<span class="pill pill-n">' + horas + ' h</span>' +
      '</span></div>' +
      '<div class="grp-b"><table class="grp-tbl"><thead><tr>' +
        '<th>Docente</th><th>DNI</th><th>Sección</th><th>NRC</th><th>Periodo</th>' +
        '<th>Turno</th><th>Sede</th><th>Modalidad</th><th>Horas</th><th>Horario</th><th>Aula</th>' +
      '</tr></thead><tbody>' +
      rs.map(r =>
        '<tr><td class="doc">' + esc(r.docente) + '</td><td>' + esc(r.dni) + '</td>' +
        '<td>' + esc(r.seccion) + '</td><td>' + esc(r.nrc) + '</td>' +
        '<td>' + esc(r.periodo) + '</td><td>' + esc(TURNO_LABEL[r.turno] || r.turno) + '</td>' +
        '<td>' + esc(r.sede) + '</td><td>' + esc(r.modalidad) + '</td>' +
        '<td class="num">' + r.horas + '</td>' +
        '<td class="hor">' + esc(horarioLegible(r)) + '</td>' +
        '<td>' + esc(r.aula || '—') + '</td></tr>').join('') +
      '</tbody></table></div></div>';
  }).join('');

  cont.querySelectorAll('.grp-h').forEach(h => {
    h.onclick = () => {
      const grp = h.parentNode, curso = grp.dataset.c;
      const abierto = grp.classList.toggle('open');
      h.querySelector('.cx').className = 'fas fa-chevron-' + (abierto ? 'down' : 'right') + ' cx';
      if (abierto) state.abiertos.add(curso); else state.abiertos.delete(curso);
    };
  });
}

/* "(LUNES)(SABADO)" + "(PRE 07:00-10:45)(...)" -> "LUNES 07:00-10:45 · SABADO ..." */
function horarioLegible(r) {
  const dias = (r.dias.match(/\(([^)]*)\)/g) || []).map(s => s.slice(1, -1).trim());
  const horas = (r.horasTxt.match(/\(([^)]*)\)/g) || []).map(s => s.slice(1, -1).trim());
  if (!dias.length) return r.horasTxt || '—';
  return dias.map((d, i) => d + (horas[i] ? ' ' + horas[i].replace(/^(PRE|VIR)\s*/, '') : '')).join(' · ');
}

function renderTabla(filas) {
  const k = state.sortKey, dir = state.sortDir;
  const ord = filas.slice().sort((a, b) => {
    let va = a[k], vb = b[k];
    if (k === 'horas') return (va - vb) * dir;
    if (k === 'ciclo') return (CICLO_ORDEN.indexOf(va) - CICLO_ORDEN.indexOf(vb)) * dir;
    if (k === 'periodo') return (ordenPeriodo(a.periodos[0] || '') - ordenPeriodo(b.periodos[0] || '')) * dir;
    va = txt(va); vb = txt(vb);
    return va.localeCompare(vb) * dir;
  });
  const body = document.getElementById('tblBody');
  if (!ord.length) {
    body.innerHTML = '<tr><td colspan="14"><div class="empty">Ninguna carga coincide con los filtros</div></td></tr>';
  } else {
    /* La tabla se dibuja completa; el scroll del panel se encarga del resto. */
    body.innerHTML = ord.map(r =>
      '<tr><td class="name">' + esc(r.curso) + '</td>' +
      '<td class="name">' + esc(r.docente) + '</td>' +
      '<td>' + esc(r.dni) + '</td><td>' + esc(r.seccion) + '</td><td>' + esc(r.nrc) + '</td>' +
      '<td><span class="pill pill-c">' + esc(r.ciclo || '—') + '</span></td>' +
      '<td>' + esc(r.periodo) + '</td>' +
      '<td>' + esc(TURNO_LABEL[r.turno] || r.turno) + '</td>' +
      '<td><span class="pill pill-s">' + esc(r.sede) + '</span></td>' +
      '<td>' + esc(r.modalidad) + '</td>' +
      '<td>' + (r.tipo === SIN_TIPO ? '—' : '<span class="pill pill-m">' + esc(r.tipo) + '</span>') + '</td>' +
      '<td class="num">' + r.horas + '</td>' +
      '<td>' + esc(horarioLegible(r)) + '</td>' +
      '<td>' + esc(r.aula || '—') + '</td></tr>').join('');
  }
  const pres = ord.filter(r => r.modalidad !== 'VIRTUAL');
  const conAula = pres.filter(r => r.aula && r.aula.indexOf('—') < 0).length;
  document.getElementById('tblCount').textContent =
    ord.length + ' de ' + DATA.length + ' cargas asignadas' +
    (pres.length ? ' · aula conocida en ' + conAula + ' de ' + pres.length + ' presenciales' : '');
  window.__FILAS = ord;
}

/* ---------- exportaciones ---------- */
const COLS_REPORTE = [
  ['N°', r => r.__i], ['Carga', r => r.carga], ['DNI', r => r.dni],
  ['Nombres y Apellidos', r => r.docente], ['Sede', r => r.sede], ['Curso', r => r.curso],
  ['Sección', r => r.seccion], ['Módulo', r => r.modulo], ['NRC', r => r.nrc],
  ['Horas', r => r.horas], ['Periodo', r => r.mes], ['TURNO', r => r.turno],
  ['CICLO', r => r.ciclo], ['MODALIDAD', r => r.modalidad],
  ['TIPO', r => (r.tipo === SIN_TIPO ? '' : r.tipo)],
  ['HORARIO (DÍAS)', r => r.dias], ['HORARIO (HORAS)', r => r.horasTxt],
  ['AULA', r => r.aula]
];

function filasReporte() {
  return (window.__FILAS || []).map((r, i) => {
    const o = { ...r, __i: i + 1 };
    const fila = {};
    COLS_REPORTE.forEach(([h, f]) => { fila[h] = f(o); });
    return fila;
  });
}

function resumenPorCurso() {
  const m = new Map();
  (window.__FILAS || []).forEach(r => {
    if (!m.has(r.curso)) m.set(r.curso, { docentes: new Set(), secciones: 0, horas: 0, ciclos: new Set() });
    const g = m.get(r.curso);
    g.docentes.add(r.docente); g.secciones++; g.horas += r.horas;
    if (r.ciclo) g.ciclos.add(r.ciclo);
  });
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([curso, g]) => ({
    'Curso': curso,
    'Ciclo': [...g.ciclos].sort((a, b) => CICLO_ORDEN.indexOf(a) - CICLO_ORDEN.indexOf(b)).join('/'),
    'Docentes': g.docentes.size,
    'Secciones': g.secciones,
    'Horas': g.horas
  }));
}

function resumenFiltros() {
  const p = [];
  if (state.cursos.size) p.push('Cursos: ' + [...state.cursos].join(', '));
  if (state.docentes.size) p.push('Docentes: ' + [...state.docentes].join(', '));
  if (state.ciclo.size) p.push('Ciclo: ' + [...state.ciclo].join(', '));
  if (state.periodo.size) p.push('Periodo: ' + [...state.periodo].join(', '));
  if (state.turno.size) p.push('Turno: ' + [...state.turno].map(t => TURNO_LABEL[t] || t).join(', '));
  if (state.sede.size) p.push('Sede: ' + [...state.sede].join(', '));
  if (state.modalidad.size) p.push('Modalidad: ' + [...state.modalidad].join(', '));
  if (state.tipo.size) p.push('Línea: ' + [...state.tipo].join(', '));
  if (state.q) p.push('Búsqueda: ' + state.q);
  return p.length ? p.join('  |  ') : 'Sin filtros (todas las cargas asignadas)';
}

function nombreArchivo(ext) {
  const partes = ['reporte_cargas'];
  if (state.ciclo.size) partes.push('ciclo_' + [...state.ciclo].join('-'));
  if (state.cursos.size === 1) partes.push([...state.cursos][0].slice(0, 24).replace(/[^A-Za-z0-9]+/g, '_'));
  const d = new Date();
  partes.push(d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'));
  return partes.join('_') + '.' + ext;
}

function exportarExcel() {
  const detalle = filasReporte();
  if (!detalle.length) { setStatus('No hay filas que exportar con los filtros actuales.', 'err'); return; }
  const wb = XLSX.utils.book_new();
  const wsDet = XLSX.utils.json_to_sheet(detalle, { header: COLS_REPORTE.map(c => c[0]) });
  wsDet['!cols'] = COLS_REPORTE.map(c => ({ wch: c[0] === 'Nombres y Apellidos' || c[0] === 'Curso' ? 34 : Math.max(8, c[0].length + 2) }));
  XLSX.utils.book_append_sheet(wb, wsDet, 'Detalle');
  const wsRes = XLSX.utils.json_to_sheet(resumenPorCurso());
  wsRes['!cols'] = [{ wch: 40 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsRes, 'Resumen por curso');
  const wsInfo = XLSX.utils.aoa_to_sheet([
    ['Reporte de cargas asignadas'],
    ['Fuente', 'Análisis de cargas asignadas'],
    ['Enlace', SHEET_URL],
    ['Generado', new Date().toLocaleString('es-PE')],
    ['Filtros', resumenFiltros()],
    ['Filas', detalle.length]
  ]);
  wsInfo['!cols'] = [{ wch: 14 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Info');
  XLSX.writeFile(wb, nombreArchivo('xlsx'));
}

function exportarPdf() {
  const detalle = filasReporte();
  if (!detalle.length) { setStatus('No hay filas que exportar con los filtros actuales.', 'err'); return; }
  if (detalle.length > 600 &&
      !confirm('Vas a generar un PDF con ' + detalle.length + ' filas (unas ' +
               Math.ceil(detalle.length / 25) + ' páginas).\n\n' +
               '¿Continuar? Puedes filtrar antes para obtener un reporte más corto.')) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();

  doc.setFillColor(113, 75, 103); doc.rect(0, 0, ancho, 46, 'F');
  doc.setTextColor(255); doc.setFontSize(13);
  doc.text('Reporte de cargas asignadas', 32, 22);
  doc.setFontSize(8);
  doc.text('Fuente: Análisis de cargas asignadas · ' + new Date().toLocaleString('es-PE'), 32, 36);

  doc.setTextColor(60); doc.setFontSize(8);
  const lineas = doc.splitTextToSize(resumenFiltros(), ancho - 64);
  doc.text(lineas, 32, 62);
  const yTabla = 62 + lineas.length * 10 + 8;

  const cols = COLS_REPORTE.filter(c => c[0] !== 'HORARIO (DÍAS)' && c[0] !== 'HORARIO (HORAS)' && c[0] !== 'AULA')
    .concat([['Horario', r => horarioLegible(r)], ['Aula', r => r.aula]]);

  doc.autoTable({
    startY: yTabla,
    head: [cols.map(c => c[0])],
    body: (window.__FILAS || []).map((r, i) => cols.map(c => String(c[1]({ ...r, __i: i + 1 }) ?? ''))),
    styles: { fontSize: 6.5, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [113, 75, 103], textColor: 255, fontSize: 6.5 },
    alternateRowStyles: { fillColor: [246, 244, 246] },
    columnStyles: { 0: { cellWidth: 18 }, 3: { cellWidth: 105 }, 5: { cellWidth: 115 } },
    margin: { left: 24, right: 24 },
    didDrawPage: d => {
      doc.setFontSize(7); doc.setTextColor(120);
      doc.text('Página ' + doc.internal.getNumberOfPages(),
        ancho - 60, doc.internal.pageSize.getHeight() - 14);
    }
  });

  const res = resumenPorCurso();
  doc.addPage('a4', 'landscape');
  doc.setFontSize(11); doc.setTextColor(60);
  doc.text('Resumen por curso', 32, 34);
  doc.autoTable({
    startY: 44,
    head: [['Curso', 'Ciclo', 'Docentes', 'Secciones', 'Horas']],
    body: res.map(r => [r.Curso, r.Ciclo, r.Docentes, r.Secciones, r.Horas]),
    styles: { fontSize: 7.5, cellPadding: 3 },
    headStyles: { fillColor: [1, 126, 132], textColor: 255 },
    margin: { left: 24, right: 24 }
  });

  doc.save(nombreArchivo('pdf'));
}

/* ---------- arranque ---------- */
let msCurso, msDocente;

function limpiar() {
  ['cursos', 'docentes', 'ciclo', 'periodo', 'turno', 'sede', 'modalidad', 'tipo'].forEach(k => state[k].clear());
  state.abiertos.clear();
  state.q = '';
  document.getElementById('q').value = '';
  msCurso.refrescar(); msDocente.refrescar();
  construirFiltros(); render();
}

document.addEventListener('DOMContentLoaded', () => {
  const alCambiar = () => { construirFiltros(); render(); };
  msCurso = crearMultiselect(document.getElementById('msCurso'), {
    placeholder: 'Escribe p. ej. CONT y elige uno o varios cursos...',
    hint: 'Puedes elegir varios cursos',
    valores: opcionesCurso, sel: state.cursos, onChange: alCambiar
  });
  msDocente = crearMultiselect(document.getElementById('msDocente'), {
    placeholder: 'Escribe p. ej. AST y elige uno o varios docentes...',
    hint: 'Puedes elegir varios docentes',
    valores: opcionesDocente, sel: state.docentes, onChange: alCambiar
  });

  document.getElementById('q').addEventListener('input', e => {
    state.q = norm(e.target.value); render();
  });
  document.getElementById('btnClear').onclick = limpiar;
  document.getElementById('btnReload').onclick = cargar;
  document.getElementById('btnXls').onclick = exportarExcel;
  document.getElementById('btnPdf').onclick = exportarPdf;

  document.querySelectorAll('#tbl thead th[data-k]').forEach(th => {
    th.onclick = () => {
      const k = th.dataset.k;
      state.sortDir = state.sortKey === k ? -state.sortDir : 1;
      state.sortKey = k;
      renderTabla(filtrar());
    };
  });

  /* El boton "1er Ciclo" del horario entra aqui; se puede cambiar con ?ciclo=II o ?ciclo=todos */
  const paramCiclo = (new URLSearchParams(location.search).get('ciclo') || 'I').toUpperCase();
  if (paramCiclo && paramCiclo !== 'TODOS') state.ciclo.add(paramCiclo);

  cargar();
});
