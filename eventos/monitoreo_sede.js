/* ===== Monitoreo de visitas a sede · una semana o el comparativo =====
   Un selector arriba cambia entre las semanas de SEMANAS y el comparativo. Por cada
   semana N se lee datos/monitoreo_semanaN.json, programacion_semanaN.json,
   chat_semanaN.json, tardanzas_semanaN.json y, desde la semana 2, hallazgos_semanaN.json.
   Para sumar una semana: agrega su número a SEMANAS y un botón en monitoreo_sede.html.
   Si la semana no tiene cronograma cargado, se ocultan los indicadores que lo necesitan.
   Tres lecturas sobre los datos de cada semana:
   1. Promedio de la semana (conformidad por momento y por sede).
   2. Reporte por día: una tarjeta por día y, al hacer clic, el detalle de los hallazgos.
   3. Sin reporte: cruce del cronograma con el formulario para ver quién no registró.
   El chat de coordinación se usa como evidencia complementaria del día. */

const SEMANAS = [1, 3];
let SEMANA = 1;          // semana que se está viendo
const CACHE = {};        // datos ya cargados de cada semana
const CAMPUS = 'Sede Monitoreada', TURN = 'Turno', MON = 'Monitor', DATE = 'Fecha';
const MOMENTOS = [
  ['Pre monitoreo (6:40 a 6:50)', 'Comentario - Pre monitoreo (6:40 a 6:50)'],
  ['1er monitoreo (6:50 a 7:00)', 'Comentario - 1er monitoreo (6:50 a 7:00)'],
  ['2do monitoreo (7:10 a 7:30)', 'Comentario - 2do monitoreo (7:10 a 7:30)'],
  ['3er monitoreo (8:30 a 9:00)', 'Comentario - 3er monitoreo (8:30 a 9:00)'],
  ['4to monitoreo (10:30 a 10:45)', 'Comentario - 4to monitoreo (10:30 a 10:45)']
];
const ESTADOS = ['Conforme', 'Con observación', 'No aplica', 'No se pudo verificar'];
/* Ventana horaria de cada momento, en el mismo orden que MOMENTOS. Sirve para
   ubicar cada mensaje del chat en el momento de control que le corresponde. */
const VENTANAS = [['06:40', '06:50'], ['06:50', '07:00'], ['07:10', '07:30'], ['08:30', '09:00'], ['10:30', '10:45']];
const TOLERANCIA = 20; // minutos fuera de la ventana para seguir asociando el mensaje
/* Fechas mal capturadas en el formulario: 19/12/2026 corresponde al lunes 19/10/2026
   (mismo monitor, misma sede y el chat de ese día confirma el reporte). */
const FECHAS_CORREGIDAS = { '2026-12-19': '2026-10-19' };

/* Códigos de sede tal como llegan del formulario y su nombre completo. */
const SEDES = {
  AQP: 'Arequipa', SUR: 'Surco', PRC: 'Surco', SJL: 'San Juan de Lurigancho',
  VES: 'Villa El Salvador', NOR: 'Norte', ATE: 'Ate', VIR: 'Virtual'
};
const nombreSede = c => esc(SEDES[String(c || '').toUpperCase()] || c || '—');

