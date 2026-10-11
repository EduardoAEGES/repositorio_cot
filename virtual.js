// ==========================================================================
// SEGUIMIENTO VIRTUAL — interfaz (mismo esquema que EVALDO)
// - Todos: ven los resultados publicados (datos/virtual.bin, cifrado con la
//   contraseña del equipo): hora de ingreso del docente y cámara por clase.
// - Modo master: maneja el agente local (tools/virtual_agente.py, puerto 8766)
//   que entra a Campus Digital, audita un día y publica los resultados.
// ==========================================================================

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('es-PE');
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const AGENTE = location.port === '8766' ? location.origin : 'http://127.0.0.1:8766';
const DATOS_EQUIPO = 'datos/virtual.bin';
const CLAVE_KEY = 'virtual_clave_equipo';
const CLAVES_PREVIAS = [CLAVE_KEY, 'evaldo_clave_equipo'];   // misma contraseña del equipo que EVALDO
const MASTER_KEY = 'virtual_master';
const CLAVE_MASTER = 'CONTA';
const MAX_FILAS = 800;
const TURNOS = { M: 'Mañana', T: 'Tarde', N: 'Noche', D: 'Diurno' };
const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const romano = (c) => { const i = ROMANOS.indexOf(c); return i < 0 ? 99 : i; };
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const st = {
    filas: new Map(),          // fecha|carga|nrc -> fila
    vista: 'clases',
    filtros: { programa: new Set(), fecha: new Set(), periodo: new Set(), ciclo: new Set(), turno: new Set(), sede: new Set(), ingreso: new Set(), camara: new Set(), permanencia: new Set() },
    texto: '',
    bufEquipo: null, equipo: null,
    agente: null, nlog: 0, timer: null, claveAccion: null,
    periodosAudit: new Set(), periodosCargados: false, excluidos: []
};

// ------------------------------------------------------------ utilidades
const fechaLarga = (f) => {
    const d = new Date(f + 'T12:00:00');
    return isNaN(d) ? f : `${DIAS[d.getDay()]} ${d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
};
const fechaCorta = (f) => {
    const d = new Date(f + 'T12:00:00');
    return isNaN(d) ? f : `${DIAS[d.getDay()].slice(0, 3)} ${d.getDate()}/${d.getMonth() + 1}`;
};
const clsIngreso = (e) => ({ PUNTUAL: 'ok', TARDE: 'warn', 'SIN INGRESO': 'bad' }[e] || 'pend');
// SIN ACTIVIDAD = nadie entró a la sala ese día (probablemente no tocaba clase): no cuenta como alerta.
const clsCamara = (e) => ({ 'CAMARA OK': 'ok', 'CAMARA TARDIA': 'warn', 'SIN CAMARA': 'bad' }[e] || 'pend');
const txtCamara = (e) => ({ 'CAMARA OK': 'Cámara OK', 'CAMARA TARDIA': 'Cámara tardía', 'SIN CAMARA': 'Sin cámara', 'SIN GRABACION': 'Sin grabación', 'NO EVALUADO': 'No evaluado' }[e] || e || '—');
const txtIngreso = (e) => ({ PUNTUAL: 'Puntual', TARDE: 'Tarde', 'SIN INGRESO': 'Sin ingreso', 'SIN ACTIVIDAD': 'Sin actividad', 'AULA NO ENCONTRADA': 'Aula no encontrada', ERROR: 'Error' }[e] || e || '—');
const clsPerm = (e) => ({ OK: 'ok', ALARMA: 'bad' }[e] || 'pend');
const txtPerm = (e) => ({ OK: 'OK', ALARMA: 'Alarma', PENDIENTE: 'Pendiente', 'SIN ACTIVIDAD': 'Sin actividad', 'NO EVALUADO': 'No evaluado' }[e] || e || '—');
// Permanencia = minutos grabados ese día vs. horas de la sesión × 45 ("Duró 83 de 90 min (faltan 7)").
const detallePerm = (f) => f.estPermanencia === 'OK' || f.estPermanencia === 'ALARMA'
    ? (f.grabado ? `Duró ${f.grabado} de ${f.esperado} min${f.faltan ? ` (faltan ${f.faltan})` : ''}` : `Sin grabación (${f.esperado} min esperados)`)
    : f.esperado ? `${f.esperado} min esperados` : '';
const esAlerta = (f) => ['TARDE', 'SIN INGRESO'].includes(f.estIngreso) || ['CAMARA TARDIA', 'SIN CAMARA'].includes(f.estCamara)
    || f.estPermanencia === 'ALARMA';

function estado(msg, error) {
    const el = $('estado');
    el.className = 'nf-status' + (error ? ' err' : '');
    el.innerHTML = msg ? (error ? '<i class="fas fa-circle-exclamation"></i> ' : '') + msg : '';
}

function agregar(filas, origen) {
    for (const f of filas || []) {
        const k = `${f.fecha}|${f.carga}|${f.nrc}`;
        const previa = st.filas.get(k);
        if (previa && (previa.auditado || '') > (f.auditado || '')) continue;   // gana la auditoría más nueva
        st.filas.set(k, Object.assign({}, f, { _origen: origen }));
    }
}

// ------------------------------------------------------------ datos del equipo (cifrados)
// datos/virtual.bin = "VIR1" + iteraciones(4) + sal(16) + iv(12) + AES-GCM(gzip(json)); lo genera virtual_agente.py
async function descifrar(buf, clave) {
    if (new TextDecoder().decode(new Uint8Array(buf, 0, 4)) !== 'VIR1') throw new Error('formato desconocido');
    const iteraciones = new DataView(buf).getUint32(4);
    const sal = new Uint8Array(buf, 8, 16), iv = new Uint8Array(buf, 24, 12), cifrado = new Uint8Array(buf, 36);
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveKey']);
    const llave = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sal, iterations: iteraciones, hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, llave, cifrado);
    return JSON.parse(await new Response(new Blob([plano]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
}

async function cargarEquipo() {
    if (!window.crypto || !crypto.subtle || typeof DecompressionStream === 'undefined') {
        estado('Este navegador no puede abrir los datos cifrados. Usa Chrome, Edge o Brave actualizados.', true);
        return;
    }
    try {
        const r = await fetch(`${DATOS_EQUIPO}?t=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok) { estado(esMaster() ? '' : 'Aún no hay resultados publicados por el equipo.'); return; }
        st.bufEquipo = await r.arrayBuffer();
    } catch (e) { estado('No se pudieron leer los resultados publicados.', true); return; }
    for (const k of CLAVES_PREVIAS) {
        let c = null;
        try { c = localStorage.getItem(k); } catch (e) { /* sin almacenamiento */ }
        if (c && await aplicarEquipo(c)) return;
    }
    pedirClave('ver');
}

