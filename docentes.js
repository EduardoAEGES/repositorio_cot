// ==========================================================================
// BASE DE DATOS DOCENTES
// 1) Datos básicos (rápido): hojas publicadas de "DOCENTES CONTA 2026"
//    -> DOCENTES CONTA 2026-2, DOCENTES PLN 2026, Docentes Observados, Docentes Desvinculados
// 2) Después: horas asignadas/libres desde la carga horaria (misma fuente que Horarios)
// ==========================================================================

const PUB_KEY = '2PACX-1vSOAtzCK7kEKL_NaeHfOFczW4YswgOmLqxVT1B_luq6HAwg4pELhT3bB93ky3lqHw';
const CARGA_CSV = 'https://docs.google.com/spreadsheets/d/1kNqEDwXe5Iqj9m54E--_WEe2wKxjTschDLgYnXeBS7w/export?format=csv&gid=1470879596';
const CACHE_KEY = 'cot_docentes_db_v1';

// En DOCENTES PLN 2026 solo son activos los docentes hasta este (inclusive)
const ULTIMO_PLN_ACTIVO = 'VILCA ALCANTARA CESAR';

// Mismos filtros de periodo que Horarios (se comparte la selección guardada 'cot_modules')
const PERIODOS = [
    { id: 'junio1Check', label: 'JUNIO 1', p: ['JUN', 'JUNIO'], m: '1' },
    { id: 'junio2Check', label: 'JUNIO 2', p: ['JUN', 'JUNIO'], m: '2' },
    { id: 'agosto1Check', label: 'AGOSTO 1', p: ['AGO', 'AGOSTO'], m: '1' },
    { id: 'agosto2Check', label: 'AGOSTO 2', p: ['AGO', 'AGOSTO'], m: '2' },
    { id: 'setiembre1Check', label: 'SETIEMBRE 1', p: ['SET', 'SETIEMBRE', 'SEPTIEMBRE'], m: '1' },
    { id: 'setiembre2Check', label: 'SETIEMBRE 2', p: ['SET', 'SETIEMBRE', 'SEPTIEMBRE'], m: '2' },
    { id: 'octubre1Check', label: 'OCTUBRE 1', p: ['OCT', 'OCTUBRE'], m: '1' },
    { id: 'octubre2Check', label: 'OCTUBRE 2', p: ['OCT', 'OCTUBRE'], m: '2' }
];

const FILAS = [
    { key: 'conta', titulo: 'Docentes de Contabilidad 2026-2', icono: 'fa-calculator' },
    { key: 'pln', titulo: 'Docentes de Pensamiento Lógico 2026', icono: 'fa-brain' },
    { key: 'observado', titulo: 'Docentes Observados', icono: 'fa-triangle-exclamation' },
    { key: 'desvinculado', titulo: 'Docentes Desvinculados', icono: 'fa-user-slash' }
];

let DOCENTES = [];          // lista unificada
let CURSOS_POR_DNI = null;  // { dni: [{periodo, modulo, nrc, start, end, day}] }
let FILTRO = 'todos';
let periodosActivos = {};

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ utilidades
function norm(s) {
    return String(s == null ? '' : s).toUpperCase().normalize('NFD')
        .replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}
function limpiaDni(s) {
    return String(s == null ? '' : s).replace(/\D/g, '').replace(/^0+/, '');
}
function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Parser CSV con soporte de comillas y saltos de línea dentro de celdas
function parseCSV(text) {
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) {
            if (c === '"') {
                if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
            } else cell += c;
        } else if (c === '"') q = true;
        else if (c === ',') { row.push(cell); cell = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(cell); rows.push(row); row = []; cell = '';
        } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
}

// Tipo de contrato -> código + descripción
function contrato(tipo) {
    const t = norm(tipo).replace(/[\s.\-_]/g, '');
    if (!t) return { code: '—', desc: 'Sin dato', cls: 'c-otro' };
    if (t.includes('PTCIN')) return { code: 'PTC IN', desc: 'Tiempo completo - contrato indeterminado', cls: 'c-ptcin' };
    if (t.includes('TCXH') || t.includes('TCH') || t.includes('TCR') || t.includes('TCPH')) return { code: tipo.trim().toUpperCase(), desc: 'Tiempo completo por horas', cls: 'c-tch' };
    if (t.includes('PTC')) return { code: 'PTC', desc: 'Tiempo completo', cls: 'c-ptc' };
    if (t.includes('PTP')) return { code: 'PTP', desc: 'Tiempo parcial', cls: 'c-ptp' };
    if (t.includes('PPH')) return { code: 'PPH', desc: 'Docente por horas', cls: 'c-pph' };
    return { code: tipo.trim().toUpperCase(), desc: 'Otro tipo de contrato', cls: 'c-otro' };
}

