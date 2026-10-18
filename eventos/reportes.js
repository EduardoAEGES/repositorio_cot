/* ============================================================================
   Reportes varios · analítica interactiva de la encuesta de alineamiento
   docente. Los datos salen de datos/alineamiento_docente_2026_20_m2.json y se
   pueden editar, agregar y eliminar desde la pestaña «Datos (editables)»; las
   ediciones quedan guardadas en el navegador.
   La pestaña «Desempeño docente» muestra el reporte del Evaldo (carpeta evaldo/).
   ========================================================================== */

const $ = id => document.getElementById(id);

/* Supabase: los datos de la encuesta viven en la tabla reportes_datos, una fila
   por reporte con todo el conjunto en JSON (ver db_create_reportes_datos.sql).
   Si no responde, se trabaja con el archivo y el navegador. */
const SB = {
    url: 'https://klmjmlhwuzhymrplemgw.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsbWptbGh3dXpoeW1ycGxlbWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTMyNjQsImV4cCI6MjA4NzE2OTI2NH0.xFWMvUJa9n9TBcBG1WSeqCGiWBaCAtCU9aY7GXk4W6E',
    tabla: 'reportes_datos',
    clave: 'alineamiento_m2'
};
async function sbPedir(ruta, opciones = {}) {
    const r = await fetch(`${SB.url}/rest/v1/${ruta}`, {
        ...opciones,
        headers: {
            apikey: SB.key, Authorization: 'Bearer ' + SB.key,
            'Content-Type': 'application/json', ...(opciones.headers || {})
        }
    });
    if (!r.ok) {
        const detalle = await r.text().catch(() => '');
        if (r.status === 404 || /does not exist|42P01/.test(detalle)) {
            throw new Error('falta crear la tabla ' + SB.tabla + ' en Supabase (ejecuta db_create_reportes_datos.sql)');
        }
        throw new Error('Supabase respondió ' + r.status + (detalle ? ': ' + detalle.slice(0, 120) : ''));
    }
    const t = await r.text();
    return t ? JSON.parse(t) : null;
}
async function leerDeSupabase() {
    const filas = await sbPedir(`${SB.tabla}?clave=eq.${SB.clave}&select=datos`);
    return Array.isArray(filas) && filas[0] ? filas[0].datos : null;  // null = tabla vacía
}
async function guardarEnSupabase() {
    await sbPedir(SB.tabla, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
            clave: SB.clave,
            datos: { columnas: DATASET.columnas, filas: DATASET.filas },
            actualizado_en: new Date().toISOString()
        })
    });
}
const COLORES = {
    brand: '#714b67', brandClaro: '#a07a95', teal: '#017e84', tealClaro: '#4fb3b8',
    ok: '#2e8b57', warn: '#d9822b', err: '#c8463d', gris: '#a0a6b2', tinta: '#272b35'
};
const PALETA = ['#714b67', '#017e84', '#d9822b', '#2e8b57', '#4a6fa5', '#c8463d', '#a07a95', '#4fb3b8', '#8a6d3b', '#6b7280'];
const ESCALA_LIKERT = ['Muy deficiente', 'Deficiente', 'Mala', 'Muy mala', 'Regular', 'Buena', 'Muy buena', 'Excelente'];
const VALOR_LIKERT = {
    'muy deficiente': 1, 'muy mala': 1, 'deficiente': 2, 'mala': 2, 'regular': 3,
    'buena': 4, 'muy buena': 5, 'excelente': 5
};
const COLOR_LIKERT = {
    'muy deficiente': '#c8463d', 'muy mala': '#c8463d', 'deficiente': '#e0845c', 'mala': '#e0845c',
    'regular': '#d9b23c', 'buena': '#5aa469', 'muy buena': '#2e8b57', 'excelente': '#2e8b57'
};

let DATASET = null;          // { nombre, descripcion, columnas, filas, modo, tabla }
let ORIGINALES = [];         // copia intacta de las filas recién cargadas
let FILTROS = {};
let VISTA = 'alineamiento';
let SUBVISTA = 'dashboard';
let GRAFICOS = {};
let PANELES = [];            // definiciones de panel para el dashboard actual
let CONFIG = { titulo: '', subtitulo: '', conclusiones: '', paneles: {} };
let PENDIENTES = { editadas: new Set(), eliminadas: [], nuevas: new Set() };
let EN_SUPABASE = false;

/* ----------------------------- utilidades ------------------------------- */
function toast(msg, tipo = '') {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast ver ' + tipo;
    clearTimeout(t._t);
    t._t = setTimeout(() => { t.className = 'toast ' + tipo; }, 3200);
}
const escapar = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const normalizar = s => String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };
const unico = arr => [...new Set(arr)];