async function aplicarEquipo(clave) {
    let datos;
    try { datos = await descifrar(st.bufEquipo, clave); } catch (e) { return false; }
    try { localStorage.setItem(CLAVE_KEY, clave); } catch (e) { /* sin almacenamiento */ }
    agregar(datos.filas, 'equipo');
    st.equipo = { generado: datos.generado, n: (datos.filas || []).length };
    pintarTodo();
    return true;
}

function pedirClave(accion) {
    st.claveAccion = accion;
    $('claveError').textContent = '';
    $('claveInput').value = '';
    $('claveSub').textContent = accion === 'publicar'
        ? 'Contraseña del equipo con la que se cifrarán los resultados (la misma que usa el equipo para verlos).'
        : 'Escribe la contraseña del equipo para ver los resultados publicados. Se recuerda en este navegador.';
    $('claveBtnTxt').textContent = accion === 'publicar' ? 'Publicar' : 'Ver datos';
    $('modalClave').hidden = false;
    document.body.classList.add('nf-lock');
    setTimeout(() => $('claveInput').focus(), 50);
}
function cerrarClave() {
    $('modalClave').hidden = true;
    document.body.classList.remove('nf-lock');
}
async function enviarClave(ev) {
    ev.preventDefault();
    const clave = $('claveInput').value;
    if (st.claveAccion === 'publicar') {
        // Si ya hay datos publicados, la clave debe ser la misma: si no, el equipo dejaría de poder verlos.
        if (st.bufEquipo && !(await descifrar(st.bufEquipo, clave).then(() => true, () => false))) {
            $('claveError').textContent = 'No coincide con la contraseña de los datos ya publicados.';
            return;
        }
        try { localStorage.setItem(CLAVE_KEY, clave); } catch (e) { /* sin almacenamiento */ }
        cerrarClave();
        publicar(clave);
        return;
    }
    if (!(await aplicarEquipo(clave))) { $('claveError').textContent = 'Contraseña incorrecta.'; return; }
    cerrarClave();
}

