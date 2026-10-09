// ==========================================================================
// SEGUIMIENTO EVALDO — interfaz
// 1) Guía para descargar AC_ALUMNOS_GB por Programación de Consultas
// 2) Importa los .xls (se leen y guardan solo en este navegador, IndexedDB)
// 3) Cruza con CARGA_HORARIA / Docentes 2026 y muestra secciones, docentes,
//    reprobados; exporta a Excel o PDF (con el logo de CERTUS) lo filtrado.
// Por defecto solo se ve el paso 3; los pasos 1 y 2 aparecen en modo master (clave).
// El cálculo vive en evaldo-core.js (mismo resultado que notas.py del panel).
// ==========================================================================

const C = window.EvaldoCore;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('es-PE');
const titulo = (t) => (t ? t.charAt(0) + t.slice(1).toLowerCase() : t);
const pausa = () => new Promise((r) => setTimeout(r, 0));   // deja repintar la pantalla

const TURNOS = { M: 'Mañana', T: 'Tarde', N: 'Noche', D: 'Diurno' };
const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO',
    'SETIEMBRE', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const SEDES = Object.fromEntries(C.CAMPUS);
const MAX_FILAS = 600;          // filas pintadas por tabla (el Excel lleva todo)
const PREF_KEY = 'evaldo_prefs_v2';

const st = {
    reportes: new Map(),        // clave AC_G_S_C -> {clave, nombre, origen, filas, declaradas, fecha, registros}
    doc: null,                  // índice de la hoja de carga
    hoja: null,                 // {fecha, filas, cache}
    datos: null,                // {registros, evaluaciones, secciones, reprobados, porSeccion, texto}
    vista: 'secciones',
    cargandoHoja: false,        // mientras se lee la hoja, el análisis espera
    memoria: false              // true si el navegador no deja usar IndexedDB
};
const filtro = {
    area: new Set(), periodo: new Set(), modulo: new Set(), cicloAcad: new Set(),
    turno: new Set(), modalidad: new Set(), campus: new Set(), ciclo: new Set()
};
const dsel = {   // por defecto, todo marcado
    grados: new Set(C.GRADOS.map((g) => g.codigo)),
    strms: new Set(Object.values(C.CICLOS).flat().map((c) => c[0])),
    campus: new Set(C.CAMPUS.map((c) => c[0]))
};

// ------------------------------------------------------------ IndexedDB
const DB = {
    db: null,
    abrir() {
        return new Promise((ok, mal) => {
            const req = indexedDB.open('evaldo', 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('reportes')) db.createObjectStore('reportes', { keyPath: 'clave' });
                if (!db.objectStoreNames.contains('hojas')) db.createObjectStore('hojas', { keyPath: 'id' });
            };
            req.onsuccess = () => { DB.db = req.result; ok(); };
            req.onerror = () => mal(req.error);
        });
    },
    _op(store, modo, fn) {
        if (!DB.db) return Promise.resolve(undefined);
        return new Promise((ok, mal) => {
            const tx = DB.db.transaction(store, modo);
            const req = fn(tx.objectStore(store));
            tx.oncomplete = () => ok(req && req.result);
            tx.onerror = () => mal(tx.error);
            tx.onabort = () => mal(tx.error);
        });
    },
    todos: (store) => DB._op(store, 'readonly', (s) => s.getAll()),
    get: (store, k) => DB._op(store, 'readonly', (s) => s.get(k)),
    put: (store, v) => DB._op(store, 'readwrite', (s) => s.put(v)),
    borrar: (store, k) => DB._op(store, 'readwrite', (s) => s.delete(k)),
    limpiar: (store) => DB._op(store, 'readwrite', (s) => s.clear())
};

// ------------------------------------------------------------ preferencias (solo comodidad)
function guardarPrefs() {
    try {
        const sets = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [...v]]));
        localStorage.setItem(PREF_KEY, JSON.stringify({ filtro: sets(filtro), dsel: sets(dsel), vista: st.vista }));
    } catch (e) { /* sin almacenamiento */ }
}
function leerPrefs() {
    try {
        const p = JSON.parse(localStorage.getItem(PREF_KEY) || 'null');
        if (!p) return;
        for (const k in filtro) if (p.filtro && p.filtro[k]) filtro[k] = new Set(p.filtro[k]);
        for (const k in dsel) if (p.dsel && p.dsel[k]) dsel[k] = new Set(p.dsel[k]);
        if (p.vista) st.vista = p.vista;
    } catch (e) { /* preferencias dañadas: se ignoran */ }
}

// ------------------------------------------------------------ arranque (init() se llama al final del archivo)
// Abierta como archivo (file://) Google bloquea la hoja de carga (origen "null").
const PAGINA_ARCHIVO = location.protocol === 'file:';
const PAGINA_LOCAL = 'http://127.0.0.1:8765/evaldo.html';
const PAGINA_WEB = 'https://eduardoaeges.github.io/repositorio_cot/evaldo.html';

async function init() {
    leerPrefs();
    let master = false;
    try { master = localStorage.getItem(MASTER_KEY) === '1'; } catch (e) { /* sin almacenamiento */ }
    ponerMaster(master, true);
    bind();
    pintarDescarga();
    if (!window.XLSX) {
        estado('No se pudo cargar la librería de Excel (sin internet o bloqueada). Recarga la página.', true);
        return;
    }
    try {
        await DB.abrir();
        estado('Leyendo reportes guardados...');
        for (const r of (await DB.todos('reportes')) || []) st.reportes.set(r.clave, r);
    } catch (e) {
        st.memoria = true;   // ventana privada o almacenamiento bloqueado
    }
    pintarArchivos();
    await Promise.all([cargarHojas(false), cargarEquipo()]);
    pintarArchivos();
    analizar();
}

function bind() {
    const zona = $('zonaSubir');
    $('inputSubir').onchange = (e) => { importar(e.target.files); e.target.value = ''; };
    zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('encima'); });
    zona.addEventListener('dragleave', () => zona.classList.remove('encima'));
    zona.addEventListener('drop', (e) => { e.preventDefault(); zona.classList.remove('encima'); importar(e.dataTransfer.files); });
    // Soltar fuera de la zona no debe abrir el archivo en la pestaña.
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());

    $('actualizarHoja').onclick = async () => { await cargarHojas(true); analizar(); };
    $('quitarTodos').onclick = async () => {
        if (!confirm('¿Quitar los reportes guardados en este navegador? Los publicados por el equipo se mantienen.')) return;
        await DB.limpiar('reportes').catch(() => {});
        for (const [k, r] of st.reportes) if (!r.publicado) st.reportes.delete(k);
        pintarArchivos();
        analizar();
    };
    let t;
    $('buscar').oninput = () => { clearTimeout(t); t = setTimeout(pintarResultados, 200); };
    $('limpiarFiltros').onclick = () => {
        Object.values(filtro).forEach((s) => s.clear());
        $('buscar').value = '';
        guardarPrefs();
        llenarFiltros();
        pintarResultados();
    };
    document.querySelectorAll('.ev-vistas .nf-chip').forEach((b) => {
        b.classList.toggle('on', b.dataset.vista === st.vista);
        b.onclick = () => {
            st.vista = b.dataset.vista;
            document.querySelectorAll('.ev-vistas .nf-chip').forEach((x) => x.classList.toggle('on', x === b));
            guardarPrefs();
            pintarResultados();
        };
    });
    $('exportarBtn').onclick = () => exportar('secciones', $('exportarBtn'));
    $('exportarEstBtn').onclick = () => exportar('estudiantes', $('exportarEstBtn'));
    $('exportarPdfBtn').onclick = () => exportarPdf($('exportarPdfBtn'));
    $('masterBtn').onclick = pulsarMaster;
    $('masterForm').onsubmit = enviarMaster;
    $('masterCerrar').onclick = cerrarMaster;
    $('modalMaster').onclick = (e) => { if (e.target === $('modalMaster')) cerrarMaster(); };
    $('autoBtn').onclick = abrirAsistente;
    $('publicarBtn').onclick = publicarEquipo;
    $('claveForm').onsubmit = enviarClave;
    $('claveOmitir').onclick = cerrarClave;
    $('asisCerrar').onclick = cerrarAsistente;
    $('modalAuto').onclick = (e) => { if (e.target === $('modalAuto')) cerrarAsistente(); };
    $('paso1Btn').onclick = pulsarPaso1;
    $('paso2Btn').onclick = pulsarPaso2;
    $('paso3Btn').onclick = pulsarPaso3;
    $('detenerBtn').onclick = () => agente('/cancelar', { method: 'POST' }).catch(() => {});
    $('incluirCompletas').onchange = pintarManual;
    $('modal-cerrar').onclick = cerrarModal;
    $('modal').onclick = (e) => { if (e.target === $('modal')) cerrarModal(); };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { cerrarModal(); cerrarAsistente(); cerrarMaster(); } });
}

function estado(msg, error) {
    const el = $('estado');
    el.className = 'nf-status' + (error ? ' err' : '');
    el.innerHTML = msg ? (error ? '<i class="fas fa-circle-exclamation"></i> ' : '') + msg : '';
}

