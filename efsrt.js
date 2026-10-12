/* ===== EFSRT Produce MPE NAF =====
   Lista de docentes/secciones EFSRT con filtros y seguimiento MPE editable por el equipo.
   Los datos viven en Supabase (public.efsrt_filas) y solo se leen/escriben con funciones
   RPC que piden la contraseña del equipo. Los Excel se leen con efsrt-parse.js. */

const SB_URL = 'https://klmjmlhwuzhymrplemgw.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsbWptbGh3dXpoeW1ycGxlbWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTMyNjQsImV4cCI6MjA4NzE2OTI2NH0.xFWMvUJa9n9TBcBG1WSeqCGiWBaCAtCU9aY7GXk4W6E';
const CLAVE_KEY = 'efsrt_clave';
const AUTOR_KEY = 'efsrt_autor';
const NOTA_MIN = 13;
const CURSO_MPE = 'https://campusdigital.certus.edu.pe/course/view.php?id=74043';
const TURNO_LABEL = { M: 'Mañana', T: 'Tarde', N: 'Noche', D: 'Diurno' };
const DIAS = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'SÁBADO', 'DOMINGO'];
const CICLOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const ESTADOS = [
    ['Aprobado', 'st-ok'], ['Desaprobado', 'st-bad'], ['Ingresó, falta nota', 'st-mid'],
    ['No ingresó', 'st-no'], ['No dictará', 'st-out'], ['Sin dato', 'st-no']
];
const TOGGLES = [['comunicado', 'Comunicado'], ['respondio', 'Respondió'], ['verificado', 'Verificado'], ['control', 'Act. control']];

const st = {
    clave: '', tab: 'sec', vista: 'seccion', q: '', verBorradas: false, borradas: { seccion: 0, mpe: 0 },
    sec: [], mpe: [], equipo: [], docentes: new Map(), importado: null,
    fSec: { docente: new Set(), vertical: new Set(), linea: new Set(), ciclo: new Set(), periodo: new Set(),
        modalidad: new Set(), turno: new Set(), sede: new Set(), dia: new Set(), contrato: new Set(), mpe: new Set() },
    fMpe: { monitor: new Set(), estado: new Set(), falta: new Set() },
    orden: { sec: ['docente', 1], mpe: ['docente', 1] }
};

/* ---------- utilidades ---------- */
const $ = id => document.getElementById(id);
const txt = v => (v == null ? '' : String(v)).trim();
const norm = s => txt(s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const esc = s => txt(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => Number(n || 0).toLocaleString('es-PE');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const cmp = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'es', { numeric: true, sensitivity: 'base' });
const fechaHora = s => (s ? new Date(s).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const leerLS = k => { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } };
const guardarLS = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (_) {} };

async function rpc(fn, args) {
    const res = await fetch(SB_URL + '/rest/v1/rpc/' + fn, {
        method: 'POST',
        headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ clave: st.clave }, args || {}))
    });
    if (!res.ok) {
        let msg = 'HTTP ' + res.status;
        try { const e = await res.json(); msg = e.message || msg; } catch (_) {}
        const err = new Error(msg); err.status = res.status; throw err;
    }
    return res.json();
}