function telLimpio(t) { return String(t || '').replace(/\D/g, ''); }

// ------------------------------------------------------------------ hojas publicadas
async function detectarHojas() {
    const r = await fetch(`https://docs.google.com/spreadsheets/d/e/${PUB_KEY}/pubhtml`);
    if (!r.ok) throw new Error('No se pudo leer el documento publicado');
    const t = await r.text();
    const hojas = [];
    const re = /name:\s*"([^"]*)"[\s\S]{0,400}?gid:\s*"(\d+)"/g;
    let m;
    while ((m = re.exec(t)) !== null) hojas.push({ name: m[1], gid: m[2] });
    return hojas;
}

async function csvHoja(gid) {
    const r = await fetch(`https://docs.google.com/spreadsheets/d/e/${PUB_KEY}/pub?gid=${gid}&single=true&output=csv&t=${Date.now()}`);
    if (!r.ok) throw new Error('No se pudo descargar la hoja ' + gid);
    return parseCSV(await r.text());
}

// Devuelve { headers (normalizados), filas } a partir de la fila que contiene DNI + APELLIDOS
function tabla(rows) {
    let h = -1;
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
        const n = rows[i].map(norm);
        if (n.includes('DNI') && n.some((x) => x.includes('APELLIDOS'))) { h = i; break; }
    }
    if (h < 0) return { headers: [], filas: [] };
    const headers = rows[h].map(norm);
    const filas = [];
    for (let i = h + 1; i < rows.length; i++) {
        const n = rows[i].map(norm);
        if (n.includes('DNI') && n.some((x) => x.includes('APELLIDOS'))) break; // otra tabla
        filas.push(rows[i]);
    }
    return { headers, filas };
}

function col(headers, ...preds) {
    for (const p of preds) {
        const i = headers.findIndex((h) => (typeof p === 'function' ? p(h) : h === p));
        if (i !== -1) return i;
    }
    return -1;
}
function cols(headers, pred) {
    const out = [];
    headers.forEach((h, i) => { if (pred(h)) out.push(i); });
    return out;
}
const val = (row, i) => (i >= 0 && row[i] != null ? String(row[i]).trim() : '');

function sedesDe(...vals) {
    const set = new Set();
    vals.forEach((v) => String(v || '').split(/[\/,;|]+/).forEach((s) => {
        const x = norm(s);
        if (x && x !== '-' && x !== '—') set.add(x);
    }));
    return [...set];
}

// ------------------------------------------------------------------ lectura por hoja
function leerConta(rows) {
    const { headers: H, filas } = tabla(rows);
    const iDni = col(H, 'DNI'), iNom = col(H, (h) => h.includes('APELLIDOS'));
    const iTel = col(H, (h) => h.startsWith('TELEFONO') || h.startsWith('CELULAR'));
    const iMail = col(H, (h) => h.startsWith('CORREO'));
    const iTipo = col(H, 'TIPO DE CONTRATO', (h) => h.includes('TIPO') && h.includes('CONTRATO'));
    const iHoras = col(H, (h) => h.includes('HORAS') && h.includes('CONTRATO'));
    const iSedeP = col(H, 'SEDE PRINCIPAL', (h) => h.startsWith('SEDE'));
    const iSedes = col(H, 'SEDES DISPONIBLES', (h) => h.includes('SEDES'));
    const iLibres = col(H, 'HORAS LIBRES');
    const iEvaldo = col(H, (h) => h.startsWith('EVALDO'));
    const iCom = col(H, (h) => h.startsWith('COMENTARIOS'));
    const iDisp = col(H, 'DISPONIBILIDAD');
    const iIngreso = col(H, (h) => h.startsWith('FECHA DE INGRESO'));
    return filas.map((r) => ({
        dni: val(r, iDni), nombre: val(r, iNom), telefono: val(r, iTel), correo: val(r, iMail),
        tipo: val(r, iTipo), horasContrato: parseFloat(val(r, iHoras).replace(',', '.')) || 0,
        sedePrincipal: norm(val(r, iSedeP)), sedes: sedesDe(val(r, iSedeP), val(r, iSedes)),
        horasLibresHoja: val(r, iLibres), evaldo: val(r, iEvaldo), comentario: val(r, iCom),
        disponibilidad: val(r, iDisp), ingreso: val(r, iIngreso)
    })).filter((d) => d.nombre && limpiaDni(d.dni));
}

