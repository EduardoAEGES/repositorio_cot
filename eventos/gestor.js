/* gestor.js — Gestor simple de eventos y constancias.
 *
 * Solo hace tres cosas: listar eventos, crear eventos y emitir constancias.
 * No maneja el pipeline de avance 0/7 → 7/7; eso vive en la app grande.
 *
 * La constancia se dibuja en un canvas sobre constancia_base.png (mismo diseño
 * que frontend-portal.js), se empaqueta como PDF y se sube al bucket
 * "certificados" de Supabase Storage.
 */

const SUPABASE_URL = 'https://klmjmlhwuzhymrplemgw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsbWptbGh3dXpoeW1ycGxlbWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTMyNjQsImV4cCI6MjA4NzE2OTI2NH0.xFWMvUJa9n9TBcBG1WSeqCGiWBaCAtCU9aY7GXk4W6E';
const BUCKET = 'certificados';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TIPOS = ['Taller', 'Webinar', 'Curso', 'Capacitación', 'Apertura Académica',
    'Kick Off Académico', 'Consultoría', 'Reunión Académica', 'Seminario', 'Congreso',
    'Simposio', 'Masterclass', 'Conversatorio', 'Diplomado', 'Asesoría Especializada'];

const AUDIENCIAS = ['Todos los estudiantes', 'Todos los estudiantes y egresados',
    'estudiantes de 1er ciclo', 'estudiantes del 3er al 6to ciclo',
    'estudiantes del 3er al 6to ciclo y egresados', 'Egresados', 'Docentes',
    'Público en General'];