function setStatus(msg, kind) {
    const el = $('status');
    el.className = msg ? 'dash-status show ' + (kind || 'info') : 'dash-status';
    el.innerHTML = msg || '';
}
let toastT = null;
function toast(msg) {
    const el = $('toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2200);
}
async function copiar(texto, etiqueta) {
    try { await navigator.clipboard.writeText(texto); }
    catch (_) {
        const ta = document.createElement('textarea'); ta.value = texto; document.body.appendChild(ta);
        ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    }
    toast('Copiado: ' + etiqueta);
}

/* ---------- reglas del seguimiento MPE ---------- */
function estadoMpe(s, d) {
    const v = txt(s.verificacion) || txt(d.nota_estrella);
    const vv = v.replace(',', '.');
    if (/^\d+(\.\d+)?$/.test(vv)) { const nota = Number(vv); return { estado: nota >= NOTA_MIN ? 'Aprobado' : 'Desaprobado', nota }; }
    const tiene = v.match(/tiene\s+(\d+)/i) || txt(s.obs).match(/tiene\s+(\d+)/i);
    if (tiene) return { estado: Number(tiene[1]) >= NOTA_MIN ? 'Aprobado' : 'Desaprobado', nota: Number(tiene[1]) };
    const n = norm(v + ' ' + txt(s.obs));
    if (/NO DICTARA/.test(n)) return { estado: 'No dictará', nota: null };
    if (/SI INGRES/.test(n)) return { estado: 'Ingresó, falta nota', nota: null };
    if (/NO HA INGRESADO|NO INGRES/.test(n)) return { estado: 'No ingresó', nota: null };
    return { estado: 'Sin dato', nota: null };
}
const claseEstado = e => (ESTADOS.find(x => x[0] === e) || [0, 'st-no'])[1];
const esSi = v => /^(SI|SÍ|OK)/i.test(txt(v));
const esNo = v => /^NO/i.test(txt(v));
function faltas(r) {
    if (r.estado === 'Aprobado' || r.estado === 'No dictará') return [];
    return TOGGLES.filter(([k]) => !esSi(r.s[k])).map(([, l]) => l);
}

/* ---------- carga ---------- */
function preparar(data) {
    // Los cambios manuales (s.d) se aplican encima de lo importado; las eliminadas (s.borrado) se ocultan
    const visible = x => !!(x.s && x.s.borrado) === st.verBorradas;
    const fila = x => ({ id: x.id, d: Object.assign({}, x.d, (x.s || {}).d), orig: x.d || {}, s: x.s || {}, por: x.por, en: x.en,
        manual: !!((x.s || {}).manual || (x.s || {}).d) });
    st.borradas = { seccion: (data.seccion || []).filter(x => x.s && x.s.borrado).length, mpe: (data.mpe || []).filter(x => x.s && x.s.borrado).length };
    data = Object.assign({}, data, { seccion: (data.seccion || []).filter(visible), mpe: (data.mpe || []).filter(visible) });
    st.docentes = new Map((data.docente || []).map(x => [x.id, x.d]));
    st.equipo = (data.equipo || []).map(x => x.d);
    st.importado = data.importado;

    const jefes = new Map(st.equipo.map(e => [norm(e.monitor), e.jefe]));
    st.mpe = (data.mpe || []).map(fila).map(prepMpe(jefes));
    const mpePorSec = new Map(st.mpe.map(r => [r.d.carga + '|' + r.d.nrc, r]));

    st.sec = (data.seccion || []).map(fila).map(r => {
        const doc = st.docentes.get(r.d.dni) || {};
        r.docente = r.d.docente;
        r.correo = r.d.correo || doc.correo || '';
        r.vertical = doc.vertical || (r.d.linea === 'COT' ? 'Contabilidad y Tributación' : 'Sin vertical');
        r.linea = r.d.linea || '';
        r.ciclo = r.d.ciclo; r.periodo = r.d.periodo; r.modalidad = r.d.modalidad; r.turno = r.d.turno;
        r.sede = r.d.sede; r.dia = r.d.dias; r.contrato = r.d.contrato;
        r.mpeFila = mpePorSec.get(r.d.carga + '|' + r.d.nrc) || null;
        r.mpe = r.mpeFila ? r.mpeFila.estado : 'Sin seguimiento';
        r.texto = norm([r.docente, r.d.dni, r.correo, r.d.nrc, r.d.seccion, r.sede, r.vertical, r.d.curso].join(' '));
        return r;
    });
}
const prepMpe = jefes => r => {
    const e = estadoMpe(r.s, r.d);
    r.estado = e.estado; r.nota = e.nota;
    r.monitor = txt(r.s.monitor) || 'Sin monitor';
    r.jefe = jefes.get(norm(r.s.monitor)) || '';
    r.falta = faltas(r);
    r.texto = norm([r.d.docente, r.d.dni, r.d.correo, r.d.nrc, r.d.seccion, r.monitor, r.s.obs].join(' '));
    return r;
};

async function cargar(silencioso) {
    if (!silencioso) setStatus('<i class="fas fa-spinner fa-spin"></i> Cargando datos...', 'info');
    try {
        const data = await rpc('efsrt_listar');
        preparar(data);
        setStatus('');
        if (!st.sec.length && !st.mpe.length) setStatus('Aún no hay datos. Pulsa <b>Importar Excel</b> y elige los archivos de EFSRT.', 'info');
        pintar();
        return true;
    } catch (e) {
        if (e.status === 403) { pedirClave('La contraseña guardada ya no es válida.'); return false; }
        setStatus('No se pudieron cargar los datos: ' + esc(e.message), 'err');
        return false;
    }
}

/* ---------- acceso ---------- */
function pedirClave(msg) {
    guardarLS(CLAVE_KEY, ''); st.clave = '';
    $('errClave').textContent = msg || '';
    $('mdClave').classList.add('open');
    setTimeout(() => $('inClave').focus(), 50);
}
$('frmClave').onsubmit = async ev => {
    ev.preventDefault();
    st.clave = $('inClave').value.trim();
    if (!st.clave) return;
    $('errClave').textContent = 'Verificando...';
    try {
        await rpc('efsrt_entrar');
        guardarLS(CLAVE_KEY, st.clave);
        $('mdClave').classList.remove('open');
        $('inClave').value = '';
        cargar();
    } catch (e) {
        $('errClave').textContent = e.status === 403 ? 'Contraseña incorrecta.' : 'No se pudo verificar: ' + e.message;
    }
};

/* ---------- filtros genéricos ---------- */
const CAMPOS_SEC = Object.keys(st.fSec);
const CAMPOS_MPE = Object.keys(st.fMpe);
const valoresDe = (r, c) => (c === 'falta' ? r.falta : [r[c]]);
function pasa(r, filtros, campos, excepto) {
    if (st.q) { const ps = norm(st.q).split(/\s+/); if (!ps.every(p => r.texto.includes(p))) return false; }
    return campos.every(c => c === excepto || !filtros[c].size || valoresDe(r, c).some(v => filtros[c].has(v)));
}
function conteos(filas, filtros, campos, campo) {
    const m = new Map();
    filas.filter(r => pasa(r, filtros, campos, campo)).forEach(r => valoresDe(r, campo).forEach(v => { if (txt(v)) m.set(v, (m.get(v) || 0) + 1); }));
    filtros[campo].forEach(v => { if (!m.has(v)) m.set(v, 0); });
    return m;
}
function chips(contId, filas, filtros, campos, campo, { etiqueta, orden } = {}) {
    const m = conteos(filas, filtros, campos, campo);
    let vals = [...m.keys()];
    vals = orden ? orden(vals, m) : vals.sort((a, b) => m.get(b) - m.get(a) || cmp(a, b));
    const cont = $(contId);
    cont.innerHTML = vals.map(v => '<button class="chip' + (filtros[campo].has(v) ? ' on' : '') + '" data-v="' + esc(v) + '">' +
        esc(etiqueta ? etiqueta(v) : v) + '<span class="n">' + fmt(m.get(v)) + '</span></button>').join('') || '<span class="hint">sin datos</span>';
    cont.querySelectorAll('.chip').forEach(b => {
        b.onclick = () => { const v = b.dataset.v; if (filtros[campo].has(v)) filtros[campo].delete(v); else filtros[campo].add(v); pintar(); };
    });
}
const porLista = lista => vals => vals.sort((a, b) => {
    const ia = lista.indexOf(norm(a)), ib = lista.indexOf(norm(b));
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || cmp(a, b);
});

/* ---------- multiselect de docentes ---------- */
function crearMultiselect(cont, { placeholder, opciones }) {
    const sel = st.fSec.docente;
    let lista = [], activo = -1;
    cont.innerHTML = '<input type="text" placeholder="' + esc(placeholder) + '">' +
        '<button class="ms-clear" title="Quitar selección" style="display:none"><i class="fas fa-times"></i></button><div class="ms-list"></div>';
    const input = cont.querySelector('input'), caja = cont.querySelector('.ms-list'), limpiar = cont.querySelector('.ms-clear');
    function tags() {
        cont.querySelectorAll('.ms-tag').forEach(t => t.remove());
        sel.forEach(v => {
            const t = document.createElement('span'); t.className = 'ms-tag';
            t.innerHTML = '<span>' + esc(v) + '</span><button title="Quitar"><i class="fas fa-times"></i></button>';
            t.querySelector('button').onclick = ev => { ev.stopPropagation(); sel.delete(v); tags(); pintar(); };
            cont.insertBefore(t, input);
        });
        limpiar.style.display = sel.size ? '' : 'none';
        input.placeholder = sel.size ? '' : placeholder;
    }
    function abrir() {
        const q = norm(input.value), m = opciones();
        const base = [...m.keys()].sort(cmp);
        lista = (q ? base.filter(v => norm(v).includes(q)).sort((a, b) => norm(b).startsWith(q) - norm(a).startsWith(q)) : base).slice(0, 80);
        activo = lista.length ? 0 : -1;
        caja.innerHTML = lista.length ? lista.map((v, i) => '<div class="ms-opt' + (i === activo ? ' active' : '') + (sel.has(v) ? ' sel' : '') +
            '" data-i="' + i + '"><i class="fas ' + (sel.has(v) ? 'fa-square-check' : 'fa-square') + '"></i><span>' + esc(v) +
            '</span><span class="n">' + fmt(m.get(v)) + '</span></div>').join('') : '<div class="ms-none">Sin coincidencias</div>';
        caja.querySelectorAll('.ms-opt').forEach(el => { el.onmousedown = ev => { ev.preventDefault(); elegir(+el.dataset.i); }; });
        caja.classList.add('open');
    }
    function elegir(i) {
        const v = lista[i]; if (v == null) return;
        if (sel.has(v)) sel.delete(v); else sel.add(v);
        input.value = ''; tags(); pintar(); abrir(); input.focus();
    }
    input.addEventListener('focus', () => { cont.classList.add('focus'); abrir(); });
    input.addEventListener('blur', () => { cont.classList.remove('focus'); setTimeout(() => caja.classList.remove('open'), 120); });
    input.addEventListener('input', abrir);
    input.addEventListener('keydown', ev => {
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
            ev.preventDefault(); if (!lista.length) return;
            activo = (activo + (ev.key === 'ArrowDown' ? 1 : -1) + lista.length) % lista.length;
            const els = caja.querySelectorAll('.ms-opt');
            els.forEach((el, i) => el.classList.toggle('active', i === activo));
            if (els[activo]) els[activo].scrollIntoView({ block: 'nearest' });
        } else if (ev.key === 'Enter') { ev.preventDefault(); elegir(activo); }
        else if (ev.key === 'Escape') input.blur();
        else if (ev.key === 'Backspace' && !input.value && sel.size) { sel.delete([...sel].pop()); tags(); pintar(); }
    });
    cont.addEventListener('click', ev => { if (ev.target === cont) input.focus(); });
    limpiar.onclick = () => { sel.clear(); tags(); pintar(); };
    return { tags };
}
const msDocente = crearMultiselect($('msDocente'), {
    placeholder: 'Escribe para buscar docentes...',
    opciones: () => {
        const m = new Map();
        st.sec.filter(r => pasa(r, st.fSec, CAMPOS_SEC, 'docente')).forEach(r => m.set(r.docente, (m.get(r.docente) || 0) + 1));
        st.fSec.docente.forEach(v => { if (!m.has(v)) m.set(v, 0); });
        return m;
    }
});