const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dia10 = v => String(v ?? '').slice(0, 10);
const shortDate = v => { const [y, m, d] = dia10(v).split('-'); return d ? `${d}/${m}/${y}` : '—'; };
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const momentoCorto = k => k.replace(/ \(.+/, '');
const enMinutos = h => { const [a, b] = String(h).split(':').map(Number); return a * 60 + (b || 0); };
/* Momento al que pertenece una hora del chat: la ventana que la contiene o,
   si cae entre dos, la más cercana dentro de la tolerancia. */
function momentoDeHora(hora) {
  if (!hora) return null;
  const m = enMinutos(hora);
  let mejor = null;
  VENTANAS.forEach(([ini, fin], i) => {
    const d = m < enMinutos(ini) ? enMinutos(ini) - m : m > enMinutos(fin) ? m - enMinutos(fin) : 0;
    if (!mejor || d < mejor.distancia) mejor = { indice: i, distancia: d };
  });
  if (mejor.distancia > TOLERANCIA) return null;
  return { ...mejor, exacto: mejor.distancia === 0 };
}

let DATA = [], PROG = { asignaciones: [] }, CHAT = { mensajes: [] }, TARD = { registros: [] }, DIAS = [], VISTA = 'promedio';
/* Sin cronograma no se puede cruzar con el formulario: no hay «sin reporte» ni cobertura. */
const hayCronograma = () => PROG.asignaciones.length > 0;

/* ---------- preparación ---------- */
function preparar(filas) {
  return filas.map(r => {
    const original = dia10(r[DATE]);
    const fecha = FECHAS_CORREGIDAS[original] || original;
    const estados = MOMENTOS.map(([k]) => r[k]).filter(Boolean);
    const notas = MOMENTOS.map(([k, c], i) => ({ indice: i, momento: momentoCorto(k), estado: r[k] || '', comentario: r[c] || '' }))
      .filter(n => n.comentario);
    return {
      ...r, fecha, fechaOriginal: original, corregida: fecha !== original,
      estados, notas,
      conformes: estados.filter(e => e === 'Conforme').length,
      observaciones: estados.filter(e => e === 'Con observación').length,
      sinVerificar: estados.filter(e => e === 'No se pudo verificar').length,
      noAplica: estados.filter(e => e === 'No aplica').length
    };
  });
}

function diasDeLaSemana() {
  const fechas = [...new Set([...PROG.asignaciones.map(a => a.fecha), ...DATA.map(r => r.fecha)])].sort();
  const nombre = {};
  for (const a of PROG.asignaciones) nombre[a.fecha] = a.dia;
  const diaDe = f => {
    const n = new Date(f + 'T12:00:00').toLocaleDateString('es-PE', { weekday: 'long' });
    return n ? n.charAt(0).toUpperCase() + n.slice(1) : shortDate(f);
  };
  return fechas.map(f => ({ fecha: f, dia: nombre[f] || diaDe(f) }));
}

/* ---------- filtros ---------- */
function filtered() {
  const s = $('sede').value, t = $('turno').value, m = $('monitor').value, e = $('estado').value;
  const q = $('buscar').value.trim().toLocaleLowerCase('es');
  return DATA.filter(r => {
    if (s && r[CAMPUS] !== s) return false;
    if (t && r[TURN] !== t) return false;
    if (m && r[MON] !== m) return false;
    if (e && !r.estados.includes(e)) return false;
    if (q && !Object.values(r).some(v => typeof v === 'string' && v.toLocaleLowerCase('es').includes(q))) return false;
    return true;
  });
}
function unique(key) { return [...new Set(DATA.map(r => r[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'es')); }
function fillSelect(id, values, etiqueta = v => v) {
  for (const v of values) { const o = document.createElement('option'); o.value = v; o.textContent = etiqueta(v); $(id).append(o); }
}

/* ---------- cruce cronograma vs formulario ---------- */
function reportoSlot(a, monitor) {
  return DATA.some(r => r.fecha === a.fecha && r[CAMPUS] === a.sede && r[TURN] === a.turno && r[MON] === monitor);
}
function faltantes() {
  const lista = [];
  for (const a of PROG.asignaciones) {
    for (const monitor of a.monitores) {
      if (reportoSlot(a, monitor)) continue;
      const cubiertoPorOtro = DATA.some(r => r.fecha === a.fecha && r[CAMPUS] === a.sede && r[TURN] === a.turno);
      lista.push({ ...a, monitor, cubiertoPorOtro });
    }
  }
  return lista.sort((x, y) => x.fecha.localeCompare(y.fecha) || x.sede.localeCompare(y.sede));
}
function cumplimiento() {
  const mapa = new Map();
  const tocar = n => { if (!mapa.has(n)) mapa.set(n, { monitor: n, prog: 0, rep: 0 }); return mapa.get(n); };
  for (const a of PROG.asignaciones) for (const m of a.monitores) {
    const fila = tocar(m); fila.prog++; if (reportoSlot(a, m)) fila.rep++;
  }
  return [...mapa.values()].sort((a, b) => (a.prog - a.rep) - (b.prog - b.rep) || a.monitor.localeCompare(b.monitor, 'es')).reverse();
}

/* ---------- KPIs ---------- */
function renderKpis(rows) {
  const estados = rows.flatMap(r => r.estados);
  const ok = estados.filter(e => e === 'Conforme').length;
  const obs = estados.filter(e => e === 'Con observación').length;
  const evaluables = ok + obs;
  const falt = faltantes();
  const promObs = rows.length ? (obs / rows.length).toFixed(1) : '0.0';
  const slots = PROG.asignaciones.reduce((n, a) => n + a.monitores.length, 0);
  const tard = TARD.registros || [];
  const tarjetas = [
    ['Respuestas', rows.length, `${new Set(rows.map(r => r[MON])).size} monitores con registro`, 'brand'],
    ['Conformidad promedio', pct(ok, evaluables) + '%', `${ok} conformes de ${evaluables} estados evaluables`, 'ok'],
    ['Observaciones', obs, `${promObs} por visita registrada`, 'warn'],
    ...(hayCronograma() ? [
      ['Cobertura del cronograma', pct(slots - falt.length, slots) + '%', `${slots - falt.length} de ${slots} turnos programados`, 'brand'],
      ['Sin reporte', falt.length, 'Monitores programados que no registraron', 'red']
    ] : [
      ['Sedes visitadas', new Set(rows.map(r => r[CAMPUS])).size, `${new Set(rows.map(r => r.fecha)).size} días con registro`, 'brand'],
      ['Tardanzas', tard.length, `${new Set(tard.map(t => t.docente)).size} docentes`, 'red']
    ])
  ];
  $('kpis').innerHTML = tarjetas.map(x =>
    `<article class="kpi ${x[3]}"><div class="label">${x[0]}</div><div class="value">${x[1]}</div><div class="hint">${esc(x[2])}</div></article>`).join('');
}

/* ---------- barras de estado ---------- */
function barraEstados(label, vals, extra = '') {
  const n = vals.reduce((a, b) => a + b, 0);
  const clases = ['ok', 'warn', 'neutral', 'neutral'];
  return `<div class="status-row"><span class="status-label">${esc(label)}</span>` +
    `<div class="stack" title="${ESTADOS.map((e, i) => e + ': ' + vals[i]).join(' - ')}">` +
    vals.map((v, i) => `<span class="${clases[i]}" style="width:${n ? v / n * 100 : 0}%"></span>`).join('') +
    `</div><span class="status-total">${extra || n}</span></div>`;
}

/* ---------- vista: promedio ---------- */
function renderPromedio(rows) {
  $('promedio-momentos').innerHTML = MOMENTOS.map(([k]) => {
    const vals = ESTADOS.map(s => rows.filter(r => r[k] === s).length);
    const conf = pct(vals[0], vals[0] + vals[1]);
    return barraEstados(momentoCorto(k), vals, `${conf}%`);
  }).join('') || '<div class="no-data">Sin resultados para estos filtros.</div>';

  const sedes = [...new Set(rows.map(r => r[CAMPUS]))].map(s => {
    const f = rows.filter(r => r[CAMPUS] === s);
    const ok = f.reduce((n, r) => n + r.conformes, 0), obs = f.reduce((n, r) => n + r.observaciones, 0);
    return {
      sede: s, n: f.length, conf: pct(ok, ok + obs), obs,
      promedio: f.length ? (obs / f.length).toFixed(1) : '0.0',
      tardanzas: tardanzasDe(s).length
    };
  }).sort((a, b) => a.conf - b.conf);

  $('promedio-sedes').innerHTML = sedes.length ? sedes.map(s => {
    const tono = s.conf >= 90 ? 'bien' : s.conf >= 75 ? 'medio' : 'alerta';
    return `<article class="sede-fila ${tono}">
      <div class="sede-nombre"><b>${nombreSede(s.sede)}</b><small>${s.n} ${s.n === 1 ? 'visita' : 'visitas'} - ${s.tardanzas} ${s.tardanzas === 1 ? 'tardanza' : 'tardanzas'}</small></div>
      <div class="sede-barra"><div style="width:${s.conf}%"></div></div>
      <div class="sede-cifras"><b>${s.conf}%</b><small>${s.promedio} obs/visita</small></div>
    </article>`;
  }).join('') : '<div class="no-data">Sin resultados.</div>';
}

/* ---------- tardanzas ---------- */
const tardanzasDe = sede => (TARD.registros || []).filter(t => t.sede === sede);
function renderTardanzas() {
  const todas = TARD.registros || [];
  const porSede = [...new Set(todas.map(t => t.sede))]
    .map(s => ({ sede: s, lista: tardanzasDe(s) }))
    .sort((a, b) => b.lista.length - a.lista.length);
  const docentes = new Set(todas.map(t => t.docente));
  const reincidentes = [...docentes].filter(d => todas.filter(t => t.docente === d).length > 1);

  $('tardanzas-sub').textContent =
    `${todas.length} tardanzas registradas en la semana - ${docentes.size} docentes - ${reincidentes.length} reincidentes`;

  $('tardanzas-sedes').innerHTML = porSede.length ? porSede.map(({ sede, lista }) => {
    const dias = [...new Set(lista.map(t => t.fecha))].length;
    return `<article class="tardanza-sede">
      <header><b>${nombreSede(sede)}</b><span class="grande">${lista.length}</span></header>
      <small>${new Set(lista.map(t => t.docente)).size} docentes en ${dias} ${dias === 1 ? 'día' : 'días'}</small>
      <ul>${lista.map(t => `<li><b>${esc(t.docente)}</b>${t.curso ? ' / ' + esc(t.curso) : ''}
        <span>${shortDate(t.fecha)}${todas.filter(x => x.docente === t.docente).length > 1 ? ' <i class="rein">reincidente</i>' : ''}</span>
        <em>${esc(t.detalle)} - fuente: ${esc(t.fuente)}</em></li>`).join('')}</ul>
    </article>`;
  }).join('') : '<div class="no-data">Sin tardanzas registradas.</div>';
}

/* ---------- vista: día por día ---------- */
function resumenDia(fecha, rows) {
  const f = rows.filter(r => r.fecha === fecha);
  const ok = f.reduce((n, r) => n + r.conformes, 0), obs = f.reduce((n, r) => n + r.observaciones, 0);
  const falt = faltantes().filter(x => x.fecha === fecha);
  return { fecha, filas: f, ok, obs, conf: pct(ok, ok + obs), faltantes: falt, sedes: new Set(f.map(r => r[CAMPUS])).size };
}
function renderDias(rows) {
  $('dias-cards').innerHTML = DIAS.map(d => {
    const r = resumenDia(d.fecha, rows);
    const tono = r.filas.length === 0 ? 'vacio' : r.conf < 80 ? 'alerta' : 'bien';
    return `<button class="dia-card ${tono}" data-fecha="${d.fecha}">
      <div class="dia-nombre">${esc(d.dia)}</div><div class="dia-fecha">${shortDate(d.fecha)}</div>
      <div class="dia-metricas"><span class="grande">${r.filas.length}</span><small>registros - ${r.sedes} sedes</small></div>
      <div class="dia-pills"><span class="pill ok">${r.conf}% conforme</span><span class="pill warn">${r.obs} obs.</span>${hayCronograma() ? `<span class="pill red">${r.faltantes.length} sin reporte</span>` : ''}</div>
      <div class="dia-cta">Ver hallazgos →</div></button>`;
  }).join('');
  for (const b of document.querySelectorAll('.dia-card')) b.onclick = () => abrirDia(b.dataset.fecha);

  $('dias-chart').innerHTML = DIAS.map(d => {
    const f = rows.filter(r => r.fecha === d.fecha);
    const vals = ESTADOS.map(s => f.reduce((n, r) => n + r.estados.filter(e => e === s).length, 0));
    return barraEstados(`${d.dia} ${shortDate(d.fecha).slice(0, 5)}`, vals, `${f.length} reg.`);
  }).join('');
}

function lineaChat(m) {
  return `<div class="chat-inline">
    <span class="chip-chat">Chat ${esc(m.hora)}${m.ubicacion && !m.ubicacion.exacto ? ' ±' + m.ubicacion.distancia + ' min' : ''}</span>
    <span><b>${esc(m.autor || 'Chat de coordinación')}:</b> ${esc(m.texto)}</span></div>`;
}

function bloquePrecision(p) {
  return `<div class="precision">
    <header><span class="chip-chat">Precisión del chat</span><b>${esc(p.tema)}</b><span>${nombreSede(p.sede)}${p.turno ? ' / ' + esc(p.turno) : ''}</span></header>
    ${p.dice_el_formulario ? `<p class="dice">El formulario dice: «${esc(p.dice_el_formulario)}»</p>` : ''}
    <p>${esc(p.texto)}</p>
    ${p.pendiente ? `<div class="pendiente"><b>Pendiente:</b> ${esc(p.pendiente)}</div>` : ''}
  </div>`;
}

function abrirDia(fecha) {
  const r = resumenDia(fecha, filtered());
  const d = DIAS.find(x => x.fecha === fecha) || { dia: '' };
  $('dia-titulo').textContent = `${d.dia} ${shortDate(fecha)}`;
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  $('dia-sub').textContent = [plural(r.filas.length, 'registro', 'registros'), `${r.conf}% de conformidad`,
    plural(r.obs, 'observación', 'observaciones'),
    ...(hayCronograma() ? [plural(r.faltantes.length, 'monitor sin reporte', 'monitores sin reporte')] : [])].join(' - ');

  const precisionesDe = (sede, turno) => (CHAT.precisiones || [])
    .filter(p => p.fecha === fecha && p.sede === sede && (!p.turno || p.turno === turno));
  const mensajesDelDia = CHAT.mensajes.filter(m => m.fecha === fecha).map(m => ({ ...m, ubicacion: momentoDeHora(m.hora) }));
  const chatDe = (sede, indice) => mensajesDelDia.filter(m => m.sede === sede && m.ubicacion && m.ubicacion.indice === indice);
  const hallazgos = r.filas
    .map(f => ({
      sede: f[CAMPUS], turno: f[TURN], monitor: f[MON], recomendacion: f['Recomendaciones'] || '',
      precisiones: precisionesDe(f[CAMPUS], f[TURN]),
      puntos: f.notas.filter(n => n.estado === 'Con observación' || n.estado === 'No se pudo verificar')
    }))
    .filter(h => h.puntos.length || h.precisiones.length);
  const nPuntos = hallazgos.reduce((n, h) => n + h.puntos.length, 0);

  const chat = mensajesDelDia;
  const sueltas = (CHAT.precisiones || []).filter(p => p.fecha === fecha && !hallazgos.some(h => h.precisiones.includes(p)));
  const adjuntas = hallazgos.reduce((n, h) => n + h.precisiones.length, 0);

  const bloque = (titulo, contenido, vacio) =>
    `<section class="det-bloque"><h4>${titulo}</h4>${contenido || `<p class="no-data">${vacio}</p>`}</section>`;

  $('dia-cuerpo').innerHTML =
    bloque(`Hallazgos del formulario (${nPuntos})`, hallazgos.map(h =>
      `<article class="hallazgo">
         <header><b>${nombreSede(h.sede)} / ${esc(h.turno)}</b><small>Monitor: ${esc(h.monitor)}</small></header>
         ${h.puntos.map(n => `<div class="punto ${n.estado === 'Con observación' ? '' : 'gris'}">
            <span class="state-chip ${n.estado === 'Con observación' ? 'warn' : 'neutral'}">${esc(n.momento)}: ${esc(n.estado)}</span>
            <span class="ventana">${VENTANAS[n.indice].join(' a ')}</span>
            <p>${esc(n.comentario) || 'Sin comentario registrado.'}</p>
            ${chatDe(h.sede, n.indice).map(m => lineaChat(m)).join('')}</div>`).join('')}
         ${h.precisiones.map(p => bloquePrecision(p)).join('')}
         ${h.recomendacion ? `<div class="reco"><b>Recomendación:</b> ${esc(h.recomendacion)}</div>` : ''}
       </article>`).join(''), 'Sin observaciones registradas este día.') +

    ((CHAT.mensajes.length || (CHAT.precisiones || []).length) ? bloque : () => '')(`Evidencia del chat de coordinación (${chat.length + sueltas.length + adjuntas})`,
      sueltas.map(p => bloquePrecision(p)).join('') + chat.map(m =>
      `<article class="chat-msg ${esc(m.tipo)}">
         <header><b>${esc(m.autor || 'Chat de coordinación')}</b><span>${[m.hora, m.sede,
            m.ubicacion ? momentoCorto(MOMENTOS[m.ubicacion.indice][0]) : null].filter(Boolean).map(esc).join(' - ')}</span></header>
         <p>${esc(m.texto)}</p></article>`).join(''),
      adjuntas ? `Las ${adjuntas} precisiones del chat de este día están adjuntas a los hallazgos de arriba.`
               : 'No hay mensajes del chat guardados para este día.') +

    (hayCronograma() ? bloque : () => '')(`Programados que no registraron (${r.faltantes.length})`, r.faltantes.length ?
      `<div class="table-wrap"><table><thead><tr><th>Sede / turno</th><th>Monitor</th><th>Aulas</th><th>Estado</th></tr></thead><tbody>` +
      r.faltantes.map(f => `<tr><td><b>${nombreSede(f.sede)}</b><br>${esc(f.turno)}</td><td>${esc(f.monitor)}</td><td>${f.aulas}</td>` +
        `<td>${f.cubiertoPorOtro ? '<span class="state-chip neutral">Turno cubierto por otro monitor</span>' : '<span class="state-chip red">Sin ningún registro del turno</span>'}</td></tr>`).join('') +
      `</tbody></table></div>` : '', 'Todos los monitores programados registraron el formulario.') +

    bloque(`Registros del día (${r.filas.length})`, r.filas.length ?
      `<div class="table-wrap"><table><thead><tr><th>Sede / turno</th><th>Monitor</th><th>Estados</th></tr></thead><tbody>` +
      r.filas.map(f => `<tr><td><b>${nombreSede(f[CAMPUS])}</b><br>${esc(f[TURN])}</td><td>${esc(f[MON])}${f.corregida ? '<br><span class="tag">fecha corregida</span>' : ''}</td>` +
        `<td>${MOMENTOS.map(([k]) => f[k] ? `<span class="state-chip ${f[k] === 'Con observación' ? 'warn' : f[k] === 'Conforme' ? '' : 'neutral'}">${esc(k.split(' ')[0])}: ${esc(f[k])}</span>` : '').join('')}</td></tr>`).join('') +
      `</tbody></table></div>` : '', 'Sin registros este día.');

  $('modal-dia').classList.add('abierto');
}

/* ---------- vista: sin reporte ---------- */
function renderFaltantes() {
  const falt = faltantes();
  $('faltantes-sub').textContent = `${falt.length} asignaciones del cronograma sin respuesta en el formulario`;
  $('faltantes-rows').innerHTML = falt.length ? falt.map(f =>
    `<tr><td>${esc(f.dia)}<br><small>${shortDate(f.fecha)}</small></td><td><b>${nombreSede(f.sede)}</b><br>${esc(f.turno)}</td>` +
    `<td>${esc(f.monitor)}</td><td>${f.aulas}</td>` +
    `<td>${f.cubiertoPorOtro ? '<span class="state-chip neutral">Turno cubierto por otro monitor</span>' : '<span class="state-chip red">Sin ningún registro del turno</span>'}</td></tr>`).join('')
    : '<tr><td colspan="5" class="empty">Todos los turnos programados tienen respuesta.</td></tr>';

  $('cumplimiento-rows').innerHTML = cumplimiento().map(c => {
    const p = pct(c.rep, c.prog);
    return `<tr><td>${esc(c.monitor)}</td><td>${c.prog}</td><td>${c.rep}</td><td>${c.prog - c.rep}</td>` +
      `<td><div class="mini-bar"><span class="${p === 100 ? 'ok' : p >= 50 ? 'warn' : 'red'}" style="width:${p}%"></span></div> ${p}%</td></tr>`;
  }).join('');

}


/* ---------- vista: respuestas ---------- */
function renderRespuestas(rows) {
  $('status-chart').innerHTML = MOMENTOS.map(([k]) =>
    barraEstados(momentoCorto(k), ESTADOS.map(s => rows.filter(r => r[k] === s).length))).join('') ||
    '<div class="no-data">Sin resultados para estos filtros.</div>';

  const campuses = [...new Set(rows.map(r => r[CAMPUS]))].map(s => [s, rows.filter(r => r[CAMPUS] === s).length]).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...campuses.map(x => x[1]));
  $('campus-chart').innerHTML = campuses.length ? campuses.map(([s, n]) =>
    `<div class="bar-row"><span>${nombreSede(s)}</span><div class="bar-track"><div class="bar-fill" style="width:${n / max * 100}%"></div></div><span class="bar-num">${n}</span></div>`).join('')
    : '<div class="no-data">Sin resultados.</div>';

  $('rows').innerHTML = rows.length ? rows.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).map(r => {
    const chips = MOMENTOS.map(([k]) => r[k] ? `<span class="state-chip ${r[k] === 'Con observación' ? 'warn' : r[k] === 'Conforme' ? '' : 'neutral'}">${esc(k.split(' ')[0])}: ${esc(r[k])}</span>` : '').join('');
    const notes = r.notas.map(n => `<div class="comment"><b>${esc(n.momento)}:</b> ${esc(n.comentario)}</div>`).join('');
    return `<tr><td>${shortDate(r.fecha)}${r.corregida ? '<br><span class="tag">corregida</span>' : ''}</td>` +
      `<td><b>${nombreSede(r[CAMPUS])}</b><br>${esc(r[TURN])}</td><td>${esc(r[MON])}</td><td>${chips}</td>` +
      `<td>${notes || '—'}${r['Recomendaciones'] ? `<div class="comment"><b>Recomendación:</b> ${esc(r['Recomendaciones'])}</div>` : ''}</td></tr>`;
  }).join('') : '<tr><td colspan="5" class="empty">No hay respuestas con los filtros elegidos.</td></tr>';
  $('table-count').textContent = `${rows.length} respuestas - usa los filtros para explorar`;
}

/* ---------- hallazgos transversales ---------- */
/* Semana 1: texto fijo. Desde la semana 2 se lee de datos/hallazgos_semanaN.json (ver init). */
let HALLAZGOS = [

  ['Break y retorno', 'Salidas tardías, retornos de hasta ~20 minutos y una demora que afectó el ingreso de estudiantes después del receso en Surco.', 'Fijar el tiempo permitido y verificar el retorno al aula en el 3er monitoreo.'],
  ['Desarrollo de clase', 'En monitoreos virtuales aparecen sesiones con actividades pendientes, sílabo no presentado, cierres sin ideas fuerza, fondos no institucionales y dificultades técnicas.', 'Seguimiento docente individual y resolver accesos antes de la siguiente visita.'],
  ['Información en sede', 'El chat del 19/10 reportó televisores con información desactualizada en San Juan de Lurigancho (TI como responsable); el formulario señala listado desactualizado en Ate, cambio de aula por aforo y ascensor fuera de servicio en San Juan de Lurigancho.', 'Asignar responsable y fecha para pantallas, aulas y mantenimiento.'],
  ['Asistencia y acceso', 'Un grupo sin estudiantes durante los primeros 15 minutos en Arequipa y docentes de otra línea ausentes en Surco; algunas observaciones no se verificaron por falta de acceso oportuno.', 'Validar asistencia con coordinación y habilitar el acceso al monitoreo virtual.'],
  ['Cobertura del cronograma', 'El cruce del cronograma con el formulario ya identifica los turnos programados sin respuesta; revisa la pestaña «Sin reporte» para el detalle por monitor.', 'Confirmar con cada monitor si la visita no se hizo o solo faltó registrarla.']
];
const HALLAZGOS_SEMANA1 = HALLAZGOS;
/* El hallazgo de puntualidad se arma con los datos, no con un texto fijo. */
function hallazgoPuntualidad() {
  const todas = TARD.registros || [];
  if (!todas.length) return null;
  const porSede = [...new Set(todas.map(t => t.sede))]
    .map(s => `${SEDES[s] || s}: ${tardanzasDe(s).length}`)
    .sort();
  const reincidentes = [...new Set(todas.map(t => t.docente))].filter(d => todas.filter(t => t.docente === d).length > 1);
  return ['Puntualidad y arranque',
    `${todas.length} tardanzas en la semana - ${porSede.join(' / ')}.`,
    reincidentes.length
      ? `Abrir seguimiento por reincidencia: ${reincidentes.join(' / ')}.`
      : 'Mantener el registro nominal de cada tardanza en el formulario.'];
}

function renderIssues() {
  $('issues').innerHTML = [hallazgoPuntualidad(), ...HALLAZGOS].filter(Boolean).map(([h, p, a]) =>
    `<article class="issue"><h4>${esc(h)}</h4><p>${esc(p)}</p><div class="action">Siguiente paso - ${esc(a)}</div></article>`).join('');
}

/* ---------- CSV ---------- */
const cell = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
function descargar(nombre, filas) {
  const text = filas.map(f => f.map(cell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
  a.download = nombre; a.click(); URL.revokeObjectURL(a.href);
}
function csvRespuestas() {
  const cols = ['Fecha', MON, CAMPUS, TURN, ...MOMENTOS.flat(), 'Recomendaciones'];
  descargar(`monitoreo_semana${SEMANA}_filtrado.csv`, [cols, ...filtered().map(r => cols.map(k => k === 'Fecha' ? shortDate(r.fecha) : r[k]))]);
}
function csvFaltantes() {
  const cols = ['Día', 'Fecha', 'Sede', 'Turno', 'Monitor programado', 'Aulas', 'Estado'];
  descargar(`monitoreo_semana${SEMANA}_sin_reporte.csv`, [cols, ...faltantes().map(f =>
    [f.dia, shortDate(f.fecha), SEDES[f.sede] || f.sede, f.turno, f.monitor, f.aulas, f.cubiertoPorOtro ? 'Turno cubierto por otro monitor' : 'Sin ningún registro del turno'])]);
}

/* ===== Reporte en diapositivas =====
   Mismo contenido en PDF (una diapositiva por página, A4 apaisado) y en PPT.
   Se arma con los datos ya filtrados, no con capturas de pantalla. */
function datosDelReporte() {
  const rows = filtered();
  const estados = rows.flatMap(r => r.estados);
  const ok = estados.filter(e => e === 'Conforme').length;
  const obs = estados.filter(e => e === 'Con observación').length;
  const falt = faltantes();
  const slots = PROG.asignaciones.reduce((n, a) => n + a.monitores.length, 0);
  const todasTard = TARD.registros || [];

  return {
    titulo: 'Monitoreo de visitas a sede',
    subtitulo: `${PROG.semana || 'Semana ' + SEMANA} - ${PROG.periodo || ''}`,
    kpis: [
      ['Respuestas', String(rows.length), `${new Set(rows.map(r => r[MON])).size} monitores con registro`],
      ['Conformidad promedio', pct(ok, ok + obs) + '%', `${ok} conformes de ${ok + obs} estados evaluables`],
      ['Observaciones', String(obs), `${rows.length ? (obs / rows.length).toFixed(1) : '0.0'} por visita`],
      ...(hayCronograma() ? [
        ['Cobertura del cronograma', pct(slots - falt.length, slots) + '%', `${slots - falt.length} de ${slots} turnos`],
        ['Sin reporte', String(falt.length), 'Monitores programados sin registro']
      ] : [
        ['Sedes visitadas', String(new Set(rows.map(r => r[CAMPUS])).size), 'Sedes con al menos un registro'],
        ['Días con registro', String(new Set(rows.map(r => r.fecha)).size), 'Días de la semana con visitas registradas']
      ]),
      ['Tardanzas', String(todasTard.length), `${new Set(todasTard.map(t => t.docente)).size} docentes`]
    ],
    momentos: MOMENTOS.map(([k], i) => {
      const c = rows.filter(r => r[k] === 'Conforme').length, o = rows.filter(r => r[k] === 'Con observación').length;
      return [momentoCorto(k), VENTANAS[i].join(' a '), String(c), String(o), pct(c, c + o) + '%'];
    }),
    sedes: [...new Set(rows.map(r => r[CAMPUS]))].map(s => {
      const f = rows.filter(r => r[CAMPUS] === s);
      const c = f.reduce((n, r) => n + r.conformes, 0), o = f.reduce((n, r) => n + r.observaciones, 0);
      return [SEDES[s] || s, String(f.length), pct(c, c + o) + '%', f.length ? (o / f.length).toFixed(1) : '0.0', String(tardanzasDe(s).length)];
    }).sort((a, b) => parseInt(a[2]) - parseInt(b[2])),
    dias: DIAS.map(d => {
      const r = resumenDia(d.fecha, rows);
      const fila = [`${d.dia} ${shortDate(d.fecha)}`, String(r.filas.length), r.conf + '%', String(r.obs)];
      return hayCronograma() ? [...fila, String(r.faltantes.length)] : fila;
    }),
    tardanzas: todasTard.map(t => [
      shortDate(t.fecha), SEDES[t.sede] || t.sede, t.docente, t.curso || '-',
      t.detalle + (todasTard.filter(x => x.docente === t.docente).length > 1 ? ' / reincidente' : '')
    ]),
    faltantes: falt.map(f => [
      `${f.dia} ${shortDate(f.fecha)}`, SEDES[f.sede] || f.sede, f.turno, f.monitor,
      f.cubiertoPorOtro ? 'Turno cubierto por otro monitor' : 'Sin ningún registro del turno'
    ]),
    hallazgos: [hallazgoPuntualidad(), ...HALLAZGOS].filter(Boolean)
  };
}

/* Identidad de la plantilla Certus 2026: azul marino, acentos magenta y celeste,
   Arial. Los fondos (con el logo de Certus arriba a la derecha) salen de la
   plantilla oficial: portada, contenido y cierre. */
const CERTUS = {
  azul: '071767', magenta: 'FC0045', celeste: '20D3FF', tinta: '1F2537', gris: '5B6478',
  borde: 'E3E7F0', zebra: 'F3F5FA', blanco: 'FFFFFF'
};
const FONDOS = { portada: 'certus/fondo_portada.jpg', contenido: 'certus/fondo_contenido.jpg', cierre: 'certus/fondo_cierre.jpg' };
const rgb = hex => [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
/* PDF y PPT comparten la retícula, en pulgadas de una diapositiva 16:9 */
const LAMINA = { w: 10, h: 5.625, mx: 0.5, tituloY: 0.3, bajadaY: 0.9, contenidoY: 1.2, pieY: 5.3 };
/* Columnas que van centradas (números y fechas) en cada tabla */
const CENTRADAS = { momentos: [1, 2, 3, 4], sedes: [1, 2, 3, 4], dias: [1, 2, 3, 4], tardanzas: [0], faltantes: [0, 2], hallazgos: [] };
/* Indicadores que se leen como alerta (van en magenta) */
const KPI_ALERTA = ['Observaciones', 'Sin reporte', 'Tardanzas'];
/* Diapositivas de tablas: [clave en datos, título, bajada, encabezados, anchos relativos] */
function laminasDeTablas(d) {
  return [
    ['momentos', 'Conformidad por momento de control', 'Estados evaluables: conforme y con observación',
      ['Momento', 'Ventana', 'Conforme', 'Con observación', 'Conformidad'], [3, 2, 1.4, 1.6, 1.4]],
    ['sedes', 'Promedio por sede', 'Ordenado de menor a mayor conformidad',
      ['Sede', 'Visitas', 'Conformidad', 'Obs. por visita', 'Tardanzas'], [3.4, 1.2, 1.5, 1.5, 1.3]],
    ['dias', 'La semana día por día', hayCronograma() ? 'Registros, conformidad y pendientes de cada día' : 'Registros y conformidad de cada día',
      hayCronograma() ? ['Día', 'Registros', 'Conformidad', 'Observaciones', 'Sin reporte'] : ['Día', 'Registros', 'Conformidad', 'Observaciones'],
      hayCronograma() ? [2.6, 1.4, 1.5, 1.6, 1.5] : [3.2, 1.8, 2, 2.2]],
    d.tardanzas.length && ['tardanzas', 'Docentes con tardanza', `${d.tardanzas.length} tardanzas registradas en la semana`,
      ['Fecha', 'Sede', 'Docente', 'Curso', 'Detalle'], [1.1, 1.6, 2.4, 2.4, 2.6]],
    d.faltantes.length && ['faltantes', 'Monitores programados sin reporte', `${d.faltantes.length} asignaciones del cronograma sin respuesta`,
      ['Día', 'Sede', 'Turno', 'Monitor programado', 'Estado'], [1.7, 1.8, 1.3, 2.8, 2.4]],
    ['hallazgos', 'Hallazgos y siguientes pasos', CHAT.mensajes.length ? 'Lectura conjunta del formulario y del chat de coordinación' : 'Lectura del formulario de monitoreo',
      ['Tema', 'Qué se observó', 'Siguiente paso'], [1.8, 4.2, 3.2]]
  ].filter(Boolean);
}

/* Las librerías del reporte se cargan al pulsar el botón y se intentan varios
   CDN: si uno está caído o bloqueado por la red de la sede, se usa el siguiente. */
function cargarScript(url) {
  return new Promise((ok, falla) => {
    const s = document.createElement('script');
    s.src = url; s.onload = ok; s.onerror = () => falla(new Error(url));
    document.head.append(s);
  });
}
async function asegurarLib(nombre, listo, urls) {
  if (listo()) return;
  for (const url of urls) {
    try { await cargarScript(url); } catch (e) { continue; }
    if (listo()) return;
  }
  throw new Error(`no se pudo cargar la librería de ${nombre} desde ningún servidor, revisa la conexión`);
}
const hayJsPDF = () => !!(window.jspdf && window.jspdf.jsPDF);
const hayAutoTable = () => hayJsPDF() && typeof window.jspdf.jsPDF.API.autoTable === 'function';
const hayPptx = () => typeof window.PptxGenJS !== 'undefined';

async function cargarLibsPDF() {
  await asegurarLib('PDF', hayJsPDF, [
    'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
    'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
  ]);
  await asegurarLib('tablas del PDF', hayAutoTable, [
    'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js',
    'https://unpkg.com/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'
  ]);
}
const cargarLibsPPT = () => asegurarLib('PPT', hayPptx, [
  'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js',
  'https://unpkg.com/pptxgenjs@3.12.0/dist/pptxgen.bundle.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pptxgenjs/3.12.0/pptxgen.bundle.js'
]);

/* Fondos como data URL (jsPDF los necesita así; pptxgenjs también los acepta) */
const FONDOS_CACHE = {};
async function fondo(nombre) {
  if (!FONDOS_CACHE[nombre]) {
    const r = await fetch(FONDOS[nombre]);
    if (!r.ok) throw new Error('no se encontró el fondo ' + FONDOS[nombre]);
    const blob = await r.blob();
    FONDOS_CACHE[nombre] = await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(blob); });
  }
  return FONDOS_CACHE[nombre];
}
const generadoEl = () => `Generado el ${new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}`;

async function reportePDF() {
  await cargarLibsPDF();
  const d = datosDelReporte();
  const [fPortada, fContenido, fCierre] = await Promise.all(['portada', 'contenido', 'cierre'].map(fondo));
  const { jsPDF } = window.jspdf;
  const L = LAMINA, M = L.mx;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'in', format: [L.h, L.w] });
  pdf.setFont('helvetica');   // equivalente métrico de Arial en el PDF
  let primera = true;
  const pagina = img => { if (!primera) pdf.addPage([L.h, L.w], 'landscape'); primera = false; pdf.addImage(img, 'JPEG', 0, 0, L.w, L.h); };
  const encabezado = (titulo, bajada) => {
    pdf.setTextColor(...rgb(CERTUS.azul)); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(22);
    pdf.text(titulo, M, L.tituloY + 0.3);
    if (bajada) { pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11); pdf.setTextColor(...rgb(CERTUS.gris)); pdf.text(bajada, M, L.bajadaY); }
  };
  const lamina = (titulo, bajada) => { pagina(fContenido); encabezado(titulo, bajada); };

  /* Portada: fondo azul con el edificio y el logo; texto a la izquierda */
  pagina(fPortada);
  pdf.setTextColor(...rgb(CERTUS.celeste)); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11);
  pdf.text('EQUIPO COT-PLN', 0.6, 1.75, { charSpace: 0.02 });
  pdf.setTextColor(255); pdf.setFontSize(34);
  pdf.text(pdf.splitTextToSize(d.titulo, 4.4), 0.6, 2.3, { lineHeightFactor: 1.05 });
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(16);
  pdf.text(d.subtitulo, 0.6, 3.55);
  pdf.setFontSize(11); pdf.setTextColor(210, 218, 245);
  pdf.text(generadoEl(), 0.6, 4.75);

  /* Indicadores en tarjetas */
  lamina('Indicadores de la semana', hayCronograma() ? 'Formulario de monitoreo cruzado con el cronograma y el chat de coordinación' : 'Formulario de monitoreo de visitas a sede');
  const gap = 0.3, ancho = (L.w - 2 * M - 2 * gap) / 3, alto = 1.8;
  d.kpis.forEach((k, i) => {
    const x = M + (i % 3) * (ancho + gap), y = L.contenidoY + Math.floor(i / 3) * (alto + gap);
    pdf.setFillColor(255, 255, 255); pdf.setDrawColor(...rgb(CERTUS.borde)); pdf.setLineWidth(0.01);
    pdf.roundedRect(x, y, ancho, alto, 0.12, 0.12, 'FD');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(...rgb(CERTUS.gris));
    pdf.text(k[0].toUpperCase(), x + 0.22, y + 0.4);
    pdf.setFontSize(32); pdf.setTextColor(...rgb(KPI_ALERTA.includes(k[0]) ? CERTUS.magenta : CERTUS.azul));
    pdf.text(k[1], x + 0.22, y + 1.05);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(...rgb(CERTUS.gris));
    pdf.text(pdf.splitTextToSize(k[2], ancho - 0.44).slice(0, 2), x + 0.22, y + 1.4);
  });

  /* Tablas: si una no cabe, sigue en otra lámina con el mismo fondo y título */
  for (const [clave, titulo, bajada, head, pesos] of laminasDeTablas(d)) {
    lamina(titulo, bajada);
    const total = pesos.reduce((a, b) => a + b, 0), util = L.w - 2 * M;
    const columnStyles = {};
    pesos.forEach((p, i) => { columnStyles[i] = { cellWidth: util * p / total, halign: CENTRADAS[clave].includes(i) ? 'center' : 'left' }; });
    pdf.autoTable({
      head: [head], body: d[clave], startY: L.contenidoY,
      margin: { left: M, right: M, top: L.contenidoY, bottom: L.h - L.pieY + 0.12 },
      styles: { font: 'helvetica', fontSize: 10, cellPadding: { top: 0.07, bottom: 0.07, left: 0.1, right: 0.1 },
        textColor: rgb(CERTUS.tinta), lineColor: rgb(CERTUS.borde), lineWidth: 0.008, valign: 'middle' },
      headStyles: { fillColor: rgb(CERTUS.azul), textColor: 255, fontStyle: 'bold', fontSize: 10 },
      alternateRowStyles: { fillColor: rgb(CERTUS.zebra) },
      bodyStyles: { fillColor: [255, 255, 255] },
      columnStyles, rowPageBreak: 'avoid',
      willDrawPage: data => { if (data.pageNumber > 1) { pdf.addImage(fContenido, 'JPEG', 0, 0, L.w, L.h); encabezado(titulo + ' (continuación)', bajada); } }
    });
  }

  /* Cierre: logo de Certus al centro (viene en el fondo) */
  pagina(fCierre);

  const n = pdf.internal.getNumberOfPages();
  for (let i = 2; i < n; i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...rgb(CERTUS.gris));
    pdf.text(`${d.titulo} · ${d.subtitulo}`, M, L.pieY + 0.12);
    pdf.text(`${i} / ${n}`, L.w - M, L.pieY + 0.12, { align: 'right' });
  }
  pdf.save(`monitoreo_semana${SEMANA}_diapositivas.pdf`);
}