function fechaLegible(v) {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function diaISO(v) {
    const d = new Date(v);
    return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}
function slug(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase().slice(0, 48) || 'col';
}

/* ============================== CARGA DE DATOS =========================== */
async function cargarDatos() {
    $('paneles').innerHTML = '<div class="cargando">Cargando datos…</div>';
    $('kpis').innerHTML = '';
    try {
        const r = await fetch('datos/alineamiento_docente_2026_20_m2.json');
        if (!r.ok) throw new Error('no se encontró datos/alineamiento_docente_2026_20_m2.json');
        DATASET = { ...(await r.json()), clave: 'alineamiento_m2' };
        // Lo guardado en Supabase manda sobre el archivo: es lo que ven todos.
        try {
            const remoto = await leerDeSupabase();
            EN_SUPABASE = true;   // la tabla respondió, aunque todavía esté vacía
            if (remoto && Array.isArray(remoto.filas) && remoto.filas.length) {
                DATASET.columnas = remoto.columnas || DATASET.columnas;
                DATASET.filas = remoto.filas;
            }
        } catch (e) {
            EN_SUPABASE = false;
            console.warn('Sin conexión con Supabase, se usan los datos del archivo:', e.message);
        }
    } catch (e) {
        console.error(e);
        $('paneles').innerHTML = `<div class="vacio">No se pudieron cargar los datos: ${escapar(e.message || e)}</div>`;
        toast('Error al cargar los datos', 'error');
        return;
    }
    if (!EN_SUPABASE) aplicarGuardadoLocal();
    ORIGINALES = JSON.parse(JSON.stringify(DATASET.filas));
    PENDIENTES = { editadas: new Set(), eliminadas: [], nuevas: new Set() };
    FILTROS = {};
    CONFIG.titulo = DATASET.nombre;
    CONFIG.subtitulo = DATASET.descripcion || '';
    CONFIG.conclusiones = '';
    $('desc-fuente').textContent = `${DATASET.descripcion || ''} ${DATASET.origen ? '· ' + DATASET.origen : ''} · ${EN_SUPABASE ? 'datos sincronizados con Supabase' : 'datos del archivo (Supabase no disponible)'}`.trim();
    definirPaneles();
    refrescar();
}

/* --------------------- persistencia en el navegador ---------------------- */
const claveLocal = () => 'reportes_cot_' + (DATASET?.clave || 'x');
function guardarLocal() {
    try { localStorage.setItem(claveLocal(), JSON.stringify(DATASET.filas)); } catch (e) { /* cuota llena */ }
}
function aplicarGuardadoLocal() {
    try {
        const guardado = localStorage.getItem(claveLocal());
        if (guardado) {
            const filas = JSON.parse(guardado);
            if (Array.isArray(filas) && filas.length) DATASET.filas = filas;
        }
    } catch (e) { /* ignorar */ }
}

/* =============================== FILTROS ================================= */
/* La selección se arma haciendo clic en los gráficos; aquí solo se dibujan
   los chips de lo que está seleccionado para poder quitarlo. */
function etiquetaFiltro(k, v) {
    if (k === '_nps') return `Puntuación ${v}`;
    if (k === '_dia') return `Día ${fechaLegible(v)}`;
    if (k === '_texto') return `Texto «${v}»`;
    return `${recortar(etiquetaAspecto(k), 30)}: ${v}`;
}
function pintarChips() {
    const activos = Object.entries(FILTROS).filter(([k, v]) => v !== '' && v !== undefined && v !== null);
    const cont = $('chips-filtros');
    if (!activos.length) {
        cont.innerHTML = '<span class="pista">Sin selección: haz clic en cualquier barra, porción o palabra del dashboard para ver el detalle de esas respuestas.</span>';
    } else {
        cont.innerHTML = activos.map(([k, v]) => `
            <span class="chip-sel">${escapar(etiquetaFiltro(k, v))}
                <button data-quitar="${escapar(k)}" title="Quitar">✕</button>
            </span>`).join('');
        cont.querySelectorAll('[data-quitar]').forEach(b => b.addEventListener('click', () => {
            delete FILTROS[b.dataset.quitar];
            refrescar();
        }));
    }
    $('btn-limpiar').disabled = !activos.length;
}

function filasFiltradas() {
    const colFecha = DATASET.columnas.find(c => c.tipo === 'fecha');
    const colNPS = colsPorTipo('nps')[0];
    const texto = normalizar(FILTROS._texto || '');
    return DATASET.filas.filter(f => {
        for (const [k, v] of Object.entries(FILTROS)) {
            if (k.startsWith('_') || v === '' || v === undefined || v === null) continue;
            if (normalizar(f[k]) !== normalizar(v)) return false;
        }
        if (FILTROS._nps !== undefined && FILTROS._nps !== '' && colNPS) {
            if (num(f[colNPS.key]) !== Number(FILTROS._nps)) return false;
        }
        if (FILTROS._dia && colFecha && diaISO(f[colFecha.key]) !== FILTROS._dia) return false;
        if (texto) {
            const todo = normalizar(DATASET.columnas.map(c => f[c.key]).join(' '));
            if (!todo.includes(texto)) return false;
        }
        return true;
    });
}

/* ============================== MÉTRICAS ================================= */
function colsPorTipo(tipo) { return DATASET.columnas.filter(c => c.tipo === tipo); }

function calcularNPS(filas, key) {
    const vals = filas.map(f => num(f[key])).filter(v => v !== null && v >= 0 && v <= 10);
    if (!vals.length) return null;
    const prom = vals.filter(v => v >= 9).length, pas = vals.filter(v => v >= 7 && v < 9).length, det = vals.filter(v => v < 7).length;
    return {
        n: vals.length, promotores: prom, pasivos: pas, detractores: det,
        pctProm: prom / vals.length * 100, pctPas: pas / vals.length * 100, pctDet: det / vals.length * 100,
        nps: Math.round((prom - det) / vals.length * 100),
        promedio: vals.reduce((a, b) => a + b, 0) / vals.length,
        vals
    };
}
function promedioLikert(filas, key) {
    const vals = filas.map(f => VALOR_LIKERT[normalizar(f[key])]).filter(v => v);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
}
function conteo(filas, key) {
    // Agrupa ignorando mayúsculas y tildes ("NEGOCIOS" y "Negocios" son lo mismo)
    // y muestra la escritura más usada.
    const m = new Map();
    filas.forEach(f => {
        const v = String(f[key] ?? '').trim();
        if (!v) return;
        const n = normalizar(v);
        if (!m.has(n)) m.set(n, { total: 0, escrituras: new Map() });
        const e = m.get(n);
        e.total++;
        e.escrituras.set(v, (e.escrituras.get(v) || 0) + 1);
    });
    return [...m.values()]
        .map(e => [[...e.escrituras.entries()].sort((a, b) => b[1] - a[1])[0][0], e.total])
        .sort((a, b) => b[1] - a[1]);
}
const STOPWORDS = new Set(('de la que el en y a los se del las un por con no una su para es al lo como mas más pero sus le ya o este si porque esta entre cuando muy sobre también me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mi antes algunos qué unos yo otro otras otra él tanto esa estos mucho quienes nada muchos cual sea poco ella estar haber estas estaba estamos algunas algo nosotros mi mis tu te ti tus ellas nosotras vosotros vosotras os mío mía ninguna ninguno ningun nada comentario comentarios').split(' '));
function palabrasFrecuentes(filas, keys, tope = 14) {
    const m = new Map();
    filas.forEach(f => keys.forEach(k => {
        normalizar(f[k]).replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/).forEach(p => {
            if (p.length < 4 || STOPWORDS.has(p)) return;
            m.set(p, (m.get(p) || 0) + 1);
        });
    }));
    return [...m.entries()].filter(e => e[1] > 1).sort((a, b) => b[1] - a[1]).slice(0, tope);
}

/* ============================== PANELES ================================== */
function definirPaneles() {
    PANELES = [];
    const colNPS = colsPorTipo('nps')[0];
    const colsLikert = colsPorTipo('likert');
    const colsCat = DATASET.columnas.filter(c => ['categoria', 'opcion'].includes(c.tipo));
    const colFecha = colsPorTipo('fecha')[0];
    const colsNum = colsPorTipo('numero');
    const colsCom = colsPorTipo('comentario');
    const colsConoc = DATASET.columnas.filter(c => c.tipo === 'opcion' && c.correcta);

    if (colNPS) {
        PANELES.push({ id: 'nps_medidor', titulo: 'Net Promoter Score', sub: 'Promotores (9-10) menos detractores (0-6)', render: panelMedidorNPS, meta: { key: colNPS.key } });
        PANELES.push({ id: 'nps_dist', titulo: 'Distribución de puntuaciones', sub: 'Cuántas personas dieron cada nota de 0 a 10', render: panelDistribucionNPS, meta: { key: colNPS.key } });
    }
    if (colsLikert.length) {
        PANELES.push({ id: 'likert', titulo: 'Valoración por aspecto evaluado', sub: 'Distribución porcentual de cada respuesta', ancho: true, render: panelLikert, meta: { keys: colsLikert.map(c => c.key) } });
        PANELES.push({ id: 'likert_prom', titulo: 'Promedio por aspecto (escala 1 a 5)', sub: 'Promedio ponderado de las valoraciones', render: panelPromedioLikert, meta: { keys: colsLikert.map(c => c.key) } });
    }
    colsCat.filter(c => !c.correcta).slice(0, 3).forEach(c => {
        PANELES.push({
            id: 'cat_' + c.key, titulo: c.label, sub: colNPS ? 'Respuestas y NPS por categoría' : 'Respuestas por categoría',
            render: panelCategoria, meta: { key: c.key, nps: colNPS?.key }
        });
    });
    if (colFecha) PANELES.push({ id: 'tendencia', titulo: 'Evolución de respuestas', sub: 'Respuestas por día' + (colNPS ? ' y NPS acumulado del día' : ''), ancho: true, render: panelTendencia, meta: { key: colFecha.key, nps: colNPS?.key } });
    colsNum.forEach(c => PANELES.push({ id: 'num_' + c.key, titulo: c.label, sub: 'Distribución de la escala', render: panelNumero, meta: { key: c.key } }));
    if (colsConoc.length) PANELES.push({ id: 'conocimiento', titulo: 'Preguntas de conocimiento', sub: '% de respuestas que coinciden con la alternativa correcta', ancho: colsConoc.length > 2, render: panelConocimiento, meta: { keys: colsConoc.map(c => c.key) } });
    if (colsCom.length) {
        PANELES.push({ id: 'palabras', titulo: 'Temas más mencionados', sub: 'Palabras repetidas en los comentarios abiertos', render: panelPalabras, meta: { keys: colsCom.map(c => c.key) } });
        PANELES.push({ id: 'comentarios', titulo: 'Comentarios recibidos', sub: 'Texto literal de las respuestas abiertas', ancho: true, render: panelComentarios, meta: { keys: colsCom.map(c => c.key) } });
    }
    PANELES.forEach(p => { if (CONFIG.paneles[p.id] === undefined) CONFIG.paneles[p.id] = true; });
}