/* ---------- pintar ---------- */
function pintar() {
    $('nSec').textContent = st.sec.length ? fmt(st.sec.length) : '';
    $('nMpe').textContent = st.mpe.length ? fmt(st.mpe.length) : '';
    $('vSec').hidden = st.tab !== 'sec';
    $('vMpe').hidden = st.tab !== 'mpe';
    document.querySelectorAll('.ef-tab').forEach(b => b.classList.toggle('on', b.dataset.t === st.tab));
    if (st.tab === 'sec') pintarSec(); else pintarMpe();
    pintarBorradas();
}

function filasSec() { return st.sec.filter(r => pasa(r, st.fSec, CAMPOS_SEC)); }
function filasMpe() { return st.mpe.filter(r => pasa(r, st.fMpe, CAMPOS_MPE)); }

function pintarSec() {
    const F = st.fSec, C = CAMPOS_SEC, S = st.sec;
    chips('fVertical', S, F, C, 'vertical');
    chips('fLinea', S, F, C, 'linea');
    chips('fCiclo', S, F, C, 'ciclo', { orden: porLista(CICLOS) });
    chips('fPeriodo', S, F, C, 'periodo');
    chips('fModalidad', S, F, C, 'modalidad');
    chips('fTurno', S, F, C, 'turno', { etiqueta: v => TURNO_LABEL[v] || v, orden: porLista(['M', 'T', 'N', 'D']) });
    chips('fSede', S, F, C, 'sede');
    chips('fDia', S, F, C, 'dia', { orden: porLista(DIAS.map(norm)) });
    chips('fContrato', S, F, C, 'contrato');
    chips('fMpe', S, F, C, 'mpe', { orden: porLista(ESTADOS.map(e => norm(e[0])).concat('SIN SEGUIMIENTO')) });
    msDocente.tags();

    const filas = filasSec();
    const docs = new Set(filas.map(r => r.d.dni || r.docente));
    const conta = filas.filter(r => r.d.rubrica);
    const obsRub = conta.filter(r => r.s.status && norm(r.s.status) !== 'OK').length;
    const est = filas.reduce((a, r) => a + (r.d.est_portal || 0), 0);
    const kpi = (lab, val, sub, cls) => '<div class="kpi ' + (cls || '') + '"><div class="k-lab">' + lab + '</div><div class="k-val">' + val +
        '</div><div class="k-sub">' + (sub || '&nbsp;') + '</div></div>';
    $('kpisSec').innerHTML =
        kpi('Docentes', fmt(docs.size), 'en el filtro') +
        kpi('Secciones', fmt(filas.length), fmt(new Set(filas.map(r => r.sede)).size) + ' sedes', 'k-purple') +
        kpi('Línea COT', fmt(filas.filter(r => r.linea === 'COT').length), 'secciones', 'k-blue') +
        kpi('Presencial / Virtual', fmt(filas.filter(r => norm(r.modalidad) === 'PRESENCIAL').length) + ' / ' +
            fmt(filas.filter(r => norm(r.modalidad) === 'VIRTUAL').length), 'secciones') +
        kpi('Estudiantes (portal)', est ? fmt(est) : '—', conta.length ? 'en ' + fmt(conta.length) + ' secciones COT' : 'solo secciones COT', 'k-green') +
        kpi('Rúbrica S8 observada', fmt(obsRub), conta.length ? 'de ' + fmt(conta.length) + ' revisadas' : '', obsRub ? 'k-red' : 'k-green');

    if (st.vista === 'docente') return tablaDocentes(filas);
    const cols = [
        ['docente', 'Docente'], ['vertical', 'Vertical'], ['seccion', 'Sección'], ['nrc', 'NRC'], ['ciclo', 'Ciclo'],
        ['sede', 'Sede'], ['modalidad', 'Modalidad'], ['turno', 'Turno'], ['dia', 'Día'], ['horario', 'Horario'],
        ['contrato', 'Contrato'], ['est', 'Est. BBDD / portal'], ['status', 'Rúbrica S8 / status'], ['mpe', 'MPE'], ['acc', '']
    ];
    const val = (r, k) => ({ seccion: r.d.seccion, nrc: Number(r.d.nrc), horario: r.d.horario, est: r.d.est_portal ?? -1, status: r.s.status || '' }[k] ?? r[k]);
    ordenar(filas, 'sec', val);
    cabecera('hSec', cols, 'sec');
    $('cntSec').textContent = fmt(filas.length) + ' secciones · ' + fmt(docs.size) + ' docentes';
    $('bSec').innerHTML = filas.length ? filas.map(r => {
        const m = r.mpeFila;
        return '<tr data-id="' + esc(r.id) + '">' +
            '<td class="name"><a class="lnk" data-doc="' + esc(r.d.dni) + '">' + esc(r.docente) + '</a>' + marcaManual(r) + '<br><span class="sub">' +
            esc(r.d.dni) + (r.correo ? ' · ' + esc(r.correo) : '') + '</span></td>' +
            '<td>' + esc(r.vertical) + '</td><td><span class="pill pill-t">' + esc(r.d.seccion) + '</span></td>' +
            '<td class="num">' + (r.d.link ? '<a class="campus" href="' + esc(r.d.link) + '" target="_blank" rel="noopener" title="Abrir en Campus">' + esc(r.d.nrc) + ' <i class="fas fa-arrow-up-right-from-square"></i></a>' : esc(r.d.nrc)) + '</td>' +
            '<td>' + esc(r.ciclo) + '</td><td>' + esc(r.sede) + '</td><td>' + esc(r.modalidad) + '</td>' +
            '<td>' + esc(TURNO_LABEL[r.turno] || r.turno) + '</td><td>' + esc(r.dia) + '</td><td>' + esc(r.d.horario) + '</td>' +
            '<td>' + esc(r.contrato) + '</td>' +
            '<td class="num">' + (r.d.est_bbdd != null || r.d.est_portal != null ? esc(r.d.est_bbdd ?? '—') + ' / ' + esc(r.d.est_portal ?? '—') : '<span class="no-dato">—</span>') + '</td>' +
            '<td class="wrap">' + (r.d.rubrica || r.s.status
                ? '<input class="ef-in obs" data-sec="' + esc(r.id) + '" value="' + esc(r.s.status) + '" placeholder="Status de rúbrica (módulo ' + esc(r.d.rubrica) + ')" title="Rúbrica en módulo ' + esc(r.d.rubrica) + '">'
                : '<span class="no-dato">—</span>') + '</td>' +
            '<td>' + (m ? '<span class="st ' + claseEstado(m.estado) + '" title="' + esc(m.s.verificacion || m.d.nota_estrella) + '">' + esc(m.estado) + '</span>' : '<span class="no-dato">—</span>') + '</td>' +
            '<td>' + acciones(r) + '</td></tr>';
    }).join('') : '<tr><td colspan="' + cols.length + '"><div class="empty">Sin resultados con estos filtros.</div></td></tr>';
}