// ------------------------------------------------------------ filtros y vistas
const CAMPOS = {
    programa: { el: 'fPrograma', val: (f) => f.area || '—' },
    fecha: { el: 'fFecha', val: (f) => f.fecha, txt: fechaCorta, orden: (a, b) => b.localeCompare(a) },
    periodo: { el: 'fPeriodo', val: (f) => `${f.periodo || ''} ${f.modulo || ''}`.trim() || '—' },
    ciclo: { el: 'fCiclo', val: (f) => f.ciclo || '—', orden: (a, b) => romano(a) - romano(b) },
    turno: { el: 'fTurno', val: (f) => f.turno || '—', txt: (v) => TURNOS[v] || v },
    sede: { el: 'fSede', val: (f) => f.sede || '—' },
    ingreso: { el: 'fIngreso', val: (f) => f.estIngreso || '—', txt: txtIngreso },
    camara: { el: 'fCamara', val: (f) => f.estCamara || '—', txt: txtCamara },
    permanencia: { el: 'fPermanencia', val: (f) => f.estPermanencia || '—', txt: txtPerm }
};

function pasa(f, salvo) {
    for (const [k, c] of Object.entries(CAMPOS)) {
        if (k === salvo) continue;
        const sel = st.filtros[k];
        if (sel.size && !sel.has(c.val(f))) return false;
    }
    if (st.texto) {
        const t = `${f.docente} ${f.curso} ${f.seccion} ${f.nrc}`.toUpperCase();
        if (!st.texto.split(/\s+/).every((p) => t.includes(p))) return false;
    }
    return true;
}
const filtradas = () => [...st.filas.values()].filter((f) => pasa(f));

function pintarChips() {
    const todas = [...st.filas.values()];
    for (const [k, c] of Object.entries(CAMPOS)) {
        const cuenta = new Map();
        for (const f of todas) if (pasa(f, k)) cuenta.set(c.val(f), (cuenta.get(c.val(f)) || 0) + 1);
        for (const v of st.filtros[k]) if (!cuenta.has(v)) cuenta.set(v, 0);
        const vals = [...cuenta.keys()].sort(c.orden || ((a, b) => String(a).localeCompare(String(b))));
        $(c.el).innerHTML = vals.map((v) => `<button class="nf-chip${st.filtros[k].has(v) ? ' on' : ''}" data-campo="${k}" data-val="${esc(v)}">${esc(c.txt ? c.txt(v) : v)} <small>${fmt(cuenta.get(v))}</small></button>`).join('')
            || '<span class="ev-muted">—</span>';
    }
}

function pintarStats(filas) {
    filas = filas.filter((f) => f.estIngreso !== 'SIN ACTIVIDAD');
    $('cTot').textContent = fmt(filas.length);
    $('cPun').textContent = fmt(filas.filter((f) => f.estIngreso === 'PUNTUAL').length);
    $('cTar').textContent = fmt(filas.filter((f) => f.estIngreso === 'TARDE').length);
    $('cSin').textContent = fmt(filas.filter((f) => f.estIngreso === 'SIN INGRESO').length);
    $('cPerm').textContent = fmt(filas.filter((f) => f.estPermanencia === 'ALARMA').length);
    $('cCam').textContent = fmt(filas.filter((f) => ['CAMARA TARDIA', 'SIN CAMARA'].includes(f.estCamara)).length);
}

const badge = (cls, txt, title) => `<span class="vr-est ${cls}"${title ? ` title="${esc(title)}"` : ''}>${esc(txt)}</span>`;
const ordenClase = (a, b) => b.fecha.localeCompare(a.fecha) || (a.horario || '').localeCompare(b.horario || '') || a.docente.localeCompare(b.docente);

function tablaClases(filas) {
    filas = filas.slice().sort(ordenClase);
    const cuerpo = filas.slice(0, MAX_FILAS).map((f) => `
        <tr class="${esAlerta(f) ? 'alarma' : ''}">
            <td>${esc(fechaCorta(f.fecha))}<br><small>${esc(f.horario)}</small></td>
            <td class="c-doc">${esc(f.docente)}<br><small>${f.area ? esc(f.area) + ' · ' : ''}${esc(TURNOS[f.turno] || f.turno)} · ${esc(f.sede)}</small></td>
            <td class="c-curso">${esc(f.curso)}<br><small>${esc(f.seccion)} · NRC ${esc(f.nrc)} · ${esc(f.periodo)}</small></td>
            <td>${badge(clsIngreso(f.estIngreso), txtIngreso(f.estIngreso), f.nota)}<br><small>${f.ingreso ? 'entró ' + esc(f.ingreso) : ''}${f.retraso ? ` (${f.retraso > 0 ? '+' : ''}${f.retraso} min)` : ''}</small></td>
            <td>${badge(clsCamara(f.estCamara), txtCamara(f.estCamara), f.nota)}<br><small>${f.camara != null && f.camara !== '' ? 'min ' + esc(f.camara) : esc(f.nota || '')}</small></td>
            <td>${badge(clsPerm(f.estPermanencia), txtPerm(f.estPermanencia))}<br><small>${esc(detallePerm(f))}</small></td>
            <td>${f.grabacion ? esc(f.grabacion) : '—'}</td>
            <td>${f.aula ? `<a href="${esc(f.aula)}" target="_blank" rel="noopener" title="Abrir aula"><i class="fas fa-arrow-up-right-from-square"></i></a>` : ''}
                <button class="vr-borrar" data-borrar="${esc(clave(f))}" title="Eliminar esta clase del historial"><i class="fas fa-trash-can"></i></button></td>
        </tr>`).join('');
    return `<div class="ev-tabla-wrap"><table class="ev-tabla">
        <thead><tr><th>Fecha</th><th>Docente</th><th>Curso</th><th>Ingreso</th><th>Cámara</th><th>Permanencia</th><th>Grabó desde</th><th>Aula</th></tr></thead>
        <tbody>${cuerpo}</tbody></table></div>`
        + (filas.length > MAX_FILAS ? `<p class="ev-mas">Se muestran ${fmt(MAX_FILAS)} de ${fmt(filas.length)}. El Excel lleva todas.</p>` : '');
}

