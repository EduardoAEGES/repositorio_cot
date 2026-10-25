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
/* Fechas mal capturadas en el formulario: 19/12/2026 corresponde al lunes 19/10/2026
   (mismo monitor, misma sede y el chat de ese día confirma el reporte). */
const FECHAS_CORREGIDAS = { '2026-12-19': '2026-10-19' };

const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dia10 = v => String(v ?? '').slice(0, 10);
const shortDate = v => { const [y, m, d] = dia10(v).split('-'); return d ? `${d}/${m}/${y}` : '—'; };
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
const momentoCorto = k => k.replace(/ \(.+/, '');

let DATA = [], PROG = { asignaciones: [] }, CHAT = { mensajes: [] }, DIAS = [], VISTA = 'promedio';

/* ---------- preparación ---------- */
function preparar(filas) {
  return filas.map(r => {
    const original = dia10(r[DATE]);
    const fecha = FECHAS_CORREGIDAS[original] || original;
    const estados = MOMENTOS.map(([k]) => r[k]).filter(Boolean);
    const notas = MOMENTOS.filter(([, c]) => r[c]).map(([k, c]) => ({ momento: momentoCorto(k), estado: r[k] || '', comentario: r[c] }));
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
function fillSelect(id, values) { for (const v of values) { const o = document.createElement('option'); o.value = v; o.textContent = v; $(id).append(o); } }

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
function extras() {
  return DATA.filter(r => {
    const a = PROG.asignaciones.find(a => a.fecha === r.fecha && a.sede === r[CAMPUS] && a.turno === r[TURN]);
    return !a || !a.monitores.includes(r[MON]);
  });
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
    `<div class="stack" title="${ESTADOS.map((e, i) => e + ': ' + vals[i]).join(' · ')}">` +
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
    return { sede: s, n: f.length, conf: pct(ok, ok + obs), obs, promedio: f.length ? (obs / f.length).toFixed(1) : '0.0' };
  }).sort((a, b) => a.conf - b.conf);

  $('promedio-sedes').innerHTML = sedes.length ? sedes.map(s =>
    `<div class="bar-row"><span>${esc(s.sede)}</span><div class="bar-track"><div class="bar-fill ${s.conf < 80 ? 'alerta' : ''}" style="width:${s.conf}%"></div></div>` +
    `<span class="bar-num">${s.conf}% · ${s.promedio} obs/visita</span></div>`).join('')
    : '<div class="no-data">Sin resultados.</div>';
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
      <div class="dia-metricas"><span class="grande">${r.filas.length}</span><small>registros · ${r.sedes} sedes</small></div>
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

function bloquePrecision(p) {
  return `<div class="precision">
    <header><span class="chip-chat">Precisión del chat</span><b>${esc(p.tema)}</b><span>${esc(p.sede)}${p.turno ? ' · ' + esc(p.turno) : ''}</span></header>
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
    plural(r.obs, 'observación', 'observaciones'), plural(r.faltantes.length, 'monitor sin reporte', 'monitores sin reporte')].join(' · ');

  const precisionesDe = (sede, turno) => (CHAT.precisiones || [])
    .filter(p => p.fecha === fecha && p.sede === sede && (!p.turno || p.turno === turno));
  const hallazgos = r.filas
    .map(f => ({
      sede: f[CAMPUS], turno: f[TURN], monitor: f[MON], recomendacion: f['Recomendaciones'] || '',
      precisiones: precisionesDe(f[CAMPUS], f[TURN]),
      puntos: f.notas.filter(n => n.estado === 'Con observación' || n.estado === 'No se pudo verificar')
    }))
    .filter(h => h.puntos.length || h.precisiones.length);
  const nPuntos = hallazgos.reduce((n, h) => n + h.puntos.length, 0);

  const chat = CHAT.mensajes.filter(m => m.fecha === fecha);
  const sueltas = (CHAT.precisiones || []).filter(p => p.fecha === fecha && !hallazgos.some(h => h.precisiones.includes(p)));
  const adjuntas = hallazgos.reduce((n, h) => n + h.precisiones.length, 0);

  const bloque = (titulo, contenido, vacio) =>
    `<section class="det-bloque"><h4>${titulo}</h4>${contenido || `<p class="no-data">${vacio}</p>`}</section>`;

  $('dia-cuerpo').innerHTML =
    bloque(`Hallazgos del formulario (${nPuntos})`, hallazgos.map(h =>
      `<article class="hallazgo">
         <header><b>${esc(h.sede)} · ${esc(h.turno)}</b><small>Monitor: ${esc(h.monitor)}</small></header>
         ${h.puntos.map(n => `<div class="punto ${n.estado === 'Con observación' ? '' : 'gris'}">
            <span class="state-chip ${n.estado === 'Con observación' ? 'warn' : 'neutral'}">${esc(n.momento)}: ${esc(n.estado)}</span>
            <p>${esc(n.comentario) || 'Sin comentario registrado.'}</p></div>`).join('')}
         ${h.precisiones.map(p => bloquePrecision(p)).join('')}
         ${h.recomendacion ? `<div class="reco"><b>Recomendación:</b> ${esc(h.recomendacion)}</div>` : ''}
       </article>`).join(''), 'Sin observaciones registradas este día.') +

    bloque(`Evidencia del chat de coordinación (${chat.length + sueltas.length + adjuntas})`,
      sueltas.map(p => bloquePrecision(p)).join('') + chat.map(m =>
      `<article class="chat-msg ${esc(m.tipo)}">
         <header><b>${esc(m.autor)}</b><span>${esc(m.hora)}${m.sede ? ' · ' + esc(m.sede) : ''}</span></header>
         <p>${esc(m.texto)}</p></article>`).join(''),
      adjuntas ? `Las ${adjuntas} precisiones del chat de este día están adjuntas a los hallazgos de arriba.`
               : 'No hay mensajes del chat guardados para este día.') +

    bloque(`Programados que no registraron (${r.faltantes.length})`, r.faltantes.length ?
      `<div class="table-wrap"><table><thead><tr><th>Sede / turno</th><th>Monitor</th><th>Aulas</th><th>Estado</th></tr></thead><tbody>` +
      r.faltantes.map(f => `<tr><td><b>${esc(f.sede)}</b><br>${esc(f.turno)}</td><td>${esc(f.monitor)}</td><td>${f.aulas}</td>` +
        `<td>${f.cubiertoPorOtro ? '<span class="state-chip neutral">Turno cubierto por otro monitor</span>' : '<span class="state-chip red">Sin ningún registro del turno</span>'}</td></tr>`).join('') +
      `</tbody></table></div>` : '', 'Todos los monitores programados registraron el formulario.') +

    bloque(`Registros del día (${r.filas.length})`, r.filas.length ?
      `<div class="table-wrap"><table><thead><tr><th>Sede / turno</th><th>Monitor</th><th>Estados</th></tr></thead><tbody>` +
      r.filas.map(f => `<tr><td><b>${esc(f[CAMPUS])}</b><br>${esc(f[TURN])}</td><td>${esc(f[MON])}${f.corregida ? '<br><span class="tag">fecha corregida</span>' : ''}</td>` +
        `<td>${MOMENTOS.map(([k]) => f[k] ? `<span class="state-chip ${f[k] === 'Con observación' ? 'warn' : f[k] === 'Conforme' ? '' : 'neutral'}">${esc(k.split(' ')[0])}: ${esc(f[k])}</span>` : '').join('')}</td></tr>`).join('') +
      `</tbody></table></div>` : '', 'Sin registros este día.');

  $('modal-dia').classList.add('abierto');
}

/* ---------- vista: sin reporte ---------- */
function renderFaltantes() {
  const falt = faltantes();
  $('faltantes-sub').textContent = `${falt.length} asignaciones del cronograma sin respuesta en el formulario`;
  $('faltantes-rows').innerHTML = falt.length ? falt.map(f =>
    `<tr><td>${esc(f.dia)}<br><small>${shortDate(f.fecha)}</small></td><td><b>${esc(f.sede)}</b><br>${esc(f.turno)}</td>` +
    `<td>${esc(f.monitor)}</td><td>${f.aulas}</td>` +
    `<td>${f.cubiertoPorOtro ? '<span class="state-chip neutral">Turno cubierto por otro monitor</span>' : '<span class="state-chip red">Sin ningún registro del turno</span>'}</td></tr>`).join('')
    : '<tr><td colspan="5" class="empty">Todos los turnos programados tienen respuesta.</td></tr>';

  $('cumplimiento-rows').innerHTML = cumplimiento().map(c => {
    const p = pct(c.rep, c.prog);
    return `<tr><td>${esc(c.monitor)}</td><td>${c.prog}</td><td>${c.rep}</td><td>${c.prog - c.rep}</td>` +
      `<td><div class="mini-bar"><span class="${p === 100 ? 'ok' : p >= 50 ? 'warn' : 'red'}" style="width:${p}%"></span></div> ${p}%</td></tr>`;
  }).join('');

  const grupos = new Map();
  for (const r of extras()) {
    const clave = [r.fecha, r[CAMPUS], r[TURN], r[MON]].join('|');
    if (!grupos.has(clave)) grupos.set(clave, { r, n: 0 });
    grupos.get(clave).n++;
  }
  const ex = [...grupos.values()].sort((a, b) => a.r.fecha.localeCompare(b.r.fecha));
  $('extras-rows').innerHTML = ex.length ? ex.map(({ r, n }) => {
    const programado = PROG.asignaciones.find(a => a.fecha === r.fecha && a.sede === r[CAMPUS] && a.turno === r[TURN]);
    const jefatura = programado && programado.jefatura && programado.jefatura.length
      ? ` Acompaña la jefatura: ${programado.jefatura.join(' / ')}.` : '';
    const motivo = (!programado || !programado.monitores.length
      ? 'El cronograma no tiene monitor asignado a este bloque.'
      : `El cronograma asignaba este turno a ${programado.monitores.join(' / ')}.`) + jefatura;
    return `<tr><td>${shortDate(r.fecha)}${r.corregida ? '<br><span class="tag">corregida desde ' + shortDate(r.fechaOriginal) + '</span>' : ''}</td>` +
      `<td><b>${esc(r[CAMPUS])}</b><br>${esc(r[TURN])}</td><td>${esc(r[MON])}${n > 1 ? ` <span class="tag">${n} registros</span>` : ''}</td>` +
      `<td>${esc(motivo)}</td></tr>`;
  }).join('') : '<tr><td colspan="4" class="empty">Todas las respuestas coinciden con el cronograma.</td></tr>';
}

/* ---------- vista: respuestas ---------- */
function renderRespuestas(rows) {
  $('status-chart').innerHTML = MOMENTOS.map(([k]) =>
    barraEstados(momentoCorto(k), ESTADOS.map(s => rows.filter(r => r[k] === s).length))).join('') ||
    '<div class="no-data">Sin resultados para estos filtros.</div>';

  const campuses = [...new Set(rows.map(r => r[CAMPUS]))].map(s => [s, rows.filter(r => r[CAMPUS] === s).length]).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...campuses.map(x => x[1]));
  $('campus-chart').innerHTML = campuses.length ? campuses.map(([s, n]) =>
    `<div class="bar-row"><span>${esc(s)}</span><div class="bar-track"><div class="bar-fill" style="width:${n / max * 100}%"></div></div><span class="bar-num">${n}</span></div>`).join('')
    : '<div class="no-data">Sin resultados.</div>';

  $('rows').innerHTML = rows.length ? rows.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).map(r => {
    const chips = MOMENTOS.map(([k]) => r[k] ? `<span class="state-chip ${r[k] === 'Con observación' ? 'warn' : r[k] === 'Conforme' ? '' : 'neutral'}">${esc(k.split(' ')[0])}: ${esc(r[k])}</span>` : '').join('');
    const notes = r.notas.map(n => `<div class="comment"><b>${esc(n.momento)}:</b> ${esc(n.comentario)}</div>`).join('');
    return `<tr><td>${shortDate(r.fecha)}${r.corregida ? '<br><span class="tag">corregida</span>' : ''}</td>` +
      `<td><b>${esc(r[CAMPUS])}</b><br>${esc(r[TURN])}</td><td>${esc(r[MON])}</td><td>${chips}</td>` +
      `<td>${notes || '—'}${r['Recomendaciones'] ? `<div class="comment"><b>Recomendación:</b> ${esc(r['Recomendaciones'])}</div>` : ''}</td></tr>`;
  }).join('') : '<tr><td colspan="5" class="empty">No hay respuestas con los filtros elegidos.</td></tr>';
  $('table-count').textContent = `${rows.length} respuestas · usa los filtros para explorar`;
}

/* ---------- hallazgos transversales ---------- */
const HALLAZGOS = [
  ['Puntualidad y arranque', 'AQP reportó el 19/10 en el chat “todos los docentes presentes, pero con tardanza”; el monitor indicó tenerlos anotados y los nombres siguen pendientes de entrega. VES documentó dos tardanzas y SJL pidió reforzar la llegada anticipada.', 'Pedir a AQP la lista nominal de tardanzas del 19/10 y registrarla en el formulario.'],
  ['Break y retorno', 'Salidas tardías, retornos de hasta ~20 minutos y una demora que afectó el ingreso de estudiantes después del receso en SUR.', 'Fijar el tiempo permitido y verificar el retorno al aula en el 3er monitoreo.'],
  ['Desarrollo de clase', 'En monitoreos virtuales aparecen sesiones con actividades pendientes, sílabo no presentado, cierres sin ideas fuerza, fondos no institucionales y dificultades técnicas.', 'Seguimiento docente individual y resolver accesos antes de la siguiente visita.'],
  ['Información en sede', 'El chat del 19/10 reportó televisores con información desactualizada en SJL (TI como responsable); el formulario señala listado desactualizado en ATE, cambio de aula por aforo y ascensor fuera de servicio en SJL.', 'Asignar responsable y fecha para pantallas, aulas y mantenimiento.'],
  ['Asistencia y acceso', 'Un grupo sin estudiantes durante los primeros 15 minutos en AQP y docentes de otra línea ausentes en SUR; algunas observaciones no se verificaron por falta de acceso oportuno.', 'Validar asistencia con coordinación y habilitar el acceso al monitoreo virtual.'],
  ['Cobertura del cronograma', 'El cruce del cronograma con el formulario ya identifica los turnos programados sin respuesta; revisa la pestaña «Sin reporte» para el detalle por monitor.', 'Confirmar con cada monitor si la visita no se hizo o solo faltó registrarla.']
];
function renderIssues() {
  $('issues').innerHTML = HALLAZGOS.map(([h, p, a]) =>
    `<article class="issue"><h4>${esc(h)}</h4><p>${esc(p)}</p><div class="action">Siguiente paso · ${esc(a)}</div></article>`).join('');
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
    [f.dia, shortDate(f.fecha), f.sede, f.turno, f.monitor, f.aulas, f.cubiertoPorOtro ? 'Turno cubierto por otro monitor' : 'Sin ningún registro del turno'])]);
}

/* ---------- render general ---------- */
function render() {
  const rows = filtered();
  $('filter-summary').textContent = `${rows.length} de ${DATA.length} respuestas · ${new Set(rows.map(r => r[MON])).size} monitores`;
  renderKpis(rows);
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
    DIAS = diasDeLaSemana();

    if (PROG.periodo) $('periodo').textContent = `${PROG.semana || 'Semana 1'} · ${PROG.periodo}`;
    fillSelect('sede', unique(CAMPUS)); fillSelect('turno', unique(TURN)); fillSelect('monitor', unique(MON));

    renderIssues();
    render();
    cambiarVista('promedio');

    const corregidas = DATA.filter(r => r.corregida).length;
    $('note-text').textContent = (PROG.nota_jefatura ? PROG.nota_jefatura + ' ' : '') + (corregidas
      ? `${corregidas} respuestas llegaron fechadas ${shortDate(Object.keys(FECHAS_CORREGIDAS)[0])} y se reasignaron al ${shortDate(Object.values(FECHAS_CORREGIDAS)[0])}, que es el día que confirman el cronograma y el chat. Los registros múltiples de un mismo monitor en un turno corresponden a aulas distintas, no a visitas extra.`
      : 'Sin fechas por corregir en esta semana.');
    $('date-alert').textContent = `${corregidas} fechas corregidas`;

    for (const id of ['sede', 'turno', 'monitor', 'estado']) $(id).addEventListener('change', render);
    $('buscar').addEventListener('input', render);
    $('reset').onclick = () => { for (const id of ['sede', 'turno', 'monitor', 'estado', 'buscar']) $(id).value = ''; render(); };
    $('print').onclick = () => window.print();
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