function agruparDocentes(filas) {
    const m = new Map();
    filas.forEach(r => {
        const k = r.d.dni || r.docente;
        if (!m.has(k)) m.set(k, { dni: r.d.dni, docente: r.docente, correo: r.correo, vertical: r.vertical, contrato: r.contrato, secs: [] });
        m.get(k).secs.push(r);
    });
    return [...m.values()];
}
function tablaDocentes(filas) {
    const g = agruparDocentes(filas);
    const cols = [['docente', 'Docente'], ['vertical', 'Vertical'], ['contrato', 'Contrato'], ['n', 'Secciones'],
        ['secciones', 'Detalle de secciones'], ['sedes', 'Sedes'], ['mpe', 'MPE']];
    g.forEach(x => {
        x.n = x.secs.length;
        x.sedes = [...new Set(x.secs.map(s => s.sede))].join(', ');
        const est = x.secs.map(s => s.mpeFila).filter(Boolean);
        x.mpe = est.length ? (est.every(e => e.estado === 'Aprobado') ? 'Aprobado' : est.find(e => e.estado !== 'Aprobado').estado) : '';
    });
    ordenar(g, 'sec', (x, k) => (k === 'secciones' ? x.n : x[k]));
    cabecera('hSec', cols, 'sec');
    $('cntSec').textContent = fmt(g.length) + ' docentes · ' + fmt(filas.length) + ' secciones';
    $('bSec').innerHTML = g.length ? g.map(x =>
        '<tr><td class="name"><a class="lnk" data-doc="' + esc(x.dni) + '">' + esc(x.docente) + '</a><br><span class="sub">' + esc(x.dni) +
        (x.correo ? ' · ' + esc(x.correo) : '') + '</span></td><td>' + esc(x.vertical) + '</td><td>' + esc(x.contrato) + '</td>' +
        '<td class="num"><b>' + x.n + '</b></td><td class="secs">' +
        x.secs.map(s => esc(s.d.seccion) + ' · NRC ' + esc(s.d.nrc) + ' · ' + esc(s.ciclo) + ' · ' + esc(s.dia) + ' ' + esc(s.d.horario)).join('<br>') +
        '</td><td>' + esc(x.sedes) + '</td><td>' + (x.mpe ? '<span class="st ' + claseEstado(x.mpe) + '">' + esc(x.mpe) + '</span>' : '<span class="no-dato">—</span>') + '</td></tr>'
    ).join('') : '<tr><td colspan="' + cols.length + '"><div class="empty">Sin resultados con estos filtros.</div></td></tr>';
}

function cabecera(id, cols, tabla) {
    const [k, dir] = st.orden[tabla];
    $(id).innerHTML = '<tr class="g1">' + cols.map(([c, l]) =>
        '<th class="sortable" data-k="' + c + '">' + l + (c === k ? ' <i class="fas fa-sort-' + (dir > 0 ? 'up' : 'down') + '"></i>' : '') + '</th>').join('') + '</tr>';
    $(id).querySelectorAll('th').forEach(th => {
        th.onclick = () => {
            const o = st.orden[tabla];
            st.orden[tabla] = [th.dataset.k, o[0] === th.dataset.k ? -o[1] : 1];
            pintar();
        };
    });
}
function ordenar(filas, tabla, val) {
    const [k, dir] = st.orden[tabla];
    filas.sort((a, b) => {
        const x = val(a, k), y = val(b, k);
        const r = typeof x === 'number' && typeof y === 'number' ? x - y : cmp(x, y);
        return r * dir || cmp(a.docente || a.d?.docente, b.docente || b.d?.docente);
    });
}