const clave = (f) => `${f.fecha}|${f.carga}|${f.nrc}`;

// Agrupaciones del dashboard. "Sin actividad" (no tocaba clase) no cuenta como clase dictada.
const GRUPOS = {
    docentes: { titulo: 'Por docente', col: 'Docente', clave: (f) => f.docente, filtro: 'docente' },
    cursos: { titulo: 'Por curso', col: 'Curso', clave: (f) => f.curso },
    ciclos: { titulo: 'Por ciclo', col: 'Ciclo', clave: (f) => f.ciclo || '—', orden: (a, b) => romano(a.nombre) - romano(b.nombre) },
    fechas: { titulo: 'Por fecha', col: 'Fecha', clave: (f) => f.fecha, txt: fechaLarga, orden: (a, b) => b.nombre.localeCompare(a.nombre) }
};

function agrupar(filas, g) {
    const m = new Map();
    for (const f of filas) {
        const k = g.clave(f);
        const d = m.get(k) || { nombre: k, clases: 0, sinAct: 0, puntual: 0, tarde: 0, sin: 0, retrasos: [], camOk: 0, camMal: 0, perm: 0, faltan: 0, docentes: new Set() };
        m.set(k, d);
        if (f.estIngreso === 'SIN ACTIVIDAD') { d.sinAct++; continue; }
        d.clases++;
        d.docentes.add(f.docente);
        if (f.estIngreso === 'PUNTUAL') d.puntual++;
        if (f.estIngreso === 'TARDE') { d.tarde++; d.retrasos.push(f.retraso); }
        if (f.estIngreso === 'SIN INGRESO') d.sin++;
        if (f.estCamara === 'CAMARA OK') d.camOk++;
        if (['CAMARA TARDIA', 'SIN CAMARA'].includes(f.estCamara)) d.camMal++;
        if (f.estPermanencia === 'ALARMA') { d.perm++; d.faltan += f.faltan || 0; }
    }
    const alertas = (d) => d.tarde + d.sin + d.camMal + d.perm;
    return [...m.values()].map((d) => Object.assign(d, {
        promRetraso: d.retrasos.length ? Math.round(d.retrasos.reduce((a, b) => a + b, 0) / d.retrasos.length) : '',
        pctPuntual: d.clases ? Math.round((d.puntual / d.clases) * 100) : null,
        nDocentes: d.docentes.size
    })).sort(g.orden || ((a, b) => alertas(b) - alertas(a) || String(a.nombre).localeCompare(String(b.nombre))));
}

function tablaGrupos(filas, g) {
    const lista = agrupar(filas, g);
    const extra = g.filtro ? '' : '<th class="num">Docentes</th>';
    return `<div class="ev-tabla-wrap"><table class="ev-tabla">
        <thead><tr><th>${g.col}</th>${extra}<th class="num">Clases</th><th>% puntual</th><th class="num">Tarde</th><th class="num">Retraso prom.</th><th class="num">Sin ingreso</th><th class="num">Cámara OK</th><th class="num">Cámara tardía / sin</th><th class="num">Permanencia incompleta</th><th class="num">Min. faltantes</th><th class="num">Sin actividad</th></tr></thead>
        <tbody>${lista.map((d) => `<tr class="clic${d.tarde + d.sin + d.camMal + d.perm ? ' alarma' : ''}" data-grupo="${esc(st.vista)}" data-nombre="${esc(d.nombre)}">
            <td class="c-doc">${esc(g.txt ? g.txt(d.nombre) : d.nombre)}</td>${g.filtro ? '' : `<td class="num">${d.nDocentes}</td>`}<td class="num">${d.clases}</td>
            <td>${d.pctPuntual == null ? '' : `<span class="vr-barra" style="width:${Math.round(d.pctPuntual * 0.6)}px"></span>${d.pctPuntual}%`}</td>
            <td class="num">${d.tarde || ''}</td><td class="num">${d.promRetraso !== '' ? '+' + d.promRetraso + ' min' : ''}</td>
            <td class="num">${d.sin || ''}</td><td class="num">${d.camOk || ''}</td><td class="num">${d.camMal || ''}</td><td class="num">${d.perm || ''}</td><td class="num">${d.faltan || ''}</td><td class="num">${d.sinAct || ''}</td></tr>`).join('')}</tbody>
        </table></div>`;
}