// ------------------------------------------------------------ hoja de carga (Google Sheets)
async function cargarHojas(forzar) {
    const btn = $('actualizarHoja');
    btn.disabled = true;
    st.cargandoHoja = true;
    $('hojaInfo').innerHTML = '<span class="nf-spinner"></span> Leyendo la hoja de carga (CARGA_HORARIA y Docentes 2026)...';
    let textos = null, fecha = Date.now(), cache = false;
    try {
        const sufijo = forzar ? `&_=${Date.now()}` : '';
        textos = await Promise.all([C.GID_CARGA, C.GID_DOCENTES].map(async (gid) => {
            const r = await fetch(C.urlHoja(gid) + sufijo, { cache: 'no-store' });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.text();
        }));
        DB.put('hojas', { id: 'hojas', textos, fecha }).catch(() => {});
    } catch (e) {
        const guardada = await DB.get('hojas', 'hojas').catch(() => null);
        if (guardada) { textos = guardada.textos; fecha = guardada.fecha; cache = true; }
    }
    btn.disabled = false;
    st.cargandoHoja = false;
    if (!textos) {
        st.doc = null;
        $('hojaInfo').innerHTML = '<span class="ev-bad"><i class="fas fa-circle-exclamation"></i> No se pudo leer la hoja de carga. Sin ella no se conoce el docente de cada sección. Revisa tu conexión y pulsa "Actualizar hoja de carga".</span>';
        return;
    }
    st.doc = C.indiceCarga(C.parseCSV(textos[0]), C.parseCSV(textos[1]));
    st.hoja = { fecha, filas: st.doc.filas, cache };
    const hora = new Date(fecha).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
    $('hojaInfo').innerHTML = `<i class="fas fa-table"></i> Hoja de carga: <b>${fmt(st.doc.filas)}</b> clases · leída ${esc(hora)}`
        + (cache ? ' <span class="ev-warn">(copia guardada: no se pudo actualizar)</span>' : '');
}

// ------------------------------------------------------------ importar .xls
// Opciones de lectura: sin texto formateado ni HTML (casi la mitad del tiempo en reportes grandes).
const OPC_LECTURA = { type: 'array', dense: true, cellText: false, cellHTML: false, cellFormula: false, cellDates: true };
const celdaTexto = (v) => (v instanceof Date
    ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
    : String(v));

function matrizDeArchivo(buffer) {
    const wb = XLSX.read(new Uint8Array(buffer), OPC_LECTURA);
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }).map((fila) => fila.map(celdaTexto));
}

function logImport(msg, cls) {
    const box = $('importLog');
    box.hidden = false;
    const d = document.createElement('div');
    d.className = cls || '';
    d.textContent = msg;
    box.appendChild(d);
    box.scrollTop = box.scrollHeight;
}

// seguir = true no limpia el registro (la descarga automática importa archivo por archivo).
async function importar(lista, seguir) {
    const files = [...(lista || [])].filter((f) => /\.xlsx?$/i.test(f.name));
    if (!files.length) { logImport('Elige archivos .xls o .xlsx (AC_ALUMNOS_GB...).', 'err'); return 0; }
    files.sort((a, b) => a.lastModified - b.lastModified);   // el más nuevo gana
    const zona = $('zonaSubir');
    zona.classList.add('ocupado');
    if (!seguir) $('importLog').innerHTML = '';
    let ok = 0;
    for (const f of files) {
        logImport(`Leyendo ${f.name}...`);
        await pausa();
        let r;
        try {
            r = C.leerReporte(matrizDeArchivo(await f.arrayBuffer()), f.name);
        } catch (e) {
            logImport(`✗ ${f.name}: no se pudo leer (${String(e.message || e).slice(0, 80)})`, 'err');
            continue;
        }
        if (r.estado === 'vacio') { logImport(`· ${f.name}: sin alumnos, se omite.`, 'warn'); continue; }
        if (r.estado !== 'ok') { logImport(`✗ ${f.name}: ${r.detalle}`, 'err'); continue; }
        const previo = st.reportes.get(r.clave);
        // Un reporte completo (Programación de Consultas) no se reemplaza por uno de "Ver Resultado".
        if (previo && previo.origen === 'programacion' && r.origen !== 'programacion') {
            logImport(`· ${f.name}: ya tienes ${r.clave} completo (Programación de Consultas); no se reemplaza por uno directo.`, 'warn');
            continue;
        }
        r.registros.forEach((x) => { x._archivo = r.clave; });
        const rep = {
            clave: r.clave, nombre: f.name, origen: r.origen, grado: r.grado, strm: r.strm, campus: r.campus,
            filas: r.filas, declaradas: r.declaradas, fecha: Date.now(), registros: r.registros
        };
        try { await DB.put('reportes', rep); } catch (e) { st.memoria = true; }
        st.reportes.set(rep.clave, rep);
        ok++;
        logImport(`✓ ${f.name} → ${r.clave} · ${nombreCombo(r)} (${fmt(r.filas)} filas${r.origen === 'programacion' ? ', completo' : ', ⚠ directo: puede estar incompleto'})`, 'ok');
    }
    logImport(`Importados ${ok} de ${files.length}.` + (st.memoria ? ' (Este navegador no permite guardar: se perderán al cerrar la pestaña.)' : ''), ok ? 'ok' : '');
    zona.classList.remove('ocupado');
    pintarArchivos();
    if (ok) analizar();
    return ok;
}

// 'AGOSTO ESCUELA (3VXS)' -> 'Agosto Escuela (3VXS)'; TECH y (3VXS) se mantienen.
const nombreBonito = (n) => n.split(' ').map((w) => (w === 'TECH' || w.startsWith('(') ? w : titulo(w))).join(' ');
function nombreCiclo(codigo) {
    for (const g in C.CICLOS) {
        const c = C.CICLOS[g].find((x) => x[0] === codigo);
        if (c) return nombreBonito(c[1]);
    }
    return codigo;
}
const nombreCombo = (r) => `${nombreCiclo(r.strm)} · ${SEDES[r.campus] || r.campus}`;

function pintarArchivos() {
    const lista = [...st.reportes.values()].filter((r) => !r.vacio).sort((a, b) => a.clave.localeCompare(b.clave));
    $('quitarTodos').hidden = !lista.length;
    const directos = lista.filter((r) => r.origen !== 'programacion').length;
    const fechaEquipo = st.equipo ? new Date(st.equipo.generado).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '';
    $('archInfo').textContent = (lista.length
        ? `${lista.length} reporte(s)` + (directos ? ` · ⚠ ${directos} de descarga directa` : '')
        : '') + (st.equipo ? ` · ☁ datos del equipo del ${fechaEquipo}` : '');
    $('archivos').innerHTML = lista.map((r) => {
        const cortado = r.declaradas && r.declaradas > r.filas;
        const marca = cortado ? `<span class="ev-bad" title="El reporte declara ${fmt(r.declaradas)} filas y trae ${fmt(r.filas)}">✗ cortado</span>`
            : r.origen === 'programacion' ? '<span class="ev-ok">✓ completo</span>'
                : '<span class="ev-warn" title="Bajado con Ver Resultado: puede faltar alumnos. Vuelve a bajarlo por Programación de Consultas.">⚠ directo</span>';
        const fecha = new Date(r.fecha).toLocaleDateString('es-PE');
        return `<div class="ev-archivo">
            <i class="fas fa-file-excel"></i>
            <div><b title="${esc(r.nombre)}">${esc(nombreCombo(r))}</b>
                <small>${esc(r.clave)} · ${fmt(r.filas)} filas · ${esc(fecha)} · ${marca}</small></div>
            ${r.publicado ? '<i class="fas fa-cloud ev-nube" title="Publicado por el equipo"></i>'
        : `<button class="ev-quitar" data-quitar="${esc(r.clave)}" title="Quitar este reporte"><i class="fas fa-xmark"></i></button>`}
        </div>`;
    }).join('');
    $('archivos').querySelectorAll('[data-quitar]').forEach((b) => {
        b.onclick = async () => {
            const k = b.dataset.quitar;
            await DB.borrar('reportes', k).catch(() => {});
            st.reportes.delete(k);
            pintarArchivos();
            analizar();
        };
    });
    pintarManual();
}

// ------------------------------------------------------------ paso 1: descarga guiada
function chips(cont, items, seleccion, alCambiar) {
    cont.innerHTML = '';
    items.forEach(([codigo, nombre]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'nf-chip' + (seleccion.has(codigo) ? ' on' : '');
        b.textContent = nombre;
        b.onclick = () => {
            seleccion.has(codigo) ? seleccion.delete(codigo) : seleccion.add(codigo);
            b.classList.toggle('on');
            alCambiar();
        };
        cont.appendChild(b);
    });
}

function ciclosVisibles() {
    const v = [];
    for (const g of C.GRADOS) if (dsel.grados.has(g.codigo)) v.push(...C.CICLOS[g.codigo]);
    return v;
}

