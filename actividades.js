/* ===== Actividades puntuales (eventos de una fecha concreta) =====
   - Se guardan en Supabase (tabla cot_actividades), NO en localStorage,
     para que cualquiera que abra la pagina las vea.
   - Se dibujan sobre la misma grilla que los cursos, pero solo cuando la
     fecha del evento cae dentro de la semana que se esta viendo.
   - Modulo independiente de horario.js: la geometria se deduce leyendo
     las filas .hour-row del DOM, asi no depende de sus constantes internas. */
(function () {
  'use strict';

  const SB_URL = 'https://klmjmlhwuzhymrplemgw.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsbWptbGh3dXpoeW1ycGxlbWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTMyNjQsImV4cCI6MjA4NzE2OTI2NH0.xFWMvUJa9n9TBcBG1WSeqCGiWBaCAtCU9aY7GXk4W6E';
  const TABLA = 'cot_actividades';

  const PERSONAS_FALLBACK = ['EDUARDO', 'JOSÉ', 'FERNANDO', 'CARLOS', 'MIRKO', 'LUIS'];
  const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];

  let sb = null;
  let actividades = [];       // actividades de la semana visible
  let lunesVisible = null;    // Date del lunes de la semana mostrada
  let editandoId = null;
  let pintando = false;       // evita que el observer se dispare con lo nuestro
  let sinColumnaEnlace = false; // la tabla aun no tiene la columna 'enlace'

  const MAX_SEMANAS = 52;
  const MAX_FILAS = 300;      // tope de actividades creadas de una vez

  /* ---------- fechas ---------- */
  const aMedianoche = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  function lunesDe(fecha) {
    const d = aMedianoche(fecha);
    const dow = d.getDay();               // 0=domingo
    // La grilla solo tiene lunes..sabado. En domingo no hay nada que mostrar de
    // esa semana, asi que se pasa a la semana que empieza al dia siguiente.
    if (dow === 0) { d.setDate(d.getDate() + 1); return d; }
    d.setDate(d.getDate() - (dow - 1));
    return d;
  }
  const sumarDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const aISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const desdeISO = s => { const [a, m, d] = String(s).split('-').map(Number); return new Date(a, m - 1, d); };
  const ddmm = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  const esMismoDia = (a, b) => aISO(a) === aISO(b);

  // El enlace va en la columna 'enlace'; si la tabla no la tiene se guarda al
  // final de la nota con este prefijo, y aqui se separa para mostrarlo.
  const PREFIJO_ENLACE = '🔗 ';
  const RE_ENLACE_NOTA = /(?:^|\n)🔗 (\S+)\s*$/;
  function enlaceDe(a) {
    if (a.enlace) return a.enlace;
    const m = String(a.nota || '').match(RE_ENLACE_NOTA);
    return m ? m[1] : '';
  }
  const notaDe = a => String(a.nota || '').replace(RE_ENLACE_NOTA, '').trim();
  // Solo se aceptan enlaces http(s); si falta el protocolo se asume https.
  function normalizarEnlace(txt) {
    const t = String(txt || '').trim();
    if (!t) return '';
    try {
      const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : 'https://' + t);
      return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
    } catch (e) { return null; }
  }
  // Las actividades repetidas comparten el id base: base, base__1, base__2...
  const serieDe = id => String(id || '').split('__')[0];

  const esc = s => String(s == null ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function personas() {
    try {
      const g = JSON.parse(localStorage.getItem('cot_groups') || '{}');
      if (g && Array.isArray(g.PTC) && g.PTC.length) return g.PTC;
    } catch (e) { /* usa el fallback */ }
    return PERSONAS_FALLBACK;
  }

  // Lista de participantes de una actividad (soporta filas antiguas con un solo user_id)
  function participantesDe(a) {
    if (Array.isArray(a.participantes) && a.participantes.length) return a.participantes;
    return a.user_id ? [a.user_id] : [];
  }

  // Docentes marcados en el panel de horario. La actividad solo se muestra si
  // al menos uno de sus participantes esta activo, igual que los cursos.
  function docentesActivos() {
    try {
      const raw = localStorage.getItem('cot_active_users');
      if (raw === null) return null;            // null = aun sin definir
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch (e) { return null; }
  }
  function estaVisible(a) {
    const activos = docentesActivos();
    if (activos === null) return true;          // sin preferencia guardada: mostrar
    return participantesDe(a).some(p => activos.has(p));
  }

  /* ---------- geometria leida del DOM ---------- */
  const minutos = t => {
    const p = String(t || '').split(':');
    return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
  };
  // Devuelve [{ini, fin, top, alto}] a partir de las filas visibles de la grilla
  function filasGrilla() {
    const filas = [];
    document.querySelectorAll('#gridBody .hour-row').forEach(row => {
      const lab = row.querySelector('.hour-label');
      if (!lab) return;
      const m = lab.textContent.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
      if (!m) return;
      filas.push({ ini: minutos(m[1]), fin: minutos(m[2]), top: row.offsetTop, alto: row.offsetHeight });
    });
    return filas;
  }
  // Convierte un minuto del dia a coordenada Y dentro de la grilla.
  // La grilla oculta las franjas sin cursos, asi que un horario que caiga en un
  // hueco oculto se ajusta al borde visible mas cercano en vez de descartarse.
  function yDe(min, filas, modo) {
    if (!filas.length) return null;
    for (const f of filas) {
      if (min >= f.ini && min < f.fin) return f.top + ((min - f.ini) / (f.fin - f.ini)) * f.alto;
    }
    if (min <= filas[0].ini) return filas[0].top;
    const ult = filas[filas.length - 1];
    if (min >= ult.fin) return ult.top + ult.alto;
    if (modo === 'fin') {
      let y = filas[0].top + filas[0].alto;
      for (const f of filas) if (f.fin <= min) y = f.top + f.alto;
      return y;
    }
    for (const f of filas) if (f.ini >= min) return f.top;
    return ult.top + ult.alto;
  }
  // true si ese horario no tiene fila visible (cae en un hueco oculto)
  function estaOculto(min, filas) {
    return filas.length > 0 && !filas.some(f => min >= f.ini && min < f.fin);
  }

  /* ---------- barra de semana ---------- */
  function construirBarra() {
    if (document.getElementById('semanaBar')) return;
    const cont = document.querySelector('.schedule-grid-container');
    if (!cont) return;
    const bar = document.createElement('div');
    bar.className = 'semana-bar';
    bar.id = 'semanaBar';
    bar.innerHTML =
      '<div class="semana-nav">' +
        '<button class="semana-btn" id="semPrev" title="Semana anterior"><i class="fas fa-chevron-left"></i></button>' +
        '<button class="semana-btn semana-hoy-btn" id="semHoy">Hoy</button>' +
        '<button class="semana-btn" id="semNext" title="Semana siguiente"><i class="fas fa-chevron-right"></i></button>' +
      '</div>' +
      '<div><div class="semana-rango" id="semRango">—</div>' +
      '<div class="semana-sub" id="semSub"></div></div>' +
      '<div class="semana-spacer">' +
        '<span class="act-contador" id="actContador"></span>' +
        '<button class="btn-actividad" id="btnNuevaActividad">' +
          '<i class="fas fa-calendar-plus"></i> Nueva actividad</button>' +
      '</div>';
    cont.insertBefore(bar, cont.firstChild);

    document.getElementById('semPrev').onclick = () => { lunesVisible = sumarDias(lunesVisible, -7); refrescar(); };
    document.getElementById('semNext').onclick = () => { lunesVisible = sumarDias(lunesVisible, 7); refrescar(); };
    document.getElementById('semHoy').onclick  = () => { lunesVisible = lunesDe(new Date()); refrescar(); };
    document.getElementById('btnNuevaActividad').onclick = () => abrirModal(null);
  }

  function pintarCabecera() {
    const cols = document.querySelectorAll('.grid-header .day-col');
    const hoy = aMedianoche(new Date());
    cols.forEach((col, i) => {
      const f = sumarDias(lunesVisible, i);
      col.classList.toggle('es-hoy', esMismoDia(f, hoy));
      let sp = col.querySelector('.day-fecha');
      if (!sp) { sp = document.createElement('span'); sp.className = 'day-fecha'; col.appendChild(sp); }
      sp.textContent = ddmm(f);
      if (!col.dataset.diaBase) col.dataset.diaBase = DIAS[i];
    });

    const fin = sumarDias(lunesVisible, 5);
    const rango = document.getElementById('semRango');
    const sub = document.getElementById('semSub');
    if (rango) {
      const mismoMes = lunesVisible.getMonth() === fin.getMonth();
      rango.textContent = mismoMes
        ? `${lunesVisible.getDate()} al ${fin.getDate()} de ${MESES[fin.getMonth()]} ${fin.getFullYear()}`
        : `${lunesVisible.getDate()} ${MESES[lunesVisible.getMonth()]} al ${fin.getDate()} ${MESES[fin.getMonth()]} ${fin.getFullYear()}`;
    }
    if (sub) {
      const esActual = esMismoDia(lunesVisible, lunesDe(new Date()));
      sub.innerHTML = esActual
        ? '<span class="semana-actual-tag">SEMANA ACTUAL</span>'
        : 'Semana del ' + ddmm(lunesVisible);
    }
    marcaColumnaHoy();
  }

  // Franja vertical sobre la columna del dia actual
  function marcaColumnaHoy() {
    const body = document.getElementById('gridBody');
    if (!body) return;
    const previa = body.querySelector('.col-hoy-marca');
    if (previa) previa.remove();
    const hoy = aMedianoche(new Date());
    let idx = -1;
    for (let i = 0; i < 6; i++) if (esMismoDia(sumarDias(lunesVisible, i), hoy)) idx = i;
    if (idx < 0) return;
    const ancho = (body.offsetWidth - 120) / 6;
    if (!(ancho > 0)) return;
    const marca = document.createElement('div');
    marca.className = 'col-hoy-marca';
    marca.style.left = `${120 + idx * ancho}px`;
    marca.style.width = `${ancho}px`;
    body.appendChild(marca);
  }

  /* ---------- datos ---------- */
  // Convierte el error tecnico en algo accionable para quien usa la pagina.
  function motivo(err) {
    const txt = String((err && err.message) || err || '');
    if (!navigator.onLine || /failed to fetch|networkerror|load failed/i.test(txt)) {
      return 'Sin conexion a internet. Revisa tu red y vuelve a intentar; no se perdio lo que escribiste.';
    }
    if (/JWT|apikey|permission|row-level/i.test(txt)) {
      return 'La base rechazo la operacion (permisos). Avisa al administrador. Detalle: ' + txt;
    }
    return txt || 'Error desconocido.';
  }


  async function cargar() {
    if (!sb) return;
    const desde = aISO(lunesVisible);
    const hasta = aISO(sumarDias(lunesVisible, 5));
    try {
      const { data, error } = await sb.from(TABLA).select('*')
        .gte('fecha', desde).lte('fecha', hasta).order('fecha');
      if (error) throw error;
      actividades = data || [];
    } catch (e) {
      console.error('Actividades:', motivo(e));
      actividades = [];
      const cont = document.getElementById('actContador');
      if (cont) cont.textContent = navigator.onLine ? 'No se pudieron cargar las actividades' : 'Sin conexion';
    }
  }

  function pintarActividades() {
    const body = document.getElementById('gridBody');
    if (!body) return;
    pintando = true;
    body.querySelectorAll('.actividad-card').forEach(c => c.remove());

    const filas = filasGrilla();
    const ancho = (body.offsetWidth - 120) / 6;
    let visibles = 0;

    actividades.forEach(a => {
      if (!estaVisible(a)) return;              // docente(s) no seleccionados
      const f = desdeISO(a.fecha);
      let dia = -1;
      for (let i = 0; i < 6; i++) if (esMismoDia(sumarDias(lunesVisible, i), f)) dia = i;
      if (dia < 0) return;

      const ini = minutos(a.start_time || '07:00');
      const fin = Math.max(minutos(a.end_time || ''), ini + 30);
      const y1 = yDe(ini, filas, 'ini');
      const y2 = yDe(fin, filas, 'fin');
      if (y1 == null || y2 == null) return;
      const alto = Math.max(16, y2 - y1);
      const recortada = estaOculto(ini, filas) || estaOculto(fin, filas);

      const quienes = participantesDe(a).join(', ');
      const card = document.createElement('div');
      card.className = 'actividad-card' + (alto < 26 ? ' ac-corta' : '');
      card.style.top = `${y1}px`;
      card.style.height = `${alto}px`;
      card.style.left = `${120 + dia * ancho + 2}px`;
      card.style.width = `${ancho - 6}px`;
      const NL = String.fromCharCode(10);
      card.title = [a.titulo, quienes + ' · ' + (a.start_time || '') + '-' + (a.end_time || ''),
                    a.lugar || null, notaDe(a) || null, enlaceDe(a) || null,
                    recortada ? '(parte del horario cae en franjas que la grilla no muestra)' : null
                   ].filter(Boolean).join(NL);
      if (recortada) card.classList.add('ac-recortada');
      const enlace = enlaceDe(a);
      card.innerHTML =
        (enlace
          ? '<a class="ac-enlace" href="' + esc(enlace) + '" target="_blank" rel="noopener noreferrer" title="Abrir enlace">' +
            '<i class="fas fa-link"></i></a>'
          : '<i class="fas fa-star ac-badge"></i>') +
        '<span class="ac-tit">' + esc(a.titulo) + '</span>' +
        '<span class="ac-meta">' + esc(a.start_time || '') +
        (a.end_time ? '-' + esc(a.end_time) : '') + ' · ' + esc(quienes) +
        (a.lugar ? ' · ' + esc(a.lugar) : '') + '</span>';
      card.onclick = ev => {
        ev.stopPropagation();
        if (ev.target.closest('.ac-enlace')) return;   // el enlace abre su pestaña
        abrirModal(a);
      };
      body.appendChild(card);
      visibles++;
    });

    const cont = document.getElementById('actContador');
    if (cont) {
      const ocultas = actividades.length - visibles;
      cont.textContent = visibles
        ? `${visibles} actividad${visibles === 1 ? '' : 'es'} esta semana` +
          (ocultas ? ` (${ocultas} de docentes no seleccionados)` : '')
        : (ocultas ? `${ocultas} actividad${ocultas === 1 ? '' : 'es'} oculta${ocultas === 1 ? '' : 's'}: elige a su docente` : '');
    }
    marcaColumnaHoy();
    pintando = false;
  }

  async function refrescar() {
    pintarCabecera();
    await cargar();
    pintarActividades();
  }

  /* ---------- modal ---------- */
  function construirModal() {
    if (document.getElementById('actModal')) return;
    const m = document.createElement('div');
    m.className = 'act-modal';
    m.id = 'actModal';
    m.innerHTML =
      '<div class="act-box">' +
        '<div class="act-head"><i class="fas fa-calendar-day"></i>' +
          '<h3 id="actTitulo">Nueva actividad</h3>' +
          '<button class="act-cerrar" id="actCerrar"><i class="fas fa-xmark"></i></button></div>' +
        '<div class="act-body">' +
          '<div class="act-aviso" id="actAviso"></div>' +
          '<div class="act-campo"><label>¿Para quién? <span class="act-resumen" id="actResumen"></span></label>' +
            '<div class="act-personas" id="actPersonas"></div></div>' +
          '<div class="act-campo"><label>Actividad</label>' +
            '<input type="text" id="actNombre" placeholder="Ej: Reunión de coordinación" maxlength="80"></div>' +
          '<div class="act-campo"><label>Horarios</label>' +
            '<div class="act-hor-cab"><span>Fecha</span><span>Desde</span><span>Hasta</span><span></span></div>' +
            '<div id="actHorarios"></div>' +
            '<button type="button" class="act-mini" id="actAgregarHorario">' +
              '<i class="fas fa-plus"></i> Agregar otro horario</button></div>' +
          '<div class="act-campo"><label>Repetir</label>' +
            '<select id="actRepetir">' +
              '<option value="no">No se repite</option>' +
              '<option value="semanas">Cada semana, durante N semanas</option>' +
              '<option value="hasta">Cada semana, hasta una fecha</option>' +
            '</select>' +
            '<div class="act-rep-extra" id="actRepSemanas">' +
              '<input type="number" id="actSemanas" min="2" max="' + MAX_SEMANAS + '" value="4">' +
              '<span>semanas (contando la primera)</span></div>' +
            '<div class="act-rep-extra" id="actRepHasta">' +
              '<span>Hasta el</span><input type="date" id="actHasta"></div>' +
            '<div class="act-rep-resumen" id="actRepResumen"></div></div>' +
          '<div class="act-campo"><label>Enlace (opcional)</label>' +
            '<div class="act-enlace-fila">' +
              '<input type="url" id="actEnlace" placeholder="Ej: https://meet.google.com/..." maxlength="500">' +
              '<a class="act-mini" id="actAbrirEnlace" target="_blank" rel="noopener noreferrer" title="Abrir enlace">' +
                '<i class="fas fa-arrow-up-right-from-square"></i></a></div></div>' +
          '<div class="act-campo"><label>Lugar (opcional)</label>' +
            '<input type="text" id="actLugar" placeholder="Ej: Sala 2 / Virtual" maxlength="60"></div>' +
          '<div class="act-campo"><label>Nota (opcional)</label>' +
            '<textarea id="actNota" maxlength="200" placeholder="Detalle breve..."></textarea></div>' +
        '</div>' +
        '<div class="act-pie">' +
          '<button class="act-btn act-guardar" id="actGuardar"><i class="fas fa-floppy-disk"></i> Guardar</button>' +
          '<button class="act-btn act-eliminar" id="actEliminar" style="display:none" title="Eliminar solo esta"><i class="fas fa-trash"></i></button>' +
          '<button class="act-btn act-eliminar" id="actEliminarSerie" style="display:none"><i class="fas fa-trash-can"></i> Serie</button>' +
          '<button class="act-btn act-cancelar" id="actCancelar">Cancelar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);

    document.getElementById('actCerrar').onclick = cerrarModal;
    document.getElementById('actCancelar').onclick = cerrarModal;
    document.getElementById('actGuardar').onclick = guardar;
    document.getElementById('actEliminar').onclick = eliminar;
    document.getElementById('actEliminarSerie').onclick = eliminarSerie;
    document.getElementById('actAgregarHorario').onclick = () => {
      const filas = leerHorarios();
      const ult = filas[filas.length - 1];
      agregarHorario(ult && ult.fecha ? aISO(sumarDias(desdeISO(ult.fecha), 1)) : aISO(diaSugerido()),
                     ult ? ult.ini : '09:00', ult ? ult.fin : '10:00');
      actualizarRepeticion();
    };
    document.getElementById('actRepetir').onchange = actualizarRepeticion;
    ['actSemanas', 'actHasta'].forEach(id =>
      document.getElementById(id).addEventListener('input', actualizarRepeticion));
    document.getElementById('actEnlace').addEventListener('input', actualizarBotonEnlace);
    m.addEventListener('click', e => { if (e.target === m) cerrarModal(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && m.classList.contains('abierto')) cerrarModal();
    });
  }

  // Seleccion multiple: se puede marcar a varios docentes a la vez.
  function pintarPersonas(sel) {
    const elegidos = new Set(Array.isArray(sel) ? sel : (sel ? [sel] : []));
    const cont = document.getElementById('actPersonas');
    cont.innerHTML = personas().map(p =>
      `<button type="button" class="act-persona${elegidos.has(p) ? ' sel' : ''}" data-p="${esc(p)}">` +
      `<i class="fas fa-check"></i>${esc(p)}</button>`
    ).join('');
    cont.querySelectorAll('.act-persona').forEach(b => {
      b.onclick = () => { b.classList.toggle('sel'); actualizarResumen(); };
    });
    actualizarResumen();
  }
  function elegidosActuales() {
    return [...document.querySelectorAll('#actPersonas .act-persona.sel')].map(b => b.dataset.p);
  }
  function actualizarResumen() {
    const r = document.getElementById('actResumen');
    if (!r) return;
    const n = elegidosActuales().length;
    r.textContent = n === 0 ? 'Ninguno seleccionado'
      : n === 1 ? '1 docente' : `${n} docentes`;
  }

  /* ---------- horarios (fecha + desde/hasta) ---------- */
  function agregarHorario(fecha, ini, fin) {
    const cont = document.getElementById('actHorarios');
    const fila = document.createElement('div');
    fila.className = 'act-hor-fila';
    fila.innerHTML =
      '<input type="date" class="ah-fecha">' +
      '<input type="time" class="ah-ini" step="900">' +
      '<input type="time" class="ah-fin" step="900">' +
      '<button type="button" class="act-hor-quitar" title="Quitar este horario"><i class="fas fa-xmark"></i></button>';
    fila.querySelector('.ah-fecha').value = fecha || '';
    fila.querySelector('.ah-ini').value = ini || '';
    fila.querySelector('.ah-fin').value = fin || '';
    fila.querySelector('.ah-fecha').addEventListener('input', actualizarRepeticion);
    fila.querySelector('.act-hor-quitar').onclick = () => {
      if (cont.children.length > 1) fila.remove();
      actualizarQuitar();
      actualizarRepeticion();
    };
    cont.appendChild(fila);
    actualizarQuitar();
  }
  // Siempre debe quedar al menos un horario
  function actualizarQuitar() {
    const filas = document.querySelectorAll('#actHorarios .act-hor-fila');
    filas.forEach(f => { f.querySelector('.act-hor-quitar').style.visibility = filas.length > 1 ? 'visible' : 'hidden'; });
  }
  function leerHorarios() {
    return [...document.querySelectorAll('#actHorarios .act-hor-fila')].map(f => ({
      fecha: f.querySelector('.ah-fecha').value,
      ini: f.querySelector('.ah-ini').value,
      fin: f.querySelector('.ah-fin').value
    }));
  }

  // Devuelve {semanas} para "N semanas", {hasta} para "hasta fecha" o {} si no se repite.
  function leerRepeticion() {
    const modo = document.getElementById('actRepetir').value;
    if (modo === 'semanas') return { semanas: parseInt(document.getElementById('actSemanas').value, 10) || 0 };
    if (modo === 'hasta') return { hasta: document.getElementById('actHasta').value };
    return {};
  }
  // Expande cada horario en sus fechas semanales. Devuelve {fechas:[{fecha,ini,fin}]} o {error}.
  function ocurrencias(horarios, rep) {
    if (rep.semanas !== undefined && (rep.semanas < 2 || rep.semanas > MAX_SEMANAS)) {
      return { error: `El número de semanas debe estar entre 2 y ${MAX_SEMANAS}.` };
    }
    if (rep.hasta !== undefined && !rep.hasta) return { error: 'Indica hasta qué fecha se repite.' };
    const fechas = [];
    for (const h of horarios) {
      if (!h.fecha) continue;
      const base = desdeISO(h.fecha);
      if (rep.hasta !== undefined) {
        const tope = desdeISO(rep.hasta);
        if (tope < base) return { error: `La fecha "hasta" es anterior al horario del ${ddmm(base)}.` };
        for (let w = 0; w < MAX_SEMANAS; w++) {
          const f = sumarDias(base, 7 * w);
          if (f > tope) break;
          fechas.push({ fecha: aISO(f), ini: h.ini, fin: h.fin });
        }
      } else {
        const n = rep.semanas || 1;
        for (let w = 0; w < n; w++) fechas.push({ fecha: aISO(sumarDias(base, 7 * w)), ini: h.ini, fin: h.fin });
      }
    }
    fechas.sort((a, b) => (a.fecha + a.ini).localeCompare(b.fecha + b.ini));
    if (fechas.length > MAX_FILAS) return { error: `Serían ${fechas.length} actividades; el máximo es ${MAX_FILAS}.` };
    return { fechas };
  }
  function actualizarRepeticion() {
    const modo = document.getElementById('actRepetir').value;
    document.getElementById('actRepSemanas').classList.toggle('ver', modo === 'semanas');
    document.getElementById('actRepHasta').classList.toggle('ver', modo === 'hasta');
    const res = document.getElementById('actRepResumen');
    const horarios = leerHorarios().filter(h => h.fecha);
    const r = ocurrencias(horarios, leerRepeticion());
    if (r.error) { res.textContent = r.error; res.className = 'act-rep-resumen ver err'; return; }
    const n = r.fechas.length;
    if (n <= 1) { res.className = 'act-rep-resumen'; return; }
    const primera = desdeISO(r.fechas[0].fecha), ultima = desdeISO(r.fechas[n - 1].fecha);
    res.textContent = `Se ${editandoId ? 'guardarán' : 'crearán'} ${n} actividades, del ${ddmm(primera)} al ${ddmm(ultima)}/${ultima.getFullYear()}.`;
    res.className = 'act-rep-resumen ver';
  }
  function actualizarBotonEnlace() {
    const url = normalizarEnlace(document.getElementById('actEnlace').value);
    const b = document.getElementById('actAbrirEnlace');
    if (url) { b.href = url; b.style.display = 'inline-flex'; }
    else { b.removeAttribute('href'); b.style.display = 'none'; }
  }

  // Muestra "Eliminar serie" si la actividad tiene hermanas repetidas
  async function revisarSerie(act) {
    const btn = document.getElementById('actEliminarSerie');
    btn.style.display = 'none';
    if (!act || !sb) return;
    try {
      const { data, error } = await sb.from(TABLA).select('id').like('id', serieDe(act.id) + '%');
      if (error) throw error;
      const n = (data || []).length;
      if (n > 1 && editandoId === act.id) {
        btn.innerHTML = `<i class="fas fa-trash-can"></i> Serie (${n})`;
        btn.title = `Eliminar las ${n} actividades de esta serie`;
        btn.dataset.n = n;
        btn.style.display = 'inline-flex';
      }
    } catch (e) { /* sin el boton de serie no se pierde nada */ }
  }

  function aviso(txt, tipo) {
    const a = document.getElementById('actAviso');
    a.className = 'act-aviso ver ' + (tipo || 'err');
    a.textContent = txt;
  }
  const limpiarAviso = () => { document.getElementById('actAviso').className = 'act-aviso'; };

  function abrirModal(act) {
    construirModal();
    editandoId = act ? act.id : null;
    limpiarAviso();
    document.getElementById('actTitulo').textContent = act ? 'Editar actividad' : 'Nueva actividad';
    document.getElementById('actEliminar').style.display = act ? 'inline-flex' : 'none';
    pintarPersonas(act ? participantesDe(act) : []);
    document.getElementById('actNombre').value = act ? act.titulo : '';
    document.getElementById('actHorarios').innerHTML = '';
    agregarHorario(act ? act.fecha : aISO(diaSugerido()),
                   act ? (act.start_time || '') : '09:00',
                   act ? (act.end_time || '') : '10:00');
    document.getElementById('actRepetir').value = 'no';
    document.getElementById('actSemanas').value = 4;
    document.getElementById('actHasta').value = '';
    actualizarRepeticion();
    document.getElementById('actEnlace').value = act ? enlaceDe(act) : '';
    actualizarBotonEnlace();
    document.getElementById('actLugar').value  = act ? (act.lugar || '') : '';
    document.getElementById('actNota').value   = act ? notaDe(act) : '';
    revisarSerie(act);
    document.getElementById('actModal').classList.add('abierto');
    setTimeout(() => document.getElementById('actNombre').focus(), 40);
  }
  // Si la semana visible contiene hoy, propone hoy; si no, el lunes de esa semana.
  function diaSugerido() {
    const hoy = aMedianoche(new Date());
    for (let i = 0; i < 6; i++) if (esMismoDia(sumarDias(lunesVisible, i), hoy)) return hoy;
    return lunesVisible;
  }
  function cerrarModal() {
    const m = document.getElementById('actModal');
    if (m) m.classList.remove('abierto');
    editandoId = null;
  }

  async function guardar() {
    const sel = elegidosActuales();
    const titulo = document.getElementById('actNombre').value.trim();
    const horarios = leerHorarios();

    if (!sel.length) return aviso('Elige al menos un docente para la actividad.');
    if (!titulo) return aviso('Escribe el nombre de la actividad.');
    for (const [i, h] of horarios.entries()) {
      const cual = horarios.length > 1 ? ` (horario ${i + 1})` : '';
      if (!h.fecha) return aviso('Indica la fecha' + cual + '.');
      if (!h.ini || !h.fin) return aviso('Indica la hora de inicio y de fin' + cual + '.');
      if (minutos(h.fin) <= minutos(h.ini)) return aviso('La hora de fin debe ser posterior a la de inicio' + cual + '.');
    }
    const enlace = normalizarEnlace(document.getElementById('actEnlace').value);
    if (enlace === null) return aviso('El enlace no es válido. Usa una dirección web, por ejemplo https://...');
    const r = ocurrencias(horarios, leerRepeticion());
    if (r.error) return aviso(r.error);
    if (!r.fechas.length) return aviso('Agrega al menos un horario.');
    if (r.fechas.length > 1 &&
        !confirm(`Se ${editandoId ? 'guardarán' : 'crearán'} ${r.fechas.length} actividades. ¿Continuar?`)) return;

    const comun = {
      user_id: sel[0],          // primer participante (compatibilidad)
      participantes: sel,
      titulo,
      lugar: document.getElementById('actLugar').value.trim() || null
    };
    const nota = document.getElementById('actNota').value.trim();
    // Al editar, la primera fecha actualiza la actividad abierta y el resto se
    // crean como nuevas dentro de la misma serie.
    const base = editandoId ? serieDe(editandoId)
      : 'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const sufijo = Date.now().toString(36);
    const construir = conColumna => r.fechas.map((f, i) => Object.assign({}, comun, {
      id: i === 0 ? (editandoId || base) : `${base}__${sufijo}${i}`,
      fecha: f.fecha, start_time: f.ini, end_time: f.fin,
      nota: (conColumna || !enlace ? nota : [nota, PREFIJO_ENLACE + enlace].filter(Boolean).join('\n')) || null
    }, conColumna ? { enlace: enlace || null } : {}));

    const btn = document.getElementById('actGuardar');
    btn.disabled = true;
    try {
      let { error } = await sb.from(TABLA).upsert(construir(!sinColumnaEnlace), { onConflict: 'id' });
      // La tabla aun no tiene la columna 'enlace': se guarda dentro de la nota.
      if (error && !sinColumnaEnlace && /enlace/i.test(error.message || '')) {
        sinColumnaEnlace = true;
        ({ error } = await sb.from(TABLA).upsert(construir(false), { onConflict: 'id' }));
      }
      if (error) throw error;
    } catch (e) {
      btn.disabled = false;
      return aviso('No se pudo guardar. ' + motivo(e));
    }
    btn.disabled = false;

    // Si la actividad quedo en otra semana, saltamos a esa semana para que se vea.
    const dest = lunesDe(desdeISO(r.fechas[0].fecha));
    if (!esMismoDia(dest, lunesVisible)) lunesVisible = dest;
    cerrarModal();
    await refrescar();
  }

  async function eliminar() {
    if (!editandoId) return;
    if (!confirm('¿Eliminar esta actividad para todos?')) return;
    try {
      const { error } = await sb.from(TABLA).delete().eq('id', editandoId);
      if (error) throw error;
    } catch (e) {
      return aviso('No se pudo eliminar. ' + motivo(e));
    }
    cerrarModal();
    await refrescar();
  }

  async function eliminarSerie() {
    if (!editandoId) return;
    const n = document.getElementById('actEliminarSerie').dataset.n || 'todas las';
    if (!confirm(`¿Eliminar las ${n} actividades de esta serie para todos?`)) return;
    try {
      const { error } = await sb.from(TABLA).delete().like('id', serieDe(editandoId) + '%');
      if (error) throw error;
    } catch (e) {
      return aviso('No se pudo eliminar la serie. ' + motivo(e));
    }
    cerrarModal();
    await refrescar();
  }

  /* ---------- arranque ---------- */
  function iniciar() {
    if (!window.supabase || !window.supabase.createClient) {
      console.warn('Actividades: falta supabase-js');
      return;
    }
    // Sin sesion propia: horario.js ya crea su cliente y compartir el storage
    // de auth dispara el aviso 'Multiple GoTrueClient instances'.
    sb = window.supabase.createClient(SB_URL, SB_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: 'cot-actividades' }
    });
    lunesVisible = lunesDe(new Date());
    construirBarra();
    construirModal();
    refrescar();

    // La grilla se redibuja al cambiar filtros o docentes: hay que repintar encima.
    const body = document.getElementById('gridBody');
    if (body) {
      let t = null;
      new MutationObserver(muts => {
        if (pintando) return;
        const propio = muts.every(m =>
          [...m.addedNodes, ...m.removedNodes].every(n =>
            n.nodeType === 1 && (n.classList.contains('actividad-card') || n.classList.contains('col-hoy-marca'))));
        if (propio) return;
        clearTimeout(t);
        t = setTimeout(pintarActividades, 120);
      }).observe(body, { childList: true });
    }
    let r = null;
    window.addEventListener('resize', () => { clearTimeout(r); r = setTimeout(pintarActividades, 150); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