function leerPln(rows) {
    const { headers: H, filas } = tabla(rows);
    const iDni = col(H, 'DNI'), iNom = col(H, (h) => h.includes('APELLIDOS'));
    const iSedes = cols(H, (h) => h === 'SEDE');
    const iTel = col(H, (h) => h.startsWith('CELULAR') || h.startsWith('TELEFONO'));
    const iMail = col(H, (h) => h.startsWith('CORREO'));
    const iProf = col(H, (h) => h.startsWith('PROFESION'));
    const iTipo = col(H, (h) => h.includes('TIPO') && h.includes('CONTRATO'));
    const iHoras = col(H, (h) => h.includes('HORAS') && h.includes('CONTRATO'));
    const iEvaldo = col(H, (h) => h.startsWith('EVALDO'));
    const iObs = col(H, (h) => h.startsWith('OBSERVACION'));
    const out = [];
    for (const r of filas) {
        const nombre = val(r, iNom);
        if (r.some((c) => norm(c) === 'DESVINCULADO')) continue;
        if (nombre && limpiaDni(val(r, iDni))) {
            const sedeP = norm(val(r, iSedes[0]));
            out.push({
                dni: val(r, iDni), nombre, telefono: val(r, iTel), correo: val(r, iMail),
                tipo: val(r, iTipo), horasContrato: parseFloat(val(r, iHoras).replace(',', '.')) || 0,
                sedePrincipal: sedesDe(sedeP)[0] || '', sedes: sedesDe(...iSedes.map((i) => val(r, i))),
                profesion: val(r, iProf), evaldo: val(r, iEvaldo), comentario: val(r, iObs)
            });
        }
        if (norm(nombre).includes(ULTIMO_PLN_ACTIVO)) break; // los siguientes ya no son activos
    }
    return out;
}

function leerSimple(rows) {
    const { headers: H, filas } = tabla(rows);
    const iDni = col(H, 'DNI'), iNom = col(H, (h) => h.includes('APELLIDOS'));
    const iTel = col(H, (h) => h.startsWith('TELEFONO') || h.startsWith('CELULAR'));
    const iMail = col(H, (h) => h.startsWith('CORREO'));
    const iTipo = col(H, (h) => h.includes('TIPO') && h.includes('CONTRATO'));
    const iArea = col(H, 'CONTA/PLN');
    const iObs = col(H, (h) => h.startsWith('OBSERVACION'));
    return filas.map((r) => ({
        dni: val(r, iDni), nombre: val(r, iNom), telefono: val(r, iTel), correo: val(r, iMail),
        tipo: val(r, iTipo), area: val(r, iArea), observacion: val(r, iObs)
    })).filter((d) => d.nombre && limpiaDni(d.dni));
}