function pintarTabla() {
    const filas = filtradas();
    pintarStats(filas);
    const lista = st.vista === 'alertas' ? filas.filter(esAlerta) : filas;
    const g = GRUPOS[st.vista];
    $('tituloTabla').textContent = (g ? g.titulo : { clases: 'Por clase', alertas: 'Solo alertas' }[st.vista]) + ` (${fmt(g ? agrupar(lista, g).length : lista.length)})`;
    if (!st.filas.size) {
        $('tabla').innerHTML = `<div class="ev-vacio">${esMaster() ? 'Audita un día en el paso 1 para ver resultados.'
            : st.bufEquipo && !st.equipo ? 'Escribe la contraseña del equipo para ver los resultados publicados.<br><br><button class="ev-btn ev-btn-auto" id="vacioClave"><i class="fas fa-unlock"></i> Escribir contraseña</button>'
                : 'Aún no hay resultados publicados por el equipo.'}</div>`;
        const b = $('vacioClave');
        if (b) b.onclick = () => pedirClave('ver');
        return;
    }
    if (!lista.length) { $('tabla').innerHTML = '<div class="ev-vacio">Nada coincide con los filtros.</div>'; return; }
    $('tabla').innerHTML = g ? tablaGrupos(lista, g) : tablaClases(lista);
}

function pintarTodo() {
    pintarChips();
    pintarTabla();
    const n = st.filas.size;
    if (n) {
        const fechas = new Set([...st.filas.values()].map((f) => f.fecha)).size;
        estado(`✓ ${fmt(n)} clases auditadas en ${fmt(fechas)} día(s)` + (st.equipo ? ` · publicado ${esc(new Date(st.equipo.generado).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }))}` : ''));
    }
}

// ------------------------------------------------------------ Excel
function exportar() {
    const filas = filtradas();
    if (!filas.length) { alert('No hay datos para exportar.'); return; }
    const negrita = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '111111' } } };
    let aoa;
    const g = GRUPOS[st.vista];
    if (g) {
        aoa = [[g.col, 'Docentes', 'Clases', 'Puntual', '% puntual', 'Tarde', 'Retraso promedio (min)', 'Sin ingreso', 'Cámara OK', 'Cámara tardía / sin cámara', 'Permanencia incompleta', 'Minutos faltantes', 'Sin actividad'],
            ...agrupar(filas, g).map((d) => [g.txt ? g.txt(d.nombre) : d.nombre, d.nDocentes, d.clases, d.puntual, d.pctPuntual ?? '', d.tarde, d.promRetraso, d.sin, d.camOk, d.camMal, d.perm, d.faltan, d.sinAct])];
    } else {
        const lista = (st.vista === 'alertas' ? filas.filter(esAlerta) : filas).sort(ordenClase);
        aoa = [['Fecha', 'Horario', 'Programa', 'Docente', 'Curso', 'Ciclo', 'Sección', 'NRC', 'Carga', 'Periodo', 'Turno', 'Sede',
            'Ingreso', 'Retraso (min)', 'Estado ingreso', 'Grabación desde', 'Cámara (min)', 'Estado cámara', 'Horas', 'Min. esperados', 'Min. grabados', 'Min. faltantes', 'Permanencia', 'Nota', 'Aula'],
        ...lista.map((f) => [f.fecha, f.horario, f.area || '', f.docente, f.curso, f.ciclo || '', f.seccion, f.nrc, f.carga, `${f.periodo || ''} ${f.modulo || ''}`.trim(), TURNOS[f.turno] || f.turno, f.sede,
            f.ingreso, f.retraso ?? '', txtIngreso(f.estIngreso), f.grabacion, f.camara ?? '', txtCamara(f.estCamara), f.horas ?? '', f.esperado ?? '', f.grabado ?? '', f.faltan ?? '', txtPerm(f.estPermanencia), f.nota || '', f.aula || ''])];
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    aoa[0].forEach((_, i) => { const c = ws[XLSX.utils.encode_cell({ r: 0, c: i })]; if (c) c.s = negrita; });
    ws['!cols'] = aoa[0].map((h) => ({ wch: Math.max(10, h.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Virtual');
    const d = new Date();
    XLSX.writeFile(wb, `VIRTUAL_${st.vista}_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.xlsx`);
}

// ------------------------------------------------------------ modo master
const esMaster = () => document.body.classList.contains('modo-master');
function ponerMaster(on) {
    document.body.classList.toggle('modo-master', on);
    $('masterTxt').textContent = on ? 'Salir de master' : 'Modo master';
    try { on ? localStorage.setItem(MASTER_KEY, '1') : localStorage.removeItem(MASTER_KEY); } catch (e) { /* sin almacenamiento */ }
    clearInterval(st.timer);
    st.timer = on ? setInterval(refrescarAgente, 2000) : null;
    if (on) refrescarAgente();
    pintarTabla();
}
function cerrarMaster() { $('modalMaster').hidden = true; document.body.classList.remove('nf-lock'); }

async function agente(ruta, opc) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), (opc && opc.espera) || 4000);
    try {
        const r = await fetch(AGENTE + ruta, Object.assign({ signal: ctl.signal, cache: 'no-store' }, opc || {}));
        return r.json();
    } finally { clearTimeout(t); }
}
const post = (ruta, cuerpo) => agente(ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo || {}), espera: 15000 });