function marcoPanel(p) {
    return `<div class="panel${p.ancho ? ' ancho' : ''}" data-panel="${p.id}">
        <h3>${escapar(p.titulo)}</h3>
        <div class="sub">${escapar(p.sub || '')}</div>
        <div class="contenido" id="cont-${p.id}"></div>
    </div>`;
}

function lienzo(id, alta) {
    return `<div class="caja${alta ? ' alta' : ''}"><canvas id="cv-${id}"></canvas></div>`;
}
/* Un clic en cualquier elemento del gráfico abre el detalle de esas respuestas.
   `alClic(indice)` devuelve { titulo, filtro } del elemento pulsado. */
function conDetalle(config, alClic) {
    const previo = config.options && config.options.onClick;
    config.options = config.options || {};
    config.options.onClick = (evt, els, chart) => {
        if (previo) previo(evt, els, chart);
        if (!els || !els.length) return;
        const el = els[0];
        const d = alClic(el.index, el.datasetIndex, chart);
        if (d) abrirDetalle(d.titulo, d.filtro, d.columnas);
    };
    return config;
}

function dibujar(id, config) {
    const cv = $('cv-' + id);
    if (!cv) return;
    if (GRAFICOS[id]) GRAFICOS[id].destroy();
    config.options = Object.assign({
        responsive: true, maintainAspectRatio: false, animation: { duration: 420 },
        onHover: (e, els) => { e.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
        plugins: { legend: { labels: { font: { family: 'Outfit', size: 11 }, boxWidth: 12 } } }
    }, config.options || {});
    GRAFICOS[id] = new Chart(cv.getContext('2d'), config);
}

/* ------------------------------ renderers -------------------------------- */
function panelMedidorNPS(p, filas) {
    const r = calcularNPS(filas, p.meta.key);
    const c = $('cont-' + p.id);
    if (!r) { c.innerHTML = '<div class="vacio">Sin puntuaciones NPS.</div>'; return; }
    const color = r.nps >= 50 ? COLORES.ok : r.nps >= 0 ? COLORES.warn : COLORES.err;
    c.innerHTML = lienzo(p.id) + `<div style="text-align:center;margin-top:-72px;">
            <div style="font-size:40px;font-weight:800;color:${color};line-height:1;">${r.nps}</div>
            <div style="font-size:11.5px;color:var(--muted);">NPS sobre ${r.n} respuestas · promedio ${r.promedio.toFixed(2)}/10</div>
        </div>
        <div style="display:flex;gap:8px;margin-top:14px;font-size:12px;justify-content:center;flex-wrap:wrap;">
            <span style="color:${COLORES.ok};font-weight:700;">Promotores ${r.pctProm.toFixed(1)}%</span>
            <span style="color:${COLORES.gris};font-weight:700;">Pasivos ${r.pctPas.toFixed(1)}%</span>
            <span style="color:${COLORES.err};font-weight:700;">Detractores ${r.pctDet.toFixed(1)}%</span>
        </div>`;
    const key = p.meta.key;
    const grupos = [
        { nombre: 'Promotores', rango: v => v >= 9 },
        { nombre: 'Pasivos', rango: v => v >= 7 && v < 9 },
        { nombre: 'Detractores', rango: v => v < 7 }
    ];
    dibujar(p.id, conDetalle({
        type: 'doughnut',
        data: {
            labels: grupos.map(g => g.nombre),
            datasets: [{ data: [r.promotores, r.pasivos, r.detractores], backgroundColor: [COLORES.ok, COLORES.gris, COLORES.err], borderWidth: 0 }]
        },
        options: {
            circumference: 180, rotation: 270, cutout: '72%',
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.parsed} (${(ctx.parsed / r.n * 100).toFixed(1)}%)` } } }
        }
    }, i => ({
        titulo: grupos[i].nombre,
        filtro: f => { const v = num(f[key]); return v !== null && grupos[i].rango(v); }
    })));
}

function panelDistribucionNPS(p, filas) {
    const r = calcularNPS(filas, p.meta.key);
    const c = $('cont-' + p.id);
    if (!r) { c.innerHTML = '<div class="vacio">Sin puntuaciones NPS.</div>'; return; }
    c.innerHTML = lienzo(p.id);
    const datos = Array.from({ length: 11 }, (_, i) => r.vals.filter(v => Math.round(v) === i).length);
    dibujar(p.id, conDetalle({
        type: 'bar',
        data: {
            labels: datos.map((_, i) => i),
            datasets: [{
                label: 'Respuestas', data: datos,
                backgroundColor: datos.map((_, i) => i >= 9 ? COLORES.ok : i >= 7 ? COLORES.gris : COLORES.err),
                borderRadius: 5
            }]
        },
        options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    }, i => ({ titulo: `Puntuación ${i}`, filtro: { _nps: i } })));
}

function panelLikert(p, filas) {
    const c = $('cont-' + p.id);
    const keys = p.meta.keys;
    const etiquetas = keys.map(k => recortar(etiquetaAspecto(k), 40));
    const niveles = unico(keys.flatMap(k => filas.map(f => String(f[k] ?? '').trim()).filter(Boolean)))
        .sort((a, b) => (VALOR_LIKERT[normalizar(a)] || 0) - (VALOR_LIKERT[normalizar(b)] || 0));
    if (!niveles.length) { c.innerHTML = '<div class="vacio">Sin valoraciones.</div>'; return; }
    c.innerHTML = lienzo(p.id, keys.length > 3);
    const datasets = niveles.map(n => ({
        label: n,
        data: keys.map(k => {
            const total = filas.filter(f => String(f[k] ?? '').trim()).length || 1;
            return filas.filter(f => normalizar(f[k]) === normalizar(n)).length / total * 100;
        }),
        backgroundColor: COLOR_LIKERT[normalizar(n)] || COLORES.brand, borderRadius: 3
    }));
    dibujar(p.id, conDetalle({
        type: 'bar',
        data: { labels: etiquetas, datasets },
        options: {
            indexAxis: 'y',
            scales: { x: { stacked: true, max: 100, ticks: { callback: v => v + '%' } }, y: { stacked: true, ticks: { font: { size: 11 } } } },
            plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.x.toFixed(1)}%` } } }
        }
    }, (i, di) => ({
        titulo: `${etiquetaAspecto(keys[i])}: ${niveles[di]}`,
        filtro: { [keys[i]]: niveles[di] }
    })));
}

function panelPromedioLikert(p, filas) {
    const c = $('cont-' + p.id);
    const keys = p.meta.keys;
    const etiquetas = keys.map(k => recortar(etiquetaAspecto(k), 18));
    const datos = keys.map(k => promedioLikert(filas, k) || 0);
    c.innerHTML = lienzo(p.id);
    dibujar(p.id, conDetalle({
        type: 'bar',
        data: { labels: etiquetas, datasets: [{ label: 'Promedio', data: datos, backgroundColor: COLORES.brand, borderRadius: 5 }] },
        options: {
            indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.parsed.x.toFixed(2) + ' / 5' } } },
            scales: { x: { min: 0, max: 5 }, y: { ticks: { font: { size: 10 }, autoSkip: false } } }
        }
    }, i => ({
        titulo: etiquetaAspecto(keys[i]),
        filtro: f => String(f[keys[i]] ?? '').trim() !== '',
        columnas: [keys[i]]
    })));
}