// Une las cuatro listas en una sola por DNI
function unificar(conta, pln, obs, desv) {
    const map = new Map();
    const get = (d) => {
        const k = limpiaDni(d.dni);
        if (!map.has(k)) map.set(k, {
            dni: d.dni.trim(), nombre: d.nombre.trim().toUpperCase(), telefono: '', correo: '', tipo: '',
            horasContrato: 0, sedePrincipal: '', sedes: [], areas: [], estado: '', observacion: '', comentario: '',
            evaldo: '', profesion: '', disponibilidad: '', ingreso: '', horasLibresHoja: ''
        });
        return map.get(k);
    };
    const completar = (t, d) => {
        ['telefono', 'correo', 'tipo', 'sedePrincipal', 'evaldo', 'profesion', 'disponibilidad', 'ingreso', 'horasLibresHoja']
            .forEach((f) => { if (!t[f] && d[f]) t[f] = d[f]; });
        if (!t.horasContrato && d.horasContrato) t.horasContrato = d.horasContrato;
        if (d.sedes) d.sedes.forEach((s) => { if (!t.sedes.includes(s)) t.sedes.push(s); });
        if (d.comentario && !t.comentario.includes(d.comentario)) t.comentario = [t.comentario, d.comentario].filter(Boolean).join(' // ');
    };
    conta.forEach((d) => { const t = get(d); completar(t, d); if (!t.areas.includes('CONTA')) t.areas.push('CONTA'); t.estado = 'activo'; });
    pln.forEach((d) => { const t = get(d); completar(t, d); if (!t.areas.includes('PLN')) t.areas.push('PLN'); t.estado = 'activo'; });
    obs.forEach((d) => {
        const t = get(d); completar(t, d);
        t.observado = true; t.observacion = d.observacion || t.observacion;
        if (!t.estado) t.estado = 'observado';
    });
    desv.forEach((d) => {
        const t = get(d); completar(t, d);
        if (t.estado !== 'activo') { t.estado = 'desvinculado'; t.observacion = d.observacion || t.observacion; }
    });
    return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// ------------------------------------------------------------------ horas asignadas (Horarios)
function parseHorarios(diasStr, horasStr) {
    if (!diasStr || !horasStr) return [];
    let dias = [...diasStr.matchAll(/\((.*?)\)/g)].map((m) => norm(m[1]));
    if (!dias.length) dias = diasStr.includes('-') ? diasStr.split('-').map(norm) : [norm(diasStr)];
    let horas = [...horasStr.matchAll(/\((.*?)\)/g)].map((m) => m[1].trim());
    if (!horas.length) horas = [horasStr.trim()];
    const DIAS = { LUNES: 0, MARTES: 1, MIERCOLES: 2, JUEVES: 3, VIERNES: 4, SABADO: 5, DOMINGO: 6 };
    const out = [];
    dias.forEach((d, i) => {
        const h = horas[i] || horas[0];
        const m = h && h.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
        if (DIAS[d] === undefined || !m) return;
        out.push({ day: DIAS[d], start: +m[1] * 60 + +m[2], end: +m[3] * 60 + +m[4] });
    });
    return out;
}

async function cargarHoras() {
    $('estado-horas').innerHTML = '<span class="nf-spinner sm"></span> Calculando horas asignadas...';
    try {
        const r = await fetch(CARGA_CSV + '&t=' + Date.now());
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const rows = parseCSV(await r.text()).slice(1);
        const porDni = {};
        rows.forEach((row) => {
            const dni = limpiaDni(row[1]);
            if (!dni) return;
            const base = {
                periodo: norm(row[11]), modulo: String(row[6] || '').trim().toUpperCase(),
                nrc: String(row[7] || '').trim(), curso: String(row[4] || '').trim(), sede: String(row[3] || '').trim(),
                seccion: String(row[5] || '').trim(), carga: String(row[0] || '').trim(), modalidad: String(row[15] || '').trim()
            };
            parseHorarios(String(row[16] || ''), String(row[17] || '')).forEach((s) => {
                (porDni[dni] = porDni[dni] || []).push({ ...base, ...s });
            });
        });
        CURSOS_POR_DNI = porDni;
        $('estado-horas').textContent = '';
        render();
    } catch (e) {
        $('estado-horas').textContent = 'No se pudieron calcular las horas asignadas (' + e.message + ').';
    }
}

function cursoVisible(c) {
    const algun = PERIODOS.some((p) => periodosActivos[p.id]);
    if (!c.periodo && !c.modulo) return algun;
    return PERIODOS.some((p) => periodosActivos[p.id] && p.p.includes(c.periodo) && (c.modulo === p.m || c.modulo === 'REGULAR'));
}

// Horas académicas (45 min) por semana, igual que "Prog" en Horarios
function horasAsignadas(d) {
    if (!CURSOS_POR_DNI) return null;
    const lista = CURSOS_POR_DNI[limpiaDni(d.dni)] || [];
    const vistos = new Set();
    let min = 0;
    const cursos = new Map(); // un curso por periodo + NRC + sección
    lista.forEach((c) => {
        if (!cursoVisible(c)) return;
        const k = `${c.nrc}-${c.start}-${c.day}`;
        if (vistos.has(k)) return;
        vistos.add(k);
        if (c.end > c.start) min += c.end - c.start;
        const per = etiquetaPeriodo(c);
        const ck = `${per}|${c.nrc}|${c.seccion}|${c.curso}`;
        if (!cursos.has(ck)) cursos.set(ck, { ...c, periodoLabel: per, horarios: [] });
        cursos.get(ck).horarios.push(c);
    });
    return { horas: Math.round((min / 45) * 10) / 10, cursos: [...cursos.values()] };
}

// "AGOSTO 1", "OCTUBRE 2", "AGOSTO REGULAR"...
function etiquetaPeriodo(c) {
    const p = PERIODOS.find((x) => x.p.includes(c.periodo) && x.m === c.modulo);
    if (p) return p.label;
    const mes = PERIODOS.find((x) => x.p.includes(c.periodo));
    if (mes) return mes.label.replace(/\s\d$/, '') + (c.modulo ? ' ' + c.modulo : '');
    return [c.periodo, c.modulo].filter(Boolean).join(' ') || 'SIN PERIODO';
}

// Enlace al aula virtual: shortname "SECCION|NRC CARGA" (igual que en Horarios)
function enlaceClase(c) {
    const short = c.seccion && c.nrc ? `${c.seccion}|${c.nrc}${c.carga ? ' ' + c.carga : ''}` : '';
    return short
        ? `https://campusdigital.certus.edu.pe/course/view.php?name=${encodeURIComponent(short)}`
        : 'https://campusdigital.certus.edu.pe/course/search.php';
}

const NOMBRE_DIA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function cursosHtml(cursos) {
    if (!cursos.length) return '';
    const orden = PERIODOS.map((p) => p.label);
    const grupos = {};
    cursos.forEach((c) => { (grupos[c.periodoLabel] = grupos[c.periodoLabel] || []).push(c); });
    const claves = Object.keys(grupos).sort((a, b) => {
        const ia = orden.indexOf(a), ib = orden.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
    return `<div class="nf-cursos">${claves.map((k) => `
        <div class="nf-periodo-grupo">
            <h4>${esc(k)} · ${grupos[k].length} curso(s)</h4>
            ${grupos[k].map((c) => {
                const hor = c.horarios.slice().sort((a, b) => a.day - b.day || a.start - b.start)
                    .map((h) => `${NOMBRE_DIA[h.day]} ${hhmm(h.start)}-${hhmm(h.end)}`).join(' · ');
                return `<div class="nf-curso">
                    <div>
                        <b>${esc(c.curso || 'Curso')}</b>
                        <small>NRC ${esc(c.nrc || '—')} · Sec. ${esc(c.seccion || '—')} · ${esc(c.sede || '—')}${c.modalidad ? ' · ' + esc(c.modalidad) : ''}</small><br>
                        <small>${esc(hor)}</small>
                    </div>
                    <a class="nf-clase" href="${enlaceClase(c)}"  rel="noopener"><i class="fas fa-arrow-up-right-from-square"></i> Entrar a la clase</a>
                </div>`;
            }).join('')}
        </div>`).join('')}</div>`;
}

// ------------------------------------------------------------------ render
function iniciales(nombre) {
    const p = nombre.split(' ').filter(Boolean);
    return ((p[0] || '')[0] || '') + ((p[2] || p[1] || '')[0] || '');
}
const GRADS = [
    ['#e50914', '#831010'], ['#7b2ff7', '#2d0b6b'], ['#00a8e1', '#063a5c'], ['#f59e0b', '#7c2d12'],
    ['#10b981', '#064e3b'], ['#ec4899', '#701a3e'], ['#6366f1', '#1e1b4b'], ['#14b8a6', '#134e4a']
];
function grad(dni) {
    const g = GRADS[(parseInt(limpiaDni(dni).slice(-3), 10) || 0) % GRADS.length];
    return `linear-gradient(135deg, ${g[0]}, ${g[1]})`;
}

function enFiltro(d, f) {
    if (f === 'todos') return true;
    if (f === 'conta') return d.estado === 'activo' && d.areas.includes('CONTA');
    if (f === 'pln') return d.estado === 'activo' && d.areas.includes('PLN');
    if (f === 'observado') return !!d.observado;
    if (f === 'desvinculado') return d.estado === 'desvinculado';
    return true;
}

function coincide(d, q) {
    if (!q) return true;
    const nq = norm(q);
    const dq = limpiaDni(q);
    if (dq && /^\d+$/.test(q.trim())) return limpiaDni(d.dni).includes(dq);
    return nq.split(' ').every((w) => norm(d.nombre).includes(w));
}

function horasHtml(d, compacto) {
    const a = horasAsignadas(d);
    if (!a) return `<div class="nf-hours loading"><span class="nf-spinner sm"></span> horas...</div>`;
    const c = d.horasContrato;
    const libres = c ? Math.max(0, Math.round((c - a.horas) * 10) / 10) : null;
    const pct = c ? Math.min(100, (a.horas / c) * 100) : 0;
    const cls = !c ? '' : a.horas > c * 1.05 ? 'over' : a.horas >= c * 0.9 ? 'ok' : 'under';
    if (compacto) {
        return `<div class="nf-hours"><div class="nf-bar ${cls}"><i style="width:${pct}%"></i></div>
            <span>${a.horas} h asig.${libres != null ? ` · ${libres} h libres` : ''}</span></div>`;
    }
    return { a, libres, pct, cls };
}

function tarjeta(d) {
    const c = contrato(d.tipo);
    const badges = [];
    if (d.areas.includes('CONTA')) badges.push('<span class="nf-tag t-conta">CONTA</span>');
    if (d.areas.includes('PLN')) badges.push('<span class="nf-tag t-pln">PLN</span>');
    if (d.observado) badges.push('<span class="nf-tag t-obs">OBSERVADO</span>');
    if (d.estado === 'desvinculado') badges.push('<span class="nf-tag t-desv">DESVINCULADO</span>');
    return `<button class="nf-card" data-dni="${esc(limpiaDni(d.dni))}">
        <div class="nf-poster" style="background:${grad(d.dni)}">
            <span class="nf-initials">${esc(iniciales(d.nombre))}</span>
            <span class="nf-contract ${c.cls}" title="${esc(c.desc)}">${esc(c.code)}</span>
        </div>
        <div class="nf-card-body">
            <div class="nf-card-name">${esc(d.nombre)}</div>
            <div class="nf-card-meta">DNI ${esc(d.dni)} · ${esc(d.sedePrincipal || '—')}</div>
            <div class="nf-tags">${badges.join('')}</div>
            ${d.estado === 'activo' ? horasHtml(d, true) : ''}
        </div>
    </button>`;
}

function render() {
    const q = $('buscar').value.trim();
    const visibles = DOCENTES.filter((d) => coincide(d, q));
    const cont = $('filas');
    const filas = FILAS.filter((f) => FILTRO === 'todos' || FILTRO === f.key);
    cont.innerHTML = filas.map((f) => {
        const items = visibles.filter((d) => enFiltro(d, f.key));
        if (q && !items.length && FILTRO === 'todos') return ''; // al buscar se ocultan las filas vacías
        return `<section class="nf-row">
            <h2><i class="fas ${f.icono}"></i> ${f.titulo} <span>${items.length}</span></h2>
            <div class="nf-row-wrap">
                <button class="nf-arrow left" aria-label="Anterior"><i class="fas fa-chevron-left"></i></button>
                <div class="nf-track">${items.length ? items.map(tarjeta).join('') : '<div class="nf-empty">Sin resultados</div>'}</div>
                <button class="nf-arrow right" aria-label="Siguiente"><i class="fas fa-chevron-right"></i></button>
            </div>
        </section>`;
    }).join('') || '<div class="nf-empty nf-empty-all">No se encontraron docentes con esa búsqueda.</div>';
    renderStats();
}

function renderStats() {
    const n = (f) => DOCENTES.filter((d) => enFiltro(d, f)).length;
    $('stats').innerHTML = [
        ['conta', 'Contabilidad', 'fa-calculator'], ['pln', 'Pensamiento Lógico', 'fa-brain'],
        ['observado', 'Observados', 'fa-triangle-exclamation'], ['desvinculado', 'Desvinculados', 'fa-user-slash']
    ].map(([f, t, i]) => `<div class="nf-stat"><i class="fas ${i}"></i><b>${n(f)}</b><span>${t}</span></div>`).join('');
}

function sugerir() {
    const q = $('buscar').value.trim();
    const box = $('sugerencias');
    if (!q) { box.hidden = true; return; }
    const res = DOCENTES.filter((d) => coincide(d, q)).slice(0, 8);
    box.innerHTML = res.length ? res.map((d) => {
        const c = contrato(d.tipo);
        const area = d.estado === 'desvinculado' ? 'DESVINCULADO' : d.areas.join(' / ') || (d.observado ? 'OBSERVADO' : '');
        return `<button class="nf-suggest-item" data-dni="${esc(limpiaDni(d.dni))}">
            <span class="nf-avatar" style="background:${grad(d.dni)}">${esc(iniciales(d.nombre))}</span>
            <span class="nf-suggest-text"><b>${esc(d.nombre)}</b><small>DNI ${esc(d.dni)} · ${esc(c.code)} · ${esc(d.sedePrincipal || '—')}</small></span>
            <span class="nf-tag ${d.estado === 'desvinculado' ? 't-desv' : d.observado ? 't-obs' : 't-conta'}">${esc(area)}</span>
        </button>`;
    }).join('') : '<div class="nf-suggest-empty">No se encontraron docentes</div>';
    box.hidden = false;
}

// Casilla de dato con botón para copiar (copia: texto plano; valor: HTML a mostrar)
function dato(icono, etiqueta, valor, copia) {
    const txt = copia != null ? copia : String(valor || '').replace(/<[^>]*>/g, '');
    return `<div class="nf-dato"><i class="fas ${icono}"></i><div><small>${etiqueta}</small><span>${valor || '—'}</span></div>
        ${txt ? `<button class="nf-copy" data-copy="${esc(txt)}" title="Copiar"><i class="far fa-copy"></i></button>` : ''}</div>`;
}

async function copiar(btn) {
    const t = btn.dataset.copy;
    try {
        await navigator.clipboard.writeText(t);
    } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = t; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch (e2) { /* sin portapapeles */ }
        ta.remove();
    }
    btn.classList.add('ok');
    btn.innerHTML = '<i class="fas fa-check"></i>';
    setTimeout(() => { btn.classList.remove('ok'); btn.innerHTML = '<i class="far fa-copy"></i>'; }, 1200);
}

function abrir(dni) {
    const d = DOCENTES.find((x) => limpiaDni(x.dni) === dni);
    if (!d) return;
    const c = contrato(d.tipo);
    const tel = telLimpio(d.telefono);
    const h = d.estado === 'activo' ? horasHtml(d, false) : null;
    let horasBlock = '';
    if (d.estado === 'activo') {
        if (!h || typeof h === 'string') {
            horasBlock = '<div class="nf-hours-big loading"><span class="nf-spinner sm"></span> Calculando horas asignadas...</div>';
        } else {
            const per = PERIODOS.filter((p) => periodosActivos[p.id]).map((p) => p.label).join(', ') || 'ningún periodo';
            horasBlock = `<div class="nf-hours-big">
                <div class="nf-kpi"><small>Horas según contrato</small><b>${d.horasContrato || '—'}</b></div>
                <div class="nf-kpi"><small>Horas asignadas</small><b>${h.a.horas}</b></div>
                <div class="nf-kpi"><small>Horas libres</small><b>${h.libres != null ? h.libres : '—'}</b></div>
                <div class="nf-bar big ${h.cls}"><i style="width:${h.pct}%"></i></div>
                <p class="nf-note">Según Horarios (${esc(per)}).${d.horasLibresHoja ? ` Horas libres en el Excel: ${esc(d.horasLibresHoja)}.` : ''}</p>
                ${cursosHtml(h.a.cursos)}
            </div>`;
        }
    }
    $('modal-contenido').innerHTML = `
        <div class="nf-modal-hero" style="background:${grad(d.dni)}">
            <span class="nf-initials big">${esc(iniciales(d.nombre))}</span>
            <div>
                <h2>${esc(d.nombre)}</h2>
                <div class="nf-tags">
                    ${d.areas.map((a) => `<span class="nf-tag ${a === 'PLN' ? 't-pln' : 't-conta'}">${a === 'PLN' ? 'PENSAMIENTO LÓGICO' : 'CONTABILIDAD'}</span>`).join('')}
                    ${d.observado ? '<span class="nf-tag t-obs">OBSERVADO</span>' : ''}
                    ${d.estado === 'desvinculado' ? '<span class="nf-tag t-desv">DESVINCULADO</span>' : ''}
                </div>
            </div>
        </div>
        <div class="nf-modal-body">
            <div class="nf-datos">
                ${dato('fa-user', 'Apellidos y nombres', esc(d.nombre), d.nombre)}
                ${dato('fa-id-card', 'DNI', esc(d.dni), d.dni)}
                ${dato('fa-phone', 'Teléfono', tel ? `<a href="tel:${tel}">${esc(d.telefono)}</a> · <a href="https://wa.me/51${tel.slice(-9)}"  rel="noopener">WhatsApp</a>` : '', d.telefono)}
                ${dato('fa-envelope', 'Correo', d.correo ? `<a href="mailto:${esc(d.correo.toLowerCase())}">${esc(d.correo.toLowerCase())}</a>` : '', d.correo.toLowerCase())}
                ${dato('fa-file-signature', 'Tipo de contrato', `<span class="nf-contract inline ${c.cls}">${esc(c.code)}</span> ${esc(c.desc)}`, `${c.code} - ${c.desc}`)}
                ${dato('fa-location-dot', 'Sede principal', esc(d.sedePrincipal), d.sedePrincipal)}
                ${dato('fa-map', 'Sedes disponibles', esc(d.sedes.join(' / ')), d.sedes.join(' / '))}
                ${d.profesion ? dato('fa-graduation-cap', 'Profesión', esc(d.profesion), d.profesion) : ''}
                ${d.evaldo ? dato('fa-star', 'EVALDO', esc(d.evaldo), d.evaldo) : ''}
                ${d.disponibilidad ? dato('fa-calendar-check', 'Disponibilidad', esc(d.disponibilidad), d.disponibilidad) : ''}
                ${d.ingreso ? dato('fa-calendar-plus', 'Fecha de ingreso', esc(d.ingreso), d.ingreso) : ''}
            </div>
            ${horasBlock}
            ${d.observacion ? `<div class="nf-alert"><i class="fas fa-triangle-exclamation"></i> ${esc(d.observacion)}</div>` : ''}
            ${d.comentario ? `<div class="nf-comment"><small>Comentarios</small>${esc(d.comentario)}</div>` : ''}
        </div>`;
    $('modal').hidden = false;
    document.body.classList.add('nf-lock');
}

function cerrar() {
    $('modal').hidden = true;
    document.body.classList.remove('nf-lock');
}

// ------------------------------------------------------------------ periodos
function cargarPeriodos() {
    const def = { junio2Check: true, agosto1Check: true };
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('cot_modules')); } catch (e) { /* sin almacenamiento */ }
    PERIODOS.forEach((p) => {
        periodosActivos[p.id] = saved && typeof saved === 'object' ? saved[p.id] === true : !!def[p.id];
    });
    pintarPeriodos();
}
function pintarPeriodos() {
    $('periodos').innerHTML = PERIODOS.map((p) =>
        `<button class="nf-chip sm ${periodosActivos[p.id] ? 'on' : ''}" data-p="${p.id}">${p.label}</button>`).join('');
}