function pintarDescarga() {
    const cambio = () => { guardarPrefs(); pintarManual(); };
    chips($('dGrados'), C.GRADOS.map((g) => [g.codigo, g.nombre]), dsel.grados, () => {
        const validos = new Set(ciclosVisibles().map((c) => c[0]));
        [...dsel.strms].forEach((s) => { if (!validos.has(s)) dsel.strms.delete(s); });
        pintarCiclosDescarga();
        cambio();
    });
    chips($('dCampus'), C.CAMPUS, dsel.campus, cambio);
    pintarCiclosDescarga();
    pintarManual();
}

function pintarCiclosDescarga() {
    const ciclos = ciclosVisibles().map(([c, n]) => [c, `${nombreBonito(n)} · ${c}`]);
    if (!ciclos.length) { $('dCiclos').innerHTML = '<span class="ev-muted">Elige un grado...</span>'; return; }
    chips($('dCiclos'), ciclos, dsel.strms, () => { guardarPrefs(); pintarManual(); });
}

function combosElegidos() {
    const combos = [];
    for (const g of C.GRADOS) {
        if (!dsel.grados.has(g.codigo)) continue;
        for (const [strm] of C.CICLOS[g.codigo]) {
            if (!dsel.strms.has(strm)) continue;
            for (const [campus] of C.CAMPUS) if (dsel.campus.has(campus)) combos.push({ grado: g.codigo, strm, campus, clave: `AC_${g.codigo}_${strm}_${campus}` });
        }
    }
    return combos;
}
const origenCombo = (c) => (st.reportes.get(c.clave) || {}).origen;
// Las que la descarga automática va a bajar: pendientes y "rehacer" (o todas si se marca).
const combosParaAuto = () => combosElegidos().filter((c) => $('incluirCompletas').checked || origenCombo(c) !== 'programacion');

function pintarManual() {
    const cont = $('listaManual');
    const combos = combosElegidos();
    $('nAuto').textContent = combosParaAuto().length;
    if (!combos.length) {
        cont.innerHTML = '<div class="ev-muted">Marca grado, ciclo y sede para ver las combinaciones a descargar.</div>';
        $('manualInfo').textContent = '';
        return;
    }
    const origen = origenCombo;
    const listas = combos.filter((c) => origen(c) === 'programacion').length;
    $('manualInfo').textContent = `${listas} de ${combos.length} combinaciones completas`;
    const val = (v) => `<span class="ev-val" data-copiar="${esc(v)}" title="Clic para copiar">${esc(v)}</span>`;
    cont.innerHTML = `<div class="ev-combo cab"><span>Combinación</span><span>Institución · Grado · Ccl Lvo · Campus (clic = copiar)</span><span>Estado</span></div>`
        + combos.map((c) => {
            const o = origen(c);
            const a = auto.estados[c.clave];
            const vacio = (st.reportes.get(c.clave) || {}).vacio;
            const marca = a && a.texto ? `<span class="${a.cls} ev-auto-marca">${esc(a.texto)}</span>`
                : vacio ? '<span class="ev-pend">✓ sin alumnos</span>'
                : o === 'programacion' ? '<span class="ev-ok">✓ completo</span>'
                    : o ? '<span class="ev-warn" title="Está, pero bajado con Ver Resultado">⚠ rehacer</span>'
                        : '<span class="ev-pend">pendiente</span>';
            return `<div class="ev-combo ${o === 'programacion' ? 'listo' : ''}">
                <span>${esc(nombreCombo(c))}</span>
                <span class="ev-vals">${val('CERTU')}${val(c.grado)}${val(c.strm)}${val(c.campus)}</span>
                ${marca}
            </div>`;
        }).join('');
    cont.querySelectorAll('[data-copiar]').forEach((el) => {
        el.onclick = async () => {
            try { await navigator.clipboard.writeText(el.dataset.copiar); } catch (e) { /* sin portapapeles */ }
            el.classList.add('copiado');
            setTimeout(() => el.classList.remove('copiado'), 700);
        };
    });
}

// ------------------------------------------------------------ análisis
const claveSec = (x) => `${x.Grado}|${x.Ciclo}|${x.Campus}|${x.Seccion}|${x.NRC}`;

function analizar() {
    if (!st.reportes.size) {
        st.datos = null;
        estado(st.memoria ? 'Este navegador no permite guardar datos (¿ventana privada?): los reportes se perderán al cerrar la pestaña.' : '', st.memoria);
        llenarFiltros();
        pintarResultados();
        return;
    }
    if (st.cargandoHoja) {
        // Quien está leyendo la hoja vuelve a llamar a analizar() al terminar.
        estado('<span class="nf-spinner"></span> Esperando la hoja de carga para ubicar a los docentes...');
        return;
    }
    if (!st.doc) {
        // Sin la hoja todas las secciones saldrían "sin docente": mejor no mostrar nada engañoso.
        st.datos = null;
        estado(PAGINA_ARCHIVO
            ? `Abriste la página como archivo (${esc(location.pathname.split('/').pop())}): así el navegador bloquea la hoja de carga de Google. `
                + `Ábrela desde <a href="${PAGINA_LOCAL}">${PAGINA_LOCAL}</a> (con el agente abierto) o desde <a href="${PAGINA_WEB}">la página publicada</a>.`
            : 'No se pudo leer la hoja de carga (CARGA_HORARIA): sin ella no se sabe qué docente tiene cada sección. Revisa tu conexión y pulsa "Actualizar hoja de carga".', true);
        llenarFiltros();
        pintarResultados();
        return;
    }
    const crudos = [];
    for (const r of st.reportes.values()) for (const x of r.registros) crudos.push(x);
    const doc = st.doc;
    const { registros, evaluaciones } = C.consolidar(crudos, doc);
    const secciones = C.resumenSecciones(registros, evaluaciones);
    const porSeccion = new Map();
    for (const r of registros) {
        const k = claveSec(r);
        if (!porSeccion.has(k)) porSeccion.set(k, []);
        porSeccion.get(k).push(r);
    }
    // Texto de búsqueda por sección (incluye a los alumnos).
    const texto = new Map();
    for (const s of secciones) {
        const k = claveSec(s);
        texto.set(k, `${s.Docente} ${s.Curso} ${s.Seccion} ${s.NRC} ${(porSeccion.get(k) || []).map((r) => r.Estudiante).join(' ')}`.toLowerCase());
    }
    st.datos = { registros, evaluaciones, secciones, reprobados: C.listaReprobados(registros, evaluaciones), porSeccion, texto };
    const sinHoja = secciones.filter((s) => s.Coincidencia === 'No está en la hoja de carga').length;
    estado(`✓ ${st.reportes.size} reporte(s) · ${fmt(registros.length)} registros · ${fmt(secciones.length)} secciones`
        + (sinHoja ? ` · ${fmt(sinHoja)} sin docente en la hoja de carga` : '')
        + (st.memoria ? ' · <span class="ev-warn">sin guardar (navegador sin almacenamiento)</span>' : ''));
    llenarFiltros();
    pintarResultados();
}

function chipsFiltro(id, valores, seleccion, etiqueta) {
    const cont = $(id);
    cont.innerHTML = '';
    if (!valores.length) { cont.innerHTML = '<span class="ev-muted">—</span>'; return; }
    valores.forEach((v) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'nf-chip' + (seleccion.has(v) ? ' on' : '');
        b.textContent = etiqueta(v);
        b.onclick = () => {
            seleccion.has(v) ? seleccion.delete(v) : seleccion.add(v);
            b.classList.toggle('on');
            guardarPrefs();
            pintarResultados();
        };
        cont.appendChild(b);
    });
}

// [clave del filtro, contenedor, nombre, etiqueta del valor]
const FILTROS_UI = [
    ['area', 'fArea', 'Área', (v) => v],
    ['periodo', 'fPeriodo', 'Periodo', titulo],
    ['modulo', 'fModulo', 'Módulo', (m) => (m === 'REGULAR' ? 'Regular' : 'Módulo ' + m)],
    ['cicloAcad', 'fCicloAcad', 'Ciclo', (c) => 'Ciclo ' + c],
    ['turno', 'fTurno', 'Turno', (t) => TURNOS[t] || t],
    ['modalidad', 'fModalidad', 'Modalidad', titulo],
    ['campus', 'fCampus', 'Sede', (c) => SEDES[c] || c],
    ['ciclo', 'fCiclo', 'Ccl Lvo', (c) => `${nombreCiclo(c)} · ${c}`]
];