const SEDES = ['Todas', 'AREQUIPA', 'SURCO', 'NORTE', 'ATE', 'SJL', 'VILLA'];
const RESPONSABLES = ['Eduardo', 'Carlos', 'José', 'Luis', 'Fernando', 'Mirko', 'Todos'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

let EVENTOS = [];
let EVENTO_ACTUAL = null;
let PARTICIPANTES = [];
let IMPORTADAS = { cabeceras: [], filas: [] };
let MES_VISIBLE = new Date();          // mes que muestra el calendario
let VISTA = 'calendario';              // 'calendario' | 'lista'

const $ = (id) => document.getElementById(id);
const norm = (s) => (s ?? '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

function mostrar(el, cond) { el.classList.toggle('oculto', !cond); }
function msg(el, texto, clase) { el.textContent = texto; el.className = 'msg ' + (clase || ''); }

// Enlaces a las hojas de cálculo.
// Botón "Plan de Trabajo"
const HOJA_INTERNA = 'https://docs.google.com/spreadsheets/d/1xgpnNCyjyzugJKXfgGJZ64vpafkN4DcUoB_VLeOuO9s/edit?usp=sharing';
const HOJA_OFICIAL = 'https://docs.google.com/spreadsheets/d/1sHLHwIZbAXlThGj8qTY0QxVn68BL_zOGMvMPE73LfJs/edit';

/** DNI peruano: 8 dígitos. Vacío no se considera "mal" (se filtra aparte). */
function dniValido(dni) {
    const v = (dni || '').toString().trim();
    return v === '' || /^\d{8}$/.test(v);
}

/** Correo con formato normal: acepta @gmail.com, @certus.edu.pe, .com.pe, etc.
 *  Vacío se considera válido (el correo es opcional). */
function correoValido(correo) {
    const v = (correo || '').toString().trim();
    if (v === '') return true;
    return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}(\.[a-zA-Z]{2,})?$/.test(v);
}

function opciones(select, lista) {
    select.innerHTML = lista.map((v) => `<option value="${v}">${v}</option>`).join('');
}

/** Dibuja los checkboxes de público objetivo, marcando los seleccionados. */
function renderAudiencias(seleccionadas) {
    const marcadas = new Set((seleccionadas || []).map((s) => s.trim()));
    $('ev-audiencia').innerHTML = AUDIENCIAS.map((a) =>
        `<label><input type="checkbox" value="${a}" ${marcadas.has(a) ? 'checked' : ''}> ${a}</label>`
    ).join('');
    $('ev-audiencia').querySelectorAll('input').forEach((c) => c.addEventListener('change', autoDescripcion));
}

/** Público objetivo elegido, unido por ", " para guardarlo en Supabase. */
function audienciaSeleccionada() {
    return [...$('ev-audiencia').querySelectorAll('input:checked')].map((c) => c.value).join(', ');
}

/* ------------------------------------------------------------------ *
 *  EVENTOS
 * ------------------------------------------------------------------ */

const fechaLarga = (d) => `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;

/**
 * Fechas del evento en el formato que va impreso en la constancia.
 *   inicio / fin -> los marcadores <<Dia_de_Mes_de_Año1>> y <<...Año2>>
 *   rango        -> texto compacto para la cabecera de la app
 */
function fechasEvento(horarioJson) {
    let rango = '';
    let inicio = '';
    let fin = '';

    try {
        const h = JSON.parse(horarioJson || '[]');
        if (h.length) {
            h.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
            const p = new Date(h[0].fecha + 'T00:00:00');
            const u = new Date(h[h.length - 1].fecha + 'T00:00:00');

            inicio = fechaLarga(p);
            fin = fechaLarga(u);

            if (p.getTime() === u.getTime()) {
                rango = inicio;
            } else if (p.getMonth() === u.getMonth()) {
                rango = `${p.getDate()} al ${u.getDate()} de ${MESES[p.getMonth()]} de ${p.getFullYear()}`;
            } else {
                rango = `${p.getDate()} de ${MESES[p.getMonth()]} al ${u.getDate()} de ${MESES[u.getMonth()]} de ${p.getFullYear()}`;
            }
        }
    } catch (e) { /* sin fechas */ }

    return { rango, inicio, fin };
}

function primeraFecha(horarioJson) {
    try {
        const h = JSON.parse(horarioJson || '[]');
        if (h.length) return h.map((s) => s.fecha).sort()[0];
    } catch (e) { }
    return '';
}

async function cargarEventos() {
    mostrar($('eventos-cargando'), true);
    $('eventos-cargando').textContent = 'Cargando eventos...';

    const { data, error } = await sb
        .from('eventos')
        .select('id,nombre,tipo,modalidad,sedes,horario,audiencia,ponente,responsable,sheet_id,descripcion_evento,logo_constancia,portada,requisitos')
        .order('id', { ascending: false });

    if (error) {
        $('eventos-cargando').textContent = 'No se pudieron cargar los eventos: ' + error.message;
        return;
    }

    EVENTOS = data || [];

    // Cuántas constancias lleva emitidas cada evento.
    const { data: asis } = await sb.from('asistencias').select('evento_id,certificado_url');
    const conteo = {};
    (asis || []).forEach((a) => {
        if (!conteo[a.evento_id]) conteo[a.evento_id] = { total: 0, hechas: 0 };
        conteo[a.evento_id].total++;
        if (a.certificado_url) conteo[a.evento_id].hechas++;
    });
    EVENTOS.forEach((e) => { e._conteo = conteo[e.id] || { total: 0, hechas: 0 }; });

    mostrar($('eventos-cargando'), false);
    pintarEventos();
}

/** Eventos que pasan el buscador. */
function eventosFiltrados() {
    const filtro = norm($('buscar').value);
    return EVENTOS.filter((e) => !filtro || norm(e.nombre).includes(filtro));
}

function pintarEventos() {
    const lista = eventosFiltrados();
    $('conteo-eventos').textContent = `${lista.length} evento(s)`;

    mostrar($('calendario'), VISTA === 'calendario');
    mostrar($('grid-eventos'), VISTA === 'lista');
    mostrar(document.querySelector('.cal-nav'), VISTA === 'calendario');

    if (VISTA === 'calendario') pintarCalendario(lista);
    else pintarLista(lista);
}

/**
 * Un evento aparece en el calendario una vez por cada sesión, igual que en el
 * panel grande: un taller de dos días ocupa las dos casillas.
 */
function sesionesDelMes(lista, anio, mes) {
    const porDia = {};
    lista.forEach((e) => {
        let sesiones = [];
        try { sesiones = JSON.parse(e.horario || '[]'); } catch (err) { return; }

        sesiones.forEach((s) => {
            if (!s.fecha) return;
            const f = new Date(s.fecha + 'T00:00:00');
            if (f.getFullYear() !== anio || f.getMonth() !== mes) return;
            const dia = f.getDate();
            if (!porDia[dia]) porDia[dia] = [];
            porDia[dia].push({ evento: e, inicio: s.inicio, fin: s.fin });
        });
    });

    Object.values(porDia).forEach((v) => v.sort((a, b) => (a.inicio || '').localeCompare(b.inicio || '')));
    return porDia;
}

function pintarCalendario(lista) {
    const anio = MES_VISIBLE.getFullYear();
    const mes = MES_VISIBLE.getMonth();
    $('mes-label').textContent = `${MESES[mes]} ${anio}`;

    const porDia = sesionesDelMes(lista, anio, mes);

    const primero = new Date(anio, mes, 1);
    const diasDelMes = new Date(anio, mes + 1, 0).getDate();
    const diasMesPrevio = new Date(anio, mes, 0).getDate();

    // La semana arranca en lunes: domingo (0) pasa a ser el séptimo día.
    const desplazamiento = (primero.getDay() + 6) % 7;

    const hoy = new Date();
    const esHoy = (d) => hoy.getFullYear() === anio && hoy.getMonth() === mes && hoy.getDate() === d;

    const celdas = [];

    for (let i = desplazamiento; i > 0; i--) {
        celdas.push(`<div class="cal-dia fuera"><span class="cal-num">${diasMesPrevio - i + 1}</span></div>`);
    }

    for (let d = 1; d <= diasDelMes; d++) {
        const chips = (porDia[d] || []).map((oc) => {
            const e = oc.evento;
            const horas = oc.inicio ? `${oc.inicio}${oc.fin ? ' - ' + oc.fin : ''}` : '';
            return `
                <div class="cal-chip ${colorEvento(e)}" data-id="${e.id}" title="${escapar(e.nombre)}">
                    <strong>${escapar(e.nombre)}</strong>
                    ${e.ponente && e.ponente !== 'pendiente'
                    ? `<small><i class="ph ph-user"></i>${escapar(e.ponente)}</small>` : ''}
                    ${horas ? `<small><i class="ph ph-clock"></i>${horas}</small>` : ''}
                </div>`;
        }).join('');

        celdas.push(
            `<div class="cal-dia ${esHoy(d) ? 'hoy' : ''}">` +
            `<span class="cal-num">${d}</span>${chips}</div>`);
    }

    // Completar la última semana para que la cuadrícula quede pareja.
    while (celdas.length % 7 !== 0) {
        const n = celdas.length - desplazamiento - diasDelMes + 1;
        celdas.push(`<div class="cal-dia fuera"><span class="cal-num">${n}</span></div>`);
    }

    $('cal-grid').innerHTML = celdas.join('');
    document.querySelectorAll('.cal-chip').forEach((chip) => {
        chip.addEventListener('click', () => abrirGestor(parseInt(chip.dataset.id, 10)));
    });
}

/** Color estable por evento, para distinguirlos de un vistazo. */
function colorEvento(e) {
    const clases = ['', 'c1', 'c2', 'c3', 'c4'];
    return clases[e.id % clases.length];
}

function pintarLista(lista) {
    $('grid-eventos').innerHTML = lista.map((e) => {
        const fecha = primeraFecha(e.horario);
        const c = e._conteo;
        const pill = c.total
            ? `<span class="pill ${c.hechas ? 'tiene' : ''}">${c.hechas}/${c.total} constancias</span>`
            : `<span class="pill">Sin participantes</span>`;
        return `
            <div class="card" data-id="${e.id}">
                ${pill}
                <h3>${escapar(e.nombre || '(sin nombre)')}</h3>
                <div class="meta">
                    <span><i class="ph ph-tag"></i> ${escapar(e.tipo || '—')}</span>
                    <span><i class="ph ph-calendar-blank"></i> ${fecha || 'sin fecha'}</span>
                    <span><i class="ph ph-monitor-play"></i> ${escapar(e.modalidad || '—')}</span>
                </div>
            </div>`;
    }).join('');

    document.querySelectorAll('#grid-eventos .card').forEach((card) => {
        card.addEventListener('click', () => abrirGestor(parseInt(card.dataset.id, 10)));
    });
}

function escapar(s) {
    return (s ?? '').toString().replace(/[&<>"]/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ------------------------------------------------------------------ *
 *  CREAR EVENTO
 * ------------------------------------------------------------------ */

function agregarSesion() {
    const div = document.createElement('div');
    div.className = 'sesion';
    div.innerHTML = `
        <div><label>Fecha</label><input type="date" class="s-fecha"></div>
        <div><label>Inicio</label><input type="time" class="s-ini" value="17:30"></div>
        <div><label>Fin</label><input type="time" class="s-fin" value="19:00"></div>
        <button type="button" title="Quitar">&times;</button>`;
    div.querySelector('button').addEventListener('click', () => div.remove());
    $('ev-sesiones').appendChild(div);
}

function autoDescripcion() {
    const campo = $('ev-descripcion');
    if (campo.dataset.tocado) return;
    const nombre = $('ev-nombre').value.trim();
    if (!nombre) return;
    const ponente = $('ev-ponente').value.trim() || 'Docente por Asignar';
    const audiencia = audienciaSeleccionada() || 'los participantes';
    campo.value = `${$('ev-tipo').value} a cargo del ponente ${ponente}, dirigido a ` +
        `${audiencia}. En este espacio se desarrollará el tema: ${nombre}. ` +
        `Modalidad: ${$('ev-modalidad').value}. Sede: ${$('ev-sedes').value}.`;
}

async function guardarEvento() {
    const nombre = $('ev-nombre').value.trim();
    if (!nombre) { msg($('msg-evento'), 'Falta el nombre de la actividad.', 'err'); return; }

    const sesiones = [];
    document.querySelectorAll('#ev-sesiones .sesion').forEach((s) => {
        const fecha = s.querySelector('.s-fecha').value;
        if (fecha) {
            sesiones.push({ fecha, inicio: s.querySelector('.s-ini').value, fin: s.querySelector('.s-fin').value });
        }
    });
    if (!sesiones.length) { msg($('msg-evento'), 'Agrega al menos una sesión con fecha.', 'err'); return; }
    sesiones.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));

    $('btn-guardar-evento').disabled = true;
    msg($('msg-evento'), 'Guardando...', '');

    const payload = {
        tipo: $('ev-tipo').value,
        nombre,
        modalidad: $('ev-modalidad').value,
        sedes: $('ev-sedes').value,
        horario: JSON.stringify(sesiones),
        audiencia: audienciaSeleccionada(),
        ponente: $('ev-ponente').value.trim() || 'pendiente',
        responsable: $('ev-responsable').value,
        descripcion_evento: $('ev-descripcion').value.trim(),
        asesoria_tema: $('ev-tipo').value === 'Asesoría Especializada' ? $('ev-asesoria-tema').value : null
    };


    let resultado;
    if (EDITANDO_EVENTO_ID) {
        resultado = await sb.from('eventos').update(payload).eq('id', EDITANDO_EVENTO_ID).select().single();
    } else {
        // Código legible del evento, mismo formato que usa la app grande (ej. 21JUL-K3M).
        const cortos = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
        const rnd = Math.random().toString(36).substring(2, 5).toUpperCase();
        payload.status = 0;
        payload.sheet_id = `${EVENTOS.length + 2}${cortos[new Date().getMonth()]}-${rnd}`;
        payload.is_public = true;
        payload.requisitos = {};
        resultado = await sb.from('eventos').insert(payload).select().single();
    }

    $('btn-guardar-evento').disabled = false;

    if (resultado.error) { msg($('msg-evento'), 'Error: ' + resultado.error.message, 'err'); return; }

    const idAbrir = EDITANDO_EVENTO_ID || resultado.data.id;
    EDITANDO_EVENTO_ID = null;

    // Portada: se guarda la imagen (ya redimensionada) en la columna del evento.
    try {
        if (PORTADA_DATA) {
            const { error: ePort } = await sb.from('eventos').update({ portada: PORTADA_DATA }).eq('id', idAbrir);
            if (ePort) throw ePort;
        } else if (PORTADA_QUITAR) {
            await sb.from('eventos').update({ portada: null }).eq('id', idAbrir);
        }
    } catch (e) {
        msg($('msg-evento'), 'Evento guardado, pero la portada falló: ' + e.message, 'err');
    }
    PORTADA_DATA = null; PORTADA_QUITAR = false;

    cerrarModales();
    await cargarEventos();
    abrirGestor(idAbrir);
}

// id del evento en edición; null = modo "crear".
let EDITANDO_EVENTO_ID = null;

// Portada del evento (formulario): imagen ya redimensionada como data URL lista
// para guardar en la columna eventos.portada, y bandera de quitar.
let PORTADA_DATA = null;
let PORTADA_QUITAR = false;

/** Lee una imagen, la reduce (máx `maxAncho`) y la devuelve como JPEG data URL. */
function archivoAPortada(file, maxAncho) {
    return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => {
            const img = new Image();
            img.onload = () => {
                let w = img.naturalWidth, h = img.naturalHeight;
                if (w > maxAncho) { h = Math.round(h * maxAncho / w); w = maxAncho; }
                const c = document.createElement('canvas');
                c.width = w; c.height = h;
                const ctx = c.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                resolve(c.toDataURL('image/jpeg', 0.82));
            };
            img.onerror = () => reject(new Error('archivo de imagen no válido'));
            img.src = fr.result;
        };
        fr.onerror = () => reject(new Error('no se pudo leer el archivo'));
        fr.readAsDataURL(file);
    });
}

/** Pinta la miniatura de portada del modal de evento a partir de una URL/objeto. */
function renderPortadaEvento(url) {
    const img = $('ev-portada-prev');
    const sin = $('ev-portada-sin');
    if (url) { img.src = url; mostrar(img, true); mostrar(sin, false); }
    else { img.removeAttribute('src'); mostrar(img, false); mostrar(sin, true); }
}

/** Abre el modal de evento precargado con los datos del evento actual. */
function abrirEdicionEvento() {
    const ev = EVENTO_ACTUAL;
    if (!ev) return;
    EDITANDO_EVENTO_ID = ev.id;

    $('ev-tipo').value = ev.tipo || TIPOS[0];
    $('ev-responsable').value = ev.responsable || RESPONSABLES[0];
    $('ev-nombre').value = ev.nombre || '';
    $('ev-ponente').value = ev.ponente === 'pendiente' ? '' : (ev.ponente || '');
    $('ev-modalidad').value = ev.modalidad || 'Virtual';
    $('ev-sedes').value = ev.sedes || SEDES[0];
    renderAudiencias((ev.audiencia || '').split(',').map((s) => s.trim()).filter(Boolean));
    $('ev-descripcion').value = ev.descripcion_evento || '';
    $('ev-descripcion').dataset.tocado = '1';   // no sobrescribir lo ya escrito

    PORTADA_DATA = null; PORTADA_QUITAR = false;
    renderPortadaEvento(ev.portada || '');
    
    if (ev.tipo === 'Asesoría Especializada') {
        $('ev-asesoria-tema').value = ev.asesoria_tema || '';
        mostrar($('grupo-asesoria'), true);
    } else {
        mostrar($('grupo-asesoria'), false);
    }

    $('ev-sesiones').innerHTML = '';
    let sesiones = [];
    try { sesiones = JSON.parse(ev.horario || '[]'); } catch (e) { }
    if (!sesiones.length) sesiones = [{ fecha: '', inicio: '17:30', fin: '19:00' }];
    sesiones.forEach((s) => {
        agregarSesion();
        const fila = $('ev-sesiones').lastElementChild;
        fila.querySelector('.s-fecha').value = s.fecha || '';
        fila.querySelector('.s-ini').value = s.inicio || '17:30';
        fila.querySelector('.s-fin').value = s.fin || '19:00';
    });

    $('titulo-modal-evento').textContent = 'Editar evento';
    $('btn-guardar-evento').textContent = 'Guardar cambios';
    msg($('msg-evento'), '', '');
    abrirModal('modal-evento');
}

/** Elimina el evento actual junto con sus participantes y constancias. */
async function eliminarEvento() {
    const ev = EVENTO_ACTUAL;
    if (!ev) return;

    const n = PARTICIPANTES.length;
    const conCert = PARTICIPANTES.filter((p) => p.certificado_url).length;
    if (!confirm(
        `¿Eliminar el evento «${ev.nombre}»?\n\n` +
        (n ? `Se borrarán también sus ${n} participante(s)` +
            (conCert ? ` y ${conCert} constancia(s) ya emitidas` : '') + '.\n' : '') +
        `Esta acción no se puede deshacer.`)) return;

    msg($('msg-generacion'), 'Eliminando...', '');

    // 1. Borrar los PDF del bucket.
    const rutas = PARTICIPANTES
        .filter((p) => p.certificado_url)
        .map((p) => p.certificado_url.split('/certificados/')[1]?.split('?')[0])
        .filter(Boolean);
    if (rutas.length) {
        const { error } = await sb.storage.from(BUCKET).remove(rutas);
        if (error) { msg($('msg-generacion'), 'No se pudieron borrar los PDF: ' + error.message, 'err'); return; }
    }

    // 2. Borrar asistencias y luego el evento.
    let r = await sb.from('asistencias').delete().eq('evento_id', ev.id);
    if (r.error) { msg($('msg-generacion'), 'Error al borrar participantes: ' + r.error.message, 'err'); return; }
    r = await sb.from('eventos').delete().eq('id', ev.id);
    if (r.error) { msg($('msg-generacion'), 'Error al borrar el evento: ' + r.error.message, 'err'); return; }

    mostrarVista('vista-eventos');
    await cargarEventos();
}

/* ------------------------------------------------------------------ *
 *  PARTICIPANTES
 * ------------------------------------------------------------------ */

async function abrirGestor(eventoId) {
    EVENTO_ACTUAL = EVENTOS.find((e) => e.id === eventoId);
    if (!EVENTO_ACTUAL) return;

    mostrarVista('vista-constancias');
    // Recordar el evento abierto en la URL para que al recargar se quede aquí.
    history.replaceState(null, '', '#evento=' + eventoId);
    msg($('msg-generacion'), '', '');
    mostrar($('barra-generacion'), false);

    const ev = EVENTO_ACTUAL;
    const f = fechasEvento(ev.horario);

    $('titulo-evento').textContent = ev.nombre;
    $('subtitulo-evento').textContent = `${ev.tipo} · ${ev.modalidad} · ${f.rango || 'sin fecha'}`;
    
    let alcanceVal = '';
    try {
        const reqs = typeof ev.requisitos === 'string' ? JSON.parse(ev.requisitos) : (ev.requisitos || {});
        if(reqs.alcance) alcanceVal = reqs.alcance;
    } catch(e) {}
    if(document.getElementById('input-alcance')) {
        document.getElementById('input-alcance').value = alcanceVal;
    }

    let sesiones = [];
    try { sesiones = JSON.parse(ev.horario || '[]'); } catch (e) { }
    const listaSesiones = sesiones.length
        ? sesiones.map((s) => `${s.fecha}${s.inicio ? ` (${s.inicio}${s.fin ? '–' + s.fin : ''})` : ''}`).join('<br>')
        : '—';

    const selCopiar = $('sel-sesion-copiar');
    if (selCopiar) {
        selCopiar.innerHTML = '';
        sesiones.forEach((s, idx) => {
            const opt = document.createElement('option');
            opt.value = `Sesión ${idx + 1}`;
            opt.textContent = `Sesión ${idx + 1} (${s.fecha})`;
            selCopiar.appendChild(opt);
        });
        const optTodos = document.createElement('option');
        optTodos.value = 'Taller Completo';
        optTodos.textContent = 'Taller Completo / Todas las sesiones';
        selCopiar.appendChild(optTodos);
    }

    const dato = (etiqueta, valor) =>
        `<div><span>${etiqueta}</span><strong>${valor || '—'}</strong></div>`;

    $('ficha-datos').innerHTML =
        dato('Código', escapar(ev.sheet_id)) +
        dato('Tipo', escapar(ev.tipo)) +
        dato('Ponente', escapar(ev.ponente === 'pendiente' ? '' : ev.ponente)) +
        dato('Modalidad', escapar(ev.modalidad)) +
        dato('Sede', escapar(ev.sedes)) +
        dato('Público objetivo', escapar(ev.audiencia)) +
        dato('Sesiones', listaSesiones);

    $('ficha-descripcion').textContent = ev.descripcion_evento || '';
    mostrar($('ficha-descripcion'), !!ev.descripcion_evento);

    await cargarPlantillasRemotas();   // nombres de diseño frescos para la tabla y el selector
    await cargarParticipantes();
    await cargarEncuestas();

    // Setup tabs
    const TABS = ['participantes', 'encuestas', 'evidencias'];
    TABS.forEach((t) => {
        $('tab-btn-' + t).onclick = () => {
            TABS.forEach((o) => {
                $('tab-btn-' + o).classList.toggle('activo', o === t);
                mostrar($('tab-' + o), o === t);
            });
            if (t === 'evidencias') cargarEvidencias();
        };
    });
    // Default to participantes tab
    $('tab-btn-participantes').click();
    if ($('tab-link-metricas')) $('tab-link-metricas').href = 'metricas.html?e=' + EVENTO_ACTUAL.id;
}

/* ------------------------------------------------------------------ *
 *  EVIDENCIAS (fotos / capturas del evento para el reporte)
 * ------------------------------------------------------------------ */

let EVIDENCIAS = [];

async function cargarEvidencias() {
    const evId = EVENTO_ACTUAL && EVENTO_ACTUAL.id;
    if (!evId) return;
    $('evid-grid').innerHTML = '';
    $('evid-conteo').textContent = 'Cargando...';
    try {
        EVIDENCIAS = await Evidencias.listar(sb, evId);
    } catch (e) {
        msg($('evid-msg'), 'Error al cargar las fotos: ' + e.message, 'err');
        EVIDENCIAS = [];
    }
    if (!EVENTO_ACTUAL || EVENTO_ACTUAL.id !== evId) return;   // cambió de evento mientras cargaba
    pintarEvidencias();
}

function pintarEvidencias() {
    $('evid-conteo').textContent = `${EVIDENCIAS.length} foto(s)`;
    mostrar($('evid-vacio'), EVIDENCIAS.length === 0);
    $('evid-grid').innerHTML = EVIDENCIAS.map((f, i) => `
        <div class="evid-item">
            <img src="${f.url}" alt="Foto ${i + 1}" onclick="window.open('${f.url}', '_blank')">
            <span class="num">${i + 1}</span>
            <button onclick="quitarEvidencia('${f.nombre}')" title="Quitar del reporte"><i class="ph ph-trash"></i> Quitar</button>
        </div>`).join('');
}

async function subirEvidencias(files) {
    const imgs = [...files].filter((f) => f.type.startsWith('image/'));
    if (!imgs.length || !EVENTO_ACTUAL) return;
    let ok = 0;
    for (const f of imgs) {
        msg($('evid-msg'), `Subiendo ${ok + 1} de ${imgs.length}...`, '');
        try { await Evidencias.subir(sb, EVENTO_ACTUAL.id, f); ok++; }
        catch (e) { msg($('evid-msg'), `No se pudo subir «${f.name}»: ${e.message}`, 'err'); await cargarEvidencias(); return; }
    }
    msg($('evid-msg'), `${ok} foto(s) subida(s).`, 'ok');
    await cargarEvidencias();
}

window.quitarEvidencia = async function (nombre) {
    if (!confirm('¿Quitar esta foto del reporte?')) return;
    try {
        await Evidencias.quitar(sb, EVENTO_ACTUAL.id, nombre);
        msg($('evid-msg'), 'Foto quitada.', 'ok');
    } catch (e) {
        msg($('evid-msg'), 'No se pudo quitar: ' + e.message, 'err');
    }
    await cargarEvidencias();
};

document.addEventListener('DOMContentLoaded', () => {
    $('evid-file').addEventListener('change', async (e) => {
        await subirEvidencias(e.target.files);
        e.target.value = '';
    });
    // Pegar capturas (Ctrl+V) cuando la pestaña de evidencias está abierta.
    document.addEventListener('paste', (e) => {
        if ($('tab-evidencias').classList.contains('oculto')) return;
        const files = [...(e.clipboardData?.files || [])];
        if (files.length) { e.preventDefault(); subirEvidencias(files); }
    });
});

async function cargarParticipantes() {
    const { data, error } = await sb
        .from('asistencias')
        .select('id,dni,nombres,apellidos,correo,certificado_url,plantilla_id')
        .eq('evento_id', EVENTO_ACTUAL.id)
        .order('apellidos', { ascending: true });

    if (error) { msg($('msg-generacion'), 'Error al cargar participantes: ' + error.message, 'err'); return; }

    PARTICIPANTES = data || [];
    const hechas = PARTICIPANTES.filter((p) => p.certificado_url).length;
    $('conteo-participantes').textContent =
        `${PARTICIPANTES.length} participante(s) · ${hechas} con constancia`;

    mostrar($('participantes-vacio'), PARTICIPANTES.length === 0);
    mostrar($('sel-acciones'), PARTICIPANTES.length > 0);
    $('tbody-participantes').innerHTML = PARTICIPANTES.map((p) => `
        <tr>
            <td style="text-align:center;"><input type="checkbox" class="chk-fila" data-id="${p.id}"></td>
            <td>${escapar(p.dni)}</td>
            <td>${escapar(((p.apellidos || '') + ' ' + (p.nombres || '')).trim())}</td>
            <td>${escapar(p.correo || '—')}</td>
            <td><span class="badge-disenio">${escapar(nombreDisenio(p.plantilla_id))}</span></td>
            <td><span class="estado-cert ${p.certificado_url ? 'si' : 'no'}">
                ${p.certificado_url ? 'Emitida' : 'Pendiente'}</span></td>
            <td>${p.certificado_url
                ? `<a href="${p.certificado_url}" target="_blank" rel="noopener">Ver PDF</a>`
                : ''}</td>
            <td class="celda-acciones">
                <button class="btn-icono" data-accion="editar" data-id="${p.id}" title="Editar">
                    <i class="ph ph-pencil-simple"></i></button>
                <button class="btn-icono" onclick="copiarAEncuesta('${p.id}')" title="Copiar a Resultados">
                    <i class="ph ph-copy"></i></button>
                <button class="btn-icono" data-accion="copiar" data-id="${p.id}" title="Copiar datos">
                    <i class="ph ph-copy-simple"></i></button>
                <button class="btn-icono peligro" data-accion="eliminar" data-id="${p.id}" title="Eliminar">
                    <i class="ph ph-trash"></i></button>
            </td>
        </tr>`).join('');

    refrescarOpcionesDisenio();
    $('chk-todos').checked = false;
    $('chk-todos').indeterminate = false;
    actualizarSeleccion();
}

async function cargarEncuestas() {
    const { data, error } = await sb
        .from('asistencia_encuesta')
        .select('*')
        .eq('evento_id', EVENTO_ACTUAL.id)
        .order('participante_nombre', { ascending: true });

    if (error) { console.error('Error al cargar encuestas:', error); return; }

    window.ENCUESTAS_ACTUALES = data || []; 
    const encuestas = window.ENCUESTAS_ACTUALES;
    $('conteo-encuestas').textContent = `${encuestas.length} respuesta(s)`;
    
    mostrar($('encuestas-vacio'), encuestas.length === 0);
    $('tbody-encuestas').innerHTML = encuestas.map(e => `
        <tr>
            <td style="text-align:center;"><input type="checkbox" class="chk-fila-encuesta" data-id="${e.id}"></td>
            <td style="white-space:nowrap;">${escapar(formatoFecha(e.fecha_llenado) || '—')}</td>
            <td style="white-space:nowrap;">${escapar(formatoHora(e.fecha_llenado) || '—')}</td>
            <td>${escapar(e.dni || '—')}</td>
            <td>${escapar(e.participante_nombre || 'Anónimo')}</td>
            <td>${escapar(e.tipo_participante || '—')}</td>
            <td>${escapar(e.sede || '—')}</td>
            <td>${escapar(etiquetaSesion(e.modulo_sesion))}</td>
            <td><strong>${e.nps != null ? e.nps : '—'}</strong></td>
            <td>${e.facilidad != null ? '★'.repeat(e.facilidad) + '☆'.repeat(5 - e.facilidad) : '—'}</td>
            <td style="font-size:12px; font-style:italic;">${(e.comentarios || '').trim() ? `"${escapar(e.comentarios.trim())}"` : ''}</td>
            <td style="text-align:right;">
                <button class="btn-ghost" style="padding:6px;" title="Copiar a Constancias" onclick="copiarAConstancias('${e.id}')"><i class="ph ph-copy"></i></button>
                <button class="btn-ghost" style="padding:6px;" title="Editar" onclick="abrirEdicionEncuesta('${e.id}')"><i class="ph ph-pencil-simple"></i></button>
                <button class="btn-ghost peligro" style="padding:6px;" title="Eliminar" onclick="eliminarEncuesta('${e.id}')"><i class="ph ph-trash"></i></button>
            </td>
        </tr>
    `).join('');

    if($('chk-todos-encuestas')) {
        $('chk-todos-encuestas').checked = false;
        $('chk-todos-encuestas').indeterminate = false;
    }
    actualizarSeleccionEncuestas();
}

// ---- Sesión de las respuestas ----
// Las respuestas importadas o copiadas sin sesión van a "Sesión 1" (o "Taller Completo" si hay varias).
// Etiquetas internas antiguas ("Importación CSV", "Copia Constancias") se muestran igual.
function sesionPorDefecto() {
    let n = 1;
    try { n = JSON.parse(EVENTO_ACTUAL.horario || '[]').length || 1; } catch (e) { }
    return n > 1 ? 'Taller Completo' : 'Sesión 1';
}
function etiquetaSesion(v) {
    const t = (v || '').toString().trim();
    if (!t || /importaci[oó]n|copia constancias/i.test(t)) return sesionPorDefecto();
    return t;
}

// ---- Fecha/hora de llenado de encuestas ----
const pad2 = (n) => String(n).padStart(2, '0');
function formatoFecha(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d) ? '' : `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function formatoHora(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d) ? '' : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Sesión del horario del evento a la que corresponde "Sesión N" (Taller/Evento completo -> la última). */
function sesionDeEncuesta(moduloSesion) {
    let sesiones = [];
    try { sesiones = JSON.parse(EVENTO_ACTUAL.horario || '[]'); } catch (e) {}
    if (!sesiones.length) return null;
    const n = parseInt(String(moduloSesion || '').replace(/\D/g, ''), 10);
    return (n >= 1 && n <= sesiones.length) ? sesiones[n - 1] : sesiones[sesiones.length - 1];
}

/** Fecha/hora de llenado autogenerada: fin de la sesión + 0 a 15 minutos. */
function fechaLlenadoEstimada(moduloSesion, horaFija) {
    const s = sesionDeEncuesta(moduloSesion);
    if (!s || !s.fecha) return new Date().toISOString();
    const [y, mo, d] = s.fecha.split('-').map(Number);
    const [hh, mm] = (horaFija || s.fin || s.inicio || '12:00').split(':').map(Number);
    const f = new Date(y, mo - 1, d, hh || 0, mm || 0);
    if (!horaFija) f.setMinutes(f.getMinutes() + Math.floor(Math.random() * 16));
    return f.toISOString();
}

/** Completa fecha_llenado de las respuestas que no la tienen. Si se crearon el mismo día de su sesión, se usa esa hora real. */
async function autogenerarFechasEncuestas() {
    const sinFecha = (window.ENCUESTAS_ACTUALES || []).filter(e => !e.fecha_llenado);
    if (!sinFecha.length) { msgToast('Todas las respuestas ya tienen fecha y hora', 'éxito'); return; }
    if (!confirm(`Se autogenerará la fecha y hora de ${sinFecha.length} respuesta(s). ¿Continuar?`)) return;

    let errores = 0;
    for (const e of sinFecha) {
        const s = sesionDeEncuesta(e.modulo_sesion);
        const creado = e.created_at ? new Date(e.created_at) : null;
        const mismoDia = s && s.fecha && creado && !isNaN(creado) &&
            `${creado.getFullYear()}-${pad2(creado.getMonth() + 1)}-${pad2(creado.getDate())}` === s.fecha;
        const fecha_llenado = mismoDia ? creado.toISOString() : fechaLlenadoEstimada(e.modulo_sesion);
        const { error } = await sb.from('asistencia_encuesta').update({ fecha_llenado }).eq('id', e.id);
        if (error) errores++;
    }
    msgToast(errores ? `Hubo ${errores} error(es) al actualizar` : 'Fechas y horas generadas', errores ? 'error' : 'éxito');
    cargarEncuestas();
}
window.autogenerarFechasEncuestas = autogenerarFechasEncuestas;

/* ---- Completar datos faltantes de las respuestas ----
 * Fuentes, en orden: participantes del propio evento y la base de estudiantes
 * (bd_estudiantes, la misma de la página Estudiantes). Solo se acepta una
 * coincidencia única; si hay dudas, la respuesta queda como está.
 * Los comentarios vacíos solo se completan con lo que la misma persona escribió
 * en otra de sus respuestas del evento: no se inventan comentarios. */

const palabrasNombre = (s) => norm(s).replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 2);
const nombrePropio = (s) => (s || '').toString().toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()).trim();

