/* ===== Monitoreo de visitas · Semana 1 =====
   Tres lecturas sobre los mismos datos:
   1. Promedio de la semana (conformidad por momento y por sede).
   2. Reporte por día: una tarjeta por día y, al hacer clic, el detalle de los hallazgos.
   3. Sin reporte: cruce del cronograma con el formulario para ver quién no registró.
   El chat de coordinación se usa como evidencia complementaria del día. */

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
  return fechas.map(f => ({ fecha: f, dia: nombre[f] || shortDate(f) }));
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
  const tarjetas = [
    ['Respuestas', rows.length, `${new Set(rows.map(r => r[MON])).size} monitores con registro`, 'brand'],
    ['Conformidad promedio', pct(ok, evaluables) + '%', `${ok} conformes de ${evaluables} estados evaluables`, 'ok'],
    ['Observaciones', obs, `${promObs} por visita registrada`, 'warn'],
    ['Cobertura del cronograma', pct(slots - falt.length, slots) + '%', `${slots - falt.length} de ${slots} turnos programados`, 'brand'],
    ['Sin reporte', falt.length, 'Monitores programados que no registraron', 'red']
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
      <div class="dia-pills"><span class="pill ok">${r.conf}% conforme</span><span class="pill warn">${r.obs} obs.</span><span class="pill red">${r.faltantes.length} sin reporte</span></div>
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
    plural(r.obs, 'observación', 'observaciones'), plural(r.faltantes.length, 'monitor sin reporte', 'monitores sin reporte')].join(' - ');

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

    bloque(`Evidencia del chat de coordinación (${chat.length + sueltas.length + adjuntas})`,
      sueltas.map(p => bloquePrecision(p)).join('') + chat.map(m =>
      `<article class="chat-msg ${esc(m.tipo)}">
         <header><b>${esc(m.autor || 'Chat de coordinación')}</b><span>${[m.hora, m.sede,
            m.ubicacion ? momentoCorto(MOMENTOS[m.ubicacion.indice][0]) : null].filter(Boolean).map(esc).join(' - ')}</span></header>
         <p>${esc(m.texto)}</p></article>`).join(''),
      adjuntas ? `Las ${adjuntas} precisiones del chat de este día están adjuntas a los hallazgos de arriba.`
               : 'No hay mensajes del chat guardados para este día.') +

    bloque(`Programados que no registraron (${r.faltantes.length})`, r.faltantes.length ?
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
const HALLAZGOS = [

  ['Break y retorno', 'Salidas tardías, retornos de hasta ~20 minutos y una demora que afectó el ingreso de estudiantes después del receso en Surco.', 'Fijar el tiempo permitido y verificar el retorno al aula en el 3er monitoreo.'],
  ['Desarrollo de clase', 'En monitoreos virtuales aparecen sesiones con actividades pendientes, sílabo no presentado, cierres sin ideas fuerza, fondos no institucionales y dificultades técnicas.', 'Seguimiento docente individual y resolver accesos antes de la siguiente visita.'],
  ['Información en sede', 'El chat del 19/10 reportó televisores con información desactualizada en San Juan de Lurigancho (TI como responsable); el formulario señala listado desactualizado en Ate, cambio de aula por aforo y ascensor fuera de servicio en San Juan de Lurigancho.', 'Asignar responsable y fecha para pantallas, aulas y mantenimiento.'],
  ['Asistencia y acceso', 'Un grupo sin estudiantes durante los primeros 15 minutos en Arequipa y docentes de otra línea ausentes en Surco; algunas observaciones no se verificaron por falta de acceso oportuno.', 'Validar asistencia con coordinación y habilitar el acceso al monitoreo virtual.'],
  ['Cobertura del cronograma', 'El cruce del cronograma con el formulario ya identifica los turnos programados sin respuesta; revisa la pestaña «Sin reporte» para el detalle por monitor.', 'Confirmar con cada monitor si la visita no se hizo o solo faltó registrarla.']
];
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
  descargar('monitoreo_semana1_filtrado.csv', [cols, ...filtered().map(r => cols.map(k => k === 'Fecha' ? shortDate(r.fecha) : r[k]))]);
}
function csvFaltantes() {
  const cols = ['Día', 'Fecha', 'Sede', 'Turno', 'Monitor programado', 'Aulas', 'Estado'];
  descargar('monitoreo_semana1_sin_reporte.csv', [cols, ...faltantes().map(f =>
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
    subtitulo: `${PROG.semana || 'Semana 1'} - ${PROG.periodo || ''}`,
    kpis: [
      ['Respuestas', String(rows.length), `${new Set(rows.map(r => r[MON])).size} monitores con registro`],
      ['Conformidad promedio', pct(ok, ok + obs) + '%', `${ok} conformes de ${ok + obs} estados evaluables`],
      ['Observaciones', String(obs), `${rows.length ? (obs / rows.length).toFixed(1) : '0.0'} por visita`],
      ['Cobertura del cronograma', pct(slots - falt.length, slots) + '%', `${slots - falt.length} de ${slots} turnos`],
      ['Sin reporte', String(falt.length), 'Monitores programados sin registro'],
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
      return [`${d.dia} ${shortDate(d.fecha)}`, String(r.filas.length), r.conf + '%', String(r.obs), String(r.faltantes.length)];
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

const MORADO = [113, 75, 103], TINTA = [45, 48, 58], SUAVE = [138, 144, 160];

async function reportePDF() {
  if (!window.jspdf) throw new Error('no se cargó la librería de PDF, revisa la conexión y recarga la página');
  const d = datosDelReporte();
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const AN = pdf.internal.pageSize.getWidth(), AL = pdf.internal.pageSize.getHeight(), M = 14;
  let primera = true;

  const diapositiva = (titulo, bajada) => {
    if (!primera) pdf.addPage();
    primera = false;
    pdf.setFillColor(...MORADO); pdf.rect(0, 0, AN, 17, 'F');
    pdf.setTextColor(255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13);
    pdf.text(titulo, M, 11);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
    pdf.text('CERTUS - COT-PLN', AN - M, 11, { align: 'right' });
    pdf.setTextColor(...SUAVE); pdf.setFontSize(9);
    if (bajada) pdf.text(bajada, M, 25);
    pdf.setTextColor(...TINTA);
  };
  const tabla = (head, body, y) => pdf.autoTable({
    head: [head], body, startY: y, margin: { left: M, right: M },
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.4, textColor: TINTA },
    headStyles: { fillColor: MORADO, textColor: 255, fontSize: 8.5 },
    alternateRowStyles: { fillColor: [248, 245, 248] }
  });

  /* Portada */
  pdf.setFillColor(...MORADO); pdf.rect(0, 0, AN, AL, 'F');
  pdf.setTextColor(255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(30);
  pdf.text(d.titulo, M, AL / 2 - 10);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(14);
  pdf.text(d.subtitulo, M, AL / 2 + 2);
  pdf.setFontSize(10);
  pdf.text(`Generado el ${new Date().toLocaleDateString('es-PE')}`, M, AL - 18);
  primera = false;

  /* Indicadores */
  diapositiva('Indicadores de la semana', 'Formulario de monitoreo cruzado con el cronograma y el chat de coordinación');
  const porFila = 3, anchoK = (AN - 2 * M - (porFila - 1) * 6) / porFila;
  let x = M, y = 34;
  d.kpis.forEach((k, i) => {
    if (i && i % porFila === 0) { x = M; y += 36; }
    pdf.setFillColor(248, 245, 248); pdf.setDrawColor(228, 222, 228);
    pdf.roundedRect(x, y, anchoK, 31, 3, 3, 'FD');
    pdf.setFontSize(8.5); pdf.setTextColor(...SUAVE); pdf.setFont('helvetica', 'bold');
    pdf.text(k[0], x + 5, y + 8);
    pdf.setFontSize(22); pdf.setTextColor(...MORADO);
    pdf.text(k[1], x + 5, y + 20);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...SUAVE);
    pdf.text(pdf.splitTextToSize(k[2], anchoK - 10).slice(0, 2), x + 5, y + 26);
    pdf.setTextColor(...TINTA);
    x += anchoK + 6;
  });

  diapositiva('Conformidad por momento de control', 'Estados evaluables: conforme y con observación');
  tabla(['Momento', 'Ventana', 'Conforme', 'Con observación', 'Conformidad'], d.momentos, 32);

  diapositiva('Promedio por sede', 'Ordenado de menor a mayor conformidad');
  tabla(['Sede', 'Visitas', 'Conformidad', 'Obs/visita', 'Tardanzas'], d.sedes, 32);

  diapositiva('La semana día por día', 'Registros, conformidad y pendientes de cada día');
  tabla(['Día', 'Registros', 'Conformidad', 'Observaciones', 'Sin reporte'], d.dias, 32);

  if (d.tardanzas.length) {
    diapositiva('Docentes con tardanza', `${d.tardanzas.length} tardanzas registradas en la semana`);
    tabla(['Fecha', 'Sede', 'Docente', 'Curso', 'Detalle'], d.tardanzas, 32);
  }
  if (d.faltantes.length) {
    diapositiva('Monitores programados sin reporte', `${d.faltantes.length} asignaciones del cronograma sin respuesta`);
    tabla(['Día', 'Sede', 'Turno', 'Monitor programado', 'Estado'], d.faltantes, 32);
  }

  diapositiva('Hallazgos y siguientes pasos', 'Lectura conjunta del formulario y del chat de coordinación');
  tabla(['Tema', 'Qué se observó', 'Siguiente paso'], d.hallazgos, 32);

  const n = pdf.internal.getNumberOfPages();
  for (let i = 2; i <= n; i++) {
    pdf.setPage(i);
    pdf.setFontSize(7.5); pdf.setTextColor(...SUAVE);
    pdf.text(`${d.titulo} - ${d.subtitulo}`, M, AL - 6);
    pdf.text(`${i} / ${n}`, AN - M, AL - 6, { align: 'right' });
  }
  pdf.save('monitoreo_semana1_diapositivas.pdf');
}

async function reportePPT() {
  if (typeof PptxGenJS === 'undefined') throw new Error('no se cargó la librería de PPT, revisa la conexión y recarga la página');
  const d = datosDelReporte();
  const ppt = new PptxGenJS();
  ppt.layout = 'LAYOUT_16x9';
  const MOR = '714B67', GRIS = '8A90A0', INK = '2D303A';

  const portada = ppt.addSlide();
  portada.background = { color: MOR };
  portada.addText(d.titulo, { x: 0.6, y: 2.0, w: 8.8, fontSize: 36, bold: true, color: 'FFFFFF' });
  portada.addText(d.subtitulo, { x: 0.6, y: 3.1, w: 8.8, fontSize: 18, color: 'F0E6EE' });
  portada.addText(`Generado el ${new Date().toLocaleDateString('es-PE')}`, { x: 0.6, y: 4.7, fontSize: 12, color: 'E3D4DE' });

  const nueva = (titulo, bajada) => {
    const s = ppt.addSlide();
    s.addShape(ppt.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.75, fill: { color: MOR } });
    s.addText(titulo, { x: 0.4, y: 0.12, w: 7.5, fontSize: 18, bold: true, color: 'FFFFFF' });
    s.addText('CERTUS - COT-PLN', { x: 7.4, y: 0.2, w: 2.2, fontSize: 10, color: 'F0E6EE', align: 'right' });
    if (bajada) s.addText(bajada, { x: 0.4, y: 0.85, w: 9.2, fontSize: 11, color: GRIS });
    return s;
  };
  const conTabla = (s, head, body) => s.addTable([
    head.map(h => ({ text: h, options: { bold: true, color: 'FFFFFF', fill: { color: MOR } } })),
    ...body.map(f => f.map(c => ({ text: String(c), options: { color: INK } })))
  ], { x: 0.4, y: 1.3, w: 9.2, fontSize: 10, border: { pt: 0.5, color: 'E5E7ED' }, autoPage: true });

  const ind = nueva('Indicadores de la semana', 'Formulario cruzado con el cronograma y el chat de coordinación');
  d.kpis.forEach((k, i) => {
    const x = 0.4 + (i % 3) * 3.12, y = 1.35 + Math.floor(i / 3) * 1.9;
    ind.addShape(ppt.ShapeType.roundRect, { x, y, w: 2.95, h: 1.65, fill: { color: 'F8F5F8' }, line: { color: 'E4DEE4' } });
    ind.addText(k[0], { x: x + 0.15, y: y + 0.1, w: 2.6, fontSize: 10, bold: true, color: GRIS });
    ind.addText(k[1], { x: x + 0.15, y: y + 0.45, w: 2.6, fontSize: 26, bold: true, color: MOR });
    ind.addText(k[2], { x: x + 0.15, y: y + 1.12, w: 2.65, fontSize: 9, color: GRIS });
  });

  conTabla(nueva('Conformidad por momento de control', 'Estados evaluables: conforme y con observación'),
    ['Momento', 'Ventana', 'Conforme', 'Con observación', 'Conformidad'], d.momentos);
  conTabla(nueva('Promedio por sede', 'Ordenado de menor a mayor conformidad'),
    ['Sede', 'Visitas', 'Conformidad', 'Obs/visita', 'Tardanzas'], d.sedes);
  conTabla(nueva('La semana día por día', 'Registros, conformidad y pendientes de cada día'),
    ['Día', 'Registros', 'Conformidad', 'Observaciones', 'Sin reporte'], d.dias);
  if (d.tardanzas.length) conTabla(nueva('Docentes con tardanza', `${d.tardanzas.length} tardanzas registradas`),
    ['Fecha', 'Sede', 'Docente', 'Curso', 'Detalle'], d.tardanzas);
  if (d.faltantes.length) conTabla(nueva('Monitores programados sin reporte', `${d.faltantes.length} asignaciones sin respuesta`),
    ['Día', 'Sede', 'Turno', 'Monitor programado', 'Estado'], d.faltantes);
  conTabla(nueva('Hallazgos y siguientes pasos', 'Lectura conjunta del formulario y del chat'),
    ['Tema', 'Qué se observó', 'Siguiente paso'], d.hallazgos);

  await ppt.writeFile({ fileName: 'monitoreo_semana1_diapositivas.pptx' });
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

/* ---------- arranque ---------- */
async function init() {
  try {
    const pedir = async (url, obligatorio) => {
      const res = await fetch(url);
      if (!res.ok) { if (obligatorio) throw new Error('No se encontró ' + url); return null; }
      return res.json();
    };
    DATA = preparar(await pedir('datos/monitoreo_semana1.json', true));
    PROG = (await pedir('datos/programacion_semana1.json')) || { asignaciones: [] };
    CHAT = (await pedir('datos/chat_semana1.json')) || { mensajes: [] };
    TARD = (await pedir('datos/tardanzas_semana1.json')) || { registros: [] };
    DIAS = diasDeLaSemana();

    if (PROG.periodo) $('periodo').textContent = `${PROG.semana || 'Semana 1'} - ${PROG.periodo}`;
    fillSelect('sede', unique(CAMPUS), v => SEDES[v] || v); fillSelect('turno', unique(TURN)); fillSelect('monitor', unique(MON));

    render();
    cambiarVista('promedio');

    for (const id of ['sede', 'turno', 'monitor', 'estado']) $(id).addEventListener('change', render);
    $('buscar').addEventListener('input', render);
    $('reset').onclick = () => { for (const id of ['sede', 'turno', 'monitor', 'estado', 'buscar']) $(id).value = ''; render(); };
    $('print').onclick = () => window.print();
    $('slides-pdf').onclick = () => generar($('slides-pdf'), reportePDF, 'PDF');
    $('slides-ppt').onclick = () => generar($('slides-ppt'), reportePPT, 'PPT');
    $('download').onclick = csvRespuestas;
    $('download-faltantes').onclick = csvFaltantes;
    for (const b of document.querySelectorAll('#tabs button')) b.onclick = () => cambiarVista(b.dataset.vista);
    $('modal-dia').addEventListener('click', e => { if (e.target.id === 'modal-dia' || e.target.hasAttribute('data-cerrar')) $('modal-dia').classList.remove('abierto'); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') $('modal-dia').classList.remove('abierto'); });
  } catch (e) {
    document.querySelector('main').innerHTML =
      `<div class="panel">No se pudieron cargar los datos: ${esc(e.message)}. Abre esta página desde el servidor del proyecto (GitHub Pages o localhost).</div>`;
  }
}
if (new URLSearchParams(location.search).has('embed')) document.body.classList.add('embed');
init();