function panelCategoria(p, filas) {
    const c = $('cont-' + p.id);
    const datos = conteo(filas, p.meta.key).slice(0, 12);
    if (!datos.length) { c.innerHTML = '<div class="vacio">Sin datos en esta categoría.</div>'; return; }
    c.innerHTML = lienzo(p.id, datos.length > 7);
    const ds = [{ label: 'Respuestas', data: datos.map(d => d[1]), backgroundColor: datos.map((_, i) => PALETA[i % PALETA.length]), borderRadius: 5, order: 2 }];
    const escalas = { x: { beginAtZero: true, ticks: { precision: 0 } } };
    if (p.meta.nps) {
        const npsPorCat = datos.map(d => {
            const r = calcularNPS(filas.filter(f => normalizar(f[p.meta.key]) === normalizar(d[0])), p.meta.nps);
            return r ? r.nps : null;
        });
        ds.push({ label: 'NPS', data: npsPorCat, type: 'line', borderColor: COLORES.teal, backgroundColor: COLORES.teal, xAxisID: 'x2', pointRadius: 4, order: 1 });
        escalas.x2 = { position: 'top', min: -100, max: 100, grid: { display: false }, ticks: { color: COLORES.teal } };
    }
    dibujar(p.id, conDetalle({
        type: 'bar', data: { labels: datos.map(d => recortar(d[0], 22)), datasets: ds },
        options: { indexAxis: 'y', scales: Object.assign(escalas, { y: { ticks: { font: { size: 10.5 }, autoSkip: false } } }) }
    }, i => ({
        titulo: `${etiquetaAspecto(p.meta.key)}: ${datos[i][0]}`,
        filtro: { [p.meta.key]: datos[i][0] }
    })));
}

function panelTendencia(p, filas) {
    const c = $('cont-' + p.id);
    const porDia = new Map();
    filas.forEach(f => {
        const d = diaISO(f[p.meta.key]); if (!d) return;
        if (!porDia.has(d)) porDia.set(d, []);
        porDia.get(d).push(f);
    });
    const dias = [...porDia.keys()].sort();
    if (!dias.length) { c.innerHTML = '<div class="vacio">Sin fechas registradas.</div>'; return; }
    c.innerHTML = lienzo(p.id);
    const ds = [{ label: 'Respuestas', data: dias.map(d => porDia.get(d).length), backgroundColor: COLORES.brandClaro, borderRadius: 5, maxBarThickness: 90, order: 2 }];
    const escalas = { y: { beginAtZero: true, ticks: { precision: 0 } } };
    if (p.meta.nps) {
        ds.push({
            label: 'NPS del día', type: 'line', yAxisID: 'y2', borderColor: COLORES.teal, backgroundColor: COLORES.teal,
            tension: .3, pointRadius: 3, data: dias.map(d => { const r = calcularNPS(porDia.get(d), p.meta.nps); return r ? r.nps : null; }), order: 1
        });
        escalas.y2 = { position: 'right', min: -100, max: 100, grid: { display: false }, ticks: { color: COLORES.teal } };
    }
    dibujar(p.id, conDetalle(
        { type: 'bar', data: { labels: dias.map(fechaLegible), datasets: ds }, options: { scales: escalas } },
        i => ({ titulo: `Respuestas del ${fechaLegible(dias[i])}`, filtro: { _dia: dias[i] } })));
}

function panelNumero(p, filas) {
    const c = $('cont-' + p.id);
    const vals = filas.map(f => num(f[p.meta.key])).filter(v => v !== null);
    if (!vals.length) { c.innerHTML = '<div class="vacio">Sin valores.</div>'; return; }
    const niveles = unico(vals).sort((a, b) => a - b);
    const prom = vals.reduce((a, b) => a + b, 0) / vals.length;
    c.innerHTML = `<div style="font-size:12px;color:var(--ink-2);margin-bottom:6px;">Promedio <strong>${prom.toFixed(2)}</strong> · ${vals.length} respuestas</div>` + lienzo(p.id);
    const keyNum = p.meta.key;
    dibujar(p.id, conDetalle({
        type: 'bar',
        data: {
            labels: niveles, datasets: [{
                label: 'Respuestas', data: niveles.map(n => vals.filter(v => v === n).length),
                backgroundColor: niveles.map((_, i) => PALETA[i % PALETA.length]), borderRadius: 5
            }]
        },
        options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    }, i => ({
        titulo: `${etiquetaAspecto(keyNum)}: ${niveles[i]}`,
        filtro: f => num(f[keyNum]) === niveles[i]
    })));
}

function panelConocimiento(p, filas) {
    const c = $('cont-' + p.id);
    const keys = p.meta.keys;
    c.innerHTML = lienzo(p.id, keys.length > 2);
    const etiquetas = keys.map(k => {
        const l = DATASET.columnas.find(x => x.key === k).label;
        return l.length > 46 ? l.slice(0, 45) + '…' : l;
    });
    const aciertos = keys.map(k => {
        const col = DATASET.columnas.find(x => x.key === k);
        const resp = filas.filter(f => String(f[k] ?? '').trim());
        if (!resp.length) return 0;
        return resp.filter(f => normalizar(f[k]) === normalizar(col.correcta)).length / resp.length * 100;
    });
    dibujar(p.id, conDetalle({
        type: 'bar',
        data: {
            labels: etiquetas,
            datasets: [{ label: '% acierto', data: aciertos, backgroundColor: aciertos.map(a => a >= 90 ? COLORES.ok : a >= 70 ? COLORES.warn : COLORES.err), borderRadius: 5 }]
        },
        options: {
            indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.parsed.x.toFixed(1) + '% de acierto' } } },
            scales: { x: { min: 0, max: 100, ticks: { callback: v => v + '%' } }, y: { ticks: { font: { size: 10.5 } } } }
        }
    }, i => {
        const col = DATASET.columnas.find(x => x.key === keys[i]);
        return {
            titulo: `Respondieron distinto a «${col.correcta}»`,
            filtro: f => { const v = String(f[keys[i]] ?? '').trim(); return v && normalizar(v) !== normalizar(col.correcta); },
            columnas: [keys[i]]
        };
    }));
}

function panelPalabras(p, filas) {
    const c = $('cont-' + p.id);
    const datos = palabrasFrecuentes(filas, p.meta.keys);
    if (!datos.length) { c.innerHTML = '<div class="vacio">Aún no hay suficientes comentarios.</div>'; return; }
    c.innerHTML = lienzo(p.id, datos.length > 9);
    dibujar(p.id, conDetalle({
        type: 'bar',
        data: { labels: datos.map(d => d[0]), datasets: [{ label: 'Menciones', data: datos.map(d => d[1]), backgroundColor: COLORES.teal, borderRadius: 5 }] },
        options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }
    }, i => ({
        titulo: `Comentarios que mencionan «${datos[i][0]}»`,
        filtro: f => p.meta.keys.some(k => normalizar(f[k]).includes(datos[i][0])),
        columnas: p.meta.keys
    })));
}

function panelComentarios(p, filas) {
    const c = $('cont-' + p.id);
    const items = [];
    filas.forEach(f => p.meta.keys.forEach(k => {
        const t = String(f[k] ?? '').trim();
        if (t.length > 2 && !/^(ningun[ao]s?|no|n\/a|nada|sin comentarios?|todo bien|ok)\.?$/i.test(t)) items.push({ texto: t, quien: etiquetaFila(f), pregunta: DATASET.columnas.find(x => x.key === k).label });
    }));
    if (!items.length) { c.innerHTML = '<div class="vacio">Sin comentarios abiertos.</div>'; return; }
    c.innerHTML = `<div style="max-height:330px;overflow:auto;display:grid;gap:8px;">` + items.slice(0, 120).map(i => `
        <div style="border-left:3px solid var(--brand);background:#faf8fa;padding:8px 10px;border-radius:0 8px 8px 0;">
            <div style="font-size:12.5px;">${escapar(i.texto)}</div>
            <div style="font-size:10.5px;color:var(--muted);margin-top:3px;">${escapar(i.quien)} · ${escapar(i.pregunta.slice(0, 60))}</div>
        </div>`).join('') + `</div>
        <div style="font-size:11px;color:var(--muted);margin-top:8px;">${items.length} comentario(s)${items.length > 120 ? ' · se muestran los primeros 120' : ''}</div>`;
}