/* ---------- seguimiento MPE ---------- */
function pintarMpe() {
    const F = st.fMpe, C = CAMPOS_MPE, S = st.mpe;
    chips('fMonitor', S, F, C, 'monitor');
    chips('fEstado', S, F, C, 'estado', { orden: porLista(ESTADOS.map(e => norm(e[0]))) });
    chips('fFalta', S, F, C, 'falta', { etiqueta: v => 'Falta ' + v.toLowerCase(), orden: porLista(TOGGLES.map(t => norm(t[1]))) });
    pintarMonitores();

    const filas = filasMpe();
    const cols = [['docente', 'Docente'], ['seccion', 'Sección / NRC'], ['horario', 'Horario'], ['monitor', 'Monitor'],
        ['estrella', 'Reporte estrella'], ['verificacion', 'Verificación (nota)'], ['estado', 'Estado'],
        ...TOGGLES, ['obs', 'Observación'], ['en', 'Último cambio'], ['acc', '']];
    const val = (r, k) => ({ docente: r.d.docente, seccion: r.d.seccion, horario: r.d.dias + ' ' + r.d.horario, estrella: r.d.nota_estrella,
        verificacion: r.nota ?? -1, estado: ESTADOS.findIndex(e => e[0] === r.estado), en: r.en || '', obs: r.s.obs }[k] ?? r.s[k] ?? r[k]);
    ordenar(filas, 'mpe', val);
    cabecera('hMpe', cols, 'mpe');
    const monitores = [...new Set(st.equipo.map(e => e.monitor).concat(st.mpe.map(r => txt(r.s.monitor))).filter(Boolean))].sort(cmp);
    $('cntMpe').textContent = fmt(filas.length) + ' de ' + fmt(S.length);
    $('bMpe').innerHTML = filas.length ? filas.map(r => {
        const d = r.d, s = r.s;
        return '<tr data-id="' + esc(r.id) + '">' +
            '<td class="name">' + esc(d.docente) + marcaManual(r) + '<br><span class="sub">' + esc(d.correo) + '</span>' +
            (d.telefono ? '<br><a class="wa" href="' + waLink(r) + '" target="_blank" rel="noopener" title="Enviar recordatorio por WhatsApp"><i class="fab fa-whatsapp"></i> ' + esc(d.telefono) + '</a>' : '') + '</td>' +
            '<td><span class="pill pill-t">' + esc(d.seccion) + '</span> <span class="sub">' + esc(d.nrc) + '</span><br><span class="sub">' + esc(d.campus) + ' · ' + fmt(d.inscritos) + ' inscr.</span></td>' +
            '<td>' + esc(d.dias) + '<br><span class="sub">' + esc(d.horario) + '</span></td>' +
            '<td><select class="ef-in" data-k="monitor"><option value="">— Sin monitor —</option>' +
            monitores.map(m => '<option' + (m === txt(s.monitor) ? ' selected' : '') + '>' + esc(m) + '</option>').join('') + '</select></td>' +
            '<td class="wrap"><span class="sub">' + esc(d.nota_estrella) + '</span></td>' +
            '<td><input class="ef-in nota" data-k="verificacion" value="' + esc(s.verificacion) + '" placeholder="Nota o estado" list="dlVerif"></td>' +
            '<td class="c-estado"><span class="st ' + claseEstado(r.estado) + '">' + esc(r.estado) + '</span></td>' +
            TOGGLES.map(([k]) => '<td>' + toggle(k, s[k]) + '</td>').join('') +
            '<td><input class="ef-in obs" data-k="obs" value="' + esc(s.obs) + '" placeholder="Agregar observación"></td>' +
            '<td class="ed">' + editado(r) + '</td><td>' + acciones(r) + '</td></tr>';
    }).join('') : '<tr><td colspan="' + cols.length + '"><div class="empty">Sin resultados con estos filtros.</div></td></tr>';
    const fechas = st.mpe.map(r => r.en).filter(Boolean).sort();
    $('actInfo').textContent = 'Excel importado: ' + (fechaHora(st.importado) || '—') + (fechas.length ? ' · último cambio: ' + fechaHora(fechas.at(-1)) : '');
}
const toggle = (k, v) => '<button class="ef-tg ' + (esSi(v) ? 'si' : esNo(v) ? 'no' : '') + '" data-k="' + k + '" title="Clic para cambiar">' + (esc(v) || '—') + '</button>';
const editado = r => (r.en ? esc(fechaHora(r.en)) + (r.por ? '<br>' + esc(r.por) : '') : '');

function pintarMonitores() {
    const base = st.mpe.filter(r => pasa(r, st.fMpe, CAMPOS_MPE, 'monitor'));
    const g = new Map();
    base.forEach(r => { if (!g.has(r.monitor)) g.set(r.monitor, []); g.get(r.monitor).push(r); });
    const tarjeta = (nombre, filas, jefe, total) => {
        const val = filas.filter(r => r.estado !== 'No dictará');
        const ok = val.filter(r => r.estado === 'Aprobado').length;
        const p = pct(ok, val.length);
        const color = p >= 80 ? 'var(--od-green)' : p >= 40 ? 'var(--od-amber)' : 'var(--od-red)';
        const cuenta = e => filas.filter(r => r.estado === e).length;
        return '<button class="ef-mon' + (total ? ' total' : '') + (!total && st.fMpe.monitor.has(nombre) ? ' on' : '') + '" data-m="' + esc(total ? '' : nombre) + '">' +
            '<div class="nm">' + esc(nombre) + '</div><div class="jf">' + esc(jefe || ' ') + '</div>' +
            '<div class="vl"><b>' + p + '%</b><span>' + ok + ' de ' + val.length + ' cumplen</span></div>' +
            '<div class="bar-track"><div class="bar-fill" style="width:' + p + '%;background:' + color + '"></div></div>' +
            '<div class="det"><span>No ingresó: ' + cuenta('No ingresó') + '</span><span>Falta nota: ' + cuenta('Ingresó, falta nota') + '</span>' +
            (cuenta('Desaprobado') ? '<span>Desaprob.: ' + cuenta('Desaprobado') + '</span>' : '') + '</div></button>';
    };
    const jefe = m => (st.mpe.find(r => r.monitor === m) || {}).jefe;
    $('monitores').innerHTML = tarjeta('Todos los monitores', base, 'Cumplimiento MPE (nota ≥ ' + NOTA_MIN + ')', true) +
        [...g.keys()].sort(cmp).map(m => tarjeta(m, g.get(m), jefe(m))).join('');
    $('monitores').querySelectorAll('.ef-mon').forEach(b => {
        b.onclick = () => {
            const m = b.dataset.m;
            if (!m) st.fMpe.monitor.clear();
            else if (st.fMpe.monitor.has(m)) st.fMpe.monitor.delete(m);
            else { st.fMpe.monitor.clear(); st.fMpe.monitor.add(m); }
            pintar();
        };
    });
}

function waLink(r) {
    const h = new Date().getHours();
    const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    const autor = txt($('autor').value);
    const msg = '☀️ ' + saludo + ', estimado docente ' + r.d.docente + '.' + (autor ? ' Le saluda ' + autor + '.' : '') + '\n\n' +
        'Quisiera consultarle si ya culminó la evaluación de la capacitación obligatoria Medición del Perfil de Egreso (MPE).\n\n' +
        '📌 Si ya la realizó, le agradeceré compartir por este medio la nota obtenida.\n\n' +
        '📌 En caso de que aún no la haya realizado, le solicito amablemente completarla. Recuerde que necesita una nota mínima de ' + NOTA_MIN +
        ' y cuenta con 3 intentos disponibles. Al finalizar, por favor, comparta la nota obtenida y una captura de pantalla como evidencia.\n\n' +
        '🔗 Ingrese aquí al curso:\n' + CURSO_MPE + '\n\nAgradezco mucho su apoyo y colaboración. 🙌';
    const tel = String(r.d.telefono).replace(/\D/g, '');
    return 'https://wa.me/' + (tel.length === 9 ? '51' + tel : tel) + '?text=' + encodeURIComponent(msg);
}