function llenarFiltros() {
    const secs = st.datos ? st.datos.secciones : [];
    const valores = (campo) => [...new Set(secs.map((s) => s[campo]).filter(Boolean))];
    const enOrden = (lista, orden) => lista.sort((a, b) =>
        ((orden.indexOf(a) + 1) || 99) - ((orden.indexOf(b) + 1) || 99) || a.localeCompare(b));
    const sedes = {};
    secs.forEach((s) => { if (s.Campus) sedes[s.Campus] = s.Sede || SEDES[s.Campus] || s.Campus; });
    const opciones = {
        area: valores('Area').sort(),
        periodo: enOrden(valores('Periodo'), MESES),
        modulo: enOrden(valores('Modulo'), ['1', '2', 'REGULAR']),
        cicloAcad: enOrden(valores('CicloAcad'), ROMANOS),
        turno: enOrden(valores('Turno'), ['M', 'T', 'N', 'D']),
        modalidad: valores('Modalidad').sort(),
        campus: Object.keys(sedes).sort(),
        ciclo: valores('Ciclo').sort()
    };
    // Sin datos se conserva la selección guardada; con datos se quitan valores que ya no existen.
    if (secs.length) Object.keys(filtro).forEach((k) => [...filtro[k]].forEach((v) => { if (!opciones[k].includes(v)) filtro[k].delete(v); }));
    FILTROS_UI.forEach(([k, id, , etiqueta]) =>
        chipsFiltro(id, opciones[k], filtro[k], k === 'campus' ? (c) => sedes[c] : etiqueta));
}

// "Filtros · Área: COT · Sede: Sede Ate · Búsqueda: "perez"" para el Excel y el PDF.
function resumenFiltros() {
    const partes = FILTROS_UI.filter(([k]) => filtro[k].size)
        .map(([k, , nombre, etiqueta]) => `${nombre}: ${[...filtro[k]].map(etiqueta).join(', ')}`);
    const q = ($('buscar').value || '').trim();
    if (q) partes.push(`Búsqueda: "${q}"`);
    return partes.length ? 'Filtros · ' + partes.join(' · ') : 'Sin filtros: todas las secciones';
}

const textoBusqueda = () => ($('buscar').value || '').trim().toLowerCase();

// Secciones que pasan los chips y el buscador.
function seccionesVisibles() {
    const q = textoBusqueda();
    return st.datos.secciones.filter((s) => C.pasaFiltros(s, filtro) && (!q || st.datos.texto.get(claveSec(s)).includes(q)));
}

function statsDe(secs) {
    const ids = new Set();
    for (const s of secs) for (const r of st.datos.porSeccion.get(claveSec(s)) || []) if (r.ID) ids.add(r.ID);
    return {
        sec: secs.length, est: ids.size,
        sin: secs.filter((s) => s.sin_notas).length,
        rep: secs.reduce((a, s) => a + s.reprobados_total, 0)
    };
}
function pintarStats(secs) {
    const n = statsDe(secs);
    $('cSec').textContent = fmt(n.sec);
    $('cEst').textContent = fmt(n.est);
    $('cSin').textContent = fmt(n.sin);
    $('cRep').textContent = fmt(n.rep);
}

function pintarResultados() {
    if (!st.datos) {
        ['cSec', 'cEst', 'cSin', 'cRep'].forEach((id) => { $(id).textContent = '0'; });
        $('tituloTabla').textContent = 'Resultados';
        // Sin datos: lo que toca hacer depende de si es el equipo (master) o quien solo consulta.
        $('tabla').innerHTML = `<div class="ev-vacio">${esMaster() ? 'Carga los reportes en el paso 2 para ver resultados.'
            : st.reportes.size ? 'No se pudieron calcular los resultados: revisa el aviso de arriba.'
                : st.bufEquipo && !st.equipo ? 'Escribe la contraseña del equipo para ver los reportes publicados.<br><br><button class="ev-btn ev-btn-auto" id="vacioClave"><i class="fas fa-unlock"></i> Escribir contraseña</button>'
                    : 'Aún no hay reportes publicados por el equipo.'}</div>`;
        if ($('vacioClave')) $('vacioClave').onclick = abrirClave;
        return;
    }
    const secs = seccionesVisibles();
    pintarStats(secs);
    if (st.vista === 'reprobados') return pintarReprobados(secs);
    if (st.vista === 'docentes') return pintarDocentes(secs);
    pintarSecciones(st.vista === 'sinnotas' ? secs.filter((s) => s.sin_notas) : secs);
}

const avance = (s) => {
    const esp = s.Esperadas || 0, sub = s.Subidas || 0;
    const cls = sub === 0 ? 'ev-bad' : (sub < esp ? 'ev-warn' : 'ev-ok');
    return `<span class="${cls}">${sub} de ${esp}</span><span class="ev-sub">${esc(s.TipoEval || '')}</span>`;
};
const detalleTexto = (s) => [
    `NRC ${s.NRC}`, s.Sede || s.Campus,
    s.Modulo ? (s.Modulo === 'REGULAR' ? 'Regular' : 'M' + s.Modulo) : '',
    s.CicloAcad ? 'Ciclo ' + s.CicloAcad : '', s.Turno ? TURNOS[s.Turno] || s.Turno : '',
    s.Modalidad ? titulo(s.Modalidad) : ''
].filter(Boolean).join(' · ');
const detalleSeccion = (s) => esc(detalleTexto(s));
const notaHtml = (n) => (n == null ? '—' : `<span class="${n < C.NOTA_APROBATORIA ? 'ev-bad' : 'ev-ok'}">${n}</span>`);
const evCorta = (ev) => ev.replace(/EVALUACI[OÓ]N/i, 'EV');

function sinFilas(msg) { $('tabla').innerHTML = `<div class="ev-vacio">${msg}</div>`; }
const avisoMas = (n) => (n > MAX_FILAS ? `<div class="ev-mas">Mostrando ${fmt(MAX_FILAS)} de ${fmt(n)}. Usa los filtros o descarga el Excel.</div>` : '');

// Solo las evaluaciones que existen en lo filtrado (ciclo I no muestra EV4).
const evalsDe = (secs) => st.datos.evaluaciones.filter((ev) => secs.some((s) => s.evals[ev]));

function pintarSecciones(secs) {
    $('tituloTabla').textContent = st.vista === 'sinnotas'
        ? `Secciones sin notas (${fmt(secs.length)})` : `Resumen por sección (${fmt(secs.length)})`;
    if (!secs.length) return sinFilas('Sin secciones con estos filtros.');
    const evals = evalsDe(secs);
    const cab = evals.map((ev) => `<th class="num">${esc(evCorta(ev))}<span class="ev-sub">prom · rep</span></th>`).join('');
    const filas = secs.slice(0, MAX_FILAS).map((s, i) => {
        const celdas = evals.map((ev) => {
            const e = s.evals[ev];
            if (!e) return '<td class="num ev-muted" title="No corresponde a este curso">·</td>';
            return `<td class="num">${notaHtml(e.promedio)}${e.reprobados ? ` · <span class="ev-bad">${e.reprobados}</span>` : ''}</td>`;
        }).join('');
        return `<tr class="clic ${s.sin_notas ? 'alarma' : ''}" data-sec="${esc(claveSec(s))}">
            <td class="num">${i + 1}</td>
            <td class="c-sec"><b>${esc(s.Seccion)}</b><span class="ev-sub">${detalleSeccion(s)}</span></td>
            <td class="c-curso">${esc(s.Curso)}</td>
            <td class="c-doc"><b>${esc(s.Docente)}</b>${s.Area ? ` <span class="ev-badge area ${esc(s.Area)}">${esc(s.Area)}</span>` : ''}</td>
            <td class="num">${s.Estudiantes}</td>
            <td class="num">${avance(s)}</td>
            ${celdas}
            <td class="num">${s.sin_notas ? '<span class="ev-badge sin">SIN NOTAS</span>' : (s.reprobados_total ? `<span class="ev-bad">${s.reprobados_total}</span>` : '0')}</td>
        </tr>`;
    }).join('');
    $('tabla').innerHTML = `<div class="ev-tabla-wrap"><table class="ev-tabla">
        <thead><tr><th class="num">#</th><th>Sección</th><th>Curso</th><th>Docente</th><th class="num">Est.</th><th class="num">Notas<span class="ev-sub">subidas</span></th>${cab}<th class="num">Reprob.</th></tr></thead>
        <tbody>${filas}</tbody></table></div>${avisoMas(secs.length)}`;
    $('tabla').querySelectorAll('tr[data-sec]').forEach((tr) => { tr.onclick = () => abrirSeccion(tr.dataset.sec); });
}

function porDocente(secs) {
    const por = new Map();
    for (const s of secs) {
        if (!por.has(s.Docente)) por.set(s.Docente, { docente: s.Docente, area: s.Area, secs: 0, est: 0, sin: 0, sub: 0, esp: 0, rep: 0, cursos: new Set() });
        const d = por.get(s.Docente);
        d.secs++; d.est += s.Estudiantes; d.sin += s.sin_notas ? 1 : 0;
        d.sub += s.Subidas || 0; d.esp += s.Esperadas || 0; d.rep += s.reprobados_total;
        d.cursos.add(s.Curso);
        if (!d.area && s.Area) d.area = s.Area;
    }
    return [...por.values()].sort((a, b) => (b.sin - a.sin) || a.docente.localeCompare(b.docente));
}