function logAgente(msg) {
    const box = $('autoLog');
    const d = document.createElement('div');
    d.className = /❌|✗/.test(msg) ? 'err' : /✓/.test(msg) ? 'ok' : /🔑|⚠/.test(msg) ? 'warn' : '';
    d.textContent = msg;
    box.appendChild(d);
    box.scrollTop = box.scrollHeight;
}

function paso(n, cls, html) {
    const el = $('paso' + n);
    el.className = 'ev-paso ' + cls;
    el.querySelector('.ev-paso-icono').innerHTML = cls === 'ok' ? '<i class="fas fa-check"></i>' : n;
    $('paso' + n + 'Txt').innerHTML = html;
}

let estabaCorriendo = false;
async function refrescarAgente() {
    const e = await agente(`/estado?desde=${st.nlog}`).catch(() => null);
    st.agente = e;
    if (!e) {
        paso(1, 'activo', 'No responde. En tu PC: doble clic en <b>tools\\Virtual_Agente.bat</b> (carpeta del repositorio). Se marca solo.');
        paso(2, 'bloq', 'Después del paso 1.');
        paso(3, 'bloq', 'Después del paso 2.');
        $('agenteInfo').textContent = '';
        return;
    }
    (e.log || []).forEach(logAgente);
    st.nlog = e.nlog;
    paso(1, 'ok', 'Conectado.');
    if (!st.periodosCargados) cargarPeriodos();
    paso(2, e.sesion ? 'ok' : 'activo', e.sesion ? 'Sesión iniciada.' : 'Pulsa el botón e <b>inicia sesión</b> en la ventana que abre el agente.');
    $('auditarBtn').hidden = e.corriendo;
    $('detenerBtn').hidden = !e.corriendo;
    $('progreso').hidden = !e.corriendo && !e.hechos;
    $('barra').style.width = e.total ? `${Math.round((e.hechos / e.total) * 100)}%` : '0';
    if (e.corriendo) paso(3, 'activo', `Auditando ${e.hechos} de ${e.total}… ${esc(e.actual || '')}`);
    else if (!e.sesion) paso(3, 'bloq', 'Después del paso 2.');
    else paso(3, e.hechos && e.hechos === e.total ? 'ok' : 'activo',
        e.error === 'sin_sesion' ? '🔑 Se venció la sesión: vuelve a iniciarla y pulsa Auditar (sigue con las que faltan).'
            : e.total ? `${e.hechos} de ${e.total} auditadas. Puedes publicar o auditar otro día.` : 'Elige la fecha y pulsa Auditar.');
    // Mientras audita (y al terminar) se traen los resultados locales del agente.
    if (e.corriendo || estabaCorriendo || !st.localCargado) {
        const r = await agente('/resultados', { espera: 15000 }).catch(() => null);
        if (r) { agregar(r.filas, 'local'); st.localCargado = true; pintarTodo(); }
    }
    estabaCorriendo = e.corriendo;
    const pub = e.publicacion || {};
    if (st.publicando && !pub.corriendo) {
        st.publicando = false;
        $('publicarBtn').disabled = false;
        avisoPublicar(esc((pub.ok ? '✓ ' : '✗ ') + pub.mensaje), pub.ok ? 'ok' : 'err');
    }
}