function etiquetaAspecto(key) {
    const l = DATASET.columnas.find(x => x.key === key)?.label || key;
    const m = l.match(/\[(.+)\]/);
    return (m ? m[1] : l).trim();
}
const recortar = (t, n) => String(t).length > n ? String(t).slice(0, n - 1) + '…' : String(t);

function etiquetaFila(f) {
    const col = DATASET.columnas.find(c => /nombre|apellido|participante/i.test(c.label) && c.tipo === 'texto');
    return col ? (String(f[col.key] || '').trim() || 'Anónimo') : 'Anónimo';
}

/* ================================ KPIs =================================== */
function construirKPIs(filas) {
    const tarjetas = [];
    tarjetas.push({ l: 'Respuestas', v: filas.length, s: `de ${DATASET.filas.length} registradas`, clase: 'brand', icono: 'ph-list-checks' });

    const colNPS = colsPorTipo('nps')[0];
    if (colNPS) {
        const r = calcularNPS(filas, colNPS.key);
        if (r) {
            tarjetas.push({ l: 'NPS', v: r.nps, s: `${r.n} puntuaciones · media ${r.promedio.toFixed(1)}/10`, clase: r.nps >= 50 ? 'ok' : r.nps >= 0 ? 'warn' : 'err', icono: 'ph-gauge' });
            tarjetas.push({ l: 'Promotores', v: r.pctProm.toFixed(1) + '%', s: `${r.promotores} personas (9-10)`, clase: 'ok', icono: 'ph-thumbs-up' });
            tarjetas.push({ l: 'Detractores', v: r.pctDet.toFixed(1) + '%', s: `${r.detractores} personas (0-6)`, clase: 'err', icono: 'ph-thumbs-down' });
        }
    }
    const colsLikert = colsPorTipo('likert');
    if (colsLikert.length) {
        const proms = colsLikert.map(c => promedioLikert(filas, c.key)).filter(v => v);
        if (proms.length) {
            const media = proms.reduce((a, b) => a + b, 0) / proms.length;
            tarjetas.push({ l: 'Satisfacción', v: media.toFixed(2), s: `escala 1 a 5 · ${(media / 5 * 100).toFixed(0)}% de favorabilidad`, clase: media >= 4.5 ? 'ok' : media >= 3.5 ? 'warn' : 'err', icono: 'ph-star' });
        }
    }
    const colsConoc = DATASET.columnas.filter(c => c.tipo === 'opcion' && c.correcta);
    if (colsConoc.length) {
        let ok = 0, tot = 0;
        colsConoc.forEach(c => filas.forEach(f => {
            const v = String(f[c.key] ?? '').trim(); if (!v) return;
            tot++; if (normalizar(v) === normalizar(c.correcta)) ok++;
        }));
        if (tot) tarjetas.push({ l: 'Acierto en conocimiento', v: (ok / tot * 100).toFixed(1) + '%', s: `${ok} de ${tot} respuestas`, clase: ok / tot >= .9 ? 'ok' : 'warn', icono: 'ph-brain' });
    }
    const colsNum = colsPorTipo('numero');
    colsNum.slice(0, 1).forEach(c => {
        const vals = filas.map(f => num(f[c.key])).filter(v => v !== null);
        if (vals.length) tarjetas.push({ l: c.label, v: (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2), s: `${vals.length} valoraciones`, clase: '', icono: 'ph-chart-line-up' });
    });
    const colDNI = DATASET.columnas.find(c => /dni|documento/i.test(c.label));
    if (colDNI) {
        const n = unico(filas.map(f => String(f[colDNI.key] ?? '').trim()).filter(Boolean)).length;
        tarjetas.push({ l: 'Personas distintas', v: n, s: filas.length > n ? `${filas.length - n} respuesta(s) repetida(s)` : 'sin duplicados', clase: '', icono: 'ph-users' });
    }
    $('kpis').innerHTML = tarjetas.map(t => `
        <div class="kpi ${t.clase}">
            <div class="l"><i class="ph ${t.icono}"></i> ${escapar(t.l)}</div>
            <div class="v">${escapar(t.v)}</div>
            <div class="s">${escapar(t.s)}</div>
        </div>`).join('');
    return tarjetas;
}

/* ============================== REFRESCO ================================= */
function refrescar() {
    if (!DATASET) return;
    const filas = filasFiltradas();
    $('info-datos').innerHTML = `<strong>${filas.length}</strong> registro(s) tras los filtros · fuente: ${escapar(DATASET.origen || DATASET.nombre)}`;
    $('rep-titulo-vista').textContent = CONFIG.titulo;
    $('rep-subtitulo-vista').textContent = `${CONFIG.subtitulo || ''} · ${filas.length} respuestas · generado el ${new Date().toLocaleDateString('es-PE')}`;
    pintarChips();
    construirKPIs(filas);
    const visibles = PANELES.filter(p => CONFIG.paneles[p.id] !== false);
    $('paneles').innerHTML = visibles.map(marcoPanel).join('');
    $('dash-vacio').classList.toggle('oculto', filas.length > 0);
    visibles.forEach(p => { try { p.render(p, filas); } catch (e) { console.error('panel ' + p.id, e); } });
    if (SUBVISTA === 'datos') pintarTabla();
}

/* ============================== DETALLE ================================== */
/* Lo que se está viendo en el modal, para poder exportarlo o fijarlo como selección. */
let DETALLE = { titulo: '', filas: [], filtro: null, columnas: null };

function columnasDetalle(extra) {
    // Se priorizan fecha, nombre, categorías y puntuaciones; se omiten teléfonos.
    const util = c => !/celular|tel[eé]fono/i.test(c.label);
    const porTipo = t => DATASET.columnas.filter(c => c.tipo === t && util(c));
    const base = [
        ...porTipo('fecha').slice(0, 1),
        ...porTipo('texto').filter(c => /apellido|nombre|participante|dni/i.test(c.label)).slice(0, 3),
        ...porTipo('categoria').slice(0, 2),
        ...porTipo('nps'), ...porTipo('numero')
    ];
    const extras = (extra || []).map(k => DATASET.columnas.find(c => c.key === k)).filter(Boolean);
    const coment = DATASET.columnas.filter(c => c.tipo === 'comentario');
    return unico([...base, ...extras, ...coment]);
}