/* ---------- guardar cambios ---------- */
function autor() {
    const a = txt($('autor').value);
    if (!a) {
        $('autor').parentElement.classList.add('falta');
        toast('Escribe tu nombre arriba para registrar quién hizo el cambio');
    }
    return a;
}
async function guardar(tipo, fila, cambios, td) {
    const previo = Object.assign({}, fila.s);
    Object.assign(fila.s, cambios);
    td.classList.remove('saved', 'err'); td.classList.add('saving');
    try {
        const r = await rpc('efsrt_guardar', { p_tipo: tipo, p_id: fila.id, p_seg: cambios, p_autor: autor() });
        fila.s = r.s; fila.por = r.por; fila.en = r.en;
        td.classList.remove('saving'); td.classList.add('saved');
        setTimeout(() => td.classList.remove('saved'), 1200);
        return true;
    } catch (e) {
        fila.s = previo;
        td.classList.remove('saving'); td.classList.add('err');
        toast(e.status === 403 ? 'La contraseña cambió; vuelve a entrar' : 'No se guardó: ' + e.message);
        if (e.status === 403) pedirClave();
        return false;
    }
}
function refrescarFilaMpe(tr, fila) {
    const jefes = new Map(st.equipo.map(e => [norm(e.monitor), e.jefe]));
    prepMpe(jefes)(fila);
    tr.querySelector('.c-estado').innerHTML = '<span class="st ' + claseEstado(fila.estado) + '">' + esc(fila.estado) + '</span>';
    tr.querySelector('.ed').innerHTML = editado(fila);
    const sec = st.sec.find(r => r.mpeFila === fila);
    if (sec) sec.mpe = fila.estado;
    pintarMonitores();
    chips('fMonitor', st.mpe, st.fMpe, CAMPOS_MPE, 'monitor');
    chips('fEstado', st.mpe, st.fMpe, CAMPOS_MPE, 'estado', { orden: porLista(ESTADOS.map(e => norm(e[0]))) });
    chips('fFalta', st.mpe, st.fMpe, CAMPOS_MPE, 'falta', { etiqueta: v => 'Falta ' + v.toLowerCase(), orden: porLista(TOGGLES.map(t => norm(t[1]))) });
}

$('bMpe').addEventListener('change', async ev => {
    const el = ev.target.closest('.ef-in'); if (!el) return;
    const tr = el.closest('tr'), fila = st.mpe.find(r => r.id === tr.dataset.id);
    const v = txt(el.value);
    if (!fila || v === txt(fila.s[el.dataset.k])) return;
    if (await guardar('mpe', fila, { [el.dataset.k]: v }, el.closest('td'))) refrescarFilaMpe(tr, fila);
});
$('bMpe').addEventListener('click', async ev => {
    const b = ev.target.closest('.ef-tg'); if (!b) return;
    const tr = b.closest('tr'), fila = st.mpe.find(r => r.id === tr.dataset.id); if (!fila) return;
    const k = b.dataset.k, actual = fila.s[k];
    const nuevo = esSi(actual) ? 'NO' : esNo(actual) ? '' : 'SI';
    b.outerHTML = toggle(k, nuevo);
    const td = tr.querySelector('.ef-tg[data-k="' + k + '"]').closest('td');
    if (await guardar('mpe', fila, { [k]: nuevo }, td)) refrescarFilaMpe(tr, fila);
    else td.innerHTML = toggle(k, actual);
});
$('bSec').addEventListener('change', async ev => {
    const el = ev.target.closest('.ef-in[data-sec]'); if (!el) return;
    const fila = st.sec.find(r => r.id === el.dataset.sec);
    if (fila && txt(el.value) !== txt(fila.s.status)) guardar('seccion', fila, { status: txt(el.value) }, el.closest('td'));
});
$('bMpe').addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.matches('input.ef-in')) ev.target.blur(); });
$('bSec').addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.matches('input.ef-in')) ev.target.blur(); });

/* ---------- ficha del docente ---------- */
$('bSec').addEventListener('click', ev => {
    const a = ev.target.closest('a.lnk'); if (!a) return;
    abrirFicha(a.dataset.doc);
});
function abrirFicha(dni) {
    const secs = st.sec.filter(r => r.d.dni === dni);
    if (!secs.length) return;
    const r0 = secs[0];
    const mpes = st.mpe.filter(m => m.d.dni === dni || (r0.correo && m.d.correo === r0.correo));
    $('docTitulo').innerHTML = '<i class="fas fa-user-tie"></i> ' + esc(r0.docente);
    const dato = (l, v, copia) => '<div class="al-dato"><span class="f-label">' + l + '</span><span>' + (esc(v) || '<span class="no-dato">—</span>') + '</span>' +
        (copia && v ? '<button class="cbtn" data-copia="' + esc(v) + '"><i class="fas fa-copy"></i></button>' : '') + '</div>';
    $('docCuerpo').innerHTML = '<div class="al-datos">' + dato('DNI', r0.d.dni, true) + dato('Correo', r0.correo, true) +
        dato('Vertical', r0.vertical) + dato('Contrato', r0.contrato) + dato('Línea', r0.linea) + dato('Secciones', String(secs.length)) +
        (mpes[0] ? dato('Teléfono', mpes[0].d.telefono, true) + dato('Monitor', mpes[0].s.monitor) : '') + '</div>' +
        '<div class="ef-ficha-secs tbl-scroll"><table class="dash-tbl"><thead><tr class="g1"><th>Sección</th><th>NRC</th><th>Ciclo</th><th>Sede</th><th>Modalidad</th><th>Día y hora</th><th>Periodo</th><th>MPE</th></tr></thead><tbody>' +
        secs.map(s => '<tr><td>' + esc(s.d.seccion) + '</td><td>' + esc(s.d.nrc) + '</td><td>' + esc(s.ciclo) + '</td><td>' + esc(s.sede) + '</td><td>' +
            esc(s.modalidad) + '</td><td>' + esc(s.dia) + ' ' + esc(s.d.horario) + '</td><td>' + esc(s.periodo) + '</td><td>' +
            (s.mpeFila ? '<span class="st ' + claseEstado(s.mpeFila.estado) + '">' + esc(s.mpeFila.estado) + '</span>' : '—') + '</td></tr>').join('') +
        '</tbody></table></div>' +
        (mpes.length ? '<p class="hint" style="margin-top:8px">Seguimiento MPE: ' + mpes.map(m => esc(m.d.seccion) + ' → ' + esc(m.estado) +
            (m.s.obs ? ' (' + esc(m.s.obs) + ')' : '')).join(' · ') + '</p>' : '');
    $('docCuerpo').querySelectorAll('[data-copia]').forEach(b => { b.onclick = () => copiar(b.dataset.copia, b.dataset.copia); });
    $('mdDoc').classList.add('open');
}
document.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => b.closest('.modal-bg').classList.remove('open'); });
$('mdDoc').addEventListener('click', ev => { if (ev.target === $('mdDoc')) $('mdDoc').classList.remove('open'); });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape') $('mdDoc').classList.remove('open'); });

