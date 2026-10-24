/* ===== Monitoreo de secciones: por sede y dia, con registro de ingreso =====
   Todas las clases (curso, seccion, NRC, docente, aula, horario) que arma
   tools/actualizar_secciones.py en secciones.json a partir de CARGA_HORARIA y
   el Portal de Horarios. Por cada clase del dia se marca el ingreso del docente
   (Puntual / Tardanza / Inasistencia) y se puede comentar (libre o un momento
   del monitoreo). Lo marcado queda como borrador en este dispositivo hasta
   pulsar «Enviar reporte», que pide el nombre y lo guarda todo en Supabase
   (asistencia_secciones). Una clase enviada solo cambia de decision con un
   sustento, y la base deja el cambio en el historial. */
(function () {
  'use strict';

  const SB_URL = 'https://klmjmlhwuzhymrplemgw.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsbWptbGh3dXpoeW1ycGxlbWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTMyNjQsImV4cCI6MjA4NzE2OTI2NH0.xFWMvUJa9n9TBcBG1WSeqCGiWBaCAtCU9aY7GXk4W6E';
  const SB_HEAD = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };
  const TABLA = SB_URL + '/rest/v1/asistencia_secciones';
  const TABLA_MAN = SB_URL + '/rest/v1/secciones_manuales';
  const TABLA_AJU = SB_URL + '/rest/v1/secciones_ajustes';
  // Un color por hora de inicio (07:00, 08:30, ...), el mismo todos los dias
  const COLORES = ['#38bdf8', '#c084fc', '#fb7185', '#facc15', '#4ade80', '#f472b6', '#2dd4bf', '#fb923c', '#818cf8', '#a3e635'];
  const AUTOR_KEY = 'cot_autor';
  const LS = 'cot_secciones_filtros';
  const BORRADOR_KEY = 'cot_secciones_borrador';   // { fecha: { "nrc|ini": {estado, comentario, tipo} } }

  const DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];
  const DIA_LABEL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const ESTADOS = ['PUNTUAL', 'TARDANZA', 'INASISTENCIA'];
  const ESTADO_LABEL = { PUNTUAL: 'Puntual', TARDANZA: 'Tardanza', INASISTENCIA: 'Inasistencia' };
  const TIPOS = { '': 'Comentario libre', PANTALLA: 'Monitoreo de pantalla', INICIO: 'Monitoreo de inicio de clase',
    BREAK: 'Monitoreo de break', CIERRE: 'Monitoreo de cierre' };
  const TURNO_LABEL = { M: 'Mañana', T: 'Tarde', N: 'Noche', D: 'Diurno' };

  let construido = false;
  let DATOS = null;          // { generado, clases: [...] }
  let REG = new Map();       // "nrc|ini" -> fila de asistencia_secciones (fecha elegida)
  let MANUALES = [];         // secciones agregadas a mano (secciones_manuales), todas las semanas
  let AJUSTES = new Map();   // claveOrig -> correccion de curso/aula/docente/sede (secciones_ajustes)
  let HORAS = [];            // horas de inicio de todo el periodo, ordenadas (para el color)
  let refresco = null;
  const hoyIdx = () => (new Date().getDay() + 6) % 7;   // 0 = lunes
  let filtros = Object.assign({ dia: hoyIdx(), q: '', vista: 'piso', turno: '', sede: '', lugar: '', hora: '' }, leerFiltros());
  filtros.dia = hoyIdx();    // siempre abre en el dia de hoy

  const esc = s => String(s == null ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s == null ? '' : s).trim().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  const hm = h => String(h || '').slice(0, 5);
  const clave = c => c.nrc + '|' + c.ini;
  const claveOrig = c => [c.nrc, c.seccion, c.dia, hm(c.ini)].join('|');
  const colorHora = ini => COLORES[Math.max(0, HORAS.indexOf(hm(ini))) % COLORES.length];
  const turnoDe = sec => { const m = String(sec || '').trim().toUpperCase().match(/([MTND])$/); return m ? m[1] : ''; };
  const pisoDe = aula => { const m = String(aula || '').match(/^[A-Za-z]*-?(\d)/); return m ? m[1] : ''; };
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const ddmm = d => String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
  const parseFecha = s => { const p = String(s || '').split('/'); return p.length === 3 ? new Date(+p[2], p[1] - 1, +p[0]) : null; };

  function leerFiltros() {
    try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; }
  }
  function guardarFiltros() {
    try { localStorage.setItem(LS, JSON.stringify(filtros)); } catch (e) { /* sin persistencia */ }
  }

  // Fecha real del dia elegido dentro de la semana actual
  function fechaDia(idx) {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - hoyIdx() + idx);
    return d;
  }
  const fechaSel = () => iso(fechaDia(filtros.dia));
  const esHoy = () => filtros.dia === hoyIdx();
  const minutos = h => { const [a, b] = hm(h).split(':'); return (+a || 0) * 60 + (+b || 0); };
  const enCurso = c => {
    if (!esHoy()) return false;
    const n = new Date(), m = n.getHours() * 60 + n.getMinutes();
    return minutos(c.ini) <= m && m < minutos(c.fin);
  };

  /* ---------- nombre de quien reporta ---------- */
  // Se escribe al enviar el reporte y se recuerda en este dispositivo
  function nombreGuardado() {
    try { return (localStorage.getItem(AUTOR_KEY) || '').trim(); } catch (e) { return ''; }
  }
  function recordarNombre(n) {
    try { localStorage.setItem(AUTOR_KEY, n); } catch (e) { /* sin persistencia */ }
  }
  // Campo de nombre para las ventanas que guardan directo (solo si aun no se conoce)
  const campoNombre = () => nombreGuardado() ? '' :
    '<label for="scNombre">Tu nombre</label><input id="scNombre" placeholder="Quién registra" autocomplete="name">';
  function tomarNombre() {
    const el = document.getElementById('scNombre');
    const n = el ? el.value.trim() : nombreGuardado();
    if (n) recordarNombre(n);
    return n;
  }

  /* ---------- borrador (lo marcado y aun no enviado) ---------- */
  function leerBorradores() {
    try { return JSON.parse(localStorage.getItem(BORRADOR_KEY)) || {}; } catch (e) { return {}; }
  }
  const borrador = () => leerBorradores()[fechaSel()] || {};
  function ponerBorrador(k, cambios) {
    const todo = leerBorradores(), f = fechaSel();
    const fila = Object.assign({}, (todo[f] || {})[k], cambios);
    Object.keys(fila).forEach(x => { if (fila[x] == null || fila[x] === '') delete fila[x]; });
    todo[f] = todo[f] || {};
    if (Object.keys(fila).length) todo[f][k] = fila; else delete todo[f][k];
    if (!Object.keys(todo[f]).length) delete todo[f];
    try { localStorage.setItem(BORRADOR_KEY, JSON.stringify(todo)); } catch (e) { /* sin persistencia */ }
  }
  // Estado visible de una clase: lo guardado en la base + el borrador encima
  function estadoDe(c) {
    const r = REG.get(clave(c)) || {};
    const b = borrador()[clave(c)] || {};
    return {
      r, enviado: !!r.confirmado, pendiente: Object.keys(b).length > 0,
      estado: b.estado || r.estado || '',
      comentario: 'comentario' in b ? b.comentario : (r.comentario || ''),
      tipo: 'tipo' in b ? b.tipo : (r.tipo_comentario || '')
    };
  }

  /* ---------- datos ---------- */
  async function cargarClases() {
    const r = await fetch('secciones.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('No se encontró secciones.json (HTTP ' + r.status + '). Ejecuta tools/actualizar_secciones.py');
    DATOS = await r.json();
    HORAS = [...new Set(DATOS.clases.map(c => hm(c.ini)))].sort();
  }
  async function cargarAjustes() {
    const r = await fetch(TABLA_AJU + '?select=*', { headers: SB_HEAD, cache: 'no-store' });
    if (!r.ok) throw new Error('Supabase: HTTP ' + r.status);
    AJUSTES = new Map((await r.json()).map(a => [a.clave, a]));
  }
  // Aplica la correccion manual (si hay) y guarda los datos originales
  function conAjuste(c) {
    if (c.manual) return c;
    const a = AJUSTES.get(claveOrig(c));
    if (!a || !['curso', 'aula', 'sede', 'docente'].some(k => a[k])) return c;
    const orig = { curso: c.curso, aula: c.aula, sede: c.sede, docente: c.docente };
    return Object.assign({}, c, {
      curso: a.curso || c.curso, aula: a.aula || c.aula, sede: a.sede || c.sede, docente: a.docente || c.docente,
      ajuste: a, orig
    });
  }
  async function cargarManuales() {
    const r = await fetch(TABLA_MAN + '?select=*&activo=eq.true&order=ini', { headers: SB_HEAD, cache: 'no-store' });
    if (!r.ok) throw new Error('Supabase: HTTP ' + r.status);
    MANUALES = (await r.json()).map(m => ({
      manual: true, mid: m.id, nrc: m.nrc || 'M' + m.id, curso: m.curso, seccion: m.seccion,
      docente: m.docente, dni: m.dni_docente, sede: m.sede, aula: m.modalidad === 'VIRTUAL' ? 'Virtual' : m.aula,
      modalidad: m.modalidad, dia: m.dia, ini: m.ini, fin: m.fin, desde: '', hasta: '', creado_por: m.creado_por
    }));
  }
  async function cargarRegistros() {
    const r = await fetch(TABLA + '?select=*&fecha=eq.' + fechaSel(), { headers: SB_HEAD, cache: 'no-store' });
    if (!r.ok) throw new Error('Supabase: HTTP ' + r.status);
    REG = new Map((await r.json()).map(f => [f.nrc + '|' + f.ini, f]));
  }

  // Clases del dia elegido, vigentes en esa fecha
  function delDia() {
    const f = fechaDia(filtros.dia);
    return (DATOS ? DATOS.clases : []).concat(MANUALES).filter(c => {
      if (c.dia !== DIAS[filtros.dia]) return false;
      const a = parseFecha(c.desde), b = parseFecha(c.hasta);
      return (!a || a <= f) && (!b || f <= b);
    }).map(conAjuste);
  }
  // Piso N / Laboratorios / Otros ambientes / Aula por confirmar / Virtual
  function lugarDe(c) {
    if (c.aula === 'Virtual' || c.sede === 'VIRTUAL' || c.modalidad === 'VIRTUAL') return 'Virtual';
    if (!c.aula) return 'Aula por confirmar';
    if (/^L/i.test(c.aula)) return 'Laboratorios';
    return pisoDe(c.aula) ? 'Piso ' + pisoDe(c.aula) : 'Otros ambientes';
  }
  const pesoLugar = l => /Virtual$/.test(l) ? 4 : /Aula por confirmar$/.test(l) ? 3 : /Otros ambientes$/.test(l) ? 2 : /Laboratorios$/.test(l) ? 1 : 0;
  // sin: filtro que no se aplica (para contar las opciones de ese mismo filtro)
  function pasa(c, sin) {
    if (filtros.turno && turnoDe(c.seccion) !== filtros.turno) return false;
    if (filtros.sede && c.sede !== filtros.sede) return false;
    if (sin !== 'lugar' && filtros.lugar && lugarDe(c) !== filtros.lugar) return false;
    if (sin !== 'hora' && filtros.hora && hm(c.ini) !== filtros.hora) return false;
    const q = norm(filtros.q);
    if (!q) return true;
    const t = norm([c.sede + '-' + c.aula, c.curso, c.docente, c.seccion, c.nrc, c.dni].join(' '));
    return q.split(/\s+/).every(p => t.includes(p));
  }
  function grupoDe(c) {
    switch (filtros.vista) {
      case 'sede': return c.sede || 'Sin sede';
      case 'curso': return c.curso || 'Sin curso';
      case 'docente': return c.docente || 'Sin docente';
      case 'hora': return hm(c.ini) + '–' + hm(c.fin);
      default: {
        const lugar = lugarDe(c);
        if (lugar === 'Virtual') return 'Virtual';
        return (filtros.sede || !c.sede ? '' : c.sede + ' · ') + lugar;
      }
    }
  }

  /* ---------- panel ---------- */
  function construir() {
    if (construido) return;
    construido = true;
    const ov = document.createElement('div');
    ov.className = 'sc-overlay';
    ov.id = 'scOverlay';
    ov.innerHTML =
      '<div class="sc-top"><div class="sc-top-in">' +
        '<h2>Monitoreo de secciones<small id="scSub"></small></h2>' +
        '<span class="sc-reloj" id="scReloj"></span>' +
        '<button class="sc-enviar" id="scEnviar" title="Envía todo lo marcado y comentado"><i class="fas fa-paper-plane"></i> Enviar reporte <b id="scPend">0</b></button>' +
        '<button class="sc-cerrar" id="scCerrar" title="Cerrar"><i class="fas fa-xmark"></i></button>' +
      '</div></div>' +
      '<div class="sc-wrap">' +
        '<div class="sc-dias sc-desliza" id="scDias"></div>' +
        '<div class="sc-dias sc-sedes sc-desliza" id="scSedes"></div>' +
        '<div class="sc-barra">' +
          '<input type="text" id="scQ" placeholder="Buscar aula, docente, curso, sección o NRC">' +
          '<select id="scVista"><option value="piso">Por piso</option><option value="sede">Por sede</option>' +
            '<option value="hora">Por horario</option><option value="curso">Por curso</option><option value="docente">Por docente</option></select>' +
          '<select id="scTurno"><option value="">Todos los turnos</option>' +
            Object.keys(TURNO_LABEL).map(t => `<option value="${t}">${TURNO_LABEL[t]}</option>`).join('') + '</select>' +
          '<select id="scLugar" title="Piso o tipo de ambiente"></select>' +
          '<button class="sc-boton sc-agregar" id="scAgregar"><i class="fas fa-plus"></i> Agregar sección</button>' +
          '<button class="sc-boton" id="scCsv"><i class="fas fa-file-csv"></i> Exportar</button>' +
          '<button class="sc-boton" id="scRecargar"><i class="fas fa-rotate"></i> Recargar</button>' +
        '</div>' +
        '<div class="sc-horas sc-desliza" id="scHoras"></div>' +
        '<div id="scResumen"></div>' +
        '<div id="scBody"></div>' +
        '<div class="sc-pie" id="scPie"></div>' +
      '</div>' +
      '<div class="sc-modal" id="scModal"><div class="sc-caja" id="scCaja"></div></div>';
    document.body.appendChild(ov);

    document.getElementById('scCerrar').onclick = cerrar;
    document.getElementById('scEnviar').onclick = abrirEnviar;
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !ov.classList.contains('abierto')) return;
      if (document.getElementById('scModal').classList.contains('abierto')) cerrarModal(); else cerrar();
    });
    const q = document.getElementById('scQ');
    q.value = filtros.q;
    q.addEventListener('input', () => { filtros.q = q.value.trim(); guardarFiltros(); pintar(); });
    [['scVista', 'vista'], ['scTurno', 'turno']].forEach(([id, k]) => {
      const s = document.getElementById(id);
      s.value = filtros[k];
      s.onchange = () => { filtros[k] = s.value; guardarFiltros(); pintar(); };
    });
    document.getElementById('scLugar').onchange = e => { filtros.lugar = e.target.value; guardarFiltros(); pintar(); };
    document.getElementById('scCsv').onclick = exportar;
    document.getElementById('scAgregar').onclick = abrirAgregar;
    document.getElementById('scRecargar').onclick = () => cargar(true);
    document.getElementById('scModal').addEventListener('click', e => { if (e.target.id === 'scModal') cerrarModal(); });
    document.getElementById('scBody').addEventListener('click', alClic);
  }

  function pintarDias() {
    const hay = new Set((DATOS ? DATOS.clases : []).map(c => c.dia));
    const dias = DIAS.map((d, i) => i).filter(i => i < 6 || hay.has(DIAS[i]));
    const cont = document.getElementById('scDias');
    cont.innerHTML = dias.map(i =>
      `<button class="sc-dia${i === filtros.dia ? ' on' : ''}" data-i="${i}">${DIA_LABEL[i]}</button>`).join('');
    cont.querySelectorAll('.sc-dia').forEach(b => b.onclick = () => {
      filtros.dia = +b.dataset.i;
      pintarDias(); pintarSedes();
      mensaje('<div class="sc-cargando"><i class="fas fa-spinner fa-spin"></i><br>Cargando registros…</div>');
      cargarRegistros().then(pintar).catch(err => mensaje('<div class="sc-vacio">' + esc(err.message) + '</div>'));
    });
  }

  // Pestañas de sede con el numero de clases del dia elegido (Virtual al final)
  function pintarSedes() {
    const cont = document.getElementById('scSedes');
    const n = {};
    delDia().forEach(c => { if (c.sede) n[c.sede] = (n[c.sede] || 0) + 1; });
    const sedes = [...new Set((DATOS ? DATOS.clases : []).concat(MANUALES).map(c => c.sede).filter(Boolean))]
      .sort((a, b) => (a === 'VIRTUAL') - (b === 'VIRTUAL') || a.localeCompare(b));
    if (!sedes.includes(filtros.sede)) filtros.sede = '';
    const tab = (v, txt, k) => `<button class="sc-dia${filtros.sede === v ? ' on' : ''}" data-s="${esc(v)}">${esc(txt)} <small>${k}</small></button>`;
    cont.innerHTML = tab('', 'Todas las sedes', delDia().length) +
      sedes.map(s => tab(s, s === 'VIRTUAL' ? 'Virtual' : s, n[s] || 0)).join('');
    cont.querySelectorAll('.sc-dia').forEach(b => b.onclick = () => {
      filtros.sede = b.dataset.s; filtros.lugar = ''; guardarFiltros(); pintarSedes(); pintar();
    });
  }

  function mensaje(html) { document.getElementById('scBody').innerHTML = html; document.getElementById('scResumen').innerHTML = ''; }

  function tarjeta(c) {
    const e = estadoDe(c);
    const est = e.estado;
    const virtual = c.aula === 'Virtual' || c.modalidad === 'VIRTUAL';
    const donde = '<div class="sc-donde"><i class="fas fa-location-dot"></i>' +
      (virtual ? 'Clase virtual' : `Sede <b>${esc(c.sede || '—')}</b> · ` +
        (c.aula ? `Aula <b>${esc(c.aula)}</b>` : '<span class="sc-sinaula">aula por confirmar</span>')) +
      ` <span class="sc-mod ${virtual ? 'vir' : 'pre'}">${virtual ? 'Virtual' : 'Presencial'}</span></div>`;
    const nota = e.comentario ? `<div class="sc-nota"><i class="fas fa-comment"></i>` +
      (e.tipo ? `<b>${esc(TIPOS[e.tipo])}:</b> ` : '') + `${esc(e.comentario)}</div>` : '';
    const cambios = c.orig ? ['curso', 'aula', 'sede', 'docente'].filter(k => c.orig[k] !== c[k])
      .map(k => `${k} antes: ${esc(c.orig[k] || '—')}`).join(' · ') : '';
    const editada = cambios ? `<div class="sc-editada"><i class="fas fa-pen-to-square"></i>Editada${c.ajuste.editado_por ? ' por ' + esc(c.ajuste.editado_por) : ''} — ${cambios}</div>` : '';
    const sello = e.enviado
      ? `<span class="sc-sello ok" title="Enviado por ${esc(e.r.confirmado_por || '')}"><i class="fas fa-check"></i> Enviado</span>`
      : e.pendiente ? '<span class="sc-sello pend"><i class="fas fa-clock"></i> Sin enviar</span>' : '';
    return `<div class="sc-card${enCurso(c) ? ' ahora' : ''}${est ? ' e-' + est : ''}" style="--hc:${colorHora(c.ini)}" data-k="${esc(clave(c))}">` +
      `<div class="sc-c-aula"><div class="sc-aula">${esc(virtual ? 'Virtual' : (c.sede || '') + (c.aula ? '-' + c.aula : ''))}</div>` +
        `<div class="sc-hora"><i class="far fa-clock"></i>${esc(hm(c.ini))}–${esc(hm(c.fin))}</div></div>` +
      `<div class="sc-c-info"><div class="sc-curso">${esc(c.curso)}</div>` +
        `<div class="sc-doc">${esc(c.docente || 'Sin docente')}${c.dni ? ` <small>· DNI ${esc(c.dni)}</small>` : ''}</div>${donde}${editada}${nota}` +
        (c.manual ? `<div class="sc-manual"><i class="fas fa-pen"></i>agregada a mano${c.creado_por ? ' por ' + esc(c.creado_por) : ''}` +
          '<button data-a="quitar" title="Quitar esta sección agregada a mano"><i class="fas fa-trash-can"></i> quitar</button></div>' : '') + '</div>' +
      `<div class="sc-sec"><b>${esc(c.seccion || '—')}</b><span>${c.manual && !/^\d/.test(c.nrc) ? 'manual' : 'NRC ' + esc(c.nrc)}</span></div>` +
      '<div class="sc-acciones">' +
        '<div class="sc-ests">' + ESTADOS.map(x => `<button class="sc-est ${x}${est === x ? ' on' : ''}" data-e="${x}"${e.enviado ? ' disabled' : ''}>${ESTADO_LABEL[x]}</button>`).join('') + '</div>' +
        '<div class="sc-mas">' + sello +
        '<button class="sc-com" data-a="editar" title="Editar curso, aula, docente o sede"><i class="fas fa-pen"></i></button>' +
        `<button class="sc-com${e.comentario || (e.r.historial || []).length ? ' tiene' : ''}" data-a="comentar" title="${e.enviado ? 'Comentario o cambio de decisión (pide sustento)' : 'Comentario'}"><i class="fas fa-comment-dots"></i></button>` +
      '</div></div></div>';
  }

  // Clases del dia con algo marcado o comentado que aun no se envio
  const pendientes = () => delDia().filter(c => estadoDe(c).pendiente);

  function pintar() {
    if (!DATOS) return;
    const fecha = fechaDia(filtros.dia);
    const todas = delDia();
    pintarLugarHoras(todas);
    const sel = todas.filter(c => pasa(c))
      .sort((a, b) => a.ini.localeCompare(b.ini) || (a.sede + a.aula).localeCompare(b.sede + b.aula));
    document.getElementById('scSub').textContent =
      `${DIA_LABEL[filtros.dia]} ${ddmm(fecha)} · datos actualizados: ${DATOS.generado || '—'}`;
    const np = pendientes().length;
    document.getElementById('scPend').textContent = np;
    document.getElementById('scEnviar').classList.toggle('hay', np > 0);

    const cuenta = { PUNTUAL: 0, TARDANZA: 0, INASISTENCIA: 0 };
    let env = 0;
    sel.forEach(c => { const e = estadoDe(c); if (e.estado) cuenta[e.estado]++; if (e.enviado) env++; });
    document.getElementById('scResumen').innerHTML =
      '<div class="sc-resumen"><h3>Ingreso del día</h3>' +
      '<p>Marca el ingreso y comenta lo que necesites; queda guardado en este dispositivo. Al terminar pulsa <b>Enviar reporte</b> (arriba) para enviarlo todo.</p>' +
      '<div class="sc-cuentas">' +
        `<div class="sc-cuenta pun"><b>${cuenta.PUNTUAL}</b><span>Puntual</span></div>` +
        `<div class="sc-cuenta tar"><b>${cuenta.TARDANZA}</b><span>Tardanza</span></div>` +
        `<div class="sc-cuenta ina"><b>${cuenta.INASISTENCIA}</b><span>Inasistencia</span></div>` +
        `<div class="sc-cuenta"><b>${env}/${sel.length}</b><span>Enviadas${np ? ` · ${np} sin enviar` : ''}</span></div>` +
      '</div></div>';

    const grupos = new Map();
    sel.forEach(c => { const g = grupoDe(c); if (!grupos.has(g)) grupos.set(g, []); grupos.get(g).push(c); });
    const nombres = [...grupos.keys()];
    // Pisos primero, luego laboratorios, otros ambientes y virtual (como en el monitoreo de sede)
    const sede = g => g.includes(' · ') ? g.split(' · ')[0] : '';
    if (filtros.vista !== 'hora') nombres.sort((a, b) => (a === 'Virtual') - (b === 'Virtual') || sede(a).localeCompare(sede(b)) || pesoLugar(a) - pesoLugar(b) || a.localeCompare(b, 'es', { numeric: true }));
    document.getElementById('scBody').innerHTML = nombres.map(g => {
      const lista = grupos.get(g);
      return `<div class="sc-grupo"><h4>${esc(g)}</h4><span class="sc-raya"></span>` +
        (lista.some(enCurso) ? '<span class="sc-encurso">en curso</span>' : '') +
        `<span class="sc-n">${lista.length} clase${lista.length === 1 ? '' : 's'}</span></div>` +
        lista.map(tarjeta).join('');
    }).join('') || `<div class="sc-vacio">${todas.length ? 'Ninguna clase coincide con la búsqueda.' : 'No hay clases registradas para este día.'}</div>`;

    const nrcs = new Set(sel.map(c => c.nrc));
    document.getElementById('scPie').textContent =
      `${sel.length} clases · ${nrcs.size} secciones (NRC) este día · ${sel.filter(c => !c.aula).length} sin aula confirmada · ` +
      'cursos: CARGA_HORARIA · aulas: Portal de Horarios';
  }

  // Opciones de piso/ambiente y leyenda de horas, con lo que hay en la sede y dia elegidos
  function pintarLugarHoras(todas) {
    const cuenta = (lista, fn) => { const n = {}; lista.forEach(c => { const k = fn(c); n[k] = (n[k] || 0) + 1; }); return n; };
    const nl = cuenta(todas.filter(c => pasa(c, 'lugar')), lugarDe);
    const lugares = Object.keys(nl).sort((a, b) => pesoLugar(a) - pesoLugar(b) || a.localeCompare(b, 'es', { numeric: true }));
    if (filtros.lugar && !lugares.includes(filtros.lugar)) lugares.push(filtros.lugar);
    const sl = document.getElementById('scLugar');
    sl.innerHTML = '<option value="">Todos los pisos</option>' +
      lugares.map(l => `<option value="${esc(l)}">${esc(l === 'Laboratorios' ? 'Solo laboratorios' : l)} (${nl[l] || 0})</option>`).join('');
    sl.value = filtros.lugar;

    const nh = cuenta(todas.filter(c => pasa(c, 'hora')), c => hm(c.ini));
    const horas = Object.keys(nh).sort();
    const cont = document.getElementById('scHoras');
    cont.innerHTML = '<span class="sc-horas-lab">Inicio</span>' + horas.map(h =>
      `<button class="sc-hchip${filtros.hora === h ? ' on' : ''}" data-h="${h}" style="--hc:${colorHora(h)}">` +
      `<i></i>${h}<small>${nh[h]}</small></button>`).join('') +
      (filtros.hora ? '<button class="sc-hchip limpiar" data-h="">Todas las horas</button>' : '');
    cont.querySelectorAll('.sc-hchip').forEach(b => b.onclick = () => {
      filtros.hora = filtros.hora === b.dataset.h ? '' : b.dataset.h; guardarFiltros(); pintar();
    });
  }

  /* ---------- guardar en la base ---------- */
  // Solo manda los campos de «cambios» (merge): si no hay comentario no se envia comentario
  async function guardar(c, cambios, por) {
    const fila = Object.assign({
      fecha: fechaSel(), nrc: c.nrc, ini: c.ini, fin: c.fin, dia: c.dia, sede: c.sede, aula: c.aula,
      curso: c.curso, seccion: c.seccion, docente: c.docente, dni_docente: c.dni || null, editado_por: por
    }, cambios);
    if (fila.confirmado && !(REG.get(clave(c)) || {}).confirmado) fila.confirmado_por = por;
    const r = await fetch(TABLA + '?on_conflict=fecha,nrc,ini', {
      method: 'POST', headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=representation' }, SB_HEAD),
      body: JSON.stringify(fila)
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'HTTP ' + r.status);
    const nueva = (await r.json())[0] || fila;
    REG.set(clave(c), nueva);
    return nueva;
  }

  function claseDe(k) { return delDia().find(c => clave(c) === k); }

  function alClic(e) {
    const b = e.target.closest('button');
    const card = e.target.closest('.sc-card');
    if (!b || !card || b.disabled) return;
    const c = claseDe(card.dataset.k);
    if (!c) return;
    if (b.dataset.a === 'comentar') { abrirModal(c); return; }
    if (b.dataset.a === 'quitar') { quitarManual(c); return; }
    if (b.dataset.a === 'editar') { abrirEditar(c); return; }
    if (b.dataset.e) {
      // Marcar queda en borrador; otro clic en la misma opcion la desmarca
      const actual = estadoDe(c).estado;
      ponerBorrador(clave(c), { estado: actual === b.dataset.e ? null : b.dataset.e });
      pintar();
    }
  }

  /* ---------- enviar reporte ---------- */
  function abrirEnviar() {
    const lista = pendientes();
    const caja = document.getElementById('scCaja');
    caja.innerHTML =
      '<h3>Enviar reporte</h3>' +
      `<div class="sc-sub">${esc(DIA_LABEL[filtros.dia])} ${ddmm(fechaDia(filtros.dia))} · ${lista.length} clase${lista.length === 1 ? '' : 's'} con marcas o comentarios sin enviar.</div>` +
      '<label for="scNombreEnv">Tu nombre</label>' +
      `<input id="scNombreEnv" value="${esc(nombreGuardado())}" placeholder="Quién envía el reporte" autocomplete="name">` +
      (lista.length ? '<div class="sc-lista">' + lista.map(c => {
        const e = estadoDe(c);
        return `<div><b>${esc(hm(c.ini))}</b> ${esc(c.sede)}${c.aula ? '-' + esc(c.aula) : ''} · ${esc(c.seccion)} · ${esc(c.curso)}<br>` +
          (e.estado ? `<span class="sc-tag ${e.estado}">${ESTADO_LABEL[e.estado]}</span>` : '<span class="sc-tag">sin marca</span>') +
          (e.comentario ? ` <i>${e.tipo ? esc(TIPOS[e.tipo]) + ': ' : ''}${esc(e.comentario)}</i>` : '') + '</div>';
      }).join('') + '</div>' : '<div class="sc-vacio">No hay nada pendiente: marca o comenta alguna clase.</div>') +
      '<div class="sc-err" id="scErr"></div>' +
      '<div class="sc-btns"><button class="sc-boton" id="scCancelar">Cancelar</button>' +
      (lista.length ? `<button class="sc-conf" id="scGuardar"><i class="fas fa-paper-plane"></i> Enviar ${lista.length}</button>` : '') + '</div>';
    caja.classList.add('ancha');
    const $ = id => document.getElementById(id);
    $('scCancelar').onclick = cerrarModal;
    if ($('scGuardar')) $('scGuardar').onclick = async () => {
      const por = $('scNombreEnv').value.trim();
      if (!por) { $('scErr').textContent = 'Escribe tu nombre para enviar el reporte.'; $('scNombreEnv').focus(); return; }
      recordarNombre(por);
      $('scGuardar').disabled = true;
      const fallas = [];
      for (let i = 0; i < lista.length; i++) {
        const c = lista[i], e = estadoDe(c);
        $('scGuardar').textContent = `Enviando ${i + 1}/${lista.length}…`;
        const cambios = {};
        if (e.estado) Object.assign(cambios, { estado: e.estado, confirmado: true });
        if (e.comentario) Object.assign(cambios, { comentario: e.comentario, tipo_comentario: e.tipo || null });
        try {
          await guardar(c, cambios, por);
          ponerBorrador(clave(c), { estado: null, comentario: null, tipo: null });
        } catch (err) { fallas.push(`${c.seccion} ${c.curso}: ${err.message}`); }
      }
      pintar();
      if (fallas.length) {
        $('scErr').innerHTML = '<b>No se enviaron:</b><br>' + fallas.map(esc).join('<br>');
        $('scGuardar').remove();
      } else cerrarModal();
    };
    $('scModal').classList.add('abierto');
    if (!nombreGuardado()) $('scNombreEnv').focus();
  }

  /* ---------- comentario / cambio de decision ---------- */
  function abrirModal(c) {
    const e = estadoDe(c), r = e.r;
    const enviado = e.enviado;
    let elegido = e.estado, tipo = e.tipo || '';
    const caja = document.getElementById('scCaja');
    caja.innerHTML =
      `<h3>${enviado ? 'Comentario o cambio de decisión' : 'Comentario'}</h3>` +
      `<div class="sc-sub">${esc(c.curso)} · ${esc(c.seccion)} · NRC ${esc(c.nrc)}<br>${esc(c.docente || '')}</div>` +
      '<label>Tipo</label><div class="sc-tipos">' + Object.keys(TIPOS).map(t =>
        `<button class="sc-tipo${tipo === t ? ' on' : ''}" data-t="${t}">${esc(TIPOS[t])}</button>`).join('') + '</div>' +
      '<label for="scCom">Comentario</label>' +
      `<textarea id="scCom" placeholder="Escribe lo observado (opcional)">${esc(e.comentario || '')}</textarea>` +
      (enviado ? '<label>Decisión</label><div class="sc-ests">' +
        ESTADOS.map(x => `<button class="sc-est ${x}${elegido === x ? ' on' : ''}" data-e="${x}">${ESTADO_LABEL[x]}</button>`).join('') + '</div>' +
        '<label for="scSust">Sustento del cambio <small>(obligatorio si cambias la decisión)</small></label><textarea id="scSust" placeholder="Por qué se modifica la decisión"></textarea>' +
        campoNombre() : '') +
      ((r.historial || []).length ? '<div class="sc-hist">' + r.historial.map(h =>
        `<div>${esc(ESTADO_LABEL[h.de] || h.de)} → ${esc(ESTADO_LABEL[h.a] || h.a)} · ${esc(h.por || '')} · ${esc(new Date(h.en).toLocaleString('es-PE'))}<br><i>${esc(h.sustento)}</i></div>`).join('') + '</div>' : '') +
      '<div class="sc-err" id="scErr"></div>' +
      '<div class="sc-btns"><button class="sc-boton" id="scCancelar">Cancelar</button>' +
      `<button class="sc-conf" id="scGuardar">${enviado ? 'Guardar y enviar' : 'Guardar'}</button></div>`;
    caja.querySelectorAll('.sc-tipo').forEach(b => b.onclick = () => {
      tipo = b.dataset.t;
      caja.querySelectorAll('.sc-tipo').forEach(x => x.classList.toggle('on', x === b));
    });
    caja.querySelectorAll('.sc-ests .sc-est').forEach(b => b.onclick = () => {
      elegido = b.dataset.e;
      caja.querySelectorAll('.sc-ests .sc-est').forEach(x => x.classList.toggle('on', x === b));
    });
    const $ = id => document.getElementById(id);
    $('scCancelar').onclick = cerrarModal;
    $('scGuardar').onclick = async () => {
      const err = $('scErr');
      const com = $('scCom').value.trim();
      if (!enviado) {
        // Aun no enviado: queda en el borrador hasta «Enviar reporte»
        ponerBorrador(clave(c), { comentario: com || null, tipo: com ? tipo || null : null });
        cerrarModal(); pintar();
        return;
      }
      const cambios = {};
      if (com !== (r.comentario || '') || (com && tipo !== (r.tipo_comentario || ''))) {
        Object.assign(cambios, { comentario: com || null, tipo_comentario: com ? tipo || null : null });
      }
      if (elegido !== r.estado) {
        const sust = $('scSust').value.trim();
        if (!sust) { err.textContent = 'Escribe el sustento para cambiar la decisión.'; return; }
        Object.assign(cambios, { estado: elegido, sustento: sust });
      }
      if (!Object.keys(cambios).length) { cerrarModal(); return; }
      const por = tomarNombre();
      if (!por) { err.textContent = 'Escribe tu nombre.'; return; }
      $('scGuardar').disabled = true; err.textContent = '';
      try { await guardar(c, cambios, por); cerrarModal(); pintar(); } catch (x) { err.textContent = x.message; $('scGuardar').disabled = false; }
    };
    $('scModal').classList.add('abierto');
    $('scCom').focus();
  }

  /* ---------- agregar seccion a mano ---------- */
  // Sugerencias: una por seccion (NRC) de todo el periodo, con su curso, docente y sede
  function sugerencias() {
    const vistas = new Map();
    (DATOS ? DATOS.clases : []).forEach(c => {
      const k = c.nrc + '|' + c.seccion;
      if (!vistas.has(k)) vistas.set(k, c);
    });
    return [...vistas.values()].sort((a, b) => a.seccion.localeCompare(b.seccion) || a.curso.localeCompare(b.curso));
  }
  const etiqueta = c => `${c.seccion} · ${c.curso} · ${c.sede} · NRC ${c.nrc}`;
  const opciones = lista => [...new Set(lista.filter(Boolean))].sort().map(v => `<option value="${esc(v)}">`).join('');

  function abrirAgregar() {
    const sug = sugerencias();
    const todas = (DATOS ? DATOS.clases : []);
    const caja = document.getElementById('scCaja');
    const campo = (id, txt, lista, extra) => `<div class="sc-campo"><label for="${id}">${txt}</label>` +
      `<input id="${id}" ${lista ? `list="${id}L"` : ''} ${extra || ''} autocomplete="off">` +
      (lista ? `<datalist id="${id}L">${lista}</datalist>` : '') + '</div>';
    caja.innerHTML =
      '<h3>Agregar sección</h3>' +
      '<div class="sc-sub">Busca una sección existente para autocompletar, o escribe los datos a mano. ' +
        'Se mostrará todas las semanas en el día elegido.</div>' +
      '<label for="scBusca">Buscar sección</label>' +
      '<input id="scBusca" list="scBuscaL" placeholder="Ej.: 412M, Pricing, 596…" autocomplete="off">' +
      `<datalist id="scBuscaL">${sug.map(c => `<option value="${esc(etiqueta(c))}">`).join('')}</datalist>` +
      '<div class="sc-form">' +
        campo('scFSec', 'Sección', opciones(todas.map(c => c.seccion)), 'placeholder="412M"') +
        campo('scFCurso', 'Curso', opciones(todas.map(c => c.curso))) +
        campo('scFDoc', 'Docente', opciones(todas.map(c => c.docente))) +
        campo('scFNrc', 'NRC', '', 'inputmode="numeric"') +
        campo('scFSede', 'Sede', opciones(todas.map(c => c.sede))) +
        campo('scFAula', 'Aula', opciones(todas.map(c => c.aula).filter(a => a !== 'Virtual')), 'placeholder="A403A"') +
        '<div class="sc-campo"><label for="scFDia">Día</label><select id="scFDia">' +
          DIAS.slice(0, 6).map((d, i) => `<option value="${d}"${i === filtros.dia ? ' selected' : ''}>${DIA_LABEL[i]}</option>`).join('') + '</select></div>' +
        '<div class="sc-campo"><label for="scFMod">Modalidad</label><select id="scFMod"><option>PRESENCIAL</option><option>VIRTUAL</option></select></div>' +
        '<div class="sc-campo"><label for="scFIni">Inicio</label><input id="scFIni" type="time"></div>' +
        '<div class="sc-campo"><label for="scFFin">Fin</label><input id="scFFin" type="time"></div>' +
      '</div>' + campoNombre() +
      '<div class="sc-err" id="scErr"></div>' +
      '<div class="sc-btns"><button class="sc-boton" id="scCancelar">Cancelar</button>' +
      '<button class="sc-conf" id="scGuardar">Agregar</button></div>';
    caja.classList.add('ancha');
    const $ = id => document.getElementById(id);
    if (filtros.sede) $('scFSede').value = filtros.sede;
    // Al elegir una sugerencia se llenan los campos (aula y horario del dia elegido si existe)
    $('scBusca').addEventListener('input', () => {
      const c = sug.find(x => etiqueta(x) === $('scBusca').value);
      if (!c) return;
      const delMismo = todas.filter(x => x.nrc === c.nrc && x.seccion === c.seccion);
      const ref = delMismo.find(x => x.dia === $('scFDia').value) || delMismo.find(x => x.aula) || c;
      $('scFSec').value = c.seccion; $('scFCurso').value = c.curso; $('scFDoc').value = c.docente || '';
      $('scFNrc').value = c.nrc; $('scFSede').value = c.sede; $('scFAula').value = ref.aula === 'Virtual' ? '' : (ref.aula || '');
      $('scFMod').value = c.modalidad === 'VIRTUAL' || c.aula === 'Virtual' ? 'VIRTUAL' : 'PRESENCIAL';
      $('scFIni').value = hm(ref.ini); $('scFFin').value = hm(ref.fin);
      $('scFDoc').dataset.dni = c.dni || '';
    });
    $('scCancelar').onclick = cerrarModal;
    $('scGuardar').onclick = async () => {
      const v = id => $(id).value.trim();
      const err = $('scErr');
      if (!v('scFSec') && !v('scFCurso')) { err.textContent = 'Escribe al menos la sección o el curso.'; return; }
      if (!v('scFIni') || !v('scFFin')) { err.textContent = 'Indica la hora de inicio y fin.'; return; }
      if (v('scFFin') <= v('scFIni')) { err.textContent = 'La hora de fin debe ser posterior al inicio.'; return; }
      const por = tomarNombre();
      if (!por) { err.textContent = 'Escribe tu nombre.'; return; }
      const doc = v('scFDoc');
      const fila = {
        dia: $('scFDia').value, ini: v('scFIni'), fin: v('scFFin'), sede: v('scFSede').toUpperCase(),
        aula: v('scFAula').toUpperCase(), seccion: v('scFSec').toUpperCase(), curso: v('scFCurso').toUpperCase(),
        docente: doc, nrc: v('scFNrc'), modalidad: $('scFMod').value,
        dni_docente: (todas.find(c => c.docente === doc && c.dni) || {}).dni || $('scFDoc').dataset.dni || '',
        creado_por: por, editado_por: por
      };
      $('scGuardar').disabled = true; err.textContent = '';
      try {
        const r = await fetch(TABLA_MAN, { method: 'POST', headers: Object.assign({ Prefer: 'return=minimal' }, SB_HEAD), body: JSON.stringify(fila) });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'HTTP ' + r.status);
        await cargarManuales();
        filtros.dia = DIAS.indexOf(fila.dia);
        cerrarModal(); pintarDias(); pintarSedes();
        await cargarRegistros(); pintar();
      } catch (e) { err.textContent = 'No se guardó: ' + e.message; $('scGuardar').disabled = false; }
    };
    $('scModal').classList.add('abierto');
    $('scBusca').focus();
  }

  /* ---------- editar curso / aula / docente / sede ---------- */
  function abrirEditar(c) {
    const todas = DATOS ? DATOS.clases : [];
    const base = c.orig || c;
    const campo = (id, txt, valor, lista, extra) => `<div class="sc-campo"><label for="${id}">${txt}</label>` +
      `<input id="${id}" list="${id}L" value="${esc(valor || '')}" ${extra || ''} autocomplete="off">` +
      `<datalist id="${id}L">${lista}</datalist></div>`;
    const caja = document.getElementById('scCaja');
    caja.innerHTML =
      '<h3>Editar clase</h3>' +
      `<div class="sc-sub">${esc(c.seccion)} · NRC ${esc(c.nrc)} · ${esc(DIA_LABEL[filtros.dia])} ${esc(hm(c.ini))}–${esc(hm(c.fin))}<br>` +
        (c.manual ? 'Sección agregada a mano.' : 'El cambio se aplica todas las semanas a esta clase.') + '</div>' +
      '<div class="sc-form">' +
        campo('scEAula', 'Aula', c.aula === 'Virtual' ? '' : c.aula,
          opciones(todas.filter(x => !c.sede || x.sede === c.sede).map(x => x.aula).filter(a => a && a !== 'Virtual')), 'placeholder="Ej.: L007A"') +
        campo('scESede', 'Sede', c.sede, opciones(todas.map(x => x.sede))) +
        campo('scECurso', 'Curso', c.curso, opciones(todas.map(x => x.curso))) +
        campo('scEDoc', 'Docente', c.docente, opciones(todas.map(x => x.docente))) +
      '</div>' + campoNombre() +
      (c.orig ? `<div class="sc-hist"><div>Original: ${esc(base.curso)} · ${esc(base.sede)}-${esc(base.aula || 'sin aula')} · ${esc(base.docente || '')}</div></div>` : '') +
      '<div class="sc-err" id="scErr"></div>' +
      '<div class="sc-btns">' +
        (c.orig ? '<button class="sc-boton" id="scRestaurar">Volver al original</button>' : '') +
        '<button class="sc-boton" id="scCancelar">Cancelar</button>' +
        '<button class="sc-conf" id="scGuardar">Guardar</button></div>';
    caja.classList.add('ancha');
    const $ = id => document.getElementById(id);
    $('scCancelar').onclick = cerrarModal;
    const guardarAjuste = async valores => {
      const por = tomarNombre();
      if (!por) { $('scErr').textContent = 'Escribe tu nombre.'; return; }
      let r;
      if (c.manual) {
        r = await fetch(TABLA_MAN + '?id=eq.' + c.mid, {
          method: 'PATCH', headers: Object.assign({ Prefer: 'return=minimal' }, SB_HEAD),
          body: JSON.stringify(Object.assign({}, valores, { editado_por: por, editado_en: new Date().toISOString() }))
        });
      } else {
        // Solo se guarda lo que difiere del original; null = sin cambio
        const fila = { clave: claveOrig(c), nrc: c.nrc, seccion: c.seccion, dia: c.dia, ini: hm(c.ini), editado_por: por, editado_en: new Date().toISOString() };
        ['curso', 'aula', 'sede', 'docente'].forEach(k => { fila[k] = valores[k] && valores[k] !== (base[k] || '') ? valores[k] : null; });
        r = await fetch(TABLA_AJU + '?on_conflict=clave', {
          method: 'POST', headers: Object.assign({ Prefer: 'resolution=merge-duplicates,return=minimal' }, SB_HEAD),
          body: JSON.stringify(fila)
        });
      }
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'HTTP ' + r.status);
      await (c.manual ? cargarManuales() : cargarAjustes());
      cerrarModal(); pintarSedes(); pintar();
    };
    $('scGuardar').onclick = async () => {
      const v = id => $(id).value.trim();
      $('scGuardar').disabled = true;
      try {
        await guardarAjuste({ aula: v('scEAula').toUpperCase(), sede: v('scESede').toUpperCase(), curso: v('scECurso').toUpperCase(), docente: v('scEDoc') });
      } catch (e) { $('scErr').textContent = 'No se guardó: ' + e.message; }
      if ($('scGuardar')) $('scGuardar').disabled = false;
    };
    if ($('scRestaurar')) $('scRestaurar').onclick = async () => {
      try { await guardarAjuste({}); } catch (e) { $('scErr').textContent = 'No se guardó: ' + e.message; }
    };
    $('scModal').classList.add('abierto');
    $('scEAula').focus();
  }

  async function quitarManual(c) {
    if (!confirm(`¿Quitar la sección ${c.seccion || ''} ${c.curso || ''} agregada a mano?`)) return;
    const por = nombreGuardado() || (prompt('Tu nombre:') || '').trim();
    if (!por) return;
    recordarNombre(por);
    try {
      const r = await fetch(TABLA_MAN + '?id=eq.' + c.mid, {
        method: 'PATCH', headers: Object.assign({ Prefer: 'return=minimal' }, SB_HEAD),
        body: JSON.stringify({ activo: false, editado_por: por, editado_en: new Date().toISOString() })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      await cargarManuales(); pintarSedes(); pintar();
    } catch (e) { alert('No se pudo quitar: ' + e.message); }
  }

  function cerrarModal() {
    document.getElementById('scCaja').classList.remove('ancha');
    document.getElementById('scModal').classList.remove('abierto');
  }

  function exportar() {
    const fecha = fechaSel();
    const sel = delDia().filter(c => pasa(c));
    const cab = ['Fecha', 'Día', 'Sede', 'Aula', 'Modalidad', 'Horario', 'Curso', 'Sección', 'NRC', 'Docente', 'DNI',
      'Ingreso', 'Enviado', 'Enviado por', 'Tipo de comentario', 'Comentario', 'Último sustento'];
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const cuerpo = sel.map(c => {
      const e = estadoDe(c);
      return [fecha, DIA_LABEL[filtros.dia], c.sede, c.aula, c.aula === 'Virtual' ? 'VIRTUAL' : (c.modalidad || 'PRESENCIAL'), hm(c.ini) + ' - ' + hm(c.fin), c.curso, c.seccion, c.nrc,
        c.docente, c.dni, ESTADO_LABEL[e.estado] || '', e.enviado ? 'Sí' : (e.pendiente ? 'Sin enviar' : 'No'), e.r.confirmado_por,
        e.comentario ? TIPOS[e.tipo || ''] : '', e.comentario, e.r.sustento].map(q).join(',');
    });
    const blob = new Blob(['﻿' + [cab.map(q).join(',')].concat(cuerpo).join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'monitoreo_secciones_' + fecha + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function cargar(forzar) {
    mensaje('<div class="sc-cargando"><i class="fas fa-spinner fa-spin"></i><br>Cargando cursos y secciones…</div>');
    try {
      if (!DATOS || forzar) await Promise.all([cargarClases(), cargarManuales(), cargarAjustes()]);
      pintarDias(); pintarSedes();
      await cargarRegistros();
      pintar();
    } catch (err) {
      mensaje('<div class="sc-vacio"><b>No se pudieron cargar los datos.</b><br>' + esc(err.message) + '</div>');
    }
  }

  function reloj() {
    const el = document.getElementById('scReloj');
    if (el) el.textContent = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function abrir() {
    construir();
    document.getElementById('scOverlay').classList.add('abierto');
    document.body.style.overflow = 'hidden';
    reloj();
    cargar(false);
    clearInterval(refresco);
    // Cada minuto: reloj, «en curso» y lo que hayan enviado otros
    refresco = setInterval(() => {
      reloj();
      if (document.getElementById('scModal').classList.contains('abierto')) return;
      cargarRegistros().then(pintar).catch(() => {});
    }, 60000);
  }
  function cerrar() {
    const o = document.getElementById('scOverlay');
    if (o) o.classList.remove('abierto');
    document.body.style.overflow = '';
    clearInterval(refresco);
  }

  function ponerBoton() {
    if (document.getElementById('btnSecciones')) return;
    const cont = document.querySelector('.header-actions');
    if (!cont) return;
    const b = document.createElement('button');
    b.id = 'btnSecciones';
    b.className = 'sc-btn';
    b.innerHTML = '<i class="fas fa-chalkboard"></i> Monitoreo sección';
    b.title = 'Monitoreo de secciones por sede y día: dónde se dicta cada sección y registro de ingreso';
    b.onclick = abrir;
    cont.insertBefore(b, cont.firstChild);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ponerBoton);
  else ponerBoton();
})();