/** "APELLIDO1 APELLIDO2 NOMBRES" (formato de la base) -> { apellidos, nombres } */
function partirNombreBase(alumno) {
    const p = (alumno || '').trim().split(/\s+/);
    const nAp = p.length >= 3 ? 2 : 1;
    return { apellidos: nombrePropio(p.slice(0, nAp).join(' ')), nombres: nombrePropio(p.slice(nAp).join(' ')) };
}

/** Busca a una persona en la base de estudiantes. Devuelve la fila solo si es única. */
async function buscarEnBaseEstudiantes(dni, nombre) {
    const d = (dni || '').toString().trim();
    const palabras = palabrasNombre(nombre);
    const q = d ? [d] : palabras;
    if (!d && palabras.length < 2) return null;
    const { data, error } = await sb.rpc('bd_est_alumnos', { f: { q: q.map((w) => w.toUpperCase()) }, lim: 10, off: 0 });
    if (error || !data) return null;
    // La búsqueda también mira cursos y docentes: confirmar contra el DNI o el nombre del alumno.
    const candidatos = data.filter((r) => d ? String(r.dni) === d
        : palabras.every((w) => palabrasNombre(r.alumno).includes(w)));
    if (candidatos.length === 1) return candidatos[0];
    if (d || candidatos.length > 1 || palabras.length < 3) return null;

    // Sin resultado: probar quitando una palabra (errores de tipeo como "Quuiroz" o "Del").
    // Solo vale si todas las pruebas apuntan a la misma única persona.
    const halladas = new Map();
    for (let i = 0; i < palabras.length; i++) {
        const resto = palabras.filter((_, j) => j !== i);
        const { data: d2 } = await sb.rpc('bd_est_alumnos', { f: { q: resto.map((w) => w.toUpperCase()) }, lim: 10, off: 0 });
        const c2 = (d2 || []).filter((r) => resto.every((w) => palabrasNombre(r.alumno).includes(w)));
        if (c2.length === 1) halladas.set(String(c2[0].dni), c2[0]);
        else if (c2.length > 1) return null;   // ambiguo
    }
    return halladas.size === 1 ? [...halladas.values()][0] : null;
}

async function completarDatosEncuestas() {
    const encuestas = window.ENCUESTAS_ACTUALES || [];
    const falta = (e) => !e.dni || !e.correo || !e.apellidos || !e.nombres || !e.sede || !e.tipo_participante || !(e.comentarios || '').trim();
    const pendientes = encuestas.filter(falta);
    if (!pendientes.length) return msgToast('Todas las respuestas ya tienen sus datos completos', 'éxito');

    // Agrupar por persona para buscar una sola vez a cada una.
    const clave = (e) => clavePersona(e.dni, e.participante_nombre || `${e.apellidos || ''} ${e.nombres || ''}`);
    const personas = new Map();
    encuestas.forEach((e) => { const k = clave(e); if (!personas.has(k)) personas.set(k, []); personas.get(k).push(e); });

    msgToast(`Buscando datos de ${pendientes.length} respuesta(s)...`, 'info');
    const encontrados = new Map();   // clave -> { dni, correo, apellidos, nombres, sede, tipo }
    const claves = [...new Set(pendientes.map(clave))];
    let i = 0;
    const trabajador = async () => {
        while (i < claves.length) {
            const k = claves[i++];
            const grupo = personas.get(k);
            const e = grupo.find((x) => x.dni) || grupo[0];
            const nombre = e.participante_nombre || `${e.apellidos || ''} ${e.nombres || ''}`;
            // 1) Participantes del evento
            const pal = palabrasNombre(nombre);
            const enEvento = PARTICIPANTES.filter((p) => (e.dni && String(p.dni) === String(e.dni)) ||
                (pal.length >= 2 && pal.every((w) => palabrasNombre(`${p.apellidos || ''} ${p.nombres || ''}`).includes(w))));
            if (enEvento.length === 1 && !/^SC/.test(enEvento[0].dni || '')) {
                const p = enEvento[0];
                encontrados.set(k, { dni: p.dni, correo: p.correo, apellidos: nombrePropio(p.apellidos), nombres: nombrePropio(p.nombres) });
            }
            // 2) Base de estudiantes
            const r = await buscarEnBaseEstudiantes(e.dni || (encontrados.get(k) || {}).dni, nombre);
            if (r) {
                const sedeBase = (r.sede || '').split('/').pop().trim();
                encontrados.set(k, {
                    ...partirNombreBase(r.alumno), ...(encontrados.get(k) || {}),
                    dni: r.dni, correo: (encontrados.get(k) || {}).correo || r.correo,
                    sede: nombrePropio(sedeBase), tipo: 'Estudiante'
                });
            }
        }
    };
    await Promise.all(Array.from({ length: 6 }, trabajador));

    // Armar los cambios (solo campos vacíos).
    const cambios = [];
    const cuenta = { dni: 0, correo: 0, nombre: 0, sede: 0, tipo: 0, comentario: 0 };
    pendientes.forEach((e) => {
        const k = clave(e), m = encontrados.get(k) || {}, c = {};
        if (!e.dni && m.dni) { c.dni = String(m.dni); cuenta.dni++; }
        if (!e.correo && m.correo) { c.correo = m.correo; cuenta.correo++; }
        if ((!e.apellidos || !e.nombres) && m.apellidos && m.nombres) {
            c.apellidos = m.apellidos; c.nombres = m.nombres;
            c.participante_nombre = `${m.apellidos} ${m.nombres}`; cuenta.nombre++;
        }
        if (!e.sede && m.sede) { c.sede = m.sede; cuenta.sede++; }
        if (!e.tipo_participante && m.tipo) { c.tipo_participante = m.tipo; cuenta.tipo++; }
        if (!(e.comentarios || '').trim()) {
            const otro = personas.get(k).find((x) => x.id !== e.id && (x.comentarios || '').trim());
            if (otro) { c.comentarios = otro.comentarios.trim(); cuenta.comentario++; }
        }
        if (Object.keys(c).length) cambios.push({ id: e.id, c });
    });

    const sinDatos = claves.filter((k) => !encontrados.has(k)).map((k) => {
        const e = personas.get(k)[0]; return e.participante_nombre || `${e.apellidos || ''} ${e.nombres || ''}`.trim();
    });
    if (!cambios.length) {
        return alert('No se encontró información nueva para completar.' +
            (sinDatos.length ? `\n\nNo se ubicó en la base (o hay más de una coincidencia):\n• ${sinDatos.slice(0, 15).join('\n• ')}${sinDatos.length > 15 ? `\n… y ${sinDatos.length - 15} más` : ''}` : ''));
    }
    if (!confirm(
        `Se completarán ${cambios.length} respuesta(s):\n\n` +
        (cuenta.dni ? `• DNI: ${cuenta.dni}\n` : '') +
        (cuenta.correo ? `• Correo: ${cuenta.correo}\n` : '') +
        (cuenta.nombre ? `• Nombres y apellidos: ${cuenta.nombre}\n` : '') +
        (cuenta.sede ? `• Sede: ${cuenta.sede}\n` : '') +
        (cuenta.tipo ? `• Tipo de participante: ${cuenta.tipo}\n` : '') +
        (cuenta.comentario ? `• Comentario (de otra respuesta de la misma persona): ${cuenta.comentario}\n` : '') +
        (sinDatos.length ? `\nNo se ubicó en la base (o hay más de una coincidencia): ${sinDatos.length} persona(s).\n` : '') +
        `\nSolo se llenan campos vacíos. ¿Continuar?`)) return;

    let errores = 0, j = 0;
    const guardar = async () => {
        while (j < cambios.length) {
            const { id, c } = cambios[j++];
            const { error } = await sb.from('asistencia_encuesta').update(c).eq('id', id);
            if (error) { errores++; console.error('Completar datos:', error); }
        }
    };
    await Promise.all(Array.from({ length: 6 }, guardar));
    msgToast(errores ? `Se completaron ${cambios.length - errores}; ${errores} con error` : `Se completaron ${cambios.length} respuesta(s)`, errores ? 'error' : 'éxito');
    if (sinDatos.length) console.info('Sin coincidencia única en la base:', sinDatos);
    await cargarEncuestas();
}
window.completarDatosEncuestas = completarDatosEncuestas;

/** Descarga las respuestas del evento como Excel. */
function exportarEncuestasExcel() {
    const encuestas = window.ENCUESTAS_ACTUALES || [];
    if (!encuestas.length) { msgToast('No hay respuestas para exportar', 'error'); return; }
    if (typeof XLSX === 'undefined') { msgToast('No se pudo cargar la librería de Excel', 'error'); return; }

    const filas = encuestas.map(e => ({
        'Fecha': formatoFecha(e.fecha_llenado),
        'Hora': formatoHora(e.fecha_llenado),
        'DNI': e.dni || '',
        'Apellidos': e.apellidos || '',
        'Nombres': e.nombres || (e.apellidos ? '' : (e.participante_nombre || '')),
        'Tipo': e.tipo_participante || '',
        'Correo': e.correo || '',
        'Sede': e.sede || '',
        'Sesión': etiquetaSesion(e.modulo_sesion),
        'NPS (0-10)': e.nps ?? '',
        'Satisfacción (1-5)': e.facilidad ?? '',
        'Comentarios': e.comentarios || ''
    }));
    const hoja = XLSX.utils.json_to_sheet(filas);
    hoja['!cols'] = [12, 8, 12, 22, 22, 12, 28, 14, 14, 10, 16, 50].map(wch => ({ wch }));
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Encuestas');
    const nombre = (EVENTO_ACTUAL.nombre || 'evento').replace(/[\\/:*?"<>|]/g, '').slice(0, 80);
    XLSX.writeFile(libro, `Encuestas - ${nombre}.xlsx`);
}
window.exportarEncuestasExcel = exportarEncuestasExcel;

/** Normaliza el tipo de participante importado. */
function normalizarTipo(t) {
    const h = norm(t || '');
    if (!h) return '';
    if (h.includes('estud')) return 'Estudiante';
    if (h.includes('docen') || h.includes('profe')) return 'Docente';
    if (h.includes('egres')) return 'Egresado';
    if (h.includes('invit') || h.includes('extern') || h.includes('public')) return 'Invitado';
    return t.toString().trim();
}

/** Convierte una fecha/marca temporal importada (texto dd/mm/aaaa [hh:mm], ISO o número de Excel) a ISO. */
function parsearFechaImportada(valor, horaTexto) {
    if (valor === undefined || valor === null || valor === '') return null;
    let y, mo, d, hh = 0, mi = 0, ss = 0;
    const num = Number(valor);
    if (!isNaN(num) && num > 20000 && typeof XLSX !== 'undefined') {
        const p = XLSX.SSF.parse_date_code(num);
        if (!p) return null;
        ({ y, m: mo, d, H: hh, M: mi, S: ss } = p);
    } else {
        const t = valor.toString().trim();
        let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
        else if ((m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/))) {
            d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000;
        } else return null;
        const h = t.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])?/i);
        if (h) { hh = +h[1]; mi = +h[2]; ss = +(h[3] || 0); if (h[4]) { const pm = h[4].toLowerCase() === 'p'; if (pm && hh < 12) hh += 12; if (!pm && hh === 12) hh = 0; } }
    }
    if (horaTexto) {
        const h = horaTexto.toString().match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap])?/i);
        if (h) { hh = +h[1]; mi = +h[2]; ss = +(h[3] || 0); if (h[4]) { const pm = h[4].toLowerCase() === 'p'; if (pm && hh < 12) hh += 12; if (!pm && hh === 12) hh = 0; } }
    }
    const f = new Date(y, mo - 1, d, hh, mi, ss);
    return isNaN(f) ? null : f.toISOString();
}

function actualizarSeleccionEncuestas() {
    const filas = Array.from(document.querySelectorAll('#tbody-encuestas .chk-fila-encuesta'));
    const marcadas = filas.filter((c) => c.checked);
    if($('sel-conteo-encuestas')) $('sel-conteo-encuestas').textContent = marcadas.length;
    if($('btn-eliminar-sel-encuestas')) $('btn-eliminar-sel-encuestas').disabled = marcadas.length === 0;
    if($('sel-acciones-encuestas')) { mostrar($('sel-acciones-encuestas'), marcadas.length > 0); llenarSedesLote(); }
    
    const todos = $('chk-todos-encuestas');
    if (todos) {
        todos.checked = filas.length > 0 && marcadas.length === filas.length;
        todos.indeterminate = marcadas.length > 0 && marcadas.length < filas.length;
    }
}

/** Refleja la selección actual en el contador y en el botón "Eliminar seleccionados". */
function actualizarSeleccion() {
    const filas = Array.from(document.querySelectorAll('#tbody-participantes .chk-fila'));
    const marcadas = filas.filter((c) => c.checked);
    $('sel-conteo').textContent = marcadas.length;
    $('btn-eliminar-sel').disabled = marcadas.length === 0;
    $('btn-asignar-diseno').disabled = marcadas.length === 0;
    $('btn-generar-sel').disabled = marcadas.length === 0;
    $('btn-eliminar-todos').disabled = filas.length === 0;
    const todos = $('chk-todos');
    todos.checked = filas.length > 0 && marcadas.length === filas.length;
    todos.indeterminate = marcadas.length > 0 && marcadas.length < filas.length;
}

/** Parte un arreglo en lotes de tamaño n (para no exceder límites de URL/API). */
function enLotes(arr, n) {
    const r = [];
    for (let i = 0; i < arr.length; i += n) r.push(arr.slice(i, i + n));
    return r;
}

/** Borra un conjunto de participantes: primero sus PDFs del bucket, luego las
 * filas de asistencias. Se usa tanto para "seleccionados" como para "todos". */
async function eliminarParticipantesBulk(lista, etiqueta) {
    if (!lista.length) return;

    const conCert = lista.filter((p) => p.certificado_url).length;
    const confirmacion = `¿Eliminar ${lista.length} participante(s) ${etiqueta} de este evento?` +
        (conCert ? `\n${conCert} tiene(n) constancia emitida; su PDF en Supabase también se borrará.` : '') +
        `\n\nEsta acción no se puede deshacer.`;
    if (!confirm(confirmacion)) return;

    $('btn-eliminar-sel').disabled = true;
    $('btn-eliminar-todos').disabled = true;
    msg($('msg-generacion'), `Eliminando ${lista.length} participante(s)...`, '');

    // 1) Borrar los PDFs (en lotes).
    const rutas = lista
        .map((p) => p.certificado_url)
        .filter(Boolean)
        .map((u) => (u.split('/certificados/')[1] || '').split('?')[0])
        .filter(Boolean);
    for (const lote of enLotes(rutas, 100)) {
        const { error } = await sb.storage.from(BUCKET).remove(lote);
        if (error) {
            msg($('msg-generacion'), 'No se pudieron borrar algunos PDFs: ' + error.message, 'err');
            actualizarSeleccion();
            return;
        }
    }

    // 2) Borrar las filas de asistencias (en lotes).
    const ids = lista.map((p) => p.id);
    for (const lote of enLotes(ids, 100)) {
        const { error } = await sb.from('asistencias').delete().in('id', lote);
        if (error) {
            msg($('msg-generacion'), 'No se pudo eliminar: ' + error.message, 'err');
            await cargarParticipantes();
            return;
        }
    }

    msg($('msg-generacion'), `Se eliminaron ${lista.length} participante(s).`, 'ok');
    await cargarParticipantes();
}

/** Devuelve los participantes cuya casilla está marcada. */
function participantesSeleccionados() {
    const ids = new Set(
        Array.from(document.querySelectorAll('#tbody-participantes .chk-fila:checked')).map((c) => c.dataset.id)
    );
    return PARTICIPANTES.filter((p) => ids.has(String(p.id)));
}

/** Asigna un diseño (1..4) a los participantes seleccionados (en lotes). */
async function asignarDisenioSeleccionados(plantillaId) {
    const lista = participantesSeleccionados();
    if (!lista.length) return;

    $('btn-asignar-diseno').disabled = true;
    msg($('msg-generacion'), `Asignando diseño a ${lista.length} participante(s)...`, '');
    const ids = lista.map((p) => p.id);
    for (const lote of enLotes(ids, 100)) {
        const { error } = await sb.from('asistencias').update({ plantilla_id: plantillaId }).in('id', lote);
        if (error) {
            msg($('msg-generacion'), 'No se pudo asignar el diseño: ' + error.message, 'err');
            $('btn-asignar-diseno').disabled = false;
            return;
        }
    }
    msg($('msg-generacion'),
        `Se asignó el diseño "${nombreDisenio(plantillaId)}" a ${lista.length} participante(s). ` +
        'Vuelve a generar sus constancias para aplicar el diseño.', 'ok');
    await cargarParticipantes();
}

// id de la fila que se está editando; null significa que el modal está en modo "agregar".
let EDITANDO_ID = null;

async function guardarParticipante() {
    const dni = $('pa-dni').value.trim();
    if (!dni) { msg($('msg-participante'), 'El DNI es obligatorio.', 'err'); return; }

    $('btn-guardar-participante').disabled = true;

    const datos = {
        dni,
        apellidos: $('pa-apellidos').value.trim(),
        nombres: $('pa-nombres').value.trim(),
        correo: $('pa-correo').value.trim()
    };

    let error;
    if (EDITANDO_ID) {
        ({ error } = await sb.from('asistencias').update(datos).eq('id', EDITANDO_ID));
    } else {
        ({ error } = await sb.from('asistencias').upsert(
            Object.assign({ evento_id: EVENTO_ACTUAL.id, asistencia: true }, datos),
            { onConflict: 'dni,evento_id' }));
    }

    $('btn-guardar-participante').disabled = false;

    if (error) { msg($('msg-participante'), 'Error: ' + error.message, 'err'); return; }

    cerrarModales();
    await cargarParticipantes();
}

/** Marca en rojo DNI/correo mal escritos, sin impedir guardar. */
function validarCamposParticipante() {
    const dniOk = dniValido($('pa-dni').value);
    const correoOk = correoValido($('pa-correo').value);
    $('pa-dni').classList.toggle('invalido', !dniOk);
    $('pa-correo').classList.toggle('invalido', !correoOk);
    mostrar($('hint-dni'), !dniOk);
    mostrar($('hint-correo'), !correoOk);
}

function abrirEdicion(p) {
    EDITANDO_ID = p.id;
    $('pa-dni').value = p.dni || '';
    $('pa-apellidos').value = p.apellidos || '';
    $('pa-nombres').value = p.nombres || '';
    $('pa-correo').value = p.correo || '';
    validarCamposParticipante();
    $('titulo-modal-participante').textContent = 'Editar participante';
    $('btn-guardar-participante').textContent = 'Guardar cambios';
    msg($('msg-participante'), p.certificado_url
        ? 'Ojo: ya tiene constancia emitida. Si cambias el nombre, vuelve a generar para actualizarla.'
        : '', '');
    abrirModal('modal-participante');
}