function pintarDocentes(secs) {
    const lista = porDocente(secs);
    $('tituloTabla').textContent = `Por docente (${fmt(lista.length)})`;
    if (!lista.length) return sinFilas('Sin docentes con estos filtros.');
    const filas = lista.slice(0, MAX_FILAS).map((d, i) => {
        const pct = d.esp ? Math.round((d.sub / d.esp) * 100) : 0;
        const cls = d.sub === 0 ? 'ev-bad' : (pct < 100 ? 'ev-warn' : 'ev-ok');
        return `<tr class="clic ${d.sin ? 'alarma' : ''}" data-doc="${esc(d.docente)}" title="Ver sus secciones">
            <td class="num">${i + 1}</td>
            <td class="c-doc"><b>${esc(d.docente)}</b>${d.area ? ` <span class="ev-badge area ${esc(d.area)}">${esc(d.area)}</span>` : ''}<span class="ev-sub">${esc([...d.cursos].slice(0, 3).join(' · '))}${d.cursos.size > 3 ? ' …' : ''}</span></td>
            <td class="num">${d.secs}</td>
            <td class="num">${fmt(d.est)}</td>
            <td class="num">${d.sin ? `<span class="ev-badge sin">${d.sin}</span>` : '0'}</td>
            <td class="num"><span class="${cls}">${pct}%</span><span class="ev-sub">${d.sub} de ${d.esp} evaluaciones</span></td>
            <td class="num">${d.rep ? `<span class="ev-bad">${fmt(d.rep)}</span>` : '0'}</td>
        </tr>`;
    }).join('');
    $('tabla').innerHTML = `<div class="ev-tabla-wrap"><table class="ev-tabla">
        <thead><tr><th class="num">#</th><th>Docente</th><th class="num">Secciones</th><th class="num">Estudiantes</th><th class="num">Sin notas</th><th class="num">Avance</th><th class="num">Reprob.</th></tr></thead>
        <tbody>${filas}</tbody></table></div>${avisoMas(lista.length)}`;
    $('tabla').querySelectorAll('tr[data-doc]').forEach((tr) => {
        tr.onclick = () => {
            $('buscar').value = tr.dataset.doc;
            document.querySelector('.ev-vistas [data-vista="secciones"]').click();
        };
    });
}

function reprobadosDe(secs) {
    const ok = new Set(secs.map(claveSec));
    const q = textoBusqueda();
    // Si la búsqueda nombra a un alumno, solo sus notas; si nombra docente/curso, toda la sección.
    let reps = st.datos.reprobados.filter((r) => ok.has(claveSec(r)));
    if (q) {
        const deAlumno = reps.filter((r) => r.Estudiante.toLowerCase().includes(q));
        const deSeccion = reps.filter((r) => `${r.Docente} ${r.Curso} ${r.Seccion} ${r.NRC}`.toLowerCase().includes(q));
        reps = deSeccion.length ? deSeccion : deAlumno;
    }
    return reps.slice().sort((a, b) => a.Nota - b.Nota);
}

function pintarReprobados(secs) {
    const reps = reprobadosDe(secs);
    $('tituloTabla').textContent = `Reprobados (${fmt(reps.length)})`;
    if (!reps.length) return sinFilas('Sin reprobados con estos filtros.');
    const filas = reps.slice(0, MAX_FILAS).map((r, i) => `<tr class="clic" data-sec="${esc(claveSec(r))}">
        <td class="num">${i + 1}</td>
        <td class="c-doc">${esc(r.Estudiante)}<span class="ev-sub">${esc(r.ID)}</span></td>
        <td class="c-sec"><b>${esc(r.Seccion)}</b><span class="ev-sub">NRC ${esc(r.NRC)} · ${esc(r.Sede || r.Campus)}</span></td>
        <td class="c-curso">${esc(r.Curso)}</td>
        <td class="c-doc">${esc(r.Docente)}</td>
        <td>${esc(r.Evaluacion)}</td>
        <td class="num ev-bad">${r.Nota}</td>
    </tr>`).join('');
    $('tabla').innerHTML = `<div class="ev-tabla-wrap"><table class="ev-tabla">
        <thead><tr><th class="num">#</th><th>Estudiante</th><th>Sección</th><th>Curso</th><th>Docente</th><th>Evaluación</th><th class="num">Nota</th></tr></thead>
        <tbody>${filas}</tbody></table></div>${avisoMas(reps.length)}`;
    $('tabla').querySelectorAll('tr[data-sec]').forEach((tr) => { tr.onclick = () => abrirSeccion(tr.dataset.sec); });
}

// ------------------------------------------------------------ detalle de una sección
function abrirSeccion(k) {
    const s = st.datos.secciones.find((x) => claveSec(x) === k);
    const regs = (st.datos.porSeccion.get(k) || []).slice().sort((a, b) => a.Estudiante.localeCompare(b.Estudiante));
    if (!s) return;
    const evals = st.datos.evaluaciones.filter((ev) => s.evals[ev]);
    const filas = regs.map((r, i) => {
        const [prom, , , sit] = C.situacion(r._notas);
        const celdas = evals.map((ev) => {
            const n = C.aNota(r._notas[ev]);
            return `<td class="num">${n === null || n === 0 ? '<span class="ev-muted">—</span>' : notaHtml(n)}</td>`;
        }).join('');
        const clsSit = sit === 'Desaprobando' ? 'ev-bad' : sit === 'Sin notas' ? 'ev-warn' : 'ev-ok';
        return `<tr class="${sit === 'Desaprobando' ? 'alarma' : ''}">
            <td class="num">${i + 1}</td>
            <td class="c-doc">${esc(r.Estudiante)}<span class="ev-sub">${esc(r.ID)}${r.FBaja ? ' · baja ' + esc(r.FBaja) : ''}</span></td>
            ${celdas}
            <td class="num">${prom === null ? '—' : notaHtml(prom)}</td>
            <td><span class="${clsSit}">${esc(sit)}</span></td>
        </tr>`;
    }).join('');
    const resumen = evals.map((ev) => {
        const e = s.evals[ev];
        return `<th class="num">${esc(evCorta(ev))}<span class="ev-sub">prom ${e.promedio == null ? '—' : e.promedio} · ${e.calificados}/${e.total}</span></th>`;
    }).join('');
    $('modal-contenido').innerHTML = `
        <div class="ev-modal-hero">
            <h3>${esc(s.Curso)} · ${esc(s.Seccion)}</h3>
            <p>${esc(s.Docente)}${s.Area ? ' (' + esc(s.Area) + ')' : ''} · ${detalleSeccion(s)} · ${esc(nombreCiclo(s.Ciclo))} · ${esc(s.Ciclo)}</p>
            <p>Avance: ${s.Subidas} de ${s.Esperadas} evaluaciones (${esc(s.TipoEval)}) · Docente ubicado por: ${esc(s.Coincidencia)}</p>
        </div>
        <div class="ev-modal-body">
            ${evals.length ? '' : '<p class="ev-nota">Este curso no tiene evaluaciones en el reporte.</p>'}
            <div class="ev-tabla-wrap"><table class="ev-tabla">
                <thead><tr><th class="num">#</th><th>Estudiante</th>${resumen}<th class="num">Promedio</th><th>Situación</th></tr></thead>
                <tbody>${filas}</tbody></table></div>
            <p class="ev-nota" style="margin-top:8px">— = sin calificar (0 o vacío). Reprobado = nota de 1 a 11.</p>
        </div>`;
    $('modal').hidden = false;
    document.body.classList.add('nf-lock');
}
function cerrarModal() {
    $('modal').hidden = true;
    document.body.classList.remove('nf-lock');
}

// ------------------------------------------------------------ exportar a Excel y PDF (con logo)
// Las librerías se bajan recién al exportar: la página abre igual de rápido.
const LIBS = {
    excel: ['https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js'],
    pdf: ['https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
        'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js']
};
const scripts = {};
function cargarScript(url) {
    if (!scripts[url]) {
        scripts[url] = new Promise((ok, mal) => {
            const el = document.createElement('script');
            el.src = url;
            el.onload = ok;
            el.onerror = () => { delete scripts[url]; el.remove(); mal(new Error('sin conexión con ' + url.split('/npm/')[1].split('/')[0])); };
            document.head.appendChild(el);
        });
    }
    return scripts[url];
}
const cargarLibs = async (lista) => { for (const url of lista) await cargarScript(url); };   // en orden: autotable necesita jsPDF

// Logo reducido a 480 px como data URL PNG (el original pesa demasiado dentro de un PDF).
// null si no se puede leer, p. ej. página abierta como archivo.
const LOGO = { url: 'LOGO_CERTUS.png', ancho: 480, alto: 134, dato: null };
async function logoCertus() {
    if (LOGO.dato) return LOGO.dato;
    try {
        const r = await fetch(LOGO.url);
        if (!r.ok) return null;
        const img = await createImageBitmap(await r.blob());
        const lienzo = document.createElement('canvas');
        lienzo.width = LOGO.ancho;
        lienzo.height = LOGO.alto = Math.round(LOGO.ancho * img.height / img.width);
        lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
        LOGO.dato = lienzo.toDataURL('image/png');
        return LOGO.dato;
    } catch (e) { return null; }
}

const marcaTiempo = () => {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
};
const textoGenerado = () => 'Generado el ' + new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });

function bajarArchivo(blob, nombre) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// Pone el botón en "Generando..." mientras corre fn.
async function conBoton(btn, fn) {
    const prev = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="nf-spinner"></span> Generando...';
    await pausa();
    try { await fn(); } catch (e) { alert('No se pudo generar el archivo: ' + (e.message || e)); }
    btn.disabled = false;
    btn.innerHTML = prev;
}

const FILA_CAB = 7;   // filas 1-3 logo, 4 título, 5 filtros, 6 resumen; 7 encabezados
const COLOR_CAB = '714B67';

function hojaExcel(wb, h, idLogo, info) {
    const ws = wb.addWorksheet(h.nombre, { views: [{ state: 'frozen', ySplit: FILA_CAB }] });
    if (idLogo !== null) ws.addImage(idLogo, { tl: { col: 0, row: 0 }, ext: { width: 180, height: Math.round(180 * LOGO.alto / LOGO.ancho) } });
    ws.getCell('A4').value = `Seguimiento EVALDO · ${h.nombre}`;
    ws.getCell('A4').font = { bold: true, size: 14, color: { argb: 'FF' + COLOR_CAB } };
    ws.getCell('A5').value = info.filtros;
    ws.getCell('A5').font = { size: 9, color: { argb: 'FF4B5563' } };
    ws.getCell('A6').value = `${fmt(h.filas.length)} fila(s) · ${info.generado}`;
    ws.getCell('A6').font = { size: 9, italic: true, color: { argb: 'FF4B5563' } };
    if (!h.filas.length) { ws.getCell(`A${FILA_CAB}`).value = 'Sin filas con estos filtros'; return; }

    const cols = Object.keys(h.filas[0]);
    const cab = ws.getRow(FILA_CAB);
    cab.values = cols;
    cab.height = 30;
    cab.eachCell((c) => {
        c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLOR_CAB } };
        c.alignment = { vertical: 'middle', wrapText: true };
    });
    for (const f of h.filas) {
        const fila = ws.addRow(cols.map((c) => (f[c] == null ? '' : f[c])));
        const rgb = h.color && h.color(f);
        if (rgb) {
            const relleno = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rgb } };
            for (let j = 1; j <= cols.length; j++) fila.getCell(j).fill = relleno;
        }
    }
    const muestra = h.filas.slice(0, 3000);
    cols.forEach((c, j) => {
        ws.getColumn(j + 1).width = Math.min(45, Math.max(c.length, ...muestra.map((f) => String(f[c] == null ? '' : f[c]).length)) + 2);
    });
    ws.autoFilter = { from: { row: FILA_CAB, column: 1 }, to: { row: FILA_CAB + h.filas.length, column: cols.length } };
}

async function exportar(tipo, btn) {
    if (!st.datos) { alert('Todavía no hay reportes para exportar.'); return; }
    const filtrados = C.filtrar(st.datos.registros, filtro, textoBusqueda());
    if (!filtrados.length) { alert('Ningún registro coincide con los filtros.'); return; }
    await conBoton(btn, async () => {
        const [, logo] = await Promise.all([cargarLibs(LIBS.excel), logoCertus()]);
        // Solo las evaluaciones que existen en lo exportado (ciclo I no lleva columnas de EV4).
        const evals = C.evaluacionesDe(filtrados);
        const hojas = tipo === 'estudiantes'
            ? C.hojasEstudiantes(filtrados, evals)
            : C.hojasConsolidado(filtrados, evals, C.resumenSecciones(filtrados, evals));
        const wb = new ExcelJS.Workbook();
        wb.creator = 'Seguimiento EVALDO - CERTUS';
        const idLogo = logo ? wb.addImage({ base64: logo, extension: 'png' }) : null;
        const info = { filtros: resumenFiltros(), generado: textoGenerado() };
        hojas.forEach((h) => hojaExcel(wb, h, idLogo, info));
        const buf = await wb.xlsx.writeBuffer();
        bajarArchivo(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
            `${tipo === 'estudiantes' ? 'Estudiantes_Docentes' : 'Notas_Filtrado'}_${marcaTiempo()}.xlsx`);
    });
}

// La vista actual como tabla de texto para el PDF: {titulo, cols: [{t, num}], filas: [[...]], alarma: Set(índices)}.
const NOMBRE_VISTA = { secciones: 'Resumen por sección', sinnotas: 'Secciones sin notas', docentes: 'Por docente', reprobados: 'Reprobados' };
function tablaVista(secs) {
    const t = (txt, num) => ({ t: txt, num: !!num });
    if (st.vista === 'docentes') {
        const lista = porDocente(secs);
        return {
            cols: [t('#', 1), t('Docente'), t('Cursos'), t('Secciones', 1), t('Estudiantes', 1), t('Sin notas', 1), t('Avance', 1), t('Reprob.', 1)],
            filas: lista.map((d, i) => [i + 1, d.docente + (d.area ? ` (${d.area})` : ''), [...d.cursos].join(' · '), d.secs, fmt(d.est), d.sin,
                `${d.esp ? Math.round((d.sub / d.esp) * 100) : 0}%\n${d.sub} de ${d.esp}`, fmt(d.rep)]),
            alarma: new Set(lista.map((d, i) => (d.sin ? i : -1)))
        };
    }
    if (st.vista === 'reprobados') {
        const reps = reprobadosDe(secs);
        return {
            cols: [t('#', 1), t('Estudiante'), t('ID'), t('Sección'), t('Curso'), t('Docente'), t('Evaluación'), t('Nota', 1)],
            filas: reps.map((r, i) => [i + 1, r.Estudiante, r.ID, `${r.Seccion}\nNRC ${r.NRC} · ${r.Sede || r.Campus}`, r.Curso, r.Docente, r.Evaluacion, r.Nota]),
            alarma: new Set()
        };
    }
    const lista = st.vista === 'sinnotas' ? secs.filter((s) => s.sin_notas) : secs;
    const evals = evalsDe(lista);
    return {
        cols: [t('#', 1), t('Sección'), t('Curso'), t('Docente'), t('Est.', 1), t('Notas subidas', 1),
            ...evals.map((ev) => t(`${evCorta(ev)}\nprom · rep`, 1)), t('Reprob.', 1)],
        filas: lista.map((s, i) => [i + 1, `${s.Seccion}\n${detalleTexto(s)}`, s.Curso, s.Docente + (s.Area ? ` (${s.Area})` : ''),
            s.Estudiantes, `${s.Subidas || 0} de ${s.Esperadas || 0}`,
            ...evals.map((ev) => {
                const e = s.evals[ev];
                if (!e) return '·';
                return `${e.promedio == null ? '-' : e.promedio}${e.reprobados ? ` · ${e.reprobados}` : ''}`;
            }),
            s.sin_notas ? 'SIN NOTAS' : s.reprobados_total]),
        alarma: new Set(lista.map((s, i) => (s.sin_notas ? i : -1)))
    };
}

async function exportarPdf(btn) {
    if (!st.datos) { alert('Todavía no hay reportes para exportar.'); return; }
    const secs = seccionesVisibles();
    const v = tablaVista(secs);
    if (!v.filas.length) { alert('No hay filas con estos filtros.'); return; }
    await conBoton(btn, async () => {
        const [, logo] = await Promise.all([cargarLibs(LIBS.pdf), logoCertus()]);
        const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
        const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 12;
        const logoAlto = 10, logoAncho = logoAlto * LOGO.ancho / LOGO.alto;
        const x = logo ? M + logoAncho + 6 : M;
        const n = statsDe(secs);
        const resumen = `${fmt(n.sec)} secciones · ${fmt(n.est)} estudiantes · ${fmt(n.sin)} secciones sin notas · ${fmt(n.rep)} notas reprobadas`;
        const filtros = doc.setFontSize(8).splitTextToSize(resumenFiltros(), W - x - M).slice(0, 2);
        const generado = textoGenerado();
        const encabezado = () => {
            if (logo) doc.addImage(logo, 'PNG', M, 8, logoAncho, logoAlto, 'logo', 'FAST');   // alias: se guarda una sola vez
            doc.setFont('helvetica', 'bold').setFontSize(14).setTextColor(17, 17, 17);
            doc.text(`Seguimiento EVALDO · ${NOMBRE_VISTA[st.vista]}`, x, 12);
            doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(75, 85, 99);
            doc.text(resumen, x, 16.5);
            doc.text(filtros, x, 20.5);
            doc.setDrawColor(229, 9, 20).setLineWidth(0.6).line(M, 26, W - M, 26);
        };
        doc.autoTable({
            head: [v.cols.map((c) => c.t)],
            body: v.filas,
            startY: 30,
            margin: { top: 30, left: M, right: M, bottom: 14 },
            styles: { fontSize: 7, cellPadding: 1.4, overflow: 'linebreak', valign: 'top', lineColor: [229, 231, 235], lineWidth: 0.1 },
            headStyles: { fillColor: [113, 75, 103], textColor: 255, fontStyle: 'bold', valign: 'middle' },
            alternateRowStyles: { fillColor: [248, 249, 250] },
            columnStyles: Object.fromEntries(v.cols.map((c, i) => [i, c.num ? { halign: 'right' } : {}])),
            didParseCell: (d) => {
                if (d.section === 'head' && v.cols[d.column.index].num) d.cell.styles.halign = 'right';
                if (d.section === 'body' && v.alarma.has(d.row.index)) d.cell.styles.fillColor = [253, 226, 225];
                if (d.section === 'body' && d.cell.raw === 'SIN NOTAS') Object.assign(d.cell.styles, { textColor: [200, 30, 30], fontStyle: 'bold' });
            },
            didDrawPage: encabezado
        });
        const paginas = doc.getNumberOfPages();
        for (let i = 1; i <= paginas; i++) {
            doc.setPage(i);
            doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(120, 120, 120);
            doc.text(`${generado} · Reprobado = nota de 1 a 11`, M, H - 6);
            doc.text(`Página ${i} de ${paginas}`, W - M, H - 6, { align: 'right' });
        }
        doc.save(`EVALDO_${NOMBRE_VISTA[st.vista].normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_')}_${marcaTiempo()}.pdf`);
    });
}