/* PPT con diseños (layouts) Certus: portada, contenido y cierre. El fondo, el
   pie y el número de diapositiva van en el diseño, así se editan en un lugar. */
async function construirPPT() {
  await cargarLibsPPT();
  const d = datosDelReporte();
  const [fPortada, fContenido, fCierre] = await Promise.all(['portada', 'contenido', 'cierre'].map(fondo));
  const L = LAMINA, M = L.mx;
  const ppt = new PptxGenJS();
  ppt.layout = 'LAYOUT_16x9';
  ppt.theme = { headFontFace: 'Arial', bodyFontFace: 'Arial' };
  ppt.title = d.titulo; ppt.author = 'Equipo COT-PLN'; ppt.company = 'CERTUS';
  const pie = { fontFace: 'Arial', fontSize: 8, color: CERTUS.gris };
  ppt.defineSlideMaster({ title: 'CERTUS_PORTADA', background: { data: fPortada } });
  ppt.defineSlideMaster({
    title: 'CERTUS_CONTENIDO', background: { data: fContenido },
    objects: [{ text: { text: `${d.titulo} · ${d.subtitulo}`, options: Object.assign({ x: M, y: L.pieY - 0.02, w: 7, h: 0.25, margin: 0 }, pie) } }],
    slideNumber: Object.assign({ x: L.w - M - 1, y: L.pieY - 0.02, w: 1, h: 0.25, align: 'right' }, pie)
  });
  ppt.defineSlideMaster({ title: 'CERTUS_CIERRE', background: { data: fCierre } });

  const titulo = (s, t, bajada) => {
    s.addText(t, { x: M, y: L.tituloY, w: 7.6, h: 0.45, fontFace: 'Arial', fontSize: 24, bold: true, color: CERTUS.azul, margin: 0, isTextBox: true });
    if (bajada) s.addText(bajada, { x: M, y: L.bajadaY - 0.16, w: 7.6, h: 0.25, fontFace: 'Arial', fontSize: 12, color: CERTUS.gris, margin: 0, isTextBox: true });
  };
  const lamina = (t, bajada) => { const s = ppt.addSlide({ masterName: 'CERTUS_CONTENIDO' }); titulo(s, t, bajada); return s; };

  const portada = ppt.addSlide({ masterName: 'CERTUS_PORTADA' });
  portada.addText('EQUIPO COT-PLN', { x: 0.6, y: 1.5, w: 5, h: 0.3, fontFace: 'Arial', fontSize: 12, bold: true, color: CERTUS.celeste, charSpacing: 2, margin: 0, isTextBox: true });
  portada.addText(d.titulo, { x: 0.6, y: 1.9, w: 4.6, h: 1.35, fontFace: 'Arial', fontSize: 36, bold: true, color: CERTUS.blanco, margin: 0, valign: 'top', isTextBox: true });
  portada.addText(d.subtitulo, { x: 0.6, y: 3.3, w: 5.2, h: 0.4, fontFace: 'Arial', fontSize: 18, color: CERTUS.blanco, margin: 0, isTextBox: true });
  portada.addText(generadoEl(), { x: 0.6, y: 4.55, w: 5, h: 0.3, fontFace: 'Arial', fontSize: 12, color: 'D2DAF5', margin: 0, isTextBox: true });

  const ind = lamina('Indicadores de la semana', hayCronograma() ? 'Formulario de monitoreo cruzado con el cronograma y el chat de coordinación' : 'Formulario de monitoreo de visitas a sede');
  const gap = 0.3, ancho = (L.w - 2 * M - 2 * gap) / 3, alto = 1.8;
  d.kpis.forEach((k, i) => {
    const x = M + (i % 3) * (ancho + gap), y = L.contenidoY + Math.floor(i / 3) * (alto + gap);
    ind.addShape(ppt.ShapeType.roundRect, { x, y, w: ancho, h: alto, rectRadius: 0.12, fill: { color: CERTUS.blanco }, line: { color: CERTUS.borde, width: 0.75 }, objectName: 'Tarjeta ' + k[0] });
    ind.addText(k[0].toUpperCase(), { x: x + 0.22, y: y + 0.2, w: ancho - 0.44, h: 0.3, fontFace: 'Arial', fontSize: 10, bold: true, color: CERTUS.gris, margin: 0, isTextBox: true });
    ind.addText(k[1], { x: x + 0.22, y: y + 0.55, w: ancho - 0.44, h: 0.6, fontFace: 'Arial', fontSize: 34, bold: true, color: KPI_ALERTA.includes(k[0]) ? CERTUS.magenta : CERTUS.azul, margin: 0, isTextBox: true });
    ind.addText(k[2], { x: x + 0.22, y: y + 1.22, w: ancho - 0.44, h: 0.45, fontFace: 'Arial', fontSize: 10, color: CERTUS.gris, margin: 0, valign: 'top', isTextBox: true });
  });

  /* Las filas se reparten aquí (y no con autoPage de pptxgenjs, que parte el
     texto de una celda entre diapositivas): se estima el alto de cada fila por
     el largo de su texto y se abre otra diapositiva antes de llegar al pie. */
  const CHARS_PULGADA = 15, ALTO_LINEA = 0.165, ALTO_FILA = 0.12, ALTO_CABECERA = 0.3;
  const altoFila = (fila, colW) => ALTO_FILA + ALTO_LINEA *
    Math.max(...fila.map((c, i) => Math.max(1, Math.ceil(String(c).length / ((colW[i] - 0.16) * CHARS_PULGADA)))));
  for (const [clave, t, bajada, head, pesos] of laminasDeTablas(d)) {
    const total = pesos.reduce((a, b) => a + b, 0), util = L.w - 2 * M;
    const colW = pesos.map(p => util * p / total);
    const centro = i => CENTRADAS[clave].includes(i) ? 'center' : 'left';
    const disponible = L.pieY - 0.15 - L.contenidoY - ALTO_CABECERA;
    const tandas = [[]];
    let usado = 0;
    d[clave].forEach(f => {
      const h = altoFila(f, colW);
      if (usado + h > disponible && tandas[tandas.length - 1].length) { tandas.push([]); usado = 0; }
      tandas[tandas.length - 1].push(f); usado += h;
    });
    tandas.forEach((filas, n) => {
      const s = lamina(n ? t + ' (continuación)' : t, bajada);
      s.addTable([
        head.map((h, i) => ({ text: h, options: { bold: true, color: CERTUS.blanco, fill: { color: CERTUS.azul }, align: centro(i) } })),
        ...filas.map((f, r) => f.map((c, i) => ({ text: String(c), options: { color: CERTUS.tinta, align: centro(i), fill: { color: r % 2 ? CERTUS.zebra : CERTUS.blanco } } })))
      ], {
        x: M, y: L.contenidoY, w: util, colW, fontFace: 'Arial', fontSize: 10, valign: 'middle',
        margin: [0.04, 0.08, 0.04, 0.08], border: { type: 'solid', pt: 0.5, color: CERTUS.borde }, objectName: 'Tabla ' + t
      });
    });
  }

  ppt.addSlide({ masterName: 'CERTUS_CIERRE' });
  return ppt;
}
async function reportePPT() {
  const ppt = await construirPPT();
  await ppt.writeFile({ fileName: `monitoreo_semana${SEMANA}_diapositivas.pptx` });
}