async function auditar() {
    const fecha = $('aFecha').value;
    if (!fecha) { $('aFecha').focus(); return; }
    const r = await post('/auditar', {
        fecha, rehacer: $('aRehacer').checked, camara: $('aCamara').checked,
        tolerancia: +$('aTol').value || 5, camaraMin: +$('aCam').value || 20,
        filtros: { programa: $('aPrograma').value.split(',').filter(Boolean), docente: $('aDocente').value.trim(), periodos: [...st.periodosAudit], turno: $('aTurno').value }
    }).catch((err) => ({ ok: false, error: err.message }));
    if (!r.ok) {
        paso(3, 'activo', r.error === 'sin_sesion' ? 'Primero inicia sesión en Campus Digital (paso 2).' : esc(r.error || 'El agente no pudo empezar.'));
        return;
    }
    $('autoLog').innerHTML = '';
    estabaCorriendo = true;
    refrescarAgente();
}

function avisoPublicar(html, tipo) {
    const el = $('publicarEstado');
    el.className = 'ev-agente ' + (tipo || '');
    el.innerHTML = html;
}
async function pulsarPublicar() {
    if (!st.agente) { avisoPublicar('Para publicar necesitas el agente abierto (paso 1).', 'warn'); return; }
    let clave = null;
    try { clave = localStorage.getItem(CLAVE_KEY); } catch (e) { /* sin almacenamiento */ }
    if (clave && (!st.bufEquipo || await descifrar(st.bufEquipo, clave).then(() => true, () => false))) publicar(clave);
    else pedirClave('publicar');
}
async function publicar(clave) {
    const r = await post('/publicar', { clave }).catch(() => ({ ok: false }));
    if (!r.ok) { avisoPublicar(esc(r.error === 'ocupado' || !r.error ? 'El agente está ocupado (auditando o publicando). Intenta cuando termine.' : r.error), 'warn'); return; }
    st.publicando = true;
    $('publicarBtn').disabled = true;
    avisoPublicar('<span class="nf-spinner"></span> Cifrando y subiendo a GitHub...');
}

// ------------------------------------------------------------ periodos, excluidos y eliminar
function pintarPeriodos() {
    if (!st.periodos) return;
    $('aPeriodos').innerHTML = st.periodos.map((p) => `<button class="nf-chip${st.periodosAudit.has(p) ? ' on' : ''}" data-periodo="${esc(p)}">${esc(p)}</button>`).join('')
        || '<span class="ev-muted">La hoja de carga no trae periodos.</span>';
}
async function cargarPeriodos() {
    st.periodosCargados = true;
    const r = await agente('/periodos', { espera: 60000 }).catch(() => null);
    if (!r) { st.periodosCargados = false; return; }
    st.periodos = r.periodos || [];
    for (const p of [...st.periodosAudit]) if (!st.periodos.includes(p)) st.periodosAudit.delete(p);
    pintarPeriodos();
    const x = await agente('/excluidos').catch(() => null);
    if (x) { st.excluidos = x.excluidos || []; pintarExcluidos(); }
}
function pintarExcluidos() {
    const el = $('excluidos');
    el.hidden = !st.excluidos.length;
    el.innerHTML = '<span><i class="fas fa-user-slash"></i> No se auditan (excluidos):</span>'
        + st.excluidos.map((d) => `<button class="nf-chip" data-incluir="${esc(d)}" title="Volver a auditar a este docente">${esc(d)} ✕</button>`).join('');
}

// Elimina clases del historial (en el agente). Opcional: excluir a sus docentes de futuras auditorías.
async function eliminar(claves) {
    claves = claves.filter((k) => st.filas.has(k));
    if (!claves.length) { alert('No hay clases para eliminar con estos filtros.'); return; }
    if (!st.agente) { alert('Para eliminar necesitas el agente abierto (paso 1): el historial vive en tu PC.'); return; }
    const docentes = [...new Set(claves.map((k) => st.filas.get(k).docente))];
    if (!confirm(`¿Eliminar ${claves.length} clase(s) de ${docentes.length} docente(s) del historial?`)) return;
    const excluir = confirm(`¿Además dejar de auditar a ${docentes.length === 1 ? docentes[0] : 'estos ' + docentes.length + ' docentes'} en las próximas auditorías?\n(Úsalo para docentes que no son de COT/PLN. Se puede deshacer.)`) ? docentes : [];
    const r = await post('/eliminar', { claves, excluir }).catch(() => null);
    if (!r || !r.ok) { alert('El agente no pudo eliminar. ¿Está abierto?'); return; }
    claves.forEach((k) => st.filas.delete(k));
    st.excluidos = r.excluidos || st.excluidos;
    pintarExcluidos();
    pintarTodo();
    avisoPublicar(`🗑 ${r.eliminadas} clase(s) eliminada(s). Pulsa <b>Publicar para el equipo</b> para que el cambio llegue al equipo.`, 'warn');
}

