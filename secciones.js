/* ===== Monitoreo de secciones: por sede y dia, con registro de ingreso =====
   Todas las clases (curso, seccion, NRC, docente, aula, horario) que arma
   tools/actualizar_secciones.py en secciones.json a partir del Portal de
   Horarios. Por cada clase del dia elegido se marca el ingreso del docente
   (Puntual / Tardanza / Inasistencia) y se confirma. Se guarda en Supabase
   (tabla asistencia_secciones); una decision confirmada solo cambia con un
   sustento, y la base deja el cambio en el historial. */
(function () {
  'use strict';

  const SB_URL = 'https://klmjmlhwuzhymrplemgw.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsbWptbGh3dXpoeW1ycGxlbWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTMyNjQsImV4cCI6MjA4NzE2OTI2NH0.xFWMvUJa9n9TBcBG1WSeqCGiWBaCAtCU9aY7GXk4W6E';
  const SB_HEAD = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };
  const TABLA = SB_URL + '/rest/v1/asistencia_secciones';
  const AUTOR_KEY = 'cot_autor';
  const LS = 'cot_secciones_filtros';

  const DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];
  const DIA_LABEL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const ESTADOS = ['PUNTUAL', 'TARDANZA', 'INASISTENCIA'];
  const ESTADO_LABEL = { PUNTUAL: 'Puntual', TARDANZA: 'Tardanza', INASISTENCIA: 'Inasistencia' };
  const TURNO_LABEL = { M: 'Mañana', T: 'Tarde', N: 'Noche', D: 'Diurno' };

  let construido = false;
  let DATOS = null;          // { generado, clases: [...] }
  let REG = new Map();       // "nrc|ini" -> fila de asistencia_secciones (fecha elegida)
  let refresco = null;
  const hoyIdx = () => (new Date().getDay() + 6) % 7;   // 0 = lunes
  let filtros = Object.assign({ dia: hoyIdx(), q: '', vista: 'piso', turno: '', sede: '' }, leerFiltros());
  filtros.dia = hoyIdx();    // siempre abre en el dia de hoy

  const esc = s => String(s == null ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s == null ? '' : s).trim().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  const hm = h => String(h || '').slice(0, 5);
  const clave = c => c.nrc + '|' + c.ini;
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
  const esHoy = () => filtros.dia === hoyIdx();
  const minutos = h => { const [a, b] = hm(h).split(':'); return (+a || 0) * 60 + (+b || 0); };
  const enCurso = c => {
    if (!esHoy()) return false;
    const n = new Date(), m = n.getHours() * 60 + n.getMinutes();
    return minutos(c.ini) <= m && m < minutos(c.fin);
  };

  function autor() {
    let a = '';
    try { a = (localStorage.getItem(AUTOR_KEY) || '').trim(); } catch (e) { /* */ }
    if (!a) {
      a = (prompt('Escribe tu nombre para registrar quién marca el ingreso:') || '').trim();
      if (a) try { localStorage.setItem(AUTOR_KEY, a); } catch (e) { /* */ }
    }
    return a;
  }

  /* ---------- datos ---------- */
  async function cargarClases() {
    const r = await fetch('secciones.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('No se encontró secciones.json (HTTP ' + r.status + '). Ejecuta tools/actualizar_secciones.py');
    DATOS = await r.json();
  }
  async function cargarRegistros() {
    const r = await fetch(TABLA + '?select=*&fecha=eq.' + iso(fechaDia(filtros.dia)), { headers: SB_HEAD, cache: 'no-store' });
    if (!r.ok) throw new Error('Supabase: HTTP ' + r.status);
    REG = new Map((await r.json()).map(f => [f.nrc + '|' + f.ini, f]));
  }

  // Clases del dia elegido, vigentes en esa fecha
  function delDia() {
    const f = fechaDia(filtros.dia);
    return (DATOS ? DATOS.clases : []).filter(c => {
      if (c.dia !== DIAS[filtros.dia]) return false;
      const a = parseFecha(c.desde), b = parseFecha(c.hasta);
      return (!a || a <= f) && (!b || f <= b);
    });
  }
  function pasa(c) {
    if (filtros.turno && turnoDe(c.seccion) !== filtros.turno) return false;
    if (filtros.sede && c.sede !== filtros.sede) return false;
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
        if (c.aula === 'Virtual') return 'Virtual';
        const lugar = /^L/i.test(c.aula) ? 'Laboratorios' : (pisoDe(c.aula) ? 'Piso ' + pisoDe(c.aula) : 'Otros ambientes');
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
      '<div class="sc-wrap">' +
        '<div class="sc-top"><h2>Monitoreo de secciones<small id="scSub"></small></h2>' +
          '<span class="sc-reloj" id="scReloj"></span>' +
          '<button class="sc-cerrar" id="scCerrar" title="Cerrar"><i class="fas fa-xmark"></i></button></div>' +
        '<div class="sc-dias" id="scDias"></div>' +
        '<div class="sc-dias sc-sedes" id="scSedes"></div>' +
        '<div class="sc-barra">' +
          '<input type="text" id="scQ" placeholder="Buscar aula, docente, curso, sección o NRC">' +
          '<select id="scVista"><option value="piso">Por piso</option><option value="sede">Por sede</option>' +
            '<option value="hora">Por horario</option><option value="curso">Por curso</option><option value="docente">Por docente</option></select>' +
          '<select id="scTurno"><option value="">Todos los turnos</option>' +
            Object.keys(TURNO_LABEL).map(t => `<option value="${t}">${TURNO_LABEL[t]}</option>`).join('') + '</select>' +
          '<button class="sc-boton" id="scCsv"><i class="fas fa-file-csv"></i> Exportar</button>' +
          '<button class="sc-boton" id="scRecargar"><i class="fas fa-rotate"></i> Recargar</button>' +
        '</div>' +
        '<div id="scResumen"></div>' +
        '<div id="scBody"></div>' +
        '<div class="sc-pie" id="scPie"></div>' +
      '</div>' +
      '<div class="sc-modal" id="scModal"><div class="sc-caja" id="scCaja"></div></div>';
    document.body.appendChild(ov);

    document.getElementById('scCerrar').onclick = cerrar;
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
    document.getElementById('scCsv').onclick = exportar;
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
    const sedes = [...new Set((DATOS ? DATOS.clases : []).map(c => c.sede).filter(Boolean))]
      .sort((a, b) => (a === 'VIRTUAL') - (b === 'VIRTUAL') || a.localeCompare(b));
    if (!sedes.includes(filtros.sede)) filtros.sede = '';
    const tab = (v, txt, k) => `<button class="sc-dia${filtros.sede === v ? ' on' : ''}" data-s="${esc(v)}">${esc(txt)} <small>${k}</small></button>`;
    cont.innerHTML = tab('', 'Todas las sedes', delDia().length) +
      sedes.map(s => tab(s, s === 'VIRTUAL' ? 'Virtual' : s, n[s] || 0)).join('');
    cont.querySelectorAll('.sc-dia').forEach(b => b.onclick = () => {
      filtros.sede = b.dataset.s; guardarFiltros(); pintarSedes(); pintar();
    });
  }

  function mensaje(html) { document.getElementById('scBody').innerHTML = html; document.getElementById('scResumen').innerHTML = ''; }

  function tarjeta(c) {
    const r = REG.get(clave(c)) || {};
    const conf = !!r.confirmado;
    const est = r.estado || '';
    const virtual = c.aula === 'Virtual' || c.modalidad === 'VIRTUAL';
    const donde = '<div class="sc-donde"><i class="fas fa-location-dot"></i>' +
      (virtual ? 'Clase virtual' : `Sede <b>${esc(c.sede || '—')}</b> · Aula <b>${esc(c.aula || '—')}</b>`) +
      ` <span class="sc-mod ${virtual ? 'vir' : 'pre'}">${virtual ? 'Virtual' : 'Presencial'}</span></div>`;
    const nota = r.comentario ? `<div class="sc-nota"><i class="fas fa-comment"></i>${esc(r.comentario)}</div>` : '';
    return `<div class="sc-card${enCurso(c) ? ' ahora' : ''}${est ? ' e-' + est : ''}" data-k="${esc(clave(c))}">` +
      `<div><div class="sc-aula">${esc(c.aula === 'Virtual' ? 'Virtual' : (c.sede ? c.sede + '-' : '') + c.aula)}</div>` +
        `<div class="sc-hora">${esc(hm(c.ini))}–${esc(hm(c.fin))}</div></div>` +
      `<div><div class="sc-curso">${esc(c.curso)}</div>` +
        `<div class="sc-doc">${esc(c.docente || 'Sin docente')}${c.dni ? ` <small>· DNI ${esc(c.dni)}</small>` : ''}</div>${donde}${nota}</div>` +
      '<div class="sc-acciones">' +
        `<div class="sc-sec"><b>${esc(c.seccion || '—')}</b><span>NRC ${esc(c.nrc)}</span></div>` +
        ESTADOS.map(e => `<button class="sc-est ${e}${est === e ? ' on' : ''}" data-e="${e}"${conf ? ' disabled' : ''}>${ESTADO_LABEL[e]}</button>`).join('') +
        (conf ? `<button class="sc-conf" disabled title="Confirmado por ${esc(r.confirmado_por || '')}"><i class="fas fa-check"></i> Confirmado</button>`
              : `<button class="sc-conf" data-a="confirmar"${est ? '' : ' disabled style="opacity:.4"'}>Confirmar</button>`) +
        `<button class="sc-com${r.comentario || (r.historial || []).length ? ' tiene' : ''}" data-a="comentar" title="${conf ? 'Comentario o cambio de decisión (pide sustento)' : 'Comentario'}"><i class="fas fa-comment-dots"></i></button>` +
      '</div></div>';
  }

  function pintar() {
    if (!DATOS) return;
    const fecha = fechaDia(filtros.dia);
    const todas = delDia();
    const sel = todas.filter(pasa)
      .sort((a, b) => a.ini.localeCompare(b.ini) || (a.sede + a.aula).localeCompare(b.sede + b.aula));
    document.getElementById('scSub').textContent =
      `${DIA_LABEL[filtros.dia]} ${ddmm(fecha)} · datos del portal: ${DATOS.generado || '—'}`;

    const cuenta = { PUNTUAL: 0, TARDANZA: 0, INASISTENCIA: 0 };
    let conf = 0;
    sel.forEach(c => { const r = REG.get(clave(c)); if (r && r.estado) cuenta[r.estado]++; if (r && r.confirmado) conf++; });
    document.getElementById('scResumen').innerHTML =
      '<div class="sc-resumen"><h3>Ingreso del día</h3>' +
      '<p>Marca el ingreso de cada docente y pulsa <b>Confirmar</b>. Para cambiar una decisión confirmada usa el botón de comentario: pedirá un sustento.</p>' +
      '<div class="sc-cuentas">' +
        `<div class="sc-cuenta pun"><b>${cuenta.PUNTUAL}</b><span>Puntual</span></div>` +
        `<div class="sc-cuenta tar"><b>${cuenta.TARDANZA}</b><span>Tardanza</span></div>` +
        `<div class="sc-cuenta ina"><b>${cuenta.INASISTENCIA}</b><span>Inasistencia</span></div>` +
        `<div class="sc-cuenta"><b>${conf}/${sel.length}</b><span>Confirmadas</span></div>` +
      '</div></div>';

    const grupos = new Map();
    sel.forEach(c => { const g = grupoDe(c); if (!grupos.has(g)) grupos.set(g, []); grupos.get(g).push(c); });
    const nombres = [...grupos.keys()];
    if (filtros.vista !== 'hora') nombres.sort((a, b) => (a === 'Virtual') - (b === 'Virtual') || a.localeCompare(b, 'es', { numeric: true }));
    document.getElementById('scBody').innerHTML = nombres.map(g => {
      const lista = grupos.get(g);
      return `<div class="sc-grupo"><h4>${esc(g)}</h4><span class="sc-raya"></span>` +
        (lista.some(enCurso) ? '<span class="sc-encurso">en curso</span>' : '') +
        `<span class="sc-n">${lista.length} clase${lista.length === 1 ? '' : 's'}</span></div>` +
        lista.map(tarjeta).join('');
    }).join('') || `<div class="sc-vacio">${todas.length ? 'Ninguna clase coincide con la búsqueda.' : 'No hay clases registradas para este día.'}</div>`;

    const nrcs = new Set(sel.map(c => c.nrc));
    document.getElementById('scPie').textContent =
      `${sel.length} clases · ${nrcs.size} secciones (NRC) este día · ${DATOS.nrc_portal || '—'} NRC encontrados en el portal de ${DATOS.nrc_base || '—'} de la base`;
  }

  /* ---------- guardar ---------- */
  async function guardar(c, cambios) {
    const por = autor();
    if (!por) throw new Error('Se necesita tu nombre para guardar.');
    const previo = REG.get(clave(c)) || {};
    const fila = {
      fecha: iso(fechaDia(filtros.dia)), nrc: c.nrc, ini: c.ini, fin: c.fin, dia: c.dia, sede: c.sede, aula: c.aula,
      curso: c.curso, seccion: c.seccion, docente: c.docente, dni_docente: c.dni || null,
      estado: previo.estado || null, comentario: previo.comentario || null, confirmado: !!previo.confirmado,
      sustento: previo.sustento || null, editado_por: por
    };
    Object.assign(fila, cambios);
    if (fila.confirmado && !previo.confirmado) fila.confirmado_por = por;
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

  async function alClic(e) {
    const b = e.target.closest('button');
    const card = e.target.closest('.sc-card');
    if (!b || !card || b.disabled) return;
    const c = claseDe(card.dataset.k);
    if (!c) return;
    if (b.dataset.a === 'comentar') { abrirModal(c); return; }
    let cambios = null;
    if (b.dataset.e) cambios = { estado: b.dataset.e };
    if (b.dataset.a === 'confirmar') {
      const est = (REG.get(clave(c)) || {}).estado;
      if (!est) return;
      if (!confirm(`¿Confirmar «${ESTADO_LABEL[est]}» para ${c.docente || 'esta clase'}?\nDespués solo se podrá cambiar con un sustento.`)) return;
      cambios = { confirmado: true };
    }
    if (!cambios) return;
    card.classList.add('guardando');
    try { await guardar(c, cambios); } catch (err) { alert('No se guardó: ' + err.message); }
    pintar();
  }

  /* ---------- comentario / cambio de decision ---------- */
  function abrirModal(c) {
    const r = REG.get(clave(c)) || {};
    const conf = !!r.confirmado;
    let elegido = r.estado || '';
    const caja = document.getElementById('scCaja');
    caja.innerHTML =
      `<h3>${conf ? 'Comentario o cambio de decisión' : 'Comentario'}</h3>` +
      `<div class="sc-sub">${esc(c.curso)} · ${esc(c.seccion)} · NRC ${esc(c.nrc)}<br>${esc(c.docente || '')}</div>` +
      (conf ? '<label>Decisión</label><div class="sc-ests">' +
        ESTADOS.map(e => `<button class="sc-est ${e}${elegido === e ? ' on' : ''}" data-e="${e}">${ESTADO_LABEL[e]}</button>`).join('') + '</div>' +
        '<label for="scSust">Sustento del cambio <small>(obligatorio si cambias la decisión)</small></label><textarea id="scSust" placeholder="Por qué se modifica la decisión"></textarea>' : '') +
      '<label for="scCom">Comentario</label>' +
      `<textarea id="scCom" placeholder="Observación sobre el ingreso">${esc(r.comentario || '')}</textarea>` +
      ((r.historial || []).length ? '<div class="sc-hist">' + r.historial.map(h =>
        `<div>${esc(ESTADO_LABEL[h.de] || h.de)} → ${esc(ESTADO_LABEL[h.a] || h.a)} · ${esc(h.por || '')} · ${esc(new Date(h.en).toLocaleString('es-PE'))}<br><i>${esc(h.sustento)}</i></div>`).join('') + '</div>' : '') +
      '<div class="sc-err" id="scErr"></div>' +
      '<div class="sc-btns"><button class="sc-boton" id="scCancelar">Cancelar</button>' +
      '<button class="sc-conf" id="scGuardar">Guardar</button></div>';
    caja.querySelectorAll('.sc-ests .sc-est').forEach(b => b.onclick = () => {
      elegido = b.dataset.e;
      caja.querySelectorAll('.sc-ests .sc-est').forEach(x => x.classList.toggle('on', x === b));
    });
    document.getElementById('scCancelar').onclick = cerrarModal;
    document.getElementById('scGuardar').onclick = async () => {
      const err = document.getElementById('scErr');
      const cambios = { comentario: document.getElementById('scCom').value.trim() || null };
      if (conf && elegido !== r.estado) {
        const sust = document.getElementById('scSust').value.trim();
        if (!sust) { err.textContent = 'Escribe el sustento para cambiar la decisión.'; return; }
        Object.assign(cambios, { estado: elegido, sustento: sust });
      }
      const g = document.getElementById('scGuardar');
      g.disabled = true; err.textContent = '';
      try { await guardar(c, cambios); cerrarModal(); pintar(); } catch (e) { err.textContent = e.message; g.disabled = false; }
    };
    document.getElementById('scModal').classList.add('abierto');
    (conf ? caja.querySelector('#scSust') : caja.querySelector('#scCom')).focus();
  }
  function cerrarModal() { document.getElementById('scModal').classList.remove('abierto'); }

  function exportar() {
    const fecha = iso(fechaDia(filtros.dia));
    const sel = delDia().filter(pasa);
    const cab = ['Fecha', 'Día', 'Sede', 'Aula', 'Modalidad', 'Horario', 'Curso', 'Sección', 'NRC', 'Docente', 'DNI',
      'Ingreso', 'Confirmado', 'Confirmado por', 'Comentario', 'Último sustento'];
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const cuerpo = sel.map(c => {
      const r = REG.get(clave(c)) || {};
      return [fecha, DIA_LABEL[filtros.dia], c.sede, c.aula, c.aula === 'Virtual' ? 'VIRTUAL' : (c.modalidad || 'PRESENCIAL'), hm(c.ini) + ' - ' + hm(c.fin), c.curso, c.seccion, c.nrc,
        c.docente, c.dni, ESTADO_LABEL[r.estado] || '', r.confirmado ? 'Sí' : 'No', r.confirmado_por, r.comentario, r.sustento].map(q).join(',');
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
      if (!DATOS || forzar) await cargarClases();
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
    // Cada minuto: reloj, «en curso» y lo que hayan marcado otros
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
