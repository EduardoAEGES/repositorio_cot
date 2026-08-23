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

  const PERSONAS_FALLBACK = ['EDUARDO', 'JOSÉ', 'JORGE', 'CARLOS', 'MIRKO', 'LUIS'];
  const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];

  let sb = null;
  let actividades = [];       // actividades de la semana visible
  let lunesVisible = null;    // Date del lunes de la semana mostrada
  let editandoId = null;
  let pintando = false;       // evita que el observer se dispare con lo nuestro

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

  const esc = s => String(s == null ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function personas() {
    try {
      const g = JSON.parse(localStorage.getItem('cot_groups') || '{}');
      if (g && Array.isArray(g.PTC) && g.PTC.length) return g.PTC;
    } catch (e) { /* usa el fallback */ }
    return PERSONAS_FALLBACK;
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

      const card = document.createElement('div');
      card.className = 'actividad-card' + (alto < 26 ? ' ac-corta' : '');
      card.style.top = `${y1}px`;
      card.style.height = `${alto}px`;
      card.style.left = `${120 + dia * ancho + 2}px`;
      card.style.width = `${ancho - 6}px`;
      card.title = `${a.titulo}\n${a.user_id} · ${a.start_time || ''}-${a.end_time || ''}` +
                   (a.lugar ? `\n${a.lugar}` : '') + (a.nota ? `\n${a.nota}` : '');
      if (recortada) card.classList.add('ac-recortada');
      card.innerHTML =
        '<i class="fas fa-star ac-badge"></i>' +
        `<span class="ac-tit">${esc(a.titulo)}</span>` +
        `<span class="ac-meta">${esc(a.start_time || '')}${a.end_time ? '-' + esc(a.end_time) : ''} · ${esc(a.user_id)}` +
        `${a.lugar ? ' · ' + esc(a.lugar) : ''}</span>`;
      card.onclick = ev => { ev.stopPropagation(); abrirModal(a); };
      body.appendChild(card);
      visibles++;
    });

    const cont = document.getElementById('actContador');
    if (cont) cont.textContent = visibles ? `${visibles} actividad${visibles === 1 ? '' : 'es'} esta semana` : '';
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
          '<div class="act-campo"><label>¿Para quién?</label>' +
            '<div class="act-personas" id="actPersonas"></div></div>' +
          '<div class="act-campo"><label>Actividad</label>' +
            '<input type="text" id="actNombre" placeholder="Ej: Reunión de coordinación" maxlength="80"></div>' +
          '<div class="act-campo"><label>Fecha</label>' +
            '<input type="date" id="actFecha"></div>' +
          '<div class="act-fila">' +
            '<div class="act-campo"><label>Desde</label><input type="time" id="actInicio" step="900"></div>' +
            '<div class="act-campo"><label>Hasta</label><input type="time" id="actFin" step="900"></div>' +
          '</div>' +
          '<div class="act-campo"><label>Lugar (opcional)</label>' +
            '<input type="text" id="actLugar" placeholder="Ej: Sala 2 / Virtual" maxlength="60"></div>' +
          '<div class="act-campo"><label>Nota (opcional)</label>' +
            '<textarea id="actNota" maxlength="200" placeholder="Detalle breve..."></textarea></div>' +
        '</div>' +
        '<div class="act-pie">' +
          '<button class="act-btn act-guardar" id="actGuardar"><i class="fas fa-floppy-disk"></i> Guardar</button>' +
          '<button class="act-btn act-eliminar" id="actEliminar" style="display:none"><i class="fas fa-trash"></i></button>' +
          '<button class="act-btn act-cancelar" id="actCancelar">Cancelar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);

    document.getElementById('actCerrar').onclick = cerrarModal;
    document.getElementById('actCancelar').onclick = cerrarModal;
    document.getElementById('actGuardar').onclick = guardar;
    document.getElementById('actEliminar').onclick = eliminar;
    m.addEventListener('click', e => { if (e.target === m) cerrarModal(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && m.classList.contains('abierto')) cerrarModal();
    });
  }

  function pintarPersonas(sel) {
    const cont = document.getElementById('actPersonas');
    cont.innerHTML = personas().map(p =>
      `<button type="button" class="act-persona${p === sel ? ' sel' : ''}" data-p="${esc(p)}">${esc(p)}</button>`
    ).join('');
    cont.querySelectorAll('.act-persona').forEach(b => {
      b.onclick = () => {
        cont.querySelectorAll('.act-persona').forEach(x => x.classList.remove('sel'));
        b.classList.add('sel');
      };
    });
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
    pintarPersonas(act ? act.user_id : personas()[0]);
    document.getElementById('actNombre').value = act ? act.titulo : '';
    document.getElementById('actFecha').value  = act ? act.fecha : aISO(diaSugerido());
    document.getElementById('actInicio').value = act ? (act.start_time || '') : '09:00';
    document.getElementById('actFin').value    = act ? (act.end_time || '') : '10:00';
    document.getElementById('actLugar').value  = act ? (act.lugar || '') : '';
    document.getElementById('actNota').value   = act ? (act.nota || '') : '';
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
    const sel = document.querySelector('#actPersonas .act-persona.sel');
    const titulo = document.getElementById('actNombre').value.trim();
    const fecha = document.getElementById('actFecha').value;
    const ini = document.getElementById('actInicio').value;
    const fin = document.getElementById('actFin').value;

    if (!sel) return aviso('Elige para quién es la actividad.');
    if (!titulo) return aviso('Escribe el nombre de la actividad.');
    if (!fecha) return aviso('Indica la fecha.');
    if (!ini || !fin) return aviso('Indica la hora de inicio y de fin.');
    if (minutos(fin) <= minutos(ini)) return aviso('La hora de fin debe ser posterior a la de inicio.');

    const btn = document.getElementById('actGuardar');
    btn.disabled = true;
    const fila = {
      id: editandoId || ('act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
      user_id: sel.dataset.p,
      titulo, fecha, start_time: ini, end_time: fin,
      lugar: document.getElementById('actLugar').value.trim() || null,
      nota: document.getElementById('actNota').value.trim() || null
    };
    try {
      const { error } = await sb.from(TABLA).upsert(fila, { onConflict: 'id' });
      if (error) throw error;
    } catch (e) {
      btn.disabled = false;
      return aviso('No se pudo guardar. ' + motivo(e));
    }
    btn.disabled = false;

    // Si la actividad quedo en otra semana, saltamos a esa semana para que se vea.
    const dest = lunesDe(desdeISO(fecha));
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