async function copiarParticipante(p, boton) {
    const linea = [p.dni, p.apellidos || '', p.nombres || '', p.correo || '', p.certificado_url || '']
        .join('\t');
    try {
        await navigator.clipboard.writeText(linea);
        // Confirmación visual breve en el propio botón.
        const original = boton.innerHTML;
        boton.innerHTML = '<i class="ph ph-check"></i>';
        setTimeout(() => { boton.innerHTML = original; }, 1200);
    } catch (e) {
        msg($('msg-generacion'), 'No se pudo copiar al portapapeles: ' + e.message, 'err');
    }
}

async function eliminarParticipante(p) {
    const nombre = ((p.apellidos || '') + ' ' + (p.nombres || '')).trim() || p.dni;
    if (!confirm(`¿Eliminar a ${nombre} (DNI ${p.dni}) de este evento?` +
        (p.certificado_url ? '\nSu constancia en Supabase también se borrará.' : ''))) return;

    // Borrar primero el PDF: si esto falla, la fila queda y se puede reintentar.
    if (p.certificado_url) {
        const ruta = p.certificado_url.split('/certificados/')[1]?.split('?')[0];
        if (ruta) {
            const { error: errPdf } = await sb.storage.from(BUCKET).remove([ruta]);
            if (errPdf) {
                msg($('msg-generacion'), 'No se pudo borrar el PDF: ' + errPdf.message, 'err');
                return;
            }
        }
    }

    const { error } = await sb.from('asistencias').delete().eq('id', p.id);
    if (error) { msg($('msg-generacion'), 'No se pudo eliminar: ' + error.message, 'err'); return; }

    msg($('msg-generacion'), `Se eliminó a ${nombre}.`, 'ok');
    await cargarParticipantes();
}

/* ------------------------------------------------------------------ *
 *  IMPORTAR DESDE GOOGLE SHEETS
 * ------------------------------------------------------------------ */

/** Parser de CSV que respeta comillas, comas internas y saltos de línea. */
function parsearCSV(texto) {
    const filas = [];
    let fila = [];
    let campo = '';
    let entreComillas = false;

    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];
        if (entreComillas) {
            if (c === '"') {
                if (texto[i + 1] === '"') { campo += '"'; i++; }
                else entreComillas = false;
            } else campo += c;
        } else if (c === '"') {
            entreComillas = true;
        } else if (c === ',') {
            fila.push(campo); campo = '';
        } else if (c === '\n') {
            fila.push(campo); filas.push(fila); fila = []; campo = '';
        } else if (c !== '\r') {
            campo += c;
        }
    }
    if (campo || fila.length) { fila.push(campo); filas.push(fila); }

    return filas.filter((f) => f.some((v) => v.trim() !== ''));
}