function abrirDetalle(titulo, filtro, columnas) {
    const base = filasFiltradas();
    const prueba = typeof filtro === 'function'
        ? filtro
        : f => Object.entries(filtro).every(([k, v]) => k === '_nps'
            ? num(f[colsPorTipo('nps')[0].key]) === Number(v)
            : k === '_dia'
                ? diaISO(f[colsPorTipo('fecha')[0].key]) === v
                : normalizar(f[k]) === normalizar(v));
    const filas = base.filter(prueba);
    DETALLE = { titulo, filas, filtro, columnas };
    const cols = columnasDetalle(DETALLE.columnas);
    $('det-titulo').textContent = titulo;
    $('det-sub').textContent = `${filas.length} respuesta(s) de ${base.length} en pantalla`;
    $('det-thead').innerHTML = `<tr>${cols.map(c => `<th>${escapar(recortar(etiquetaAspecto(c.key), 34))}</th>`).join('')}</tr>`;
    $('det-tbody').innerHTML = filas.length
        ? filas.map(f => `<tr>${cols.map(c => `<td>${escapar(c.tipo === 'fecha' ? fechaLegible(f[c.key]) : (f[c.key] ?? ''))}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${cols.length}" class="vacio">Sin respuestas para este elemento.</td></tr>`;
    $('btn-det-filtrar').classList.toggle('oculto', typeof filtro === 'function');
    $('modal-detalle').classList.add('abierto');
}

function exportarDetalle() {
    if (!DETALLE.filas.length) { toast('No hay respuestas que exportar', 'error'); return; }
    const cols = columnasDetalle(DETALLE.columnas);
    const aoa = [[DETALLE.titulo], [], cols.map(c => c.label),
        ...DETALLE.filas.map(f => cols.map(c => c.tipo === 'fecha' ? fechaLegible(f[c.key]) : f[c.key]))];
    const wb = XLSX.utils.book_new();
    const h = XLSX.utils.aoa_to_sheet(aoa);
    h['!cols'] = cols.map(c => ({ wch: c.tipo === 'comentario' ? 60 : 22 }));
    XLSX.utils.book_append_sheet(wb, h, 'Detalle');
    XLSX.writeFile(wb, `detalle_${slug(DETALLE.titulo)}.xlsx`);
}

/* ============================ TABLA EDITABLE ============================= */
function pintarTabla() {
    const filas = filasFiltradas();
    $('info-tabla').innerHTML = `<strong>${filas.length}</strong> fila(s) · ${EN_SUPABASE ? 'guardando en Supabase' : 'sin conexión con Supabase: se guarda en este navegador'}`;
    $('thead-datos').innerHTML = `<tr>
        <th style="width:28px;"><input type="checkbox" id="chk-todas"></th>
        ${DATASET.columnas.map(c => `<th>${escapar(c.label)}<span class="chip-tipo">${c.tipo}</span></th>`).join('')}
        <th style="width:40px;"></th></tr>`;
    $('tbody-datos').innerHTML = filas.map(f => `<tr data-id="${escapar(f._id)}">
        <td style="text-align:center;"><input type="checkbox" class="chk-fila" data-id="${escapar(f._id)}"></td>
        ${DATASET.columnas.map(c => {
            const editable = true;
            const val = c.tipo === 'fecha' ? (f[c.key] ? String(f[c.key]).slice(0, 16).replace('T', ' ') : '') : (f[c.key] ?? '');
            return `<td class="celda${PENDIENTES.editadas.has(f._id) ? '' : ''}" ${editable ? 'contenteditable="true"' : 'style="color:var(--muted);"'} data-id="${escapar(f._id)}" data-col="${c.key}">${escapar(val)}</td>`;
        }).join('')}
        <td style="text-align:center;"><button class="btn btn-peligro" style="padding:3px 7px;" data-borrar="${escapar(f._id)}" title="Eliminar"><i class="ph ph-trash"></i></button></td>
    </tr>`).join('') || `<tr><td colspan="${DATASET.columnas.length + 2}" class="vacio">Sin filas.</td></tr>`;

    $('tbody-datos').querySelectorAll('td.celda[contenteditable]').forEach(td => {
        td.addEventListener('blur', () => editarCelda(td));
        td.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); td.blur(); } });
    });
    $('tbody-datos').querySelectorAll('[data-borrar]').forEach(b => b.addEventListener('click', () => eliminarFilas([b.dataset.borrar])));
    $('chk-todas').addEventListener('change', e => {
        $('tbody-datos').querySelectorAll('.chk-fila').forEach(c => { c.checked = e.target.checked; });
    });
}

function editarCelda(td) {
    const { id, col } = td.dataset;
    const fila = DATASET.filas.find(f => String(f._id) === id);
    if (!fila) return;
    const columna = DATASET.columnas.find(c => c.key === col);
    let valor = td.textContent.trim();
    if (columna.tipo === 'nps' || columna.tipo === 'numero') valor = valor === '' ? '' : (num(valor) ?? '');
    if (String(fila[col] ?? '') === String(valor)) return;
    fila[col] = valor;
    PENDIENTES.editadas.add(fila._id);
    td.classList.add('editada');
    guardarLocal();
    refrescar();
    toast('Celda actualizada');
}

function eliminarFilas(ids) {
    if (!ids.length) { toast('Marca al menos una fila', 'error'); return; }
    if (!confirm(`¿Eliminar ${ids.length} registro(s)? Esta acción no se puede deshacer tras guardar.`)) return;
    ids.forEach(id => {
        const i = DATASET.filas.findIndex(f => String(f._id) === String(id));
        if (i >= 0) {
            const [f] = DATASET.filas.splice(i, 1);
            if (!PENDIENTES.nuevas.has(f._id)) PENDIENTES.eliminadas.push(f._id);
            PENDIENTES.editadas.delete(f._id);
            PENDIENTES.nuevas.delete(f._id);
        }
    });
    guardarLocal();
    refrescar();
    toast(`${ids.length} registro(s) eliminado(s)`, 'ok');
}

function nuevaFila() {
    const f = { _id: 'nuevo_' + Date.now() };
    DATASET.columnas.forEach(c => { f[c.key] = c.tipo === 'fecha' ? new Date().toISOString().slice(0, 19) : ''; });
    DATASET.filas.unshift(f);
    PENDIENTES.nuevas.add(f._id);
    guardarLocal();
    cambiarSub('datos');
    refrescar();
    toast('Fila agregada: completa los datos y guarda');
}

async function guardarCambios() {
    const btn = $('btn-guardar');
    btn.disabled = true;
    try {
        await guardarEnSupabase();
        EN_SUPABASE = true;
        guardarLocal();
        PENDIENTES = { editadas: new Set(), eliminadas: [], nuevas: new Set() };
        toast('Cambios guardados en Supabase: los ve todo el equipo', 'ok');
    } catch (e) {
        console.error(e);
        guardarLocal();
        toast('No se pudo guardar en Supabase (' + (e.message || e) + '). Los cambios quedan en este navegador.', 'error');
    } finally {
        btn.disabled = false;
        refrescar();
    }
}

function restaurarOriginales() {
    if (!confirm('¿Restaurar los datos tal como se cargaron y descartar las ediciones locales?')) return;
    DATASET.filas = JSON.parse(JSON.stringify(ORIGINALES));
    PENDIENTES = { editadas: new Set(), eliminadas: [], nuevas: new Set() };
    try { localStorage.removeItem(claveLocal()); } catch (e) { }
    refrescar();
    toast('Datos restaurados', 'ok');
}

/* ============================ EXPORTACIONES ============================== */
function conclusionesSugeridas(filas) {
    const partes = [];
    const colNPS = colsPorTipo('nps')[0];
    if (colNPS) {
        const r = calcularNPS(filas, colNPS.key);
        if (r) partes.push(`El NPS alcanzado es ${r.nps} sobre ${r.n} respuestas (${r.pctProm.toFixed(1)}% promotores, ${r.pctPas.toFixed(1)}% pasivos y ${r.pctDet.toFixed(1)}% detractores), con una puntuación media de ${r.promedio.toFixed(2)} sobre 10.`);
    }
    const colsLikert = colsPorTipo('likert');
    if (colsLikert.length) {
        const proms = colsLikert.map(c => ({ c, v: promedioLikert(filas, c.key) })).filter(x => x.v);
        if (proms.length) {
            const mejor = proms.reduce((a, b) => a.v >= b.v ? a : b), peor = proms.reduce((a, b) => a.v <= b.v ? a : b);
            const et = c => etiquetaAspecto(c.key);
            partes.push(`El aspecto mejor valorado es «${et(mejor.c)}» (${mejor.v.toFixed(2)}/5) y el que más margen de mejora tiene es «${et(peor.c)}» (${peor.v.toFixed(2)}/5).`);
        }
    }
    const colsConoc = DATASET.columnas.filter(c => c.tipo === 'opcion' && c.correcta);
    colsConoc.forEach(c => {
        const resp = filas.filter(f => String(f[c.key] ?? '').trim());
        if (!resp.length) return;
        const pct = resp.filter(f => normalizar(f[c.key]) === normalizar(c.correcta)).length / resp.length * 100;
        if (pct < 95) partes.push(`En «${c.label}» el ${pct.toFixed(1)}% respondió la alternativa esperada; conviene reforzar este punto.`);
    });
    const pal = palabrasFrecuentes(filas, colsPorTipo('comentario').map(c => c.key), 5);
    if (pal.length) partes.push(`Los comentarios giran sobre todo en torno a: ${pal.map(p => p[0]).join(', ')}.`);
    return partes.join(' ');
}