// ------------------------------------------------------------------ carga
async function cargarBasicos() {
    // 1. Mostrar al instante lo último guardado en este navegador
    try {
        const c = JSON.parse(localStorage.getItem(CACHE_KEY));
        if (c && Array.isArray(c.docentes) && c.docentes.length) {
            DOCENTES = c.docentes;
            render();
            $('estado').innerHTML = '<span class="nf-spinner sm"></span> Actualizando datos...';
        }
    } catch (e) { /* sin caché */ }

    // 2. Descargar las cuatro hojas en paralelo
    try {
        const hojas = await detectarHojas();
        const buscar = (re) => hojas.find((h) => re.test(norm(h.name)));
        const hConta = buscar(/CONTA.*2026-2/) || buscar(/DOCENTES CONTA/);
        const hPln = buscar(/PLN.*2026/) || buscar(/DOCENTES PLN/);
        const hObs = buscar(/OBSERVADO/);
        const hDesv = buscar(/DESVINCULADO/);
        if (!hConta && !hPln) throw new Error('No se encontraron las hojas DOCENTES CONTA 2026-2 / DOCENTES PLN 2026');
        const leer = (h, fn) => (h ? csvHoja(h.gid).then(fn).catch(() => []) : Promise.resolve([]));
        const [conta, pln, obs, desv] = await Promise.all([
            leer(hConta, leerConta), leer(hPln, leerPln), leer(hObs, leerSimple), leer(hDesv, leerSimple)
        ]);
        DOCENTES = unificar(conta, pln, obs, desv);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), docentes: DOCENTES })); } catch (e) { /* lleno */ }
        $('estado').textContent = `${DOCENTES.length} docentes · actualizado ${new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`;
        render();
    } catch (e) {
        $('estado').textContent = DOCENTES.length
            ? 'Mostrando datos guardados. No se pudo actualizar: ' + e.message
            : 'No se pudieron cargar los docentes: ' + e.message;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    cargarPeriodos();

    $('buscar').addEventListener('input', () => { sugerir(); render(); });
    $('buscar').addEventListener('focus', sugerir);
    document.addEventListener('click', (e) => {
        const cp = e.target.closest('.nf-copy');
        if (cp) { copiar(cp); return; }
        const item = e.target.closest('[data-dni]');
        if (item) { $('sugerencias').hidden = true; abrir(item.dataset.dni); return; }
        if (!e.target.closest('.nf-search-wrap')) $('sugerencias').hidden = true;

        const chip = e.target.closest('#filtros .nf-chip');
        if (chip) {
            FILTRO = chip.dataset.f;
            document.querySelectorAll('#filtros .nf-chip').forEach((b) => b.classList.toggle('on', b === chip));
            render();
        }
        const per = e.target.closest('#periodos .nf-chip');
        if (per) {
            periodosActivos[per.dataset.p] = !periodosActivos[per.dataset.p];
            pintarPeriodos();
            render();
        }
        const arrow = e.target.closest('.nf-arrow');
        if (arrow) {
            const track = arrow.parentElement.querySelector('.nf-track');
            track.scrollBy({ left: (arrow.classList.contains('left') ? -1 : 1) * track.clientWidth * 0.85, behavior: 'smooth' });
        }
        if (e.target === $('modal') || e.target.closest('#modal-cerrar')) cerrar();
    });
    $('buscar').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const first = $('sugerencias').querySelector('[data-dni]');
            if (first) { $('sugerencias').hidden = true; abrir(first.dataset.dni); }
        }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { cerrar(); $('sugerencias').hidden = true; } });

    // Primero los datos básicos; luego, las horas asignadas
    cargarBasicos().then(cargarHoras);
});