/* ---------- acciones de la barra ---------- */
document.querySelectorAll('.ef-tab').forEach(b => { b.onclick = () => { st.tab = b.dataset.t; guardarLS('efsrt_tab', st.tab); pintar(); }; });
document.querySelectorAll('#vista .chip').forEach(b => {
    b.onclick = () => {
        st.vista = b.dataset.v;
        document.querySelectorAll('#vista .chip').forEach(x => x.classList.toggle('on', x === b));
        pintar();
    };
});
let qT = null;
$('q').addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(() => { st.q = $('q').value; pintar(); }, 150); });
$('btnClear').onclick = () => {
    Object.values(st.tab === 'sec' ? st.fSec : st.fMpe).forEach(s => s.clear());
    st.q = ''; $('q').value = ''; pintar();
};
$('btnMail').onclick = () => {
    const correos = st.tab === 'sec' ? filasSec().map(r => r.correo) : filasMpe().map(r => r.d.correo);
    const unicos = [...new Set(correos.filter(Boolean))];
    if (!unicos.length) return toast('No hay correos en el filtro');
    copiar(unicos.join('; '), unicos.length + ' correos');
};
$('btnXls').onclick = () => {
    let filas, nombre;
    if (st.tab === 'sec' && st.vista === 'docente') {
        nombre = 'EFSRT_docentes';
        filas = agruparDocentes(filasSec()).map(x => ({ DNI: x.dni, Docente: x.docente, Correo: x.correo, Vertical: x.vertical, Contrato: x.contrato,
            Secciones: x.secs.length, Detalle: x.secs.map(s => s.d.seccion + ' (NRC ' + s.d.nrc + ')').join(', '), Sedes: [...new Set(x.secs.map(s => s.sede))].join(', ') }));
    } else if (st.tab === 'sec') {
        nombre = 'EFSRT_secciones';
        filas = filasSec().map(r => ({ Carga: r.d.carga, Periodo: r.periodo, DNI: r.d.dni, Docente: r.docente, Correo: r.correo, Vertical: r.vertical,
            Línea: r.linea, Contrato: r.contrato, Curso: r.d.curso, Sección: r.d.seccion, Módulo: r.d.modulo, NRC: r.d.nrc, Ciclo: r.ciclo, Sede: r.sede,
            Modalidad: r.modalidad, Turno: r.turno, Día: r.dia, Horario: r.d.horario, 'Est. BBDD': r.d.est_bbdd, 'Est. portal': r.d.est_portal,
            'Rúbrica S8': r.d.rubrica, Status: r.s.status || '', MPE: r.mpeFila ? r.mpeFila.estado : '' }));
    } else {
        nombre = 'EFSRT_seguimiento_MPE';
        filas = filasMpe().map(r => ({ Carga: r.d.carga, Sección: r.d.seccion, NRC: r.d.nrc, Campus: r.d.campus, Días: r.d.dias, Horario: r.d.horario,
            Docente: r.d.docente, DNI: r.d.dni, Correo: r.d.correo, Teléfono: r.d.telefono, Jefe: r.jefe, Monitor: r.s.monitor || '',
            'Reporte estrella': r.d.nota_estrella, Verificación: r.s.verificacion || '', Estado: r.estado, Comunicado: r.s.comunicado || '',
            Respondió: r.s.respondio || '', Verificado: r.s.verificado || '', 'Actualizado en control': r.s.control || '', Observación: r.s.obs || '',
            'Editado por': r.por || '', 'Editado en': fechaHora(r.en) }));
    }
    if (!filas.length) return toast('No hay filas para descargar');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'Datos');
    XLSX.writeFile(wb, nombre + '_' + new Date().toISOString().slice(0, 10) + '.xlsx');
};

/* ---------- importar Excel ---------- */
const TIPOS = { seccion: 'docentes y secciones', mpe: 'seguimiento MPE', equipo: 'equipo académico', docente: 'base de docentes' };
$('btnImp').onclick = () => $('fileImp').click();
$('fileImp').onchange = async () => {
    const files = [...$('fileImp').files]; $('fileImp').value = '';
    if (!files.length) return;
    try {
        const datos = {};
        for (const f of files) Object.assign(datos, EfsrtParse.leer(XLSX.read(await f.arrayBuffer(), { cellDates: false })));
        const tipos = Object.keys(datos).filter(t => datos[t].length);
        if (!tipos.length) return setStatus('No encontré hojas de EFSRT en esos archivos (TODOS DOCENTES EFSRT, PROGRAMACIÓN MPE, EQUIPO ACADÉMICO o BASE DOCENTES V1).', 'err');
        const resumen = tipos.map(t => '• ' + TIPOS[t] + ': ' + datos[t].length + ' filas').join('\n');
        if (!confirm('Se actualizará en la base:\n' + resumen + '\n\nEl seguimiento ya editado (monitor, notas, SI/NO, observaciones) se conserva. ' +
            'Las filas que ya no estén en el Excel se quitan. ¿Continuar?')) return;
        setStatus('<i class="fas fa-spinner fa-spin"></i> Importando...', 'info');
        const res = [];
        for (const t of tipos) {
            const r = await rpc('efsrt_importar', { p_tipo: t, filas: datos[t], reemplazar: true });
            res.push(TIPOS[t] + ': ' + r.guardadas + ' filas' + (r.borradas ? ', ' + r.borradas + ' quitadas' : ''));
        }
        await cargar(true);
        setStatus('<i class="fas fa-check"></i> Importado — ' + esc(res.join(' · ')), 'info');
    } catch (e) {
        setStatus('No se pudo importar: ' + esc(e.message), 'err');
    }
};