async function generar(boton, fn, etiqueta) {
  const antes = boton.textContent;
  boton.disabled = true; boton.textContent = 'Generando…';
  try { await fn(); }
  catch (e) { alert('No se pudo generar el ' + etiqueta + ': ' + e.message); }
  finally { boton.disabled = false; boton.textContent = antes; }
}

/* ---------- render general ---------- */
function render() {
  const rows = filtered();
  $('filter-summary').textContent = `${rows.length} de ${DATA.length} respuestas - ${new Set(rows.map(r => r[MON])).size} monitores`;
  renderKpis(rows);
  renderTardanzas();
  renderIssues();
  renderPromedio(rows);
  renderDias(rows);
  renderFaltantes();
  renderRespuestas(rows);
}
function cambiarVista(v) {
  VISTA = v;
  for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.vista === v);
  for (const id of ['promedio', 'dias', 'faltantes', 'respuestas']) $('vista-' + id).classList.toggle('oculto', id !== v);
}

/* ---------- datos por semana ---------- */
async function pedir(url, obligatorio) {
  const res = await fetch(url);
  if (!res.ok) { if (obligatorio) throw new Error('No se encontró ' + url); return null; }
  return res.json();
}
async function cargarSemana(n) {
  if (CACHE[n]) return CACHE[n];
  const filas = await pedir(`datos/monitoreo_semana${n}.json`, true);
  const [prog, chat, tard, hall] = await Promise.all([
    pedir(`datos/programacion_semana${n}.json`), pedir(`datos/chat_semana${n}.json`),
    pedir(`datos/tardanzas_semana${n}.json`), n === 1 ? null : pedir(`datos/hallazgos_semana${n}.json`)
  ]);
  return (CACHE[n] = {
    DATA: preparar(filas),
    PROG: prog || { asignaciones: [] }, CHAT: chat || { mensajes: [] }, TARD: tard || { registros: [] },
    HALL: n === 1 ? HALLAZGOS_SEMANA1 : (hall && hall.hallazgos) || []
  });
}
/* Deja la semana n como la que muestran todas las vistas */
function usarSemana(n) {
  const c = CACHE[n];
  SEMANA = n; DATA = c.DATA; PROG = c.PROG; CHAT = c.CHAT; TARD = c.TARD; HALLAZGOS = c.HALL;
  DIAS = diasDeLaSemana();
}
function llenarFiltros() {
  for (const id of ['sede', 'turno', 'monitor']) {
    const s = $(id);
    while (s.options.length > 1) s.remove(1);
    s.value = '';
  }
  $('estado').value = ''; $('buscar').value = '';
  fillSelect('sede', unique(CAMPUS), v => SEDES[v] || v); fillSelect('turno', unique(TURN)); fillSelect('monitor', unique(MON));
}