// ------------------------------------------------------------ inicio
function init() {
    const ayer = new Date(Date.now() - 864e5);
    $('aFecha').value = `${ayer.getFullYear()}-${String(ayer.getMonth() + 1).padStart(2, '0')}-${String(ayer.getDate()).padStart(2, '0')}`;
    $('aCam').oninput = () => { $('limCam').textContent = $('aCam').value || 20; };

    $('masterBtn').onclick = () => {
        if (esMaster()) { ponerMaster(false); return; }
        $('masterError').textContent = '';
        $('masterInput').value = '';
        $('modalMaster').hidden = false;
        document.body.classList.add('nf-lock');
        setTimeout(() => $('masterInput').focus(), 50);
    };
    $('masterForm').onsubmit = (ev) => {
        ev.preventDefault();
        if ($('masterInput').value.trim().toUpperCase() !== CLAVE_MASTER) { $('masterError').textContent = 'Clave incorrecta.'; return; }
        cerrarMaster();
        ponerMaster(true);
    };
    $('masterCerrar').onclick = cerrarMaster;
    $('claveForm').onsubmit = enviarClave;
    $('claveOmitir').onclick = () => { cerrarClave(); pintarTabla(); };
    $('paso2Btn').onclick = () => post('/abrir-navegador').catch(() => {});
    $('auditarBtn').onclick = auditar;
    $('detenerBtn').onclick = () => post('/detener').catch(() => {});
    $('publicarBtn').onclick = pulsarPublicar;
    $('exportarBtn').onclick = exportar;
    $('eliminarBtn').onclick = () => eliminar(filtradas().map(clave));
    try { (JSON.parse(localStorage.getItem('virtual_periodos')) || []).forEach((p) => st.periodosAudit.add(p)); } catch (e) { /* sin almacenamiento */ }

    document.addEventListener('click', (ev) => {
        const chip = ev.target.closest('[data-campo]');
        if (chip) {
            const s = st.filtros[chip.dataset.campo];
            s.has(chip.dataset.val) ? s.delete(chip.dataset.val) : s.add(chip.dataset.val);
            pintarTodo();
            return;
        }
        const vista = ev.target.closest('[data-vista]');
        if (vista) {
            st.vista = vista.dataset.vista;
            document.querySelectorAll('[data-vista]').forEach((b) => b.classList.toggle('on', b === vista));
            pintarTabla();
            return;
        }
        const borrar = ev.target.closest('[data-borrar]');
        if (borrar) { eliminar([borrar.dataset.borrar]); return; }
        const per = ev.target.closest('[data-periodo]');
        if (per) {
            const p = per.dataset.periodo;
            st.periodosAudit.has(p) ? st.periodosAudit.delete(p) : st.periodosAudit.add(p);
            try { localStorage.setItem('virtual_periodos', JSON.stringify([...st.periodosAudit])); } catch (e) { /* sin almacenamiento */ }
            pintarPeriodos();
            return;
        }
        const inc = ev.target.closest('[data-incluir]');
        if (inc) {
            post('/incluir', { docente: inc.dataset.incluir }).then((r) => { st.excluidos = r.excluidos || []; pintarExcluidos(); }).catch(() => {});
            return;
        }
        const grupo = ev.target.closest('tr[data-grupo]');
        if (grupo) {   // de un resumen a sus clases
            const v = grupo.dataset.grupo, n = grupo.dataset.nombre;
            if (v === 'docentes' || v === 'cursos') $('buscar').value = st.texto = n.toUpperCase();
            if (v === 'ciclos') st.filtros.ciclo = new Set([n]);
            if (v === 'fechas') st.filtros.fecha = new Set([n]);
            document.querySelector('[data-vista="clases"]').click();
            pintarTodo();
        }
    });
    $('buscar').oninput = () => { st.texto = $('buscar').value.trim().toUpperCase(); pintarTodo(); };
    $('limpiarFiltros').onclick = () => {
        Object.values(st.filtros).forEach((s) => s.clear());
        $('buscar').value = st.texto = '';
        pintarTodo();
    };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { cerrarMaster(); cerrarClave(); } });

    let master = false;
    try { master = localStorage.getItem(MASTER_KEY) === '1'; } catch (e) { /* sin almacenamiento */ }
    ponerMaster(master);
    estado('');
    cargarEquipo().then(pintarTodo);
}

init();