/** Convierte cualquier link de Sheets en la URL de exportación CSV de esa pestaña. */
function urlCsvDeSheets(link) {
    const id = (link.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/) || [])[1];
    if (!id) throw new Error('Ese link no parece de Google Sheets. Debe contener /spreadsheets/d/...');
    const gid = (link.match(/[#&?]gid=(\d+)/) || [])[1] || '0';
    return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`;
}

async function leerDatos() {
    const esArchivo = !$('tab-archivo').classList.contains('oculto');
    msg($('msg-importar'), 'Leyendo...', '');
    $('btn-leer').disabled = true;

    try {
        let filas;

        if (esArchivo) {
            const archivo = $('im-archivo').files[0];
            if (!archivo) throw new Error('Elige un archivo .csv, .xlsx o .xls');
            const nombre = archivo.name.toLowerCase();
            if (nombre.endsWith('.xlsx') || nombre.endsWith('.xls')) {
                if (typeof XLSX === 'undefined') {
                    throw new Error('No se pudo cargar el lector de Excel; revisa tu conexión e inténtalo otra vez.');
                }
                const wb = XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
                const hoja = wb.Sheets[wb.SheetNames[0]];
                filas = XLSX.utils.sheet_to_json(hoja, { header: 1, blankrows: false, defval: '' })
                    .map((f) => f.map((c) => (c == null ? '' : String(c))));
            } else {
                filas = parsearCSV(await archivo.text());
            }
        } else {
            const link = $('im-url').value.trim();
            if (!link) throw new Error('Pega el link de la hoja.');
            const resp = await fetch(urlCsvDeSheets(link));
            if (!resp.ok) {
                throw new Error(`Google respondió ${resp.status}. Lo más probable es que la hoja ` +
                    `no esté compartida como "Cualquier persona con el enlace". Compártela así, ` +
                    `o usa la pestaña "Subir CSV / Excel".`);
            }
            filas = parsearCSV(await resp.text());
        }

        if (filas.length < 2) throw new Error('La hoja no tiene datos debajo de la cabecera.');

        IMPORTADAS = { cabeceras: filas[0], filas: filas.slice(1) };
        prepararMapeo();
        msg($('msg-importar'), `${IMPORTADAS.filas.length} fila(s) leída(s). Revisa el mapeo de columnas.`, 'ok');
    } catch (e) {
        // fetch a un dominio ajeno sin CORS cae aquí como TypeError sin detalle
        const detalle = e instanceof TypeError
            ? 'El navegador bloqueó la lectura (CORS). Comparte la hoja como "Cualquier persona con el enlace" o usa la pestaña "Subir CSV".'
            : e.message;
        msg($('msg-importar'), detalle, 'err');
        mostrar($('im-previa'), false);
    } finally {
        $('btn-leer').disabled = false;
    }
}

// Selectores del mapeo. Todos se rellenan con las columnas de la hoja.
const SELECTS_MAPEO = ['map-dni', 'map-correo', 'map-nombres', 'map-paterno',
    'map-materno', 'map-nombres2', 'map-apellidos', 'map-completo',
    'map-satisfaccion', 'map-nps', 'map-comentarios', 'map-sede', 'map-sesion',
    'map-tipo', 'map-fecha', 'map-hora'];

function prepararMapeo() {
    const cab = IMPORTADAS.cabeceras;
    const opts = ['<option value="-1">— ninguna —</option>']
        .concat(cab.map((c, i) => `<option value="${i}">${escapar(c)}</option>`)).join('');

    // El correo institucional contiene "DNI@certus", por eso el DNI solo se
    // acepta en cabeceras cortas.
    const buscar = (test) => {
        for (let i = 0; i < cab.length; i++) if (test(norm(cab[i]))) return i;
        return -1;
    };
    const iPaterno = buscar((h) => h.includes('paterno'));
    const iMaterno = buscar((h) => h.includes('materno'));
    const iApellidos = buscar((h) => h.includes('apellido') && !h.includes('paterno') && !h.includes('materno'));
    const iNombres = buscar((h) => (h.includes('nombre') || h.includes('nombres')) &&
        !h.includes('completo') && !h.includes('apellido'));
    const iCompleto = buscar((h) => h.includes('completo') ||
        (h.includes('apellido') && h.includes('nombre')));

    const sugerencias = {
        'map-dni': buscar((h) => (h.includes('dni') && h.length <= 20) || h.includes('documento')),
        'map-correo': buscar((h) => h.includes('correo') || h.includes('email')),
        'map-nombres': iNombres,
        'map-paterno': iPaterno,
        'map-materno': iMaterno,
        'map-nombres2': iNombres,
        'map-apellidos': iApellidos,
        'map-completo': iCompleto,
        'map-satisfaccion': buscar((h) => h.includes('satisfacción') || h.includes('satisfaccion') || h.includes('escala')),
        'map-nps': buscar((h) => h.includes('recomendarías') || h.includes('recomendarias') || h.includes('nps')),
        'map-comentarios': buscar((h) => h.includes('comentario') || h.includes('sugerencia')),
        'map-sede': buscar((h) => h.includes('sede') || h.includes('campus')),
        'map-sesion': buscar((h) => h.includes('sesión') || h.includes('sesion') || h.includes('taller')),
        'map-tipo': buscar((h) => h.includes('tipo') || h.includes('eres') || h.includes('familia certus')),
        'map-fecha': buscar((h) => h.includes('marca temporal') || h.includes('timestamp') || h.includes('fecha')),
        'map-hora': buscar((h) => h === 'hora' || h.includes('hora de'))
    };

    SELECTS_MAPEO.forEach((id) => {
        $(id).innerHTML = opts;
        $(id).value = String(sugerencias[id] ?? -1);
        $(id).onchange = pintarPrevia;
    });
    $('map-orden').onchange = pintarPrevia;

    // Elegir el modo más probable según lo que trae la hoja. La clave para
    // distinguir "nom-ape" de "completo": en nom-ape nombres y apellidos son
    // columnas DISTINTAS; en completo ambos caen en la misma (o no hay nombres).
    let modo = 'nom-ape';
    if (iPaterno !== -1 && iMaterno !== -1) modo = 'separado';
    else if (iNombres !== -1 && iApellidos !== -1 && iNombres !== iApellidos) modo = 'nom-ape';
    else if (iCompleto !== -1) modo = 'completo';
    $('map-modo').value = modo;
    aplicarModoMapeo();

    mostrar($('im-previa'), true);
    pintarPrevia();
}

/** Muestra solo los selectores del modo elegido. */
function aplicarModoMapeo() {
    const modo = $('map-modo').value;
    mostrar($('modo-separado'), modo === 'separado');
    mostrar($('modo-nom-ape'), modo === 'nom-ape');
    mostrar($('modo-completo'), modo === 'completo');
}

/** Separa un nombre completo en [apellidos, nombres]. */
function partirNombre(texto, orden) {
    texto = (texto || '').replace(/\s+/g, ' ').trim();
    if (!texto) return ['', ''];

    // Con coma es inequívoco: "APELLIDOS, NOMBRES" (o al revés si el orden lo indica).
    if (texto.includes(',')) {
        const izq = texto.split(',')[0].trim();
        const der = texto.slice(texto.indexOf(',') + 1).trim();
        return orden === 'NA' ? [der, izq] : [izq, der];
    }

    const t = texto.split(' ');
    if (t.length === 1) return [t[0], ''];
    if (t.length === 2) return orden === 'NA' ? [t[1], t[0]] : [t[0], t[1]];

    // 3+ palabras: se asume que los apellidos son dos (convención peruana).
    return orden === 'NA'
        ? [t.slice(-2).join(' '), t.slice(0, -2).join(' ')]
        : [t.slice(0, 2).join(' '), t.slice(2).join(' ')];
}

function filasMapeadas() {
    const modo = $('map-modo').value;
    const iDni = parseInt($('map-dni').value, 10);
    const iCorreo = parseInt($('map-correo').value, 10);
    const iSat = parseInt($('map-satisfaccion').value, 10);
    const iNps = parseInt($('map-nps').value, 10);
    const iCom = parseInt($('map-comentarios').value, 10);
    const iSede = parseInt($('map-sede').value, 10);
    const iSes = parseInt($('map-sesion').value, 10);
    const iTipo = parseInt($('map-tipo').value, 10);
    const iFecha = parseInt($('map-fecha').value, 10);
    const iHora = parseInt($('map-hora').value, 10);
    const leer = (fila, i) => (i >= 0 && fila[i] !== undefined ? fila[i].toString().trim() : '');

    const vistos = new Set();
    const asistencias = [];
    const encuestas = [];
    IMPORTADAS.filas.forEach((fila) => {
        const dni = leer(fila, iDni);
        if (MODO_IMPORTACION !== 'encuestas') {
            if (!dni || vistos.has(dni)) return;   // sin DNI no hay constancia posible
            vistos.add(dni);
        } else {
            // si es encuestas, DNI puede ser vacío
            if (dni && vistos.has(dni)) return;
            if (dni) vistos.add(dni);
        }

        let nombres = '';
        let apellidos = '';
        if (modo === 'separado') {
            nombres = leer(fila, parseInt($('map-nombres').value, 10));
            apellidos = [leer(fila, parseInt($('map-paterno').value, 10)),
                leer(fila, parseInt($('map-materno').value, 10))].filter(Boolean).join(' ');
        } else if (modo === 'nom-ape') {
            nombres = leer(fila, parseInt($('map-nombres2').value, 10));
            apellidos = leer(fila, parseInt($('map-apellidos').value, 10));
        } else {
            const completo = leer(fila, parseInt($('map-completo').value, 10));
            [apellidos, nombres] = partirNombre(completo, $('map-orden').value);
        }

        if (MODO_IMPORTACION !== 'encuestas') {
            asistencias.push({
                evento_id: EVENTO_ACTUAL.id,
                dni,
                apellidos,
                nombres,
                correo: leer(fila, iCorreo),
                asistencia: true
            });
        }

        if (iSat >= 0 || iNps >= 0 || MODO_IMPORTACION === 'encuestas') {
            const satVal = parseInt(leer(fila, iSat));
            const npsVal = parseInt(leer(fila, iNps));
            if (!isNaN(satVal) || !isNaN(npsVal) || MODO_IMPORTACION === 'encuestas') {
                let s_ses = (iSes >= 0 && leer(fila, iSes)) || sesionPorDefecto();
                let s_sede = iSede >= 0 ? leer(fila, iSede) : '';
                
                let cx = "No";
                if(!isNaN(npsVal)) {
                    if (npsVal >= 9) cx = "Sí";
                    else if (npsVal >= 7) cx = "Neutral";
                } else cx = null;
                
                encuestas.push({
                    evento_id: EVENTO_ACTUAL.id,
                    participante_nombre: (nombres + ' ' + apellidos).trim(),
                    nombres,
                    apellidos,
                    dni,
                    tipo_participante: normalizarTipo(leer(fila, iTipo)),
                    fecha_llenado: parsearFechaImportada(iFecha >= 0 ? fila[iFecha] : '', leer(fila, iHora))
                        || fechaLlenadoEstimada(s_ses),
                    correo: leer(fila, iCorreo),
                    sede: s_sede,
                    modulo_sesion: s_ses,
                    facilidad: isNaN(satVal) ? null : satVal,
                    nps: isNaN(npsVal) ? null : npsVal,
                    comentarios: leer(fila, iCom),
                    cumplio_expectativas: cx
                });
            }
        }
    });
    return { asistencias, encuestas };
}

function pintarPrevia() {
    const { asistencias, encuestas } = filasMapeadas();

    let malos = 0;
    $('im-tbody').innerHTML = asistencias.slice(0, 100).map((f) => {
        const dniMal = !dniValido(f.dni);
        const correoMal = !correoValido(f.correo);
        if (dniMal || correoMal) malos++;
        return `<tr>
            <td class="${dniMal ? 'celda-mal' : ''}">${escapar(f.dni)}${dniMal ? ' ⚠' : ''}</td>
            <td>${escapar(f.apellidos)}</td>
            <td>${escapar(f.nombres)}</td>
            <td class="${correoMal ? 'celda-mal' : ''}">${escapar(f.correo)}${correoMal ? ' ⚠' : ''}</td>
        </tr>`;
    }).join('');

    // Contar todos (no solo los 100 visibles) para el aviso.
    const totalMalos = asistencias.filter((f) => !dniValido(f.dni) || !correoValido(f.correo)).length;
    let mensaje = totalMalos
        ? `⚠ ${totalMalos} fila(s) con DNI o correo con formato dudoso (marcadas en rojo). Se importarán igual.`
        : `${asistencias.length} fila(s) listas para importar.`;
    
    if (encuestas.length > 0) {
        mensaje += ` Además, se registraron ${encuestas.length} respuestas de encuesta de satisfacción válidas para el reporte.`;
    }

    msg($('msg-importar'), mensaje, totalMalos ? 'err' : 'ok');

    const totalImportar = MODO_IMPORTACION === 'encuestas' ? encuestas.length : asistencias.length;
    $('btn-confirmar-import').textContent = MODO_IMPORTACION === 'encuestas'
        ? `Importar ${encuestas.length} respuesta(s)`
        : `Importar ${asistencias.length} participante(s)`;
    $('btn-confirmar-import').disabled = totalImportar === 0;
}

async function confirmarImport() {
    const { asistencias, encuestas } = filasMapeadas();
    if (!asistencias.length && !encuestas.length) return;

    $('btn-confirmar-import').disabled = true;
    if (asistencias.length > 0) {
        msg($('msg-importar'), 'Importando asistencias...', '');

        const { error: errAsistencias } = await sb.from('asistencias')
            .upsert(asistencias, { onConflict: 'dni,evento_id' });

        if (errAsistencias) { 
            msg($('msg-importar'), 'Error al importar asistencias: ' + errAsistencias.message, 'err'); 
            $('btn-confirmar-import').disabled = false;
            return; 
        }
    }

    if (encuestas.length > 0) {
        msg($('msg-importar'), 'Importando encuestas...', '');
        const { error: errEncuestas } = await sb.from('asistencia_encuesta').insert(encuestas);
        if (errEncuestas) { 
            msg($('msg-importar'), 'Error al importar encuestas: ' + errEncuestas.message, 'err'); 
            $('btn-confirmar-import').disabled = false;
            return; 
        }
    }

    $('btn-confirmar-import').disabled = false;
    cerrarModales();
    if(MODO_IMPORTACION !== 'encuestas') await cargarParticipantes();
    else await cargarEncuestas();
}

let MODO_IMPORTACION = 'participantes';
window.abrirModalImportar = function(modo) {
    MODO_IMPORTACION = modo || 'participantes';
    msg($('msg-importar'), '', '');
    mostrar($('im-previa'), false);
    abrirModal('modal-importar');
};

/* ------------------------------------------------------------------ *
 *  CONSTANCIAS
 * ------------------------------------------------------------------ */

/* Diseño tomado de "Formato Constancias.pptx". El fondo, el logo y las dos
 * firmas salen de ese archivo; las posiciones son las del propio PPTX
 * convertidas a un lienzo de 1123 x 794 (10.83" x 7.5" a ~104 dpi). */

const PLANTILLA_POR_DEFECTO = {
    titulo: 'Constancia de Participación',
    otorgado: 'Otorgado a:',
    cuerpo: 'Por su participación en el evento <<Nombre_del_Webinar>>, desarrollado del ' +
        '<<Dia_de_Mes_de_Año1>> al <<Dia_de_Mes_de_Año2>>, en reconocimiento a su compromiso ' +
        'e interés por fortalecer sus conocimientos y competencias profesionales.',
    ciudad: 'Lima, <<Dia_de_Mes_de_Año2>>'
};

/* Firmas por defecto. Cada firma es una imagen (recuadro x, y, ancho, alto en el
 * lienzo de 1123x794) con su texto centrado debajo. `img` guarda la firma subida
 * como data URL; si está vacío se usa `archivo`, el PNG/JPG que viene con el
 * proyecto. El texto se centra automáticamente bajo el recuadro de la imagen. */
const FIRMAS_POR_DEFECTO = [
    {
        texto: 'Jose Carlos Kohagura Carpio\nJefe Académico de Negocios\nInstituto de Educación Superior Privado CERTUS',
        img: null, archivo: 'cert_firma1.png', x: 271, y: 555, w: 107, h: 92
    },
    {
        texto: 'Lola Elena Hurtado Olarte\nCoordinadora Académica de Contabilidad y Tributación\nInstituto de Educación Superior Privado CERTUS',
        img: null, archivo: 'cert_firma2.jpg', x: 671, y: 534, w: 160, h: 109
    }
];

function clonarFirma(f) {
    return Object.assign({ texto: '', img: null, archivo: null, x: 0, y: 0, w: 120, h: 90 }, f);
}

/** Plantilla base: textos por defecto + una copia nueva de las firmas por defecto. */
function plantillaBase() {
    const t = Object.assign({}, PLANTILLA_POR_DEFECTO);
    t.firmas = FIRMAS_POR_DEFECTO.map(clonarFirma);
    return t;
}

/* Se pueden tener hasta 4 diseños de constancia (biblioteca global, reutilizable
 * en todos los eventos). Cada persona (asistencia) usa uno mediante su
 * `plantilla_id` (1..4). Los nombres son editables; estos son los de arranque. */
const NUM_DISENIOS = 4;
const NOMBRES_DISENIO_DEFECTO = { 1: 'General', 2: 'Ponentes', 3: 'Organizadores', 4: 'Certificado' };

/** Fusiona lo guardado con la base y garantiza que exista `firmas` y `nombre`.
 * Migra los diseños antiguos que guardaban firmante1/firmante2 como texto suelto. */
function normalizarPlantilla(datos, id) {
    const t = plantillaBase();
    t.nombre = NOMBRES_DISENIO_DEFECTO[id] || ('Diseño ' + (id || 1));
    t.fondo = 'cert_fondo.png';
    if (datos) {
        ['titulo', 'otorgado', 'cuerpo', 'ciudad', 'nombre', 'fondo'].forEach((k) => {
            if (datos[k] != null) t[k] = datos[k];
        });
        if (Array.isArray(datos.firmas)) {
            t.firmas = datos.firmas.map(clonarFirma);
        } else if (datos.firmante1 != null || datos.firmante2 != null) {
            if (datos.firmante1 != null) t.firmas[0].texto = datos.firmante1;
            if (datos.firmante2 != null) t.firmas[1].texto = datos.firmante2;
        }
    }
    return t;
}

const TIPO_LETRA = 'Arial, Helvetica, sans-serif';
const AZUL = '#1f2a5c';

/* Los diseños viven en Supabase (tabla plantilla_constancia, filas id=1..4) para
 * que sean los mismos desde cualquier PC. Se cachean en memoria porque el
 * dibujado en canvas es síncrono. */
let PLANTILLAS = {};
for (let _i = 1; _i <= NUM_DISENIOS; _i++) PLANTILLAS[_i] = normalizarPlantilla(null, _i);

/** Devuelve el diseño con ese id (1..4); si no existe, el diseño 1. */
function plantilla(id) {
    return PLANTILLAS[id] || PLANTILLAS[1];
}

/** Nombre visible de un diseño (para la tabla y los selectores). */
function nombreDisenio(id) {
    const t = PLANTILLAS[id || 1];
    return (t && t.nombre) || ('Diseño ' + (id || 1));
}

/** Carga los 4 diseños desde Supabase (los que no existan quedan por defecto). */
async function cargarPlantillasRemotas() {
    const { data, error } = await sb.from('plantilla_constancia').select('id,datos');
    if (error) {
        console.warn('No se pudieron leer los diseños, se usan los de por defecto:', error.message);
        return;
    }
    const porId = {};
    (data || []).forEach((r) => { porId[r.id] = r.datos; });
    for (let i = 1; i <= NUM_DISENIOS; i++) PLANTILLAS[i] = normalizarPlantilla(porId[i], i);
}

async function guardarPlantillaRemota(id, obj) {
    const { error } = await sb.from('plantilla_constancia')
        .upsert({ id, datos: obj, actualizado_at: new Date().toISOString() });
    if (error) throw error;
    PLANTILLAS[id] = normalizarPlantilla(obj, id);
}

async function restablecerPlantillaRemota(id) {
    const { error } = await sb.from('plantilla_constancia').delete().eq('id', id);
    if (error) throw error;
    PLANTILLAS[id] = normalizarPlantilla(null, id);
}

/** Título por palabra: "MAMANI roque" -> "Mamani Roque". Respeta guiones y apóstrofos. */
function capitalizar(texto) {
    return (texto || '')
        .toLowerCase()
        .replace(/(^|[\s'’\-])([a-záéíóúñü])/g, (m, sep, letra) => sep + letra.toUpperCase());
}

/** Los cuatro marcadores que se pueden usar dentro de los textos editables. */
function valoresPlaceholder(p, ev) {
    const f = fechasEvento(ev.horario);
    return {
        '<<Apellidos_y_Nombres>>': `${capitalizar(p.apellidos)} ${capitalizar(p.nombres)}`.trim(),
        '<<Nombres_Mype>>': `${capitalizar(p.nombres)} ${capitalizar(p.apellidos)}`.trim(),
        '<<Nombres_Docente>>': `${capitalizar(p.nombres)} ${capitalizar(p.apellidos)}`.trim(),
        '<<Nombre_del_Webinar>>': ev.nombre || '',
        '<<Dia_de_Mes_de_Año1>>': f.inicio,
        '<<Dia_de_Mes_de_Año2>>': f.fin,
        '<<Fecha_Actividad>>': f.inicio,
        '<<Tipo_Asesoria>>': ev.asesoria_tema || ''
    };
}

function sustituir(texto, valores) {
    let salida = texto;
    Object.keys(valores).forEach((k) => { salida = salida.split(k).join(valores[k]); });

    // Un evento de un solo día quedaría como "del 5 de Mayo al 5 de Mayo".
    const unDia = valores['<<Dia_de_Mes_de_Año1>>'] === valores['<<Dia_de_Mes_de_Año2>>'];
    if (unDia) {
        const fecha = valores['<<Dia_de_Mes_de_Año1>>'];
        salida = salida.split(`del ${fecha} al ${fecha}`).join(`el ${fecha}`);
    }
    return salida;
}

function envolverTexto(ctx, texto, x, y, anchoMax, alto) {
    const lineas = [];
    texto.split('\n').forEach((parrafo) => {
        let linea = '';
        parrafo.split(' ').forEach((palabra, n) => {
            const prueba = linea + palabra + ' ';
            if (ctx.measureText(prueba).width > anchoMax && n > 0) {
                lineas.push(linea.trim());
                linea = palabra + ' ';
            } else {
                linea = prueba;
            }
        });
        lineas.push(linea.trim());
    });
    lineas.forEach((l, k) => ctx.fillText(l, x, y + k * alto));
    return lineas.length;
}

const RECURSOS = {};

function cargarImagen(nombre, ruta) {
    if (RECURSOS[nombre]) return Promise.resolve(RECURSOS[nombre]);
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => { RECURSOS[nombre] = img; resolve(img); };
        img.onerror = () => reject(new Error('No se pudo cargar ' + ruta));
        img.src = ruta;
    });
}

/** Carga cualquier imagen por su `src` (ruta de archivo o data URL) y la cachea.
 * Se usa para las firmas, que pueden ser un archivo del proyecto o una imagen
 * subida por el usuario (data URL). */
const IMG_CACHE = {};
function cargarImg(src) {
    if (!src) return Promise.resolve(null);
    if (IMG_CACHE[src]) return Promise.resolve(IMG_CACHE[src]);
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => { IMG_CACHE[src] = img; resolve(img); };
        img.onerror = () => reject(new Error('No se pudo cargar la imagen de firma'));
        img.src = src;
    });
}

function cargarRecursosConstancia(fondoUrl) {
    return Promise.all([
        cargarImagen('fondo_' + fondoUrl, fondoUrl),
        cargarImagen('logo', 'cert_logo.png'),
        // El canvas NO descarga webfonts por sí solo: si no se piden aquí,
        // fillText dibuja con la fuente de reserva y la constancia sale distinta.
        document.fonts.load('700 46px "Playfair Display"'),
        document.fonts.load('600 48px "Playfair Display"'),
        document.fonts.load('italic 500 19px "Playfair Display"'),
        document.fonts.load('18px "Libre Baskerville"'),
        document.fonts.load('italic 17px "Libre Baskerville"')
    ]);
}

/* Logos adicionales que aparecen SOLO en ciertos eventos, además del logo
 * CERTUS. Se dibujan arriba a la derecha (coordenadas sobre el lienzo de
 * 1123 x 794). La clave `contiene` se compara con el nombre del evento sin
 * acentos ni mayúsculas y por coincidencia parcial, así "Tributación para
 * Emprendedores 2026" o variantes también encajan. */
const LOGOS_POR_EVENTO = [
    // Logo_RS.png: fondo transparente y recortado al contenido (proporción ~1.36).
    { contiene: 'tributacion para emprendedores', archivo: 'Logo_RS.png', x: 981, y: 22, w: 112, h: 82 }
];

function logoExtraParaEvento(ev) {
    // Prioridad: el logo subido a este evento (columna logo_constancia).
    if (ev && ev.logo_constancia && ev.logo_constancia.img) return ev.logo_constancia;
    // Respaldo: logos fijos por nombre de evento (p. ej. RS en "Tributación").
    const nombre = norm(ev && ev.nombre);
    return LOGOS_POR_EVENTO.find((l) => nombre.includes(l.contiene)) || null;
}

/* Bloque de firmante centrado en `cx`, empezando en `y`. La PRIMERA línea es el
 * nombre (tamaño mayor) y las siguientes son el cargo/institución, un poco más
 * pequeñas (~75%, como 12 → 9). Cada párrafo se envuelve dentro de 500 px. */
const FIRMANTE_NOMBRE_PX = 17;
const FIRMANTE_CARGO_PX = 13; // ≈ 17 * 9/12
function dibujarFirmante(ctx, texto, cx, y) {
    let yy = y;
    (texto || '').split('\n').forEach((parrafo, idx) => {
        const esNombre = idx === 0;
        ctx.font = `${esNombre ? FIRMANTE_NOMBRE_PX : FIRMANTE_CARGO_PX}px ${TIPO_LETRA}`;
        const alto = esNombre ? 20 : 16;
        let linea = '';
        parrafo.split(' ').forEach((palabra, n) => {
            const prueba = linea + palabra + ' ';
            if (ctx.measureText(prueba).width > 500 && n > 0) {
                ctx.fillText(linea.trim(), cx, yy);
                yy += alto;
                linea = palabra + ' ';
            } else {
                linea = prueba;
            }
        });
        ctx.fillText(linea.trim(), cx, yy);
        yy += alto;
    });
}

/**
 * Dibuja la constancia. Con `crudo` en true deja los <<marcadores>> sin
 * reemplazar, que es lo que muestra el botón "Ver estructura del modelo".
 */
async function dibujarConstancia(p, ev, crudo, plantillaOverride) {
    ev = ev || EVENTO_ACTUAL;
    const canvas = $('cert-canvas');
    const ctx = canvas.getContext('2d');
    // La vista previa del editor pasa el diseño en edición; al generar, cada
    // persona usa el diseño que tenga asignado (plantilla_id, 1 por defecto).
    const t = plantillaOverride || plantilla((p && p.plantilla_id) || 1);

    const [fondo, logo] = await cargarRecursosConstancia(t.fondo || 'cert_fondo.png');

    // Las firmas pueden ser archivos del proyecto o imágenes subidas; se cargan
    // aparte porque su número y su origen dependen de la plantilla.
    const firmas = Array.isArray(t.firmas) ? t.firmas : [];
    const imgsFirma = await Promise.all(
        firmas.map((f) => cargarImg(f.img || f.archivo || '').catch(() => null))
    );

    // Logo extra según el evento (p. ej. RS Consultores en "Tributación para
    // Emprendedores"). Va arriba a la derecha, balanceando el logo CERTUS.
    const cfgLogoExtra = logoExtraParaEvento(ev);
    const imgLogoExtra = cfgLogoExtra
        ? await cargarImg(cfgLogoExtra.img || cfgLogoExtra.archivo || '').catch(() => null)
        : null;

    const valores = crudo ? null : valoresPlaceholder(p, ev);
    const texto = (s) => (crudo ? s : sustituir(s, valores));

    ctx.clearRect(0, 0, 1123, 794);
    ctx.drawImage(fondo, 0, 0, 1123, 794);
    ctx.drawImage(logo, 23, 18, 152, 89);
    if (imgLogoExtra) {
        ctx.drawImage(imgLogoExtra, cfgLogoExtra.x, cfgLogoExtra.y, cfgLogoExtra.w, cfgLogoExtra.h);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Tipografía ceremonial: serifas para el texto protocolar, sans solo en firmas.
    ctx.fillStyle = AZUL;
    ctx.font = '700 46px "Playfair Display", Georgia, serif';
    ctx.fillText(texto(t.titulo), 561, 213);

    ctx.font = 'italic 500 19px "Playfair Display", Georgia, serif';
    ctx.fillStyle = '#5a6172';
    ctx.fillText(texto(t.otorgado), 561, 282);

    // El nombre se encoge si no cabe, en vez de salirse de la tarjeta.
    const nombre = crudo ? '<<Apellidos_y_Nombres>>' : valores['<<Apellidos_y_Nombres>>'];
    let tamNombre = 48;
    do {
        ctx.font = `600 ${tamNombre}px "Playfair Display", Georgia, serif`;
        tamNombre -= 2;
    } while (ctx.measureText(nombre).width > 880 && tamNombre > 24);
    ctx.fillStyle = AZUL;
    ctx.fillText(nombre, 561, 348);

    // Filete decorativo bajo el nombre, desvanecido en los extremos.
    const filete = ctx.createLinearGradient(280, 0, 843, 0);
    filete.addColorStop(0, 'rgba(31, 42, 92, 0)');
    filete.addColorStop(0.25, 'rgba(31, 42, 92, .55)');
    filete.addColorStop(0.75, 'rgba(31, 42, 92, .55)');
    filete.addColorStop(1, 'rgba(31, 42, 92, 0)');
    ctx.strokeStyle = filete;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(280, 384); ctx.lineTo(843, 384); ctx.stroke();

    ctx.font = '18px "Libre Baskerville", Georgia, serif';
    ctx.fillStyle = '#39415a';
    const lineasCuerpo = envolverTexto(ctx, texto(t.cuerpo), 561, 425, 850, 29);

    // La fecha baja si el cuerpo ocupa más renglones, para no montarse encima.
    const yCiudad = Math.max(519, 425 + lineasCuerpo * 29 + 14);
    ctx.font = 'italic 17px "Libre Baskerville", Georgia, serif';
    ctx.fillStyle = '#5a6172';
    ctx.fillText(texto(t.ciudad), 561, yCiudad);

    // Cada firma: la imagen en su recuadro y el texto centrado justo debajo.
    // 500 de ancho para el texto: "Coordinadora Académica de Contabilidad y
    // Tributación" tiene que entrar en un solo renglón, como en el formato original.
    firmas.forEach((f, i) => {
        const img = imgsFirma[i];
        if (img) {
            // Las firmas escaneadas traen fondo claro: 'multiply' lo funde con la tarjeta.
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            ctx.drawImage(img, f.x, f.y, f.w, f.h);
            ctx.restore();
        }
        ctx.textAlign = 'center';
        ctx.fillStyle = '#1b2340';
        dibujarFirmante(ctx, texto(f.texto || ''), f.x + f.w / 2, f.y + f.h + 8);
    });

    return canvas;
}

function canvasAPdf(canvas) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1123, 794] });
    pdf.addImage(canvas.toDataURL('image/png', 1.0), 'PNG', 0, 0, 1123, 794, undefined, 'FAST');
    return pdf.output('blob');
}

/* Emite/actualiza constancias. Con `lista` se limita a esas personas (p. ej. las
 * seleccionadas); sin `lista`, a todos los participantes del evento. */
async function generarConstancias(lista, esSeleccion) {
    const universo = lista || PARTICIPANTES;
    if (!universo.length) {
        msg($('msg-generacion'), esSeleccion
            ? 'No hay participantes seleccionados.'
            : 'No hay participantes a los que emitirles constancia.', 'err');
        return;
    }

    // Con «Solo pendientes» marcado se emiten únicamente las que faltan (rápido
    // en eventos grandes). Desmarcado, se regeneran todas con el diseño vigente.
    const soloPendientes = $('chk-pendientes').checked;
    const pendientes = soloPendientes
        ? universo.filter((p) => !p.certificado_url)
        : universo;
    const yaTenian = pendientes.filter((p) => p.certificado_url).length;

    if (!pendientes.length) {
        msg($('msg-generacion'), (esSeleccion ? 'Los seleccionados' : 'Todos') +
            ' ya tienen su constancia emitida. Desmarca «Solo pendientes» si quieres ' +
            'regenerarlas con el diseño actual.', 'ok');
        return;
    }

    // Regenerar sobrescribe el PDF original y no queda historial: si alguien ya
    // descargó su copia, dejará de coincidir con la del sistema. Que sea a sabiendas.
    if (yaTenian > 0 && !confirm(
        `Se van a regenerar ${yaTenian} constancia(s) ya emitidas.\n\n` +
        `El PDF original se reemplaza y no queda copia del anterior. ¿Continuar?`)) {
        return;
    }

    $('btn-generar').disabled = true;
    $('btn-generar-sel').disabled = true;
    mostrar($('barra-generacion'), true);

    // Sin esto el canvas dibuja con las fuentes de reserva y la constancia sale distinta.
    await document.fonts.ready;
    // Y sin esto se podrían emitir con un diseño viejo si lo editaron en otro equipo.
    await cargarPlantillasRemotas();

    const errores = [];
    let hechas = 0;

    for (const p of pendientes) {
        try {
            msg($('msg-generacion'), `Generando ${hechas + 1} de ${pendientes.length}...`, '');

            const canvas = await dibujarConstancia(p);
            const blob = canvasAPdf(canvas);
            const ruta = `${EVENTO_ACTUAL.id}/${p.dni}_${EVENTO_ACTUAL.sheet_id || EVENTO_ACTUAL.id}.pdf`;

            const { error: errSubida } = await sb.storage.from(BUCKET)
                .upload(ruta, blob, {
                    contentType: 'application/pdf',
                    upsert: true,
                    cacheControl: '60'
                });
            if (errSubida) throw errSubida;

            // Al regenerar, el archivo se sobrescribe pero la ruta no cambia; sin
            // este sufijo el navegador seguiría mostrando el PDF viejo desde caché.
            const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(ruta);
            const urlConVersion = `${pub.publicUrl}?v=${Date.now()}`;

            const { error: errUpdate } = await sb.from('asistencias')
                .update({ certificado_url: urlConVersion, certificado_autorizado: true })
                .eq('id', p.id);
            if (errUpdate) throw errUpdate;

            hechas++;
        } catch (e) {
            errores.push(`${p.dni}: ${e.message || e}`);
            hechas++;
        }
        $('progreso').style.width = Math.round((hechas * 100) / pendientes.length) + '%';
    }

    $('btn-generar').disabled = false;

    const correctas = pendientes.length - errores.length;
    const nuevas = Math.max(correctas - yaTenian, 0);
    let texto = `✅ ${correctas} constancia(s)${esSeleccion ? ' (de la selección)' : ''} guardadas en Supabase`;
    texto += yaTenian
        ? ` (${nuevas} nueva(s) y ${Math.min(yaTenian, correctas)} actualizada(s) con el diseño vigente).`
        : '.';
    if (errores.length) texto += `\n⚠ï¸ ${errores.length} con error:\n` + errores.join('\n');
    msg($('msg-generacion'), texto, errores.length ? 'err' : 'ok');

    await cargarParticipantes();
    await cargarEventos();
}

/* ------------------------------------------------------------------ *
 *  CONSTANCIAS EN POWERPOINT
 *  Cada constancia se dibuja en el mismo canvas que usa el PDF y se coloca
 *  como imagen a página completa en una diapositiva A4 horizontal.
 * ------------------------------------------------------------------ */
const PPT_ANCHO = 11.69, PPT_ALTO = 8.27;   // A4 horizontal en pulgadas

function nuevoPptx() {
    if (typeof PptxGenJS === 'undefined') {
        throw new Error('no se pudo cargar la librería de PowerPoint; revisa la conexión y recarga la página');
    }
    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: 'A4H', width: PPT_ANCHO, height: PPT_ALTO });
    pptx.layout = 'A4H';
    pptx.author = 'CERTUS · COT-PLN';
    pptx.title = EVENTO_ACTUAL ? EVENTO_ACTUAL.nombre : 'Constancias';
    return pptx;
}

function descargarBlob(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}

function nombreArchivoParticipante(p) {
    const base = `${p.dni || 's-dni'}_${(p.apellidos || '') + ' ' + (p.nombres || '')}`.trim() || 'constancia';
    return base.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 70);
}

/* Dibuja las constancias de `lista` y devuelve [{p, imagen}]. */
async function imagenesConstancias(lista) {
    await document.fonts.ready;          // si no, salen con las fuentes de reserva
    await cargarPlantillasRemotas();     // y con el diseño que esté vigente
    const salida = [];
    for (let i = 0; i < lista.length; i++) {
        msg($('msg-generacion'), `Preparando constancia ${i + 1} de ${lista.length}...`, '');
        const canvas = await dibujarConstancia(lista[i]);
        salida.push({ p: lista[i], imagen: canvas.toDataURL('image/jpeg', 0.92) });
        $('progreso').style.width = Math.round(((i + 1) * 100) / lista.length) + '%';
        await new Promise((r) => setTimeout(r, 0));   // deja respirar al navegador
    }
    return salida;
}

/* Lista sobre la que trabajan los botones de PowerPoint. */
function listaParaPpt(soloSeleccion) {
    const lista = soloSeleccion ? participantesSeleccionados() : PARTICIPANTES;
    if (!lista.length) {
        msg($('msg-generacion'), soloSeleccion
            ? 'No hay participantes seleccionados.'
            : 'No hay participantes en este evento.', 'err');
        return null;
    }
    return lista;
}

function botonesPpt() {
    return ['btn-ppt-unico', 'btn-ppt-separado', 'btn-ppt-unico-sel', 'btn-ppt-separado-sel']
        .map((id) => $(id)).filter(Boolean);
}

async function descargarPptUnico(soloSeleccion) {
    const lista = listaParaPpt(soloSeleccion);
    if (!lista) return;
    botonesPpt().forEach((b) => { b.disabled = true; });
    mostrar($('barra-generacion'), true);
    try {
        const imgs = await imagenesConstancias(lista);
        msg($('msg-generacion'), 'Armando el PowerPoint...', '');
        const pptx = nuevoPptx();
        imgs.forEach(({ p, imagen }) => {
            const slide = pptx.addSlide();
            slide.addImage({ data: imagen, x: 0, y: 0, w: PPT_ANCHO, h: PPT_ALTO });
            slide.addNotes(`${p.apellidos || ''} ${p.nombres || ''} · DNI ${p.dni || '—'}`.trim());
        });
        const blob = await pptx.write('blob');
        descargarBlob(blob, `constancias_${slugEvento()}.pptx`);
        msg($('msg-generacion'), `✅ PowerPoint con ${imgs.length} constancia(s) descargado.`, 'ok');
    } catch (e) {
        console.error(e);
        msg($('msg-generacion'), 'No se pudo generar el PowerPoint: ' + (e.message || e), 'err');
    } finally {
        botonesPpt().forEach((b) => { b.disabled = false; });
        $('progreso').style.width = '0%';
        mostrar($('barra-generacion'), false);
    }
}

async function descargarPptSeparados(soloSeleccion) {
    const lista = listaParaPpt(soloSeleccion);
    if (!lista) return;
    botonesPpt().forEach((b) => { b.disabled = true; });
    mostrar($('barra-generacion'), true);
    try {
        const imgs = await imagenesConstancias(lista);
        if (typeof JSZip === 'undefined') {
            throw new Error('no se pudo cargar la librería de ZIP; revisa la conexión y recarga la página');
        }
        const zip = new JSZip();
        const carpeta = zip.folder(`constancias_${slugEvento()}`);
        for (let i = 0; i < imgs.length; i++) {
            msg($('msg-generacion'), `Armando PowerPoint ${i + 1} de ${imgs.length}...`, '');
            const pptx = nuevoPptx();
            const slide = pptx.addSlide();
            slide.addImage({ data: imgs[i].imagen, x: 0, y: 0, w: PPT_ANCHO, h: PPT_ALTO });
            carpeta.file(`${nombreArchivoParticipante(imgs[i].p)}.pptx`, await pptx.write('blob'));
            await new Promise((r) => setTimeout(r, 0));
        }
        msg($('msg-generacion'), 'Comprimiendo el ZIP...', '');
        const blob = await zip.generateAsync({ type: 'blob' }, (meta) => {
            $('progreso').style.width = Math.round(meta.percent) + '%';
        });
        descargarBlob(blob, `constancias_ppt_${slugEvento()}.zip`);
        msg($('msg-generacion'), `✅ ZIP con ${imgs.length} PowerPoint(s), uno por persona.`, 'ok');
    } catch (e) {
        console.error(e);
        msg($('msg-generacion'), 'No se pudo generar el ZIP: ' + (e.message || e), 'err');
    } finally {
        botonesPpt().forEach((b) => { b.disabled = false; });
        $('progreso').style.width = '0%';
        mostrar($('barra-generacion'), false);
    }
}

function slugEvento() {
    const base = (EVENTO_ACTUAL && (EVENTO_ACTUAL.sheet_id || EVENTO_ACTUAL.nombre)) || 'evento';
    return String(base).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50).toLowerCase();
}

window.descargarPptUnico = descargarPptUnico;
window.descargarPptSeparados = descargarPptSeparados;

function mostrarVista(id) {
    ['vista-eventos', 'vista-constancias'].forEach((v) => mostrar($(v), v === id));
    // Al volver a la lista se olvida el evento abierto (ver abrirGestor).
    if (id === 'vista-eventos' && location.hash) {
        history.replaceState(null, '', location.pathname + location.search);
    }
}

/* ------------------------------------------------------------------ *
 *  DISEÑO EDITABLE DE LA CONSTANCIA
 * ------------------------------------------------------------------ */

const CAMPOS_PLANTILLA = {
    'pl-titulo': 'titulo',
    'pl-otorgado': 'otorgado',
    'pl-cuerpo': 'cuerpo',
    'pl-ciudad': 'ciudad'
};

let VIENDO_MODELO = false;

/* Copia de trabajo de las firmas mientras el editor está abierto. Incluye las
 * imágenes recién subidas que aún no se han guardado en Supabase. La UI del
 * editor y la vista previa leen de aquí. */
let FIRMAS_EDITOR = [];

/** Lee un archivo de imagen y devuelve un PNG en data URL, reduciéndolo si es
 * muy grande para no inflar la plantilla guardada. Devuelve también el ancho y
 * alto originales para poder respetar la proporción de la firma. */
function archivoAImagenEscalada(file, maxAncho) {
    return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => {
            const img = new Image();
            img.onload = () => {
                let w = img.naturalWidth, h = img.naturalHeight;
                if (w > maxAncho) { h = Math.round(h * maxAncho / w); w = maxAncho; }
                const c = document.createElement('canvas');
                c.width = w; c.height = h;
                c.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve({ data: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight });
            };
            img.onerror = () => reject(new Error('archivo de imagen no válido'));
            img.src = fr.result;
        };
        fr.onerror = () => reject(new Error('no se pudo leer el archivo'));
        fr.readAsDataURL(file);
    });
}

let _previaTimer;
function previaDebounced() {
    clearTimeout(_previaTimer);
    _previaTimer = setTimeout(refrescarPrevia, 350);
}

/** Reconstruye las tarjetas de firma del editor a partir de FIRMAS_EDITOR. */
function renderFirmasEditor() {
    const cont = $('firmas-lista');
    cont.innerHTML = '';

    FIRMAS_EDITOR.forEach((f, i) => {
        const card = document.createElement('div');
        card.className = 'firma-card';
        card.innerHTML =
            '<div class="firma-top">' +
                '<div class="firma-previa"><img alt="Firma ' + (i + 1) + '"><span class="firma-sin">Sin imagen</span></div>' +
                '<div class="firma-campos">' +
                    '<label>Texto del firmante (una línea por renglón)</label>' +
                    '<textarea class="f-texto" rows="3"></textarea>' +
                    '<div class="firma-num">' +
                        '<div><label>X</label><input type="number" class="f-x"></div>' +
                        '<div><label>Y</label><input type="number" class="f-y"></div>' +
                        '<div><label>Ancho</label><input type="number" class="f-w"></div>' +
                        '<div><label>Alto</label><input type="number" class="f-h"></div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="firma-acc">' +
                '<label class="btn-ghost btn-file"><i class="ph ph-image"></i> Cambiar imagen' +
                    '<input type="file" accept="image/*" class="f-file" hidden></label>' +
                '<button type="button" class="btn-ghost f-del"><i class="ph ph-trash"></i> Eliminar firma</button>' +
            '</div>';

        const previa = card.querySelector('.firma-previa img');
        const sinImg = card.querySelector('.firma-sin');
        const pintarPrevia = () => {
            const src = f.img || f.archivo || '';
            previa.src = src;
            mostrar(previa, !!src);
            mostrar(sinImg, !src);
        };
        pintarPrevia();

        card.querySelector('.f-texto').value = f.texto || '';
        card.querySelector('.f-x').value = f.x;
        card.querySelector('.f-y').value = f.y;
        card.querySelector('.f-w').value = f.w;
        card.querySelector('.f-h').value = f.h;

        card.querySelector('.f-texto').addEventListener('input', (e) => {
            f.texto = e.target.value; previaDebounced();
        });
        const numeros = { '.f-x': 'x', '.f-y': 'y', '.f-w': 'w', '.f-h': 'h' };
        Object.keys(numeros).forEach((sel) => {
            card.querySelector(sel).addEventListener('input', (e) => {
                const v = parseInt(e.target.value, 10);
                f[numeros[sel]] = isNaN(v) ? 0 : v;
                previaDebounced();
            });
        });

        card.querySelector('.f-file').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const r = await archivoAImagenEscalada(file, 600);
                f.img = r.data;
                // Ajusta el alto para conservar la proporción del ancho actual.
                if (r.w) {
                    f.h = Math.round(f.w * r.h / r.w);
                    card.querySelector('.f-h').value = f.h;
                }
                pintarPrevia();
                previaDebounced();
            } catch (err) {
                msg($('msg-disenio'), 'No se pudo leer la imagen: ' + err.message, 'err');
            } finally {
                e.target.value = '';
            }
        });

        card.querySelector('.f-del').addEventListener('click', () => {
            FIRMAS_EDITOR.splice(i, 1);
            renderFirmasEditor();
            previaDebounced();
        });

        cont.appendChild(card);
    });
}

function agregarFirmaEditor() {
    FIRMAS_EDITOR.push(clonarFirma({
        texto: 'Nombre y Apellidos\nCargo\nInstituto de Educación Superior Privado CERTUS',
        x: 480, y: 545, w: 140, h: 96
    }));
    renderFirmasEditor();
    previaDebounced();
}

/* ------------------------------------------------------------------ *
 *  LOGO POR EVENTO
 * ------------------------------------------------------------------ */

/* Copia de trabajo del logo del evento actual mientras el editor está abierto:
 * { img, x, y, w, h } o null si el evento no tiene logo. Se guarda en la columna
 * eventos.logo_constancia, así cada evento lleva su propio logo. */
let LOGO_EDITOR = null;
const LOGO_DEFECTO = { x: 981, y: 22, w: 112, h: 82 };

function renderLogoEditor() {
    const img = $('logo-ev-img');
    const sin = $('logo-ev-sin');
    const hay = !!(LOGO_EDITOR && LOGO_EDITOR.img);
    img.src = hay ? LOGO_EDITOR.img : '';
    mostrar(img, hay);
    mostrar(sin, !hay);

    const l = LOGO_EDITOR || LOGO_DEFECTO;
    $('logo-ev-x').value = l.x;
    $('logo-ev-y').value = l.y;
    $('logo-ev-w').value = l.w;
    $('logo-ev-h').value = l.h;

    const nom = (EVENTO_ACTUAL && EVENTO_ACTUAL.nombre) ? EVENTO_ACTUAL.nombre : 'este evento';
    $('logo-evento-nota').textContent = 'Sube un logo que aparecerá SOLO en las constancias de "' +
        nom + '", arriba a la derecha. Ajusta posición (X, Y) y tamaño (Ancho, Alto).';
}

/** Evento tal cual, pero con el logo de trabajo aplicado, para la vista previa. */
function eventoConLogoEditor() {
    const base = EVENTO_ACTUAL || { nombre: 'NOMBRE DEL EVENTO', horario: '[]', tipo: 'Webinar', id: 0 };
    return Object.assign({}, base, {
        logo_constancia: (LOGO_EDITOR && LOGO_EDITOR.img) ? LOGO_EDITOR : null
    });
}

/** Participante de mentira para la vista previa cuando el evento aún no tiene ninguno. */
function participanteEjemplo() {
    return PARTICIPANTES[0] || {
        dni: '00000000', apellidos: 'APELLIDO APELLIDO', nombres: 'NOMBRE NOMBRE'
    };
}

/* Diseño (1..4) que se está editando en el modal de diseño. */
let DISENIO_ACTUAL = 1;

function plantillaDesdeFormulario() {
    const obj = { nombre: $('pl-nombre').value.trim() || nombreDisenio(DISENIO_ACTUAL) };
    obj.fondo = $('pl-fondo').value;
    Object.keys(CAMPOS_PLANTILLA).forEach((id) => { obj[CAMPOS_PLANTILLA[id]] = $(id).value; });
    obj.firmas = FIRMAS_EDITOR.map(clonarFirma);
    return obj;
}

/** Rellena los selectores de diseño (editor y asignación) con los 4 nombres. */
function refrescarOpcionesDisenio() {
    ['pl-diseno', 'sel-diseno-asignar'].forEach((selId) => {
        const sel = $(selId);
        if (!sel) return;
        const previo = sel.value;
        sel.innerHTML = '';
        for (let i = 1; i <= NUM_DISENIOS; i++) {
            const o = document.createElement('option');
            o.value = i;
            o.textContent = `${i}. ${nombreDisenio(i)}`;
            sel.appendChild(o);
        }
        if (previo) sel.value = previo;
    });
}

/** Carga en el formulario el diseño con ese id (desde la caché PLANTILLAS). */
function cargarFormularioDisenio(id) {
    DISENIO_ACTUAL = id;
    const t = plantilla(id);
    $('pl-nombre').value = t.nombre || '';
    $('pl-fondo').value = t.fondo || 'cert_fondo.png';
    Object.keys(CAMPOS_PLANTILLA).forEach((cid) => { $(cid).value = t[CAMPOS_PLANTILLA[cid]]; });
    FIRMAS_EDITOR = (t.firmas || []).map(clonarFirma);
    renderFirmasEditor();
}

async function refrescarPrevia() {
    // Dibuja con lo que hay escrito ahora mismo, sin guardar: se pasa el diseño
    // en edición como override, para no tocar la caché de los 4 diseños.
    try {
        const override = normalizarPlantilla(plantillaDesdeFormulario(), DISENIO_ACTUAL);
        const canvas = await dibujarConstancia(participanteEjemplo(), eventoConLogoEditor(), VIENDO_MODELO, override);
        $('previa-img').src = canvas.toDataURL('image/png');
    } catch (e) {
        msg($('msg-disenio'), 'No se pudo dibujar la vista previa: ' + e.message, 'err');
    }
}

async function abrirDisenio() {
    // Releer por si los cambió alguien desde otro equipo.
    await cargarPlantillasRemotas();
    refrescarOpcionesDisenio();
    $('pl-diseno').value = DISENIO_ACTUAL;
    cargarFormularioDisenio(DISENIO_ACTUAL);

    // Logo específico de este evento (columna eventos.logo_constancia).
    LOGO_EDITOR = (EVENTO_ACTUAL && EVENTO_ACTUAL.logo_constancia && EVENTO_ACTUAL.logo_constancia.img)
        ? Object.assign({}, EVENTO_ACTUAL.logo_constancia)
        : null;
    renderLogoEditor();
    msg($('msg-logo-ev'), '', '');

    VIENDO_MODELO = false;
    $('aviso-modelo').textContent = '';
    msg($('msg-disenio'), '', '');
    abrirModal('modal-disenio');

    await document.fonts.ready;
    await refrescarPrevia();
}

/* ------------------------------------------------------------------ *
 *  MODALES Y ARRANQUE
 * ------------------------------------------------------------------ */

function abrirModal(id) {
    cerrarModales();
    $(id).classList.add('abierto');
}

function cerrarModales() {
    document.querySelectorAll('.modal-bg').forEach((m) => m.classList.remove('abierto'));
}

async function cargarAsesorias() {
    const { data, error } = await sb.from('asesorias_especializadas').select('tema').order('tema');
    if (error) {
        console.warn('Error al cargar asesorías:', error.message);
        return;
    }
    opciones($('ev-asesoria-tema'), (data || []).map(d => d.tema));
}

document.addEventListener('DOMContentLoaded', () => {
    opciones($('ev-tipo'), TIPOS);
    renderAudiencias([]);
    opciones($('ev-sedes'), SEDES);
    opciones($('ev-responsable'), RESPONSABLES);
    
    cargarAsesorias();
    
    $('ev-tipo').addEventListener('change', (e) => {
        mostrar($('grupo-asesoria'), e.target.value === 'Asesoría Especializada');
    });

    $('btn-nuevo-evento').addEventListener('click', () => {
        EDITANDO_EVENTO_ID = null;
        $('ev-nombre').value = '';
        $('ev-ponente').value = '';
        $('ev-descripcion').value = '';
        delete $('ev-descripcion').dataset.tocado;
        $('ev-sesiones').innerHTML = '';
        agregarSesion();
        renderAudiencias([]);
        $('ev-asesoria-tema').selectedIndex = 0;
        mostrar($('grupo-asesoria'), $('ev-tipo').value === 'Asesoría Especializada');
        PORTADA_DATA = null; PORTADA_QUITAR = false;
        renderPortadaEvento('');
        $('titulo-modal-evento').textContent = 'Crear evento';
        $('btn-guardar-evento').textContent = 'Crear evento';
        msg($('msg-evento'), '', '');
        abrirModal('modal-evento');
    });

    // Portada del evento: elegir imagen (se redimensiona y se guarda al guardar) y quitar.
    $('ev-portada-file').addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
            PORTADA_DATA = await archivoAPortada(f, 1200);
            PORTADA_QUITAR = false;
            renderPortadaEvento(PORTADA_DATA);
        } catch (err) {
            msg($('msg-evento'), 'No se pudo leer la imagen: ' + err.message, 'err');
        } finally {
            e.target.value = '';
        }
    });
    $('ev-portada-quitar').addEventListener('click', () => {
        PORTADA_DATA = null;
        PORTADA_QUITAR = true;
        $('ev-portada-file').value = '';
        renderPortadaEvento('');
    });

    $('btn-editar-evento').addEventListener('click', abrirEdicionEvento);
    $('btn-eliminar-evento').addEventListener('click', eliminarEvento);

    $('btn-agregar-sesion').addEventListener('click', agregarSesion);
    $('btn-guardar-evento').addEventListener('click', guardarEvento);
    // (los checkboxes de ev-audiencia disparan autoDescripcion desde renderAudiencias)
    ['ev-tipo', 'ev-nombre', 'ev-ponente', 'ev-modalidad', 'ev-sedes']
        .forEach((id) => $(id).addEventListener('input', autoDescripcion));
    $('ev-descripcion').addEventListener('input', function () { this.dataset.tocado = '1'; });

    $('btn-recargar').addEventListener('click', cargarEventos);
    $('buscar').addEventListener('input', pintarEventos);

    $('mes-anterior').addEventListener('click', () => {
        MES_VISIBLE = new Date(MES_VISIBLE.getFullYear(), MES_VISIBLE.getMonth() - 1, 1);
        pintarEventos();
    });
    $('mes-siguiente').addEventListener('click', () => {
        MES_VISIBLE = new Date(MES_VISIBLE.getFullYear(), MES_VISIBLE.getMonth() + 1, 1);
        pintarEventos();
    });
    $('btn-hoy').addEventListener('click', () => {
        MES_VISIBLE = new Date();
        pintarEventos();
    });

    $('btn-vista').addEventListener('click', () => {
        VISTA = VISTA === 'calendario' ? 'lista' : 'calendario';
        $('btn-vista').innerHTML = VISTA === 'calendario'
            ? '<i class="ph ph-list"></i> Ver como lista'
            : '<i class="ph ph-calendar-blank"></i> Ver calendario';
        pintarEventos();
    });

    $('btn-volver').addEventListener('click', () => {
        mostrarVista('vista-eventos');
        cargarEventos();
    });

    // El portal de constancias sigue publicado en Netlify (el resto vive en GitHub Pages).
    $('btn-portal').addEventListener('click', () => {
        window.open('https://eventoscot.netlify.app/portal_constancias.html', '_blank');
    });
    $('btn-reporte').addEventListener('click', () => {
        window.open('reporte.html', '_blank');
    });
    $('btn-encuesta-general').addEventListener('click', () => {
        window.open('encuesta.html', '_blank');
    });
    // btn-encuesta-evento listener removed (handled via onclick)
    $('btn-hoja-interna').addEventListener('click', () => window.open(HOJA_INTERNA, '_blank'));
    $('btn-hoja-oficial').addEventListener('click', () => window.open(HOJA_OFICIAL, '_blank'));

    $('btn-agregar-manual').addEventListener('click', () => {
        EDITANDO_ID = null;
        ['pa-dni', 'pa-apellidos', 'pa-nombres', 'pa-correo'].forEach((id) => { $(id).value = ''; });
        $('titulo-modal-participante').textContent = 'Agregar participante';
        $('btn-guardar-participante').textContent = 'Agregar';
        msg($('msg-participante'), '', '');
        validarCamposParticipante();
        abrirModal('modal-participante');
    });
    $('btn-guardar-participante').addEventListener('click', guardarParticipante);
    $('pa-dni').addEventListener('input', validarCamposParticipante);
    $('pa-correo').addEventListener('input', validarCamposParticipante);

    // Un solo listener para los botones de todas las filas (la tabla se repinta seguido).
    $('tbody-participantes').addEventListener('click', (e) => {
        const boton = e.target.closest('button[data-accion]');
        if (!boton) return;
        const p = PARTICIPANTES.find((x) => String(x.id) === boton.dataset.id);
        if (!p) return;
        if (boton.dataset.accion === 'editar') abrirEdicion(p);
        else if (boton.dataset.accion === 'copiar') copiarParticipante(p, boton);
        else if (boton.dataset.accion === 'eliminar') eliminarParticipante(p);
    });

    // Selección de participantes (casilla por fila + "seleccionar todos").
    $('tbody-participantes').addEventListener('change', (e) => {
        if (e.target.classList.contains('chk-fila')) actualizarSeleccion();
    });
    $('chk-todos').addEventListener('change', () => {
        const marcar = $('chk-todos').checked;
        document.querySelectorAll('#tbody-participantes .chk-fila').forEach((c) => { c.checked = marcar; });
        actualizarSeleccion();
    });
    
    // Selección de encuestas (casilla por fila + "seleccionar todos")
    $('tbody-encuestas').addEventListener('change', (e) => {
        if (e.target.classList.contains('chk-fila-encuesta')) actualizarSeleccionEncuestas();
    });
    if ($('chk-todos-encuestas')) {
        $('chk-todos-encuestas').addEventListener('change', () => {
            const marcar = $('chk-todos-encuestas').checked;
            document.querySelectorAll('#tbody-encuestas .chk-fila-encuesta').forEach((c) => { c.checked = marcar; });
            actualizarSeleccionEncuestas();
        });
    }

    $('btn-eliminar-sel').addEventListener('click', () => {
        eliminarParticipantesBulk(participantesSeleccionados(), 'seleccionado(s)');
    });
    $('btn-eliminar-todos').addEventListener('click', () => {
        eliminarParticipantesBulk(PARTICIPANTES.slice(), '(TODOS)');
    });
    $('btn-asignar-diseno').addEventListener('click', () => {
        asignarDisenioSeleccionados(parseInt($('sel-diseno-asignar').value, 10) || 1);
    });


    $('btn-leer').addEventListener('click', leerDatos);
    $('btn-confirmar-import').addEventListener('click', confirmarImport);
    $('map-modo').addEventListener('change', () => { aplicarModoMapeo(); pintarPrevia(); });

    document.querySelectorAll('.tabs button').forEach((b) => {
        b.addEventListener('click', () => {
            document.querySelectorAll('.tabs button').forEach((x) => x.classList.remove('abierto'));
            b.classList.add('abierto');
            mostrar($('tab-link'), b.dataset.tab === 'link');
            mostrar($('tab-archivo'), b.dataset.tab === 'archivo');
        });
    });

    $('btn-generar').addEventListener('click', () => generarConstancias());
    $('btn-generar-sel').addEventListener('click', () => generarConstancias(participantesSeleccionados(), true));
    $('btn-ppt-unico').addEventListener('click', () => descargarPptUnico(false));
    $('btn-ppt-separado').addEventListener('click', () => descargarPptSeparados(false));
    $('btn-ppt-unico-sel').addEventListener('click', () => descargarPptUnico(true));
    $('btn-ppt-separado-sel').addEventListener('click', () => descargarPptSeparados(true));

    $('btn-disenio').addEventListener('click', abrirDisenio);

    Object.keys(CAMPOS_PLANTILLA).forEach((id) => {
        let temporizador;
        $(id).addEventListener('input', () => {
            clearTimeout(temporizador);
            temporizador = setTimeout(refrescarPrevia, 350);
        });
    });

    $('btn-agregar-firma').addEventListener('click', agregarFirmaEditor);

    // Logo del evento: posición/tamaño, subir, quitar y guardar.
    const numsLogo = { 'logo-ev-x': 'x', 'logo-ev-y': 'y', 'logo-ev-w': 'w', 'logo-ev-h': 'h' };
    Object.keys(numsLogo).forEach((id) => {
        $(id).addEventListener('input', () => {
            if (!LOGO_EDITOR) return;
            const v = parseInt($(id).value, 10);
            LOGO_EDITOR[numsLogo[id]] = isNaN(v) ? 0 : v;
            previaDebounced();
        });
    });

    $('logo-ev-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const r = await archivoAImagenEscalada(file, 600);
            const base = LOGO_EDITOR || Object.assign({}, LOGO_DEFECTO);
            base.img = r.data;
            if (r.w) base.h = Math.round(base.w * r.h / r.w); // conservar proporción
            LOGO_EDITOR = base;
            renderLogoEditor();
            previaDebounced();
        } catch (err) {
            msg($('msg-logo-ev'), 'No se pudo leer la imagen: ' + err.message, 'err');
        } finally {
            e.target.value = '';
        }
    });

    $('logo-ev-quitar').addEventListener('click', () => {
        LOGO_EDITOR = null;
        renderLogoEditor();
        previaDebounced();
        msg($('msg-logo-ev'), 'Logo quitado. Pulsa "Guardar logo del evento" para confirmar.', '');
    });

    $('logo-ev-guardar').addEventListener('click', async () => {
        if (!EVENTO_ACTUAL) {
            msg($('msg-logo-ev'), 'Abre el diseño desde un evento para guardar su logo.', 'err');
            return;
        }
        $('logo-ev-guardar').disabled = true;
        msg($('msg-logo-ev'), 'Guardando...', '');
        try {
            const valor = (LOGO_EDITOR && LOGO_EDITOR.img) ? LOGO_EDITOR : null;
            const { error } = await sb.from('eventos').update({ logo_constancia: valor }).eq('id', EVENTO_ACTUAL.id);
            if (error) throw error;
            EVENTO_ACTUAL.logo_constancia = valor;
            const ev = EVENTOS.find((e) => e.id === EVENTO_ACTUAL.id);
            if (ev) ev.logo_constancia = valor;
            msg($('msg-logo-ev'), valor
                ? '✅ Logo guardado para este evento. Aplica a las constancias que generes desde ahora.'
                : '✅ Logo eliminado de este evento.', 'ok');
        } catch (e) {
            msg($('msg-logo-ev'), 'No se pudo guardar: ' + e.message, 'err');
        } finally {
            $('logo-ev-guardar').disabled = false;
        }
    });

    $('btn-ver-modelo').addEventListener('click', async () => {
        VIENDO_MODELO = !VIENDO_MODELO;
        $('btn-ver-modelo').innerHTML = VIENDO_MODELO
            ? '<i class="ph ph-user"></i> Ver con datos reales'
            : '<i class="ph ph-eye"></i> Ver estructura del modelo';
        $('aviso-modelo').textContent = VIENDO_MODELO
            ? 'Mostrando los marcadores sin reemplazar, como en el archivo modelo.'
            : '';
        await refrescarPrevia();
    });

    // Cambiar de diseño en el selector: carga ese diseño en el formulario.
    $('pl-diseno').addEventListener('change', async () => {
        cargarFormularioDisenio(parseInt($('pl-diseno').value, 10) || 1);
        msg($('msg-disenio'), '', '');
        await refrescarPrevia();
    });
    // El nombre del diseño también refresca la vista previa y el selector.
    $('pl-nombre').addEventListener('input', () => {
        const o = $('pl-diseno').querySelector(`option[value="${DISENIO_ACTUAL}"]`);
        if (o) o.textContent = `${DISENIO_ACTUAL}. ${$('pl-nombre').value.trim() || nombreDisenio(DISENIO_ACTUAL)}`;
    });

    $('btn-guardar-disenio').addEventListener('click', async () => {
        $('btn-guardar-disenio').disabled = true;
        msg($('msg-disenio'), 'Guardando...', '');
        try {
            await guardarPlantillaRemota(DISENIO_ACTUAL, plantillaDesdeFormulario());
            refrescarOpcionesDisenio();
            $('pl-diseno').value = DISENIO_ACTUAL;
            msg($('msg-disenio'), `✅ Diseño "${nombreDisenio(DISENIO_ACTUAL)}" guardado. Se usará en las ` +
                'próximas constancias de quienes lo tengan asignado, desde cualquier equipo.', 'ok');
        } catch (e) {
            msg($('msg-disenio'), 'No se pudo guardar: ' + e.message, 'err');
        } finally {
            $('btn-guardar-disenio').disabled = false;
        }
    });

    $('btn-restablecer-disenio').addEventListener('click', async () => {
        if (!confirm(`¿Restablecer el diseño "${nombreDisenio(DISENIO_ACTUAL)}" al formato original?`)) return;
        try {
            await restablecerPlantillaRemota(DISENIO_ACTUAL);
            cargarFormularioDisenio(DISENIO_ACTUAL);
            refrescarOpcionesDisenio();
            $('pl-diseno').value = DISENIO_ACTUAL;
            msg($('msg-disenio'), 'Diseño y firmas restablecidos al formato original.', '');
            await refrescarPrevia();
        } catch (e) {
            msg($('msg-disenio'), 'No se pudo restablecer: ' + e.message, 'err');
        }
    });

    document.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', cerrarModales));

    // Cerrar al hacer clic en el fondo, pero solo si el gesto EMPEZÓ ahí.
    // Si no, seleccionar texto dentro de un campo y soltar el botón fuera del
    // modal dispara el click sobre el fondo y la ventana se cierra sola.
    document.querySelectorAll('.modal-bg').forEach((m) => {
        let empezoEnFondo = false;
        m.addEventListener('mousedown', (e) => { empezoEnFondo = e.target === m; });
        m.addEventListener('click', (e) => {
            if (e.target === m && empezoEnFondo) cerrarModales();
            empezoEnFondo = false;
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') cerrarModales();
    });

    cargarPlantillasRemotas();
    cargarEventos().then(() => {
        // Si la página se recargó dentro de un evento, volver a abrirlo.
        const m = location.hash.match(/^#evento=(.+)$/);
        if (!m) return;
        const ev = EVENTOS.find((e) => String(e.id) === decodeURIComponent(m[1]));
        if (ev) abrirGestor(ev.id);
        else mostrarVista('vista-eventos');
    });
});

// ==================== ENCUESTAS CRUD LOGIC ====================
function abrirModalEnlaceEncuesta() {
    if (!EVENTO_ACTUAL) return;
    const select = $('sel-enlace-sesion');
    select.innerHTML = '<option value="">Cargando...</option>';
    
    let sesiones = [];
    try { sesiones = JSON.parse(EVENTO_ACTUAL.horario || '[]'); } catch(e) {}
    
    select.innerHTML = '';
    if (sesiones.length > 0) {
        sesiones.forEach((s, idx) => {
            select.innerHTML += `<option value="Sesión ${idx + 1}">Sesión ${idx + 1} (${s.fecha})</option>`;
        });
        if (sesiones.length > 1) {
            select.innerHTML += `<option value="Taller Completo">Taller Completo / Todas las sesiones</option>`;
        }
    } else {
        select.innerHTML = '<option value="Sesión 1">Sesión 1 (Predeterminada)</option>';
    }
    
    actualizarEnlaceInput();
    $('modal-link-encuesta').classList.add('abierto');
}
window.abrirModalEnlaceEncuesta = abrirModalEnlaceEncuesta;

function actualizarEnlaceInput() {
    if (!EVENTO_ACTUAL) return;
    const sesion = $('sel-enlace-sesion').value;
    // Link corto: encuesta.html?e=<id>&s=<n° sesión | t = Taller Completo>. El nombre lo carga la encuesta desde Supabase.
    // Siempre al dominio público de Vercel: el público no debe ver GitHub.
    const url = new URL('encuesta.html', 'https://eventos-certus.vercel.app/');
    url.searchParams.set('e', EVENTO_ACTUAL.id);
    // f=c: formulario completo para actividades académicas (sin f: breve)
    if ($('sel-enlace-tipo') && $('sel-enlace-tipo').value) url.searchParams.set('f', $('sel-enlace-tipo').value);
    if(sesion) {
        url.searchParams.set('s', sesion === 'Taller Completo' ? 't' : sesion.replace('Sesión ', ''));
    }
    $('input-enlace-encuesta').value = url.toString();
}
window.actualizarEnlaceInput = actualizarEnlaceInput;

function copiarEnlaceEncuesta() {
    const input = $('input-enlace-encuesta');
    input.select();
    document.execCommand('copy');
    msgToast('Enlace copiado al portapapeles', 'éxito');
    $('modal-link-encuesta').classList.remove('abierto');
}
window.copiarEnlaceEncuesta = copiarEnlaceEncuesta;

function abrirModalEncuestaManual() {
    $('form-encuesta-manual').reset();
    $('encuesta-manual-id').value = '';
    $('titulo-modal-encuesta').textContent = 'Agregar Respuesta Manual';
    
    const select = $('em-sesion');
    let sesiones = [];
    try { sesiones = JSON.parse(EVENTO_ACTUAL.horario || '[]'); } catch(e) {}
    
    select.innerHTML = '';
    if (sesiones.length > 0) {
        sesiones.forEach((s, idx) => {
            select.innerHTML += `<option value="Sesión ${idx + 1}">Sesión ${idx + 1}</option>`;
        });
        if (sesiones.length > 1) {
            select.innerHTML += `<option value="Evento Completo">Evento Completo</option>`;
        }
    } else {
        select.innerHTML = '<option value="Sesión 1">Sesión 1</option>';
    }
    $('modal-encuesta-manual').classList.add('abierto');
}
window.abrirModalEncuestaManual = abrirModalEncuestaManual;

function abrirEdicionEncuesta(id) {
    const enc = window.ENCUESTAS_ACTUALES.find(e => e.id === id);
    if (!enc) return;
    $('form-encuesta-manual').reset();
    $('encuesta-manual-id').value = enc.id;
    if (enc.apellidos || enc.nombres) {
        $('em-apellidos').value = enc.apellidos || '';
        $('em-nombres').value = enc.nombres || '';
    } else {
        // Registros antiguos: todo el nombre va a Apellidos (editable).
        $('em-apellidos').value = enc.participante_nombre || '';
        $('em-nombres').value = '';
    }
    $('em-dni').value = enc.dni || '';
    $('em-correo').value = enc.correo || '';
    $('em-tipo').value = enc.tipo_participante || '';
    if (enc.fecha_llenado) {
        const f = new Date(enc.fecha_llenado);
        $('em-fecha').value = `${f.getFullYear()}-${pad2(f.getMonth() + 1)}-${pad2(f.getDate())}`;
        $('em-hora').value = formatoHora(enc.fecha_llenado);
    }
    $('em-sede').value = enc.sede || '';
    
    const select = $('em-sesion');
    let sesiones = [];
    try { sesiones = JSON.parse(EVENTO_ACTUAL.horario || '[]'); } catch(e) {}
    select.innerHTML = '';
    if (sesiones.length > 0) {
        sesiones.forEach((s, idx) => {
            select.innerHTML += `<option value="Sesión ${idx + 1}">Sesión ${idx + 1}</option>`;
        });
        if (sesiones.length > 1) select.innerHTML += `<option value="Evento Completo">Evento Completo</option>`;
    } else {
        select.innerHTML = '<option value="Sesión 1">Sesión 1</option>';
    }
    $('em-sesion').value = enc.modulo_sesion || '';
    
    $('em-nps').value = enc.nps ?? '';
    $('em-facilidad').value = enc.facilidad ?? '';
    $('em-comentarios').value = enc.comentarios || '';
    
    $('titulo-modal-encuesta').textContent = 'Editar Respuesta';
    $('modal-encuesta-manual').classList.add('abierto');
}
window.abrirEdicionEncuesta = abrirEdicionEncuesta;

setTimeout(() => {
    const formManual = $('form-encuesta-manual');
    if (formManual) {
        formManual.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = $('encuesta-manual-id').value;
            const apellidos = $('em-apellidos').value.trim();
            const nombres = $('em-nombres').value.trim();
            const payload = {
                evento_id: EVENTO_ACTUAL.id,
                apellidos: apellidos,
                nombres: nombres,
                participante_nombre: (apellidos + ' ' + nombres).trim(),
                dni: $('em-dni').value.trim(),
                correo: $('em-correo').value.trim(),
                sede: $('em-sede').value,
                modulo_sesion: $('em-sesion').value,
                nps: parseInt($('em-nps').value),
                facilidad: parseInt($('em-facilidad').value),
                comentarios: $('em-comentarios').value,
                tipo_participante: $('em-tipo').value,
                // Sin fecha -> se autogenera con el fin de la sesión (respetando la hora si se escribió)
                fecha_llenado: $('em-fecha').value
                    ? new Date(`${$('em-fecha').value}T${$('em-hora').value || '12:00'}`).toISOString()
                    : fechaLlenadoEstimada($('em-sesion').value, $('em-hora').value || null)
            };
            
            if (payload.nps >= 9) payload.cumplio_expectativas = "Sí";
            else if (payload.nps >= 7) payload.cumplio_expectativas = "Neutral";
            else payload.cumplio_expectativas = "No";
            
            let res;
            if (id) {
                res = await sb.from('asistencia_encuesta').update(payload).eq('id', id);
            } else {
                res = await sb.from('asistencia_encuesta').insert(payload);
            }
            
            if (res.error) {
                msgToast('Error al guardar: ' + res.error.message, 'error');
            } else {
                msgToast('Respuesta guardada con éxito', 'éxito');
                $('modal-encuesta-manual').classList.remove('abierto');
                cargarEncuestas();
            }
        });
    }
}, 500);

async function eliminarEncuesta(id) {
    if(!confirm('¿Estás seguro de eliminar esta respuesta?')) return;
    const { error } = await sb.from('asistencia_encuesta').delete().eq('id', id);
    if(error) msgToast('Error al eliminar', 'error');
    else { msgToast('Eliminado', 'éxito'); cargarEncuestas(); }
}
window.eliminarEncuesta = eliminarEncuesta;

async function eliminarEncuestasSeleccionadas() {
    const marcadas = Array.from(document.querySelectorAll('#tbody-encuestas .chk-fila-encuesta:checked'));
    if (marcadas.length === 0) return;
    if (!confirm(`¿Eliminar ${marcadas.length} respuestas seleccionadas?`)) return;
    
    const ids = marcadas.map(c => c.dataset.id);
    const lotes = enLotes(ids, 100);
    let eliminados = 0;
    
    for (const lote of lotes) {
        const { error } = await sb.from('asistencia_encuesta').delete().in('id', lote);
        if (error) { msgToast('Error parcial al eliminar', 'error'); break; }
        eliminados += lote.length;
    }
    
    msgToast(`Se eliminaron ${eliminados} respuestas`, 'éxito');
    cargarEncuestas();
}
window.eliminarEncuestasSeleccionadas = eliminarEncuestasSeleccionadas;

/* Asignación por lotes: pone el mismo tipo o la misma sede a todas las
   respuestas marcadas, sin tener que editarlas una por una. */
async function actualizarEncuestasEnLote(campo, valor, etiqueta) {
    const marcadas = Array.from(document.querySelectorAll('#tbody-encuestas .chk-fila-encuesta:checked'));
    if (marcadas.length === 0) { msgToast('Marca al menos una respuesta', 'error'); return; }
    if (!confirm(`¿Poner ${etiqueta} «${valor || 'sin especificar'}» a ${marcadas.length} respuesta(s)?`)) return;

    const ids = marcadas.map(c => c.dataset.id);
    let actualizados = 0;
    for (const lote of enLotes(ids, 100)) {
        const { error } = await sb.from('asistencia_encuesta')
            .update({ [campo]: valor || null })
            .in('id', lote);
        if (error) { msgToast('Error parcial al actualizar: ' + error.message, 'error'); break; }
        actualizados += lote.length;
    }
    if (actualizados) msgToast(`Se actualizó ${etiqueta} en ${actualizados} respuesta(s)`, 'éxito');
    cargarEncuestas();
}

async function asignarTipoEncuestas() {
    const sel = $('sel-tipo-lote');
    await actualizarEncuestasEnLote('tipo_participante', sel ? sel.value : '', 'el tipo');
}
window.asignarTipoEncuestas = asignarTipoEncuestas;

async function asignarSedeEncuestas() {
    const sel = $('sel-sede-lote');
    if (!sel || !sel.value) { msgToast('Selecciona una sede', 'error'); return; }
    await actualizarEncuestasEnLote('sede', sel.value, 'la sede');
}
window.asignarSedeEncuestas = asignarSedeEncuestas;

/* El selector de sede por lotes usa las mismas opciones que el formulario manual. */
function llenarSedesLote() {
    const origen = $('em-sede'), destino = $('sel-sede-lote');
    if (!origen || !destino || destino.options.length) return;
    destino.innerHTML = Array.from(origen.options)
        .filter(o => o.value)
        .map(o => `<option value="${o.value}">${o.textContent}</option>`).join('');
}
setTimeout(llenarSedesLote, 500);

async function copiarEncuestasSeleccionadas() {
    const marcadas = Array.from(document.querySelectorAll('#tbody-encuestas .chk-fila-encuesta:checked'));
    if (marcadas.length === 0) return;
    
    const selCopiar = $('sel-sesion-copiar');
    const sesionDestino = selCopiar ? selCopiar.value : null;
    
    if (!sesionDestino) {
        msgToast('Selecciona una sesión de destino', 'error');
        return;
    }

    if (!confirm(`¿Copiar ${marcadas.length} respuestas seleccionadas a "${sesionDestino}"?`)) return;
    
    const ids = marcadas.map(c => c.dataset.id);
    const encuestasACopiar = window.ENCUESTAS_ACTUALES.filter(e => ids.includes(e.id));
    
    if (encuestasACopiar.length === 0) return;
    
    // Preparar payloads
    const payloads = encuestasACopiar.map(e => {
        const p = { ...e };
        delete p.id;
        delete p.created_at;
        p.modulo_sesion = sesionDestino;
        return p;
    });
    
    $('btn-copiar-encuestas').disabled = true;
    msgToast(`Copiando ${payloads.length} respuestas...`, 'info');
    
    // Insertar en lotes
    const lotes = enLotes(payloads, 100);
    let copiados = 0;
    
    for (const lote of lotes) {
        const { error } = await sb.from('asistencia_encuesta').insert(lote);
        if (error) { 
            console.error('Error copiando:', error);
            msgToast('Error parcial al copiar: ' + error.message, 'error'); 
            break; 
        }
        copiados += lote.length;
    }
    
    $('btn-copiar-encuestas').disabled = false;
    msgToast(`Se copiaron ${copiados} respuestas a ${sesionDestino}`, 'éxito');
    
    // Limpiar selección
    if ($('chk-todos-encuestas')) $('chk-todos-encuestas').checked = false;
    
    cargarEncuestas();
}
window.copiarEncuestasSeleccionadas = copiarEncuestasSeleccionadas;

function abrirModalImportarEncuestas() {
    $('texto-importar-encuestas').value = '';
    $('escala-nps-import').value = '0-10';
    $('modal-importar-encuestas').classList.add('abierto');
}
window.abrirModalImportarEncuestas = abrirModalImportarEncuestas;

async function procesarImportarEncuestas() {
    const texto = $('texto-importar-encuestas').value.trim();
    if(!texto) return msgToast('No hay datos para importar', 'error');
    
    const escala = $('escala-nps-import').value;
    const lineas = texto.split('\n');
    let insertados = 0;
    
    for(let l of lineas) {
        if(!l.trim()) continue;
        const c = l.split('\t');
        if(c.length < 2) continue;
        
        let nombre = (c[0]||'').trim();
        let correo = (c[1]||'').trim();
        let sede = (c[2]||'').trim();
        let sesion = (c[3]||'').trim();
        let nps = parseInt(c[4]);
        let sat = parseInt(c[5]);
        let coms = (c[6]||'').trim();
        
        if (isNaN(nps)) nps = 0;
        if (isNaN(sat)) sat = 3;
        
        // Mapeo NPS 1-5 a 0-10
        if(escala === '1-5') {
            nps = Math.round((nps - 1) * (10 / 4));
        }
        
        const payload = {
            evento_id: EVENTO_ACTUAL.id,
            participante_nombre: nombre,
            correo: correo,
            sede: sede,
            modulo_sesion: sesion,
            nps: nps,
            facilidad: sat,
            comentarios: coms,
            cumplio_expectativas: nps >= 9 ? "Sí" : (nps >= 7 ? "Neutral" : "No")
        };
        
        await sb.from('asistencia_encuesta').insert(payload);
        insertados++;
    }
    
    $('modal-importar-encuestas').classList.remove('abierto');
    msgToast(`Se importaron ${insertados} respuestas`, 'éxito');
    cargarEncuestas();
}
window.procesarImportarEncuestas = procesarImportarEncuestas;

function msgToast(txt, tipo) {
    const d = document.createElement('div');
    d.style.position = 'fixed';
    d.style.bottom = '20px';
    d.style.left = '50%';
    d.style.transform = 'translateX(-50%)';
    d.style.padding = '12px 24px';
    d.style.background = tipo === 'error' ? '#ef4444' : '#10b981';
    d.style.color = 'white';
    d.style.borderRadius = '8px';
    d.style.zIndex = '9999';
    d.textContent = txt;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 3000);
}

// --- Nuevas funciones de copia e importación ---

window.guardarAlcance = async function (val) {
    if (!EVENTO_ACTUAL) return;
    let reqs = {};
    try { reqs = typeof EVENTO_ACTUAL.requisitos === 'string' ? JSON.parse(EVENTO_ACTUAL.requisitos) : (EVENTO_ACTUAL.requisitos || {}); } catch (e) {}
    reqs.alcance = val;
    EVENTO_ACTUAL.requisitos = reqs;
    const { error } = await sb.from('eventos').update({ requisitos: reqs }).eq('id', EVENTO_ACTUAL.id);
    if (error) msgToast('Error guardando alcance: ' + error.message, 'error');
    else msgToast('Alcance guardado', 'éxito');
};

window.copiarAEncuesta = async function (id) {
    const p = PARTICIPANTES.find(x => x.id === id);
    if (!p) return;
    const payload = {
        evento_id: EVENTO_ACTUAL.id,
        apellidos: p.apellidos,
        nombres: p.nombres,
        participante_nombre: ((p.apellidos || '') + ' ' + (p.nombres || '')).trim(),
        correo: p.correo,
        modulo_sesion: sesionPorDefecto(),
        dni: p.dni
    };
    const { error } = await sb.from('asistencia_encuesta').insert(payload);
    if (error) msgToast('Error al copiar: ' + error.message, 'error');
    else { msgToast('Copiado a Resultados', 'éxito'); cargarEncuestas(); }
};

window.copiarMarcadosAResultados = async function () {
    const marcados = Array.from(document.querySelectorAll('#tbody-participantes .chk-fila:checked'));
    if (!marcados.length) return msgToast('No hay participantes marcados', 'error');
    let insertados = 0;
    for (let m of marcados) {
        const id = m.dataset.id;
        const p = PARTICIPANTES.find(x => x.id === id);
        if (!p) continue;
        const payload = {
            evento_id: EVENTO_ACTUAL.id,
            apellidos: p.apellidos,
            nombres: p.nombres,
            participante_nombre: ((p.apellidos || '') + ' ' + (p.nombres || '')).trim(),
            correo: p.correo,
            modulo_sesion: sesionPorDefecto(),
            dni: p.dni
        };
        await sb.from('asistencia_encuesta').insert(payload);
        insertados++;
    }
    msgToast(`Copiados ${insertados} a Resultados`, 'éxito');
    cargarEncuestas();
};

/* ---- Resultados (encuestas) -> Constancias (participantes) ---- */

/** Clave de persona: DNI si lo hay; si no, el nombre con las palabras ordenadas
 *  (las importaciones a veces invierten nombres y apellidos). */
function clavePersona(dni, nombreCompleto) {
    const d = (dni ?? '').toString().trim();
    if (d) return 'dni:' + d;
    return 'nom:' + norm(nombreCompleto).replace(/\s+/g, ' ').split(' ').sort().join(' ');
}

/** DNI de reemplazo estable para quien no tiene DNI ("SC" + hash del nombre):
 *  reenviar a la misma persona no la duplica. */
function dniSinCodigo(clave) {
    let h = 5381;
    for (const ch of clave) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
    return 'SC' + h.toString(36).toUpperCase().padStart(7, '0').slice(0, 7);
}

/** Convierte una respuesta de encuesta en un participante para constancias. */
function encuestaAParticipante(e) {
    let nombres = (e.nombres || '').trim(), apellidos = (e.apellidos || '').trim();
    if (!nombres && !apellidos) {   // registros sin columnas separadas: "Apellido1 Apellido2 Nombres"
        const partes = (e.participante_nombre || '').trim().split(/\s+/).filter(Boolean);
        const nAp = partes.length >= 3 ? 2 : 1;
        apellidos = partes.slice(0, nAp).join(' ');
        nombres = partes.slice(nAp).join(' ');
    }
    const clave = clavePersona(e.dni, `${apellidos} ${nombres}`);
    return {
        clave,
        fila: {
            evento_id: EVENTO_ACTUAL.id,
            dni: (e.dni || '').toString().trim() || dniSinCodigo(clave),
            nombres, apellidos,
            correo: e.correo || '',   // la columna no admite null
            asistencia: true
        }
    };
}

/** Envía respuestas a Constancias sin repetir personas ni tocar a las que ya están. */
async function enviarAConstancias(encuestas) {
    if (!encuestas.length) return msgToast('No hay respuestas para enviar', 'error');

    const existentes = new Set();
    PARTICIPANTES.forEach((p) => {
        existentes.add(clavePersona(p.dni, `${p.apellidos || ''} ${p.nombres || ''}`));
        existentes.add(clavePersona('', `${p.apellidos || ''} ${p.nombres || ''}`));
        if (p.dni) existentes.add('dni:' + p.dni);
    });

    const nuevos = new Map();
    let yaEstaban = 0;
    encuestas.forEach((e) => {
        if (!(e.participante_nombre || e.nombres || e.apellidos || e.dni)) return;
        const { clave, fila } = encuestaAParticipante(e);
        const claveNombre = clavePersona('', `${fila.apellidos} ${fila.nombres}`);
        if (existentes.has(clave) || existentes.has(claveNombre) || existentes.has('dni:' + fila.dni)) { yaEstaban++; return; }
        if (!nuevos.has(clave)) nuevos.set(clave, fila);
    });
    const filas = [...nuevos.values()];
    const repetidas = encuestas.length - yaEstaban - filas.length;

    // Con DNI real, el nombre y el correo se toman de la base de estudiantes: las importaciones
    // a veces traen nombres y apellidos cruzados y saldrían mal en la constancia.
    msgToast('Verificando nombres en la base de estudiantes...', 'info');
    let k = 0;
    await Promise.all(Array.from({ length: 6 }, async () => {
        while (k < filas.length) {
            const f = filas[k++];
            if (!/^\d{8,}$/.test(f.dni)) continue;
            const r = await buscarEnBaseEstudiantes(f.dni, '');
            if (!r) continue;
            Object.assign(f, partirNombreBase(r.alumno));
            if (!f.correo && r.correo) f.correo = r.correo;
        }
    }));

    if (!filas.length) {
        return msgToast(`Las ${encuestas.length} respuesta(s) ya están en Constancias`, 'éxito');
    }
    if (!confirm(
        `Se agregarán ${filas.length} participante(s) a Constancias.\n\n` +
        (yaEstaban ? `• ${yaEstaban} respuesta(s) son de personas que ya están en Constancias.\n` : '') +
        (repetidas > 0 ? `• ${repetidas} respuesta(s) son de la misma persona (se agrega una sola vez).\n` : '') +
        `\n¿Continuar?`)) return;

    let insertados = 0;
    for (const lote of enLotes(filas, 100)) {
        const { error } = await sb.from('asistencias').insert(lote);
        if (error) {
            msgToast(`Se agregaron ${insertados}; error en el resto: ${error.message}`, 'error');
            await cargarParticipantes();
            return;
        }
        insertados += lote.length;
    }
    msgToast(`${insertados} participante(s) agregados a Constancias`, 'éxito');
    if ($('chk-todos-encuestas')) $('chk-todos-encuestas').checked = false;
    document.querySelectorAll('#tbody-encuestas .chk-fila-encuesta').forEach((c) => { c.checked = false; });
    actualizarSeleccionEncuestas();
    await cargarParticipantes();
}

window.copiarAConstancias = async function (id) {
    const e = (window.ENCUESTAS_ACTUALES || []).find(x => x.id === id);
    if (e) await enviarAConstancias([e]);
};

/** Botón "Enviar a Constancias": las respuestas marcadas o, si no hay ninguna marcada, todas. */
window.copiarMarcadosAConstancias = async function () {
    const todas = window.ENCUESTAS_ACTUALES || [];
    const ids = new Set(Array.from(document.querySelectorAll('#tbody-encuestas .chk-fila-encuesta:checked')).map((c) => c.dataset.id));
    await enviarAConstancias(ids.size ? todas.filter((e) => ids.has(e.id)) : todas);
};