/* ---------- comparativo entre semanas ---------- */
const normalizar = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
function estadisticas(c) {
  const filas = c.DATA, tard = c.TARD.registros || [];
  const ok = filas.reduce((n, r) => n + r.conformes, 0), obs = filas.reduce((n, r) => n + r.observaciones, 0);
  const sedes = {};
  for (const s of new Set([...filas.map(r => r[CAMPUS]), ...tard.map(t => t.sede)])) {
    const f = filas.filter(r => r[CAMPUS] === s);
    const o = f.reduce((n, r) => n + r.conformes, 0), b = f.reduce((n, r) => n + r.observaciones, 0);
    sedes[s] = { visitas: f.length, conf: o + b ? pct(o, o + b) : null, tard: tard.filter(t => t.sede === s).length };
  }
  // Cobertura: turnos del cronograma con registro del monitor asignado (mismo criterio que «Sin reporte»)
  let prog = 0, rep = 0;
  for (const a of c.PROG.asignaciones) for (const m of a.monitores) {
    prog++;
    if (filas.some(r => r.fecha === a.fecha && r[CAMPUS] === a.sede && r[TURN] === a.turno && r[MON] === m)) rep++;
  }
  return {
    prog, rep, cobertura: prog ? pct(rep, prog) : null,
    visitas: filas.length, monitores: new Set(filas.map(r => r[MON])).size,
    conf: pct(ok, ok + obs), obs, obsVisita: filas.length ? obs / filas.length : 0,
    tard: tard.length, tardVisita: filas.length ? tard.length / filas.length : 0,
    sedesN: new Set(filas.map(r => r[CAMPUS])).size, dias: new Set(filas.map(r => r.fecha)).size,
    momentos: MOMENTOS.map(([k]) => {
      const a = filas.filter(r => r[k] === 'Conforme').length, b = filas.filter(r => r[k] === 'Con observación').length;
      return a + b ? pct(a, a + b) : null;
    }),
    sedes, tardList: tard
  };
}
/* Diferencia entre dos valores; «mejor» dice si subir (alto) o bajar (bajo) es bueno. */
function delta(a, b, { mejor = null, unidad = '', dec = 0 } = {}) {
  if (a == null || b == null) return '<span class="delta neutro">—</span>';
  const d = +(b - a).toFixed(dec);
  const cls = d === 0 ? 'igual' : !mejor ? 'neutro' : (d > 0) === (mejor === 'alto') ? 'mejora' : 'empeora';
  const txt = d === 0 ? 'Sin cambio' : (d > 0 ? '+' : '−') + Math.abs(d).toFixed(dec) + (unidad ? ' ' + unidad : '');
  return `<span class="delta ${cls}">${txt}</span>`;
}
const barraPct = v => v == null ? '—' :
  `<div class="mini-bar"><span class="${v >= 90 ? '' : v >= 75 ? 'warn' : 'red'}" style="width:${v}%"></span></div> ${v}%`;