// ------------------------------------------------------------ modo master (pasos 1 y 2)
// Quien solo consulta ve los resultados; descargar, cargar y publicar piden la clave.
// Es un candado de comodidad (la página es pública), no protege los datos: eso lo hace la contraseña del equipo.
const MASTER_KEY = 'evaldo_master';
const CLAVE_MASTER = 'CONTA';
const esMaster = () => document.body.classList.contains('modo-master');

function ponerMaster(on, inicio) {
    document.body.classList.toggle('modo-master', on);
    $('masterTxt').textContent = on ? 'Salir de master' : 'Modo master';
    try { on ? localStorage.setItem(MASTER_KEY, '1') : localStorage.removeItem(MASTER_KEY); } catch (e) { /* sin almacenamiento */ }
    if (!inicio) pintarResultados();
}
function pulsarMaster() {
    if (esMaster()) { ponerMaster(false); return; }
    $('masterError').textContent = '';
    $('masterInput').value = '';
    $('modalMaster').hidden = false;
    document.body.classList.add('nf-lock');
    setTimeout(() => $('masterInput').focus(), 50);
}
function enviarMaster(ev) {
    ev.preventDefault();
    if ($('masterInput').value.trim().toUpperCase() !== CLAVE_MASTER) {
        $('masterError').textContent = 'Clave incorrecta.';
        $('masterInput').select();
        return;
    }
    cerrarMaster();
    ponerMaster(true);
}
function cerrarMaster() {
    if ($('modalMaster').hidden) return;
    $('modalMaster').hidden = true;
    document.body.classList.remove('nf-lock');
}

// ------------------------------------------------------------ descarga automática (agente local)
// El agente (evaldo_agente.py, carpeta SEGUIMIENTO ESTUDIANTES) maneja tu Brave con
// Campus Evolution. Una ventana con 3 pasos (agente, sesión, descargar) que se marcan
// solos; mientras está abierta se consulta al agente cada 2 segundos.
const AGENTE = location.port === '8765' ? location.origin : 'http://127.0.0.1:8765';
const auto = {
    combos: [], estados: {}, nlog: 0, importados: new Set(),
    agente: null, timer: null, abriendo: false, corriendo: false, total: 0
};

async function agente(ruta, opc) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), (opc && opc.espera) || 4000);
    try {
        const r = await fetch(AGENTE + ruta, Object.assign({ signal: ctl.signal, cache: 'no-store' }, opc || {}));
        return ruta.startsWith('/archivo/') ? r : r.json();
    } finally { clearTimeout(t); }
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function logAuto(msg) {
    const box = $('autoLog');
    const d = document.createElement('div');
    d.className = /❌|✗/.test(msg) ? 'err' : /✓|listo/i.test(msg) ? 'ok' : /🔑|⚠/.test(msg) ? 'warn' : '';
    d.textContent = msg;
    box.appendChild(d);
    box.scrollTop = box.scrollHeight;
}

function abrirAsistente() {
    if (!auto.corriendo) {   // ventana nueva: se olvida el resumen de la descarga anterior
        auto.combos = combosParaAuto();
        auto.estados = {};
        $('asisSub').textContent = 'Pulsa el botón de cada paso. Se marcan con ✓ solos.';
    }
    if (!auto.combos.length && !auto.corriendo) {
        const el = $('agenteEstado');
        el.className = 'ev-agente warn';
        el.textContent = combosElegidos().length
            ? 'Todas las combinaciones marcadas ya están completas. Marca "Volver a bajar también las completas" si quieres actualizarlas.'
            : 'Marca arriba grado, ciclo y sede.';
        return;
    }
    $('agenteEstado').textContent = '';
    $('modalAuto').hidden = false;
    document.body.classList.add('nf-lock');
    pintarAsistente();
    refrescarAsistente();
    clearInterval(auto.timer);
    auto.timer = setInterval(refrescarAsistente, 2000);
}

function cerrarAsistente() {
    $('modalAuto').hidden = true;
    document.body.classList.remove('nf-lock');
    // Si está descargando se sigue consultando en segundo plano (para importar lo que llega).
    if (!auto.corriendo) { clearInterval(auto.timer); auto.timer = null; }
}

function paso(n, estado, texto) {
    const el = $('paso' + n);
    el.className = 'ev-paso ' + estado;
    el.querySelector('.ev-paso-icono').innerHTML = estado === 'ok' ? '<i class="fas fa-check"></i>'
        : (estado === 'activo' && n !== 3 && texto.includes('...')) ? '<span class="nf-spinner"></span>' : n;
    $('paso' + n + 'Txt').innerHTML = texto;
}

function pintarAsistente() {
    const e = auto.agente;
    const n = auto.corriendo ? auto.total : auto.combos.length;
    // Paso 1: agente
    if (e) paso(1, 'ok', 'Conectado.');
    else if (auto.abriendo) paso(1, 'activo', 'Abriendo... acepta el aviso de Brave. ¿No pasa nada? Doble clic en <b>EVALDO_Agente.bat</b> (carpeta SEGUIMIENTO ESTUDIANTES).');
    else paso(1, 'activo', 'Abre el programa de tu PC que maneja Campus Evolution.');
    // Paso 2: sesión
    if (!e) paso(2, 'bloq', 'Después del paso 1.');
    else if (e.sesion) paso(2, 'ok', 'Sesión iniciada.');
    else paso(2, 'activo', 'Pulsa el botón e <b>inicia sesión</b> en la ventana de Brave que aparece.');
    // Paso 3: descargar
    $('paso3Tit').textContent = `Descargar ${n} reporte(s)`;
    const hechos = Object.values(auto.estados).filter((x) => x.fin).length;
    if (auto.corriendo) {
        paso(3, 'activo', `Descargando: ${hechos} de ${n} listos. Puedes cerrar esta ventana; sigue en segundo plano.`);
    } else if (e && e.sesion) {
        paso(3, hechos && hechos === n ? 'ok' : 'activo', hechos ? `${hechos} de ${n} terminados.` : 'Todo listo: pulsa Descargar.');
    } else paso(3, 'bloq', 'Después del paso 2.');
    $('paso3Btn').hidden = auto.corriendo;
    $('detenerBtn').hidden = !auto.corriendo;
    // Progreso y lista
    $('asisProgreso').hidden = !auto.corriendo && !hechos;
    $('asisBarra').style.width = n ? `${Math.round((hechos / n) * 100)}%` : '0';
    $('asisLista').innerHTML = (auto.corriendo || hechos ? auto.combos : []).map((c) => {
        const x = auto.estados[c.clave] || { texto: 'en cola', cls: 'ev-pend' };
        return `<div class="ev-asis-item"><span>${esc(nombreCombo(c))}</span><span class="${x.cls}">${esc(x.texto)}</span></div>`;
    }).join('');
}

async function refrescarAsistente() {
    const desde = auto.corriendo ? auto.nlog : 999999;
    const e = await agente(`/estado?desde=${desde}`).catch(() => null);
    auto.agente = e;
    if (e) auto.abriendo = false;
    if (e && auto.corriendo) await procesarAvance(e);
    pintarAsistente();
    pintarManual();
}

const TEXTOS_AUTO = {
    cola: () => ['en cola', 'ev-pend'],
    ejecutando: (i) => [i.detalle || 'ejecutando...', 'ev-warn'],
    vacio: () => ['sin alumnos', 'ev-pend', true],
    error: (i) => ['✗ ' + (i.detalle || 'error'), 'ev-bad', true],
    ok: () => ['descargado', 'ev-ok']
};