function resumenParaExport(filas) {
    const res = [];
    res.push(['Reporte', CONFIG.titulo]);
    res.push(['Fuente', DATASET.origen || DATASET.nombre]);
    res.push(['Generado', new Date().toLocaleString('es-PE')]);
    res.push(['Registros analizados', filas.length]);
    const activos = Object.entries(FILTROS).filter(([k, v]) => v && !k.startsWith('_'));
    activos.forEach(([k, v]) => res.push(['Filtro · ' + (DATASET.columnas.find(c => c.key === k)?.label || k), v]));
    if (FILTROS._desde) res.push(['Filtro · desde', FILTROS._desde]);
    if (FILTROS._hasta) res.push(['Filtro · hasta', FILTROS._hasta]);
    res.push([]);
    document.querySelectorAll('#kpis .kpi').forEach(k => res.push([k.querySelector('.l').textContent.trim(), k.querySelector('.v').textContent.trim(), k.querySelector('.s').textContent.trim()]));
    return res;
}

function exportarExcel() {
    const filas = filasFiltradas();
    if (!filas.length) { toast('No hay datos para exportar', 'error'); return; }
    const wb = XLSX.utils.book_new();

    const hResumen = XLSX.utils.aoa_to_sheet(resumenParaExport(filas));
    hResumen['!cols'] = [{ wch: 32 }, { wch: 40 }, { wch: 38 }];
    XLSX.utils.book_append_sheet(wb, hResumen, 'Resumen');

    const cabecera = DATASET.columnas.map(c => c.label);
    const cuerpo = filas.map(f => DATASET.columnas.map(c => c.tipo === 'fecha' ? fechaLegible(f[c.key]) : f[c.key]));
    const hDatos = XLSX.utils.aoa_to_sheet([cabecera, ...cuerpo]);
    hDatos['!cols'] = DATASET.columnas.map(c => ({ wch: c.tipo === 'comentario' ? 55 : Math.min(34, Math.max(12, c.label.length + 2)) }));
    hDatos['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: cuerpo.length, c: cabecera.length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, hDatos, 'Datos');

    const colNPS = colsPorTipo('nps')[0];
    if (colNPS) {
        const cats = DATASET.columnas.filter(c => ['categoria', 'opcion'].includes(c.tipo) && !c.correcta);
        const aoa = [['Dimensión', 'Valor', 'Respuestas', 'Promotores', 'Pasivos', 'Detractores', 'NPS', 'Media (0-10)']];
        cats.forEach(c => conteo(filas, c.key).forEach(([v, n]) => {
            const r = calcularNPS(filas.filter(f => normalizar(f[c.key]) === normalizar(v)), colNPS.key);
            aoa.push([c.label, v, n, r?.promotores ?? 0, r?.pasivos ?? 0, r?.detractores ?? 0, r?.nps ?? '', r ? +r.promedio.toFixed(2) : '']);
        }));
        const h = XLSX.utils.aoa_to_sheet(aoa);
        h['!cols'] = [{ wch: 30 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, h, 'NPS por categoría');
    }
    const colsLikert = colsPorTipo('likert');
    if (colsLikert.length) {
        const niveles = unico(colsLikert.flatMap(c => filas.map(f => String(f[c.key] ?? '').trim()).filter(Boolean)))
            .sort((a, b) => (VALOR_LIKERT[normalizar(a)] || 0) - (VALOR_LIKERT[normalizar(b)] || 0));
        const aoa = [['Aspecto', ...niveles, 'Respuestas', 'Promedio (1-5)']];
        colsLikert.forEach(c => {
            const resp = filas.filter(f => String(f[c.key] ?? '').trim());
            aoa.push([c.label, ...niveles.map(n => resp.filter(f => normalizar(f[c.key]) === normalizar(n)).length), resp.length, +(promedioLikert(filas, c.key) || 0).toFixed(2)]);
        });
        const h = XLSX.utils.aoa_to_sheet(aoa);
        h['!cols'] = [{ wch: 52 }, ...niveles.map(() => ({ wch: 14 })), { wch: 12 }, { wch: 15 }];
        XLSX.utils.book_append_sheet(wb, h, 'Valoraciones');
    }
    const colsCom = colsPorTipo('comentario');
    if (colsCom.length) {
        const aoa = [['Participante', 'Pregunta', 'Comentario']];
        filas.forEach(f => colsCom.forEach(c => {
            const t = String(f[c.key] ?? '').trim();
            if (t) aoa.push([etiquetaFila(f), c.label, t]);
        }));
        const h = XLSX.utils.aoa_to_sheet(aoa);
        h['!cols'] = [{ wch: 30 }, { wch: 45 }, { wch: 80 }];
        XLSX.utils.book_append_sheet(wb, h, 'Comentarios');
    }
    XLSX.writeFile(wb, `${slug(CONFIG.titulo)}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast('Excel generado', 'ok');
}

async function exportarPDF() {
    const filas = filasFiltradas();
    if (!filas.length) { toast('No hay datos para exportar', 'error'); return; }
    const btn = $('btn-pdf');
    btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner"></i> Generando…';
    const subPrevia = SUBVISTA;
    if (subPrevia !== 'dashboard') {             // los paneles deben estar visibles para capturarlos
        cambiarSub('dashboard');
        await new Promise(r => setTimeout(r, 600));
    }
    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const AN = pdf.internal.pageSize.getWidth(), AL = pdf.internal.pageSize.getHeight();
        const M = 10;

        const encabezado = (titulo) => {
            pdf.setFillColor(113, 75, 103); pdf.rect(0, 0, AN, 16, 'F');
            pdf.setTextColor(255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12);
            pdf.text(titulo, M, 10.5);
            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
            pdf.text('CERTUS · COT-PLN', AN - M, 10.5, { align: 'right' });
            pdf.setTextColor(40);
        };
        const pie = () => {
            const n = pdf.internal.getNumberOfPages();
            for (let i = 1; i <= n; i++) {
                pdf.setPage(i); pdf.setFontSize(8); pdf.setTextColor(140);
                pdf.text(`${CONFIG.titulo} · generado el ${new Date().toLocaleString('es-PE')}`, M, AL - 5);
                pdf.text(`Página ${i} de ${n}`, AN - M, AL - 5, { align: 'right' });
            }
        };

        // ---------- portada con KPIs ----------
        encabezado('Reporte analítico');
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(20);
        pdf.text(CONFIG.titulo, M, 34, { maxWidth: AN - 2 * M });
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(90);
        pdf.text(`${CONFIG.subtitulo || ''}`.trim(), M, 42, { maxWidth: AN - 2 * M });
        pdf.text(`Fuente: ${DATASET.origen || DATASET.nombre} · ${filas.length} registros analizados`, M, 48);

        const kpis = [...document.querySelectorAll('#kpis .kpi')].map(k => [
            k.querySelector('.l').textContent.trim(), k.querySelector('.v').textContent.trim(), k.querySelector('.s').textContent.trim()
        ]);
        let x = M, y = 58;
        const anchoK = (AN - 2 * M - 12) / 4;
        kpis.forEach((k, i) => {
            if (i && i % 4 === 0) { x = M; y += 30; }
            pdf.setDrawColor(224); pdf.setFillColor(250, 248, 250);
            pdf.roundedRect(x, y, anchoK, 25, 2.5, 2.5, 'FD');
            pdf.setFontSize(8); pdf.setTextColor(110); pdf.text(k[0], x + 4, y + 7, { maxWidth: anchoK - 8 });
            pdf.setFontSize(17); pdf.setTextColor(113, 75, 103); pdf.setFont('helvetica', 'bold');
            pdf.text(String(k[1]), x + 4, y + 16);
            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(140);
            pdf.text(k[2], x + 4, y + 21.5, { maxWidth: anchoK - 8 });
            x += anchoK + 4;
        });

        const texto = (CONFIG.conclusiones || '').trim() || conclusionesSugeridas(filas);
        if (texto) {
            const yTxt = y + 34;
            pdf.setFontSize(11); pdf.setTextColor(60); pdf.setFont('helvetica', 'bold');
            pdf.text('Conclusiones y recomendaciones', M, yTxt);
            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9.5); pdf.setTextColor(80);
            pdf.text(pdf.splitTextToSize(texto, AN - 2 * M), M, yTxt + 6);
        }

        // ---------- un panel por página ----------
        const paneles = [...document.querySelectorAll('#paneles .panel')];
        for (const panel of paneles) {
            pdf.addPage();
            encabezado(panel.querySelector('h3').textContent.trim());
            pdf.setFontSize(9); pdf.setTextColor(130);
            pdf.text(panel.querySelector('.sub').textContent.trim(), M, 23);
            // Se captura el panel completo (gráfico + cifras y leyendas en HTML),
            // ocultando su título porque ya va en la cabecera de la página.
            panel.classList.add('capturando');
            const cv = await html2canvas(panel, { backgroundColor: '#ffffff', scale: 1.7, logging: false });
            panel.classList.remove('capturando');
            const img = cv.toDataURL('image/jpeg', 0.88);
            const maxW = AN - 2 * M, maxH = AL - 38;
            const esc = Math.min(maxW / cv.width, maxH / cv.height);
            const w = cv.width * esc, h = cv.height * esc;
            pdf.addImage(img, 'JPEG', (AN - w) / 2, 28, w, h);
        }

        // ---------- tabla de datos ----------
        pdf.addPage();
        encabezado('Datos analizados');
        const cols = DATASET.columnas.filter(c => c.tipo !== 'comentario').slice(0, 9);
        pdf.autoTable({
            startY: 22,
            head: [cols.map(c => c.label.length > 34 ? c.label.slice(0, 33) + '…' : c.label)],
            body: filas.map(f => cols.map(c => c.tipo === 'fecha' ? fechaLegible(f[c.key]) : String(f[c.key] ?? ''))),
            styles: { fontSize: 7, cellPadding: 1.6, overflow: 'linebreak' },
            headStyles: { fillColor: [113, 75, 103], textColor: 255, fontSize: 7.5 },
            alternateRowStyles: { fillColor: [249, 247, 249] },
            margin: { left: M, right: M, bottom: 12 }
        });

        pie();
        pdf.save(`${slug(CONFIG.titulo)}_${new Date().toISOString().slice(0, 10)}.pdf`);
        toast('PDF generado', 'ok');
    } catch (e) {
        console.error(e);
        toast('No se pudo generar el PDF: ' + (e.message || e), 'error');
    } finally {
        btn.disabled = false; btn.innerHTML = '<i class="ph ph-file-pdf"></i> Exportar PDF';
        if (subPrevia !== 'dashboard') cambiarSub(subPrevia);
    }
}

/* ============================ PERSONALIZACIÓN ============================ */
function abrirPersonalizar() {
    $('rep-titulo').value = CONFIG.titulo;
    $('rep-subtitulo').value = CONFIG.subtitulo;
    $('rep-conclusiones').value = CONFIG.conclusiones;
    $('rep-conclusiones').placeholder = conclusionesSugeridas(filasFiltradas()) || 'Escribe aquí tus conclusiones…';
    $('lista-paneles').innerHTML = PANELES.map(p => `
        <label><input type="checkbox" data-panel="${p.id}" ${CONFIG.paneles[p.id] !== false ? 'checked' : ''}> ${escapar(p.titulo)}</label>`).join('');
    $('modal-personalizar').classList.add('abierto');
}

/* ================================ VISTAS ================================= */
function cambiarVista(v) {
    VISTA = v;
    document.querySelectorAll('#pestanas-top button').forEach(b => b.classList.toggle('on', b.dataset.vista === v));
    $('vista-alineamiento').classList.toggle('oculto', v !== 'alineamiento');
    $('vista-evaldo').classList.toggle('oculto', v !== 'evaldo');
    // El reporte de desempeño se carga la primera vez que se abre su pestaña.
    if (v === 'evaldo' && !$('marco-evaldo').src) $('marco-evaldo').src = 'evaldo/index.html';
}

function cambiarSub(v) {
    SUBVISTA = v;
    document.querySelectorAll('#pestanas-sub button').forEach(b => b.classList.toggle('on', b.dataset.sub === v));
    $('vista-dashboard').classList.toggle('oculto', v !== 'dashboard');
    $('vista-datos').classList.toggle('oculto', v !== 'datos');
    if (v === 'datos') pintarTabla();
}

/* ================================ EVENTOS ================================ */
document.querySelectorAll('#pestanas-top button').forEach(b => b.addEventListener('click', () => cambiarVista(b.dataset.vista)));
document.querySelectorAll('#pestanas-sub button').forEach(b => b.addEventListener('click', () => cambiarSub(b.dataset.sub)));
$('btn-limpiar').addEventListener('click', () => { FILTROS = {}; refrescar(); });
$('btn-det-excel').addEventListener('click', exportarDetalle);
$('btn-det-filtrar').addEventListener('click', () => {
    if (DETALLE.filtro && typeof DETALLE.filtro !== 'function') Object.assign(FILTROS, DETALLE.filtro);
    $('modal-detalle').classList.remove('abierto');
    refrescar();
    toast('Se muestran solo esas respuestas');
});
$('modal-detalle').addEventListener('click', e => { if (e.target.id === 'modal-detalle') e.currentTarget.classList.remove('abierto'); });
$('btn-recargar').addEventListener('click', cargarDatos);
$('btn-excel').addEventListener('click', exportarExcel);
$('btn-pdf').addEventListener('click', exportarPDF);
$('btn-personalizar').addEventListener('click', abrirPersonalizar);
$('btn-aplicar-personalizacion').addEventListener('click', () => {
    CONFIG.titulo = $('rep-titulo').value.trim() || DATASET.nombre;
    CONFIG.subtitulo = $('rep-subtitulo').value.trim();
    CONFIG.conclusiones = $('rep-conclusiones').value.trim();
    $('lista-paneles').querySelectorAll('[data-panel]').forEach(c => { CONFIG.paneles[c.dataset.panel] = c.checked; });
    $('modal-personalizar').classList.remove('abierto');
    refrescar();
    toast('Reporte actualizado', 'ok');
});
document.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', () => b.closest('.modal').classList.remove('abierto')));
$('modal-personalizar').addEventListener('click', e => { if (e.target.id === 'modal-personalizar') e.currentTarget.classList.remove('abierto'); });
$('btn-nueva-fila').addEventListener('click', nuevaFila);
$('btn-guardar').addEventListener('click', guardarCambios);
$('btn-deshacer').addEventListener('click', restaurarOriginales);
$('btn-borrar-sel').addEventListener('click', () => {
    eliminarFilas([...document.querySelectorAll('#tbody-datos .chk-fila:checked')].map(c => c.dataset.id));
});

cargarDatos();