function renderComparativo() {
  const nA = SEMANAS[SEMANAS.length - 2], nB = SEMANAS[SEMANAS.length - 1];
  const A = estadisticas(CACHE[nA]), B = estadisticas(CACHE[nB]);
  const sA = `Semana ${nA}`, sB = `Semana ${nB}`;
  const nombre = s => SEDES[s] || s;

  const tarjeta = (titulo, a, b, fmt, opts, hint) =>
    `<article class="kpi cmp"><div class="label">${esc(titulo)}</div>
      <div class="cmp-vals"><span><small>${sA}</small><b>${fmt(a)}</b></span><i>→</i><span><small>${sB}</small><b>${fmt(b)}</b></span></div>
      ${delta(a, b, opts)}${hint ? `<div class="hint">${esc(hint)}</div>` : ''}</article>`;
  const entero = v => String(v), uno = v => v.toFixed(1), dos = v => v.toFixed(2), por = v => v + '%';
  const tarjetas = [
    tarjeta('Conformidad promedio', A.conf, B.conf, por, { mejor: 'alto', unidad: 'pts' }, 'Conformes sobre estados evaluables'),
    tarjeta('Observaciones por visita', A.obsVisita, B.obsVisita, uno, { mejor: 'bajo', dec: 1 }, `${A.obs} y ${B.obs} observaciones en total`),
    tarjeta('Tardanzas por visita', A.tardVisita, B.tardVisita, dos, { mejor: 'bajo', dec: 2 }, `${A.tard} y ${B.tard} tardanzas en total`),
    tarjeta('Respuestas', A.visitas, B.visitas, entero, {}, `${A.monitores} y ${B.monitores} monitores con registro`),
    A.cobertura != null && B.cobertura != null
      ? tarjeta('Cobertura del cronograma', A.cobertura, B.cobertura, por, { mejor: 'alto', unidad: 'pts' }, `${A.rep} de ${A.prog} y ${B.rep} de ${B.prog} turnos con registro`)
      : tarjeta('Sedes visitadas', A.sedesN, B.sedesN, entero, {}, 'Sedes con al menos un registro'),
    tarjeta('Días con registro', A.dias, B.dias, entero, {}, 'Días de la semana con visitas')
  ].join('');

  /* por sede */
  const sedesU = [...new Set([...Object.keys(A.sedes), ...Object.keys(B.sedes)])];
  const cambioSede = s => {
    const a = A.sedes[s], b = B.sedes[s];
    return a && b && a.conf != null && b.conf != null ? b.conf - a.conf : null;
  };
  sedesU.sort((x, y) => (cambioSede(x) ?? 999) - (cambioSede(y) ?? 999) || nombre(x).localeCompare(nombre(y), 'es'));
  const celdaSede = x => x && x.visitas
    ? `${barraPct(x.conf)}<small class="sub"> ${x.visitas} ${x.visitas === 1 ? 'visita' : 'visitas'}</small>`
    : '<span class="sin">Sin visitas</span>';
  const filasSedes = sedesU.map(s => {
    const a = A.sedes[s], b = B.sedes[s];
    const ta = a ? a.tard : 0, tb = b ? b.tard : 0;
    return `<tr><td><b>${esc(nombre(s))}</b></td><td>${celdaSede(a)}</td><td>${celdaSede(b)}</td>` +
      `<td>${delta(a && a.conf, b && b.conf, { mejor: 'alto', unidad: 'pts' })}</td>` +
      `<td>${ta} → ${tb} ${delta(ta, tb, { mejor: 'bajo' })}</td></tr>`;
  }).join('');

  /* por momento de control */
  const filasMomentos = MOMENTOS.map(([k], i) =>
    `<tr><td>${esc(momentoCorto(k))}<br><small class="sub">${VENTANAS[i].join(' a ')}</small></td><td>${barraPct(A.momentos[i])}</td><td>${barraPct(B.momentos[i])}</td>` +
    `<td>${delta(A.momentos[i], B.momentos[i], { mejor: 'alto', unidad: 'pts' })}</td></tr>`).join('');

  /* docentes con tardanza en las dos semanas */
  const agrupar = lista => {
    const m = new Map();
    for (const t of lista) { const k = normalizar(t.docente); if (!m.has(k)) m.set(k, []); m.get(k).push(t); }
    return m;
  };
  const gA = agrupar(A.tardList), gB = agrupar(B.tardList);
  const repetidos = [...gA.keys()].filter(k => gB.has(k) && !k.startsWith('DOCENTE NO IDENTIFICADO'));
  const donde = lista => lista.map(t => `${shortDate(t.fecha).slice(0, 5)} ${nombre(t.sede)}`).join(', ');

  /* lectura automática de lo que cambió */
  const puntos = [];
  const dc = B.conf - A.conf;
  puntos.push(dc === 0
    ? `La conformidad promedio se mantiene en ${B.conf}% entre ${sA} y ${sB}.`
    : `La conformidad promedio ${dc > 0 ? 'subió' : 'bajó'} de ${A.conf}% a ${B.conf}% (${Math.abs(dc)} pts).`);
  const comparables = sedesU.filter(s => cambioSede(s) !== null);
  if (comparables.length) {
    const peor = comparables[0], mejor = comparables[comparables.length - 1];
    if (cambioSede(peor) < 0) puntos.push(`Mayor caída por sede: ${nombre(peor)}, de ${A.sedes[peor].conf}% a ${B.sedes[peor].conf}% (${Math.abs(cambioSede(peor))} pts).`);
    if (cambioSede(mejor) > 0) puntos.push(`Mayor mejora por sede: ${nombre(mejor)}, de ${A.sedes[mejor].conf}% a ${B.sedes[mejor].conf}% (+${cambioSede(mejor)} pts).`);
  }
  const dMom = MOMENTOS.map((_, i) => A.momentos[i] == null || B.momentos[i] == null ? null : B.momentos[i] - A.momentos[i]);
  const iPeor = dMom.reduce((m, v, i) => v !== null && (m === -1 || v < dMom[m]) ? i : m, -1);
  const iMejor = dMom.reduce((m, v, i) => v !== null && (m === -1 || v > dMom[m]) ? i : m, -1);
  if (iPeor >= 0 && dMom[iPeor] < 0) puntos.push(`El momento de control que más cayó fue «${momentoCorto(MOMENTOS[iPeor][0])}»: de ${A.momentos[iPeor]}% a ${B.momentos[iPeor]}% (${Math.abs(dMom[iPeor])} pts).`);
  if (iMejor >= 0 && dMom[iMejor] > 0) puntos.push(`El que más mejoró fue «${momentoCorto(MOMENTOS[iMejor][0])}»: de ${A.momentos[iMejor]}% a ${B.momentos[iMejor]}% (+${dMom[iMejor]} pts).`);
  if (A.cobertura != null && B.cobertura != null && A.cobertura !== B.cobertura)
    puntos.push(`La cobertura del cronograma ${B.cobertura > A.cobertura ? 'subió' : 'bajó'} de ${A.cobertura}% a ${B.cobertura}%: ${B.rep} de ${B.prog} turnos programados tienen registro del monitor asignado.`);
  puntos.push(`Tardanzas: ${A.tard} en ${sA} (${A.tardVisita.toFixed(2)} por visita) y ${B.tard} en ${sB} (${B.tardVisita.toFixed(2)} por visita).`);
  const soloA = sedesU.filter(s => A.sedes[s] && A.sedes[s].visitas && !(B.sedes[s] && B.sedes[s].visitas));
  const soloB = sedesU.filter(s => B.sedes[s] && B.sedes[s].visitas && !(A.sedes[s] && A.sedes[s].visitas));
  if (soloA.length) puntos.push(`Sin visitas registradas en ${sB}: ${soloA.map(nombre).join(', ')}.`);
  if (soloB.length) puntos.push(`Sin visitas registradas en ${sA}: ${soloB.map(nombre).join(', ')}.`);
  puntos.push(repetidos.length
    ? `${repetidos.length} ${repetidos.length === 1 ? 'docente con tardanza' : 'docentes con tardanza'} en las dos semanas: ${repetidos.map(k => gB.get(k)[0].docente).join(', ')}.`
    : 'Ningún docente repite tardanza entre las dos semanas.');
  const cronoA = CACHE[nA].PROG.asignaciones.length > 0, cronoB = CACHE[nB].PROG.asignaciones.length > 0;

  $('comparativo').innerHTML =
    `<section class="kpis kpis-cmp">${tarjetas}</section>` +
    `<section class="panel"><div class="panel-head"><div><h3>Qué cambió de ${sA} a ${sB}</h3><p>Lectura automática de las diferencias entre ambas semanas</p></div><span class="tag">Comparativo</span></div>
       <ul class="cambios">${puntos.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
       <p class="nota-cmp">Las semanas tienen distinto número de visitas (${A.visitas} y ${B.visitas}): compara porcentajes y tasas por visita, no totales.${cronoA !== cronoB ? ` Solo ${cronoA ? sA : sB} tiene cronograma cargado, por eso no se compara la cobertura ni los monitores sin reporte.` : ''}</p></section>` +
    `<section class="panel"><div class="panel-head"><div><h3>Conformidad por sede</h3><p>Ordenado de la mayor caída a la mayor mejora</p></div></div>
       <div class="table-wrap"><table><thead><tr><th>Sede</th><th>${sA}</th><th>${sB}</th><th>Cambio</th><th>Tardanzas</th></tr></thead><tbody>${filasSedes}</tbody></table></div></section>` +
    `<section class="layout">
       <article class="panel"><div class="panel-head"><div><h3>Conformidad por momento de control</h3><p>Sobre los estados evaluables</p></div></div>
         <div class="table-wrap"><table><thead><tr><th>Momento</th><th>${sA}</th><th>${sB}</th><th>Cambio</th></tr></thead><tbody>${filasMomentos}</tbody></table></div></article>
       <article class="panel"><div class="panel-head"><div><h3>Docentes con tardanza en ambas semanas</h3><p>Coinciden por nombre en los registros de tardanza</p></div></div>
         ${repetidos.length ? `<ul class="repetidos">${repetidos.map(k => `<li><b>${esc(gB.get(k)[0].docente)}</b><span>${sA}: ${esc(donde(gA.get(k)))}</span><span>${sB}: ${esc(donde(gB.get(k)))}</span></li>`).join('')}</ul>`
           : '<div class="no-data">Ningún docente aparece con tardanza en las dos semanas.</div>'}</article>
     </section>`;
}