async function procesarAvance(e) {
    (e.log || []).forEach(logAuto);
    auto.nlog = e.nlog;
    for (const [clave, info] of Object.entries(e.listos || {})) {
        if (auto.importados.has(clave)) continue;
        const [texto, cls, fin] = (TEXTOS_AUTO[info.estado] || (() => [info.estado, 'ev-pend']))(info);
        auto.estados[clave] = { texto, cls, fin: !!fin };
        if (info.estado === 'vacio' && !(st.reportes.get(clave) || {}).registros?.length) {
            // Se recuerda para no volver a pedirla en la siguiente descarga.
            const [, grado, strm, campus] = clave.split('_');
            const marca = { clave, nombre: '(sin alumnos)', origen: 'programacion', vacio: true, grado, strm, campus, filas: 0, registros: [], fecha: Date.now() };
            st.reportes.set(clave, marca);
            DB.put('reportes', marca).catch(() => {});
            auto.importados.add(clave);
            auto.estados[clave] = { texto: 'sin alumnos', cls: 'ev-pend', fin: true };
            continue;
        }
        if (info.estado !== 'ok') continue;
        auto.importados.add(clave);   // se marca antes de traerlo para no repetirlo en el siguiente sondeo
        try {
            const resp = await agente('/archivo/' + clave, { espera: 60000 });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const archivo = new File([await resp.arrayBuffer()], clave + '.xls', { lastModified: Date.now() });
            await importar([archivo], true);
            auto.estados[clave] = { texto: '✓ importado', cls: 'ev-ok', fin: true };
        } catch (err) {
            auto.importados.delete(clave);
            auto.estados[clave] = { texto: '✗ no se pudo traer', cls: 'ev-bad', fin: true };
        }
    }
    if (!e.corriendo) {
        auto.corriendo = false;
        const ok = Object.values(auto.estados).filter((x) => x.texto === '✓ importado').length;
        $('asisSub').textContent = e.error === 'sin_sesion'
            ? '🔑 Se venció la sesión de Campus. Vuelve a iniciarla (paso 2) y pulsa Descargar: seguirá con las que faltan.'
            : e.error ? 'El agente se detuvo: ' + e.error : `✓ Listo: ${ok} de ${auto.total} reporte(s) importados. Pulsa "Publicar para el equipo" (paso 2) para que el equipo lo vea.`;
        if ($('modalAuto').hidden) { clearInterval(auto.timer); auto.timer = null; }
    }
}

async function pulsarPaso1() {
    auto.abriendo = true;
    pintarAsistente();
    location.href = 'evaldo://iniciar';   // abre EVALDO_Agente.bat (botón instalado)
}

async function pulsarPaso2() {
    await agente('/abrir-navegador', { method: 'POST', espera: 20000 }).catch(() => {});
    $('paso2Txt').innerHTML = 'Se abrió Campus Evolution en Brave: <b>inicia sesión ahí</b>. Esto se marca solo.';
}

async function pulsarPaso3() {
    // Se recalcula: lo ya importado queda "completo" y no se vuelve a pedir.
    auto.combos = combosParaAuto();
    if (!auto.combos.length) { $('asisSub').textContent = 'No queda nada pendiente en las combinaciones marcadas.'; return; }
    const antes = await agente('/estado?desde=999999').catch(() => null);
    const r = await agente('/descargar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ combos: auto.combos.map(({ grado, strm, campus }) => ({ grado, strm, campus })) })
    }).catch((err) => ({ ok: false, error: err.message }));
    if (!r.ok) {
        $('asisSub').textContent = r.error === 'sin_sesion' ? 'Primero inicia sesión en Campus Evolution (paso 2).' : (r.error || 'El agente no pudo empezar.');
        return;
    }
    auto.corriendo = true;
    auto.total = auto.combos.length;
    auto.estados = {};
    auto.importados = new Set();
    auto.nlog = antes ? antes.nlog : 0;
    $('autoLog').innerHTML = '';
    $('asisSub').textContent = 'Descargando. Cada reporte entra solo a la página apenas está listo.';
    pintarAsistente();
}

// ------------------------------------------------------------ datos del equipo (publicados cifrados)
// datos/evaldo.bin = "EVD1" + iteraciones(4) + sal(16) + iv(12) + AES-GCM(gzip(json)); lo genera
// evaldo_publicar.py (agente). Se descifra aquí con la contraseña del equipo (WebCrypto).
const DATOS_EQUIPO = 'datos/evaldo.bin';
const CLAVE_KEY = 'evaldo_clave_equipo';

async function descifrarEquipo(buf, clave) {
    if (new TextDecoder().decode(new Uint8Array(buf, 0, 4)) !== 'EVD1') throw new Error('formato desconocido');
    const iteraciones = new DataView(buf).getUint32(4);
    const sal = new Uint8Array(buf, 8, 16), iv = new Uint8Array(buf, 24, 12), cifrado = new Uint8Array(buf, 36);
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveKey']);
    const llave = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sal, iterations: iteraciones, hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, llave, cifrado);   // falla si la clave es otra
    const texto = await new Response(new Blob([plano]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    return JSON.parse(texto);
}

// Descarga el archivo publicado (si existe) y, con la clave recordada, lo aplica; si no, pide la clave.
async function cargarEquipo() {
    if (!window.crypto || !crypto.subtle || typeof DecompressionStream === 'undefined') return;
    try {
        const r = await fetch(`${DATOS_EQUIPO}?t=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok) return;
        st.bufEquipo = await r.arrayBuffer();
    } catch (e) { return; }
    let clave = null;
    try { clave = localStorage.getItem(CLAVE_KEY); } catch (e) { /* sin almacenamiento */ }
    if (clave && await aplicarEquipo(clave)) return;
    abrirClave();
}
function abrirClave() {
    $('claveError').textContent = '';
    $('modalClave').hidden = false;
    document.body.classList.add('nf-lock');
    setTimeout(() => $('claveInput').focus(), 50);
}

async function aplicarEquipo(clave) {
    let datos;
    try { datos = await descifrarEquipo(st.bufEquipo, clave); } catch (e) { return false; }
    try { localStorage.setItem(CLAVE_KEY, clave); } catch (e) { /* sin almacenamiento */ }
    for (const rep of datos.reportes) {
        const local = st.reportes.get(rep.clave);
        // Lo bajado en este navegador manda si es más nuevo; un completo nunca se cambia por un directo.
        if (local && !local.publicado) {
            if (local.origen === 'programacion' && rep.origen !== 'programacion') continue;
            if ((local.fecha || 0) >= rep.fecha && !(local.origen !== 'programacion' && rep.origen === 'programacion')) continue;
        }
        const n = datos.campos.length;
        const registros = rep.registros.map((fila) => {
            const o = { _archivo: rep.clave, _notas: fila[n] || {} };
            datos.campos.forEach((c, i) => { o[c] = fila[i]; });
            return o;
        });
        const [, grado, strm, campus] = rep.clave.split('_');
        st.reportes.set(rep.clave, { clave: rep.clave, nombre: 'publicado por el equipo', origen: rep.origen, grado, strm, campus, filas: rep.filas, fecha: rep.fecha, registros, publicado: true });
    }
    for (const k of datos.vacios || []) {
        if (st.reportes.has(k)) continue;
        const [, grado, strm, campus] = k.split('_');
        st.reportes.set(k, { clave: k, nombre: '(sin alumnos)', origen: 'programacion', vacio: true, grado, strm, campus, filas: 0, registros: [], fecha: 0, publicado: true });
    }
    st.equipo = { generado: datos.generado, n: datos.reportes.length };
    return true;
}

async function enviarClave(ev) {
    ev.preventDefault();
    $('claveError').textContent = '';
    const boton = ev.submitter || $('claveForm').querySelector('button');
    boton.disabled = true;
    const ok = await aplicarEquipo($('claveInput').value);
    boton.disabled = false;
    if (!ok) { $('claveError').textContent = 'Contraseña incorrecta.'; return; }
    cerrarClave();
    pintarArchivos();
    analizar();
}
function cerrarClave() {
    $('modalClave').hidden = true;
    document.body.classList.remove('nf-lock');
}

async function publicarEquipo() {
    const el = $('publicarEstado');
    const aviso = (html, tipo) => { el.className = 'ev-agente ' + (tipo || ''); el.innerHTML = html; };
    const e = await agente('/estado?desde=999999').catch(() => null);
    if (!e) { aviso('Para publicar necesitas el agente abierto: pulsa ⚡ Descargar automáticamente → paso 1 "Abrir agente".', 'warn'); return; }
    const r = await agente('/publicar', { method: 'POST' }).catch(() => ({ ok: false }));
    if (!r.ok) { aviso('El agente está ocupado (descargando o publicando). Intenta cuando termine.', 'warn'); return; }
    $('publicarBtn').disabled = true;
    aviso('<span class="nf-spinner"></span> Cifrando y subiendo a GitHub los reportes de la carpeta del agente...');
    for (;;) {
        await dormir(2000);
        const x = await agente('/estado?desde=999999').catch(() => null);
        if (!x || x.publicacion.corriendo) continue;
        aviso(esc((x.publicacion.ok ? '✓ ' : '✗ ') + x.publicacion.mensaje), x.publicacion.ok ? 'ok' : 'err');
        break;
    }
    $('publicarBtn').disabled = false;
}

// Al final: así todas las constantes de arriba ya existen cuando arranca.
init();