/* ---------- edición manual: cambiar, agregar, eliminar ---------- */
const CAMPOS_EDIT = {
    seccion: [['docente', 'Docente (apellidos y nombres)', 1], ['dni', 'DNI', 1], ['correo', 'Correo'], ['contrato', 'Tipo de contrato'],
        ['linea', 'Línea', 0, ['COT', 'Otra línea']], ['seccion', 'Sección', 1], ['nrc', 'NRC', 1], ['carga', 'Carga (Ccl Lvo)'],
        ['periodo', 'Periodo'], ['curso', 'Curso'], ['modulo', 'Módulo'], ['ciclo', 'Ciclo', 0, CICLOS], ['sede', 'Sede'],
        ['modalidad', 'Modalidad', 0, ['PRESENCIAL', 'VIRTUAL']], ['turno', 'Turno', 0, ['M', 'T', 'N', 'D']],
        ['dias', 'Día', 0, ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO']], ['horario', 'Horario (ej. PRE 19:00-20:30)']],
    mpe: [['docente', 'Docente', 1], ['dni', 'DNI'], ['correo', 'Correo'], ['telefono', 'Teléfono (WhatsApp)'], ['seccion', 'Sección', 1],
        ['nrc', 'NRC', 1], ['carga', 'Carga (Ccl Lvo)'], ['campus', 'Campus'], ['dias', 'Días (ej. Lun Jue)'], ['horario', 'Horario (ej. 19:00-20:30)'],
        ['inscritos', 'Inscritos']]
};
const tipoTab = () => (st.tab === 'sec' ? 'seccion' : 'mpe');
const filaDe = (tipo, id) => (tipo === 'seccion' ? st.sec : st.mpe).find(r => r.id === id);
const marcaManual = r => (r.s.manual ? ' <span class="st st-out" title="Agregada a mano">nueva</span>'
    : r.s.d ? ' <span class="st st-mid" title="Datos cambiados a mano: ' + esc(Object.keys(r.s.d).join(', ')) + '">editado</span>' : '');
const acciones = r => (st.verBorradas
    ? '<button class="ef-ac" data-ac="restaurar" data-id="' + esc(r.id) + '" title="Restaurar"><i class="fas fa-rotate-left"></i></button>'
    : '<button class="ef-ac" data-ac="editar" data-id="' + esc(r.id) + '" title="Editar datos (p. ej. cambio de docente)"><i class="fas fa-pen"></i></button>' +
      '<button class="ef-ac del" data-ac="eliminar" data-id="' + esc(r.id) + '" title="Eliminar"><i class="fas fa-trash"></i></button>');

let editando = null;   // { tipo, fila | null }
function abrirEdicion(tipo, fila) {
    editando = { tipo, fila };
    $('edTitulo').innerHTML = '<i class="fas fa-pen"></i> ' + (fila ? 'Editar ' : 'Agregar ') + (tipo === 'seccion' ? 'sección' : 'seguimiento MPE');
    const d = fila ? fila.d : {};
    $('edCampos').innerHTML = CAMPOS_EDIT[tipo].map(([k, l, req, ops]) => {
        const v = d[k] ?? '';
        const cambiado = fila && fila.s.d && k in fila.s.d && txt(fila.orig[k]) !== txt(v);
        return '<label class="ef-campo"><span>' + esc(l) + (req ? ' *' : '') + (cambiado ? ' <em title="Valor del Excel">(Excel: ' + esc(fila.orig[k] || '—') + ')</em>' : '') + '</span>' +
            (ops ? '<select name="' + k + '"><option value=""></option>' + [...new Set(ops.concat(v ? [String(v)] : []))].map(o =>
                '<option' + (String(o) === String(v) ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select>'
                : '<input name="' + k + '" value="' + esc(v) + '"' + (req ? ' required' : '') + '>') + '</label>';
    }).join('');
    const docs = [...new Map(st.sec.map(r => [r.docente, r])).values()].sort((a, b) => cmp(a.docente, b.docente));
    $('dlDocentes').innerHTML = docs.map(r => '<option value="' + esc(r.docente) + '">').join('');
    const inDoc = $('edCampos').querySelector('[name="docente"]');
    inDoc.setAttribute('list', 'dlDocentes');
    // Al elegir un docente conocido se completan DNI, correo y contrato
    inDoc.addEventListener('change', () => {
        const r = docs.find(x => x.docente === inDoc.value); if (!r) return;
        const pon = (k, v) => { const el = $('edCampos').querySelector('[name="' + k + '"]'); if (el && v) el.value = v; };
        pon('dni', r.d.dni); pon('correo', r.correo); pon('contrato', r.contrato);
        const m = st.mpe.find(x => x.d.dni === r.d.dni); if (m) pon('telefono', m.d.telefono);
    });
    $('edReset').hidden = !(fila && fila.s.d && !fila.s.manual);
    $('mdEdit').classList.add('open');
    setTimeout(() => inDoc.focus(), 50);
}
$('frmEdit').onsubmit = async ev => {
    ev.preventDefault();
    const { tipo, fila } = editando;
    const vals = {};
    $('edCampos').querySelectorAll('[name]').forEach(el => { vals[el.name] = txt(el.value); });
    if (vals.inscritos !== undefined) vals.inscritos = vals.inscritos === '' ? null : Number(vals.inscritos);
    try {
        if (!fila) {
            await rpc('efsrt_agregar', { p_tipo: tipo, p_datos: vals, p_seg: {}, p_autor: autor() });
        } else if (fila.s.manual) {
            await rpc('efsrt_guardar', { p_tipo: tipo, p_id: fila.id, p_seg: { d: vals }, p_autor: autor() });
        } else {
            // solo se guardan como cambio manual los campos distintos al Excel
            const dif = {};
            Object.keys(vals).forEach(k => { if (txt(vals[k]) !== txt(fila.orig[k])) dif[k] = vals[k]; });
            await rpc('efsrt_guardar', { p_tipo: tipo, p_id: fila.id, p_seg: { d: Object.keys(dif).length ? dif : null }, p_autor: autor() });
        }
        $('mdEdit').classList.remove('open');
        toast(fila ? 'Cambios guardados' : 'Fila agregada');
        await cargar(true);
    } catch (e) { toast('No se guardó: ' + e.message); }
};
$('edReset').onclick = async () => {
    const { tipo, fila } = editando;
    if (!confirm('¿Volver a los datos originales del Excel?')) return;
    await rpc('efsrt_guardar', { p_tipo: tipo, p_id: fila.id, p_seg: { d: null }, p_autor: autor() });
    $('mdEdit').classList.remove('open');
    await cargar(true);
};
async function accion(tipo, ac, id) {
    const fila = filaDe(tipo, id); if (!fila) return;
    if (ac === 'editar') return abrirEdicion(tipo, fila);
    const nombre = fila.d.docente + ' · ' + fila.d.seccion + ' (NRC ' + fila.d.nrc + ')';
    if (ac === 'eliminar' && !confirm('¿Eliminar ' + nombre + '?\n\nSe podrá restaurar desde «Ver eliminadas».')) return;
    try {
        await rpc('efsrt_guardar', { p_tipo: tipo, p_id: id, p_seg: { borrado: ac === 'eliminar' ? true : null }, p_autor: autor() });
        toast(ac === 'eliminar' ? 'Eliminada' : 'Restaurada');
        await cargar(true);
    } catch (e) { toast('No se pudo: ' + e.message); }
}
['bSec', 'bMpe'].forEach(id => $(id).addEventListener('click', ev => {
    const b = ev.target.closest('.ef-ac'); if (!b) return;
    accion(id === 'bSec' ? 'seccion' : 'mpe', b.dataset.ac, b.dataset.id);
}));
document.querySelectorAll('[data-agregar]').forEach(b => { b.onclick = () => abrirEdicion(b.dataset.agregar, null); });
document.querySelectorAll('[data-borradas]').forEach(b => {
    b.onclick = async () => { st.verBorradas = !st.verBorradas; await cargar(true); };
});
function pintarBorradas() {
    document.querySelectorAll('[data-borradas]').forEach(b => {
        const n = st.borradas[b.dataset.borradas] || 0;
        b.classList.toggle('on', st.verBorradas);
        b.innerHTML = st.verBorradas ? '<i class="fas fa-arrow-left"></i> Volver a la lista' : '<i class="fas fa-trash-can"></i> Ver eliminadas <span class="n">' + n + '</span>';
    });
    document.querySelectorAll('[data-agregar]').forEach(b => { b.hidden = st.verBorradas; });
}

/* ---------- inicio ---------- */
$('autor').value = leerLS(AUTOR_KEY);
$('autor').addEventListener('input', () => { guardarLS(AUTOR_KEY, txt($('autor').value)); $('autor').parentElement.classList.remove('falta'); });
st.tab = leerLS('efsrt_tab') === 'mpe' ? 'mpe' : 'sec';
st.clave = leerLS(CLAVE_KEY);
const dl = document.createElement('datalist'); dl.id = 'dlVerif';
dl.innerHTML = ['20', '18', '16', '14', '13', 'SI INGRESÓ, SOLICITAR NOTA', 'NO HA INGRESADO AL CURSO'].map(v => '<option value="' + v + '">').join('');
document.body.appendChild(dl);
pintar();
if (st.clave) cargar(); else pedirClave();
// Al volver a la pestaña se traen los cambios de los demás (si no se está escribiendo)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && st.clave && !document.activeElement.matches('input, select')) cargar(true);
});