/* ---------- semana o comparativo ---------- */
function mostrar(sel) {
  const comparar = sel === 'comparar';
  document.body.classList.toggle('comparando', comparar);
  for (const b of document.querySelectorAll('#selector-semana button')) b.classList.toggle('on', b.dataset.sem === String(sel));
  $('intro-sub').textContent = comparar
    ? 'Qué cambió entre la semana anterior y la más reciente: conformidad, tardanzas y sedes.'
    : 'Promedio de la semana, detalle día por día y cruce del cronograma con el formulario para ver quién no reportó.';
  if (comparar) {
    $('periodo').textContent = 'Comparativo de semanas';
    renderComparativo();
    return;
  }
  usarSemana(Number(sel));
  $('periodo').textContent = PROG.periodo ? `${PROG.semana || 'Semana ' + SEMANA} - ${PROG.periodo}` : `Semana ${SEMANA}`;
  // Sin cronograma no hay pestaña «Sin reporte»
  document.querySelector('#tabs [data-vista="faltantes"]').hidden = !hayCronograma();
  llenarFiltros();
  render();
  cambiarVista(VISTA === 'faltantes' && !hayCronograma() ? 'promedio' : VISTA);
}

/* ---------- arranque ---------- */
async function init() {
  try {
    await Promise.all(SEMANAS.map(cargarSemana));

    for (const id of ['sede', 'turno', 'monitor', 'estado']) $(id).addEventListener('change', render);
    $('buscar').addEventListener('input', render);
    $('reset').onclick = () => { for (const id of ['sede', 'turno', 'monitor', 'estado', 'buscar']) $(id).value = ''; render(); };
    $('print').onclick = () => window.print();
    $('slides-pdf').onclick = () => generar($('slides-pdf'), reportePDF, 'PDF');
    $('slides-ppt').onclick = () => generar($('slides-ppt'), reportePPT, 'PPT');
    $('download').onclick = csvRespuestas;
    $('download-faltantes').onclick = csvFaltantes;
    for (const b of document.querySelectorAll('#tabs button')) b.onclick = () => cambiarVista(b.dataset.vista);
    for (const b of document.querySelectorAll('#selector-semana button')) b.onclick = () => mostrar(b.dataset.sem);
    $('modal-dia').addEventListener('click', e => { if (e.target.id === 'modal-dia' || e.target.hasAttribute('data-cerrar')) $('modal-dia').classList.remove('abierto'); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') $('modal-dia').classList.remove('abierto'); });

    // ?semana=1, ?semana=3 o ?semana=comparar; sin parámetro abre la semana más reciente
    const pedida = new URLSearchParams(location.search).get('semana');
    mostrar(pedida === 'comparar' || SEMANAS.includes(Number(pedida)) ? pedida : String(SEMANAS[SEMANAS.length - 1]));
  } catch (e) {
    document.querySelector('main').innerHTML =
      `<div class="panel">No se pudieron cargar los datos: ${esc(e.message)}. Abre esta página desde el servidor del proyecto (GitHub Pages o localhost).</div>`;
  }
}
if (new URLSearchParams(location.search).has('embed')) document.body.classList.add('embed');
init();
