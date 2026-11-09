/* ===== Reporte en diapositivas · estilo Certus COT-PLN =====
   Mismo diseño que la presentación «Monitoreo de visitas a sede»: portada y
   separadores azul marino con franja celeste, contenido blanco con tarjetas
   F4F6FB, títulos Cambria y texto Calibri, 16:9 (13.33 × 7.5 pulgadas).
   - En una semana: portada, resultados generales, sedes y tardanzas, cobertura,
     turnos en otra fecha / fuera de plazo, hallazgos y conclusiones de esa semana.
   - En el comparativo: el evolutivo entre semanas y luego el reporte de cada semana.
   Cada lámina se describe una vez (lista de piezas) y se dibuja en PPT
   (pptxgenjs, gráficos nativos) o en PDF (jsPDF + autotable). Todo sale de los
   datos cargados, incluidas las ediciones locales. Se carga después de monitoreo_sede.js. */

const DC = { navy: '1F2A5C', cyan: '00A3E0', red: 'E4002B', purple: '6C4C9C', green: '2E8B57', gray: '8A90A0',
  ink: '3A4162', soft: 'EEF2FA', card: 'F4F6FB', border: 'E1E6F2', muted: '6B7280', sub: '6B728A', pale: 'AEB8D8', light: 'D7DEF2' };
const SERIE1 = 'AEB8D8', SERIE2 = '1F2A5C';
const W = 13.333, H = 7.5, MX = 0.7, ANCHO = 11.9;
const CORTO = { 'San Juan de Lurigancho': 'S. J. Lurigancho', 'Villa El Salvador': 'V. El Salvador' };

/* ---------- cálculos ---------- */
const nomSede = c => SEDES[c] || c;
const fmtPct = v => v == null ? '—' : v + '%';
const signo = (d, dec = 0, u = '') => d === 0 ? 'Sin cambio' : (d > 0 ? '+' : '−') + Math.abs(d).toFixed(dec) + (u ? ' ' + u : '');
const titular = s => String(s || '').toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());
const etiquetaDia = f => `${diaSemana(f).slice(0, 3)} ${shortDate(f).slice(0, 5)}`;
/* Recorta a una línea de tabla (el detalle completo queda en la página web) */
const recortar = (s, n) => { s = String(s || '').split(/[;.](\s|$)/)[0].trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };

function datosSemana(n, filas) {
  const c = CACHE[n], todas = c.DATA;
  filas = filas || todas;
  const tard = c.TARD.registros || [];
  const ok = filas.reduce((s, r) => s + r.conformes, 0), obs = filas.reduce((s, r) => s + r.observaciones, 0);
  const sedes = [...new Set(filas.map(r => r[CAMPUS]))].map(s => {
    const f = filas.filter(r => r[CAMPUS] === s);
    const a = f.reduce((x, r) => x + r.conformes, 0), b = f.reduce((x, r) => x + r.observaciones, 0);
    return { sede: s, visitas: f.length, conf: a + b ? pct(a, a + b) : null, obs: b, tard: tard.filter(t => t.sede === s).length };
  }).sort((x, y) => (x.conf ?? 999) - (y.conf ?? 999));
  const momentos = MOMENTOS.map(([k]) => {
    const a = filas.filter(r => r[k] === 'Conforme').length, b = filas.filter(r => r[k] === 'Con observación').length;
    return { m: momentoCorto(k), conf: a + b ? pct(a, a + b) : 0, obs: b };
  });
  const dias = [...new Set(filas.map(r => r.fecha))].sort().map(f => {
    const g = filas.filter(r => r.fecha === f);
    const a = g.reduce((x, r) => x + r.conformes, 0), b = g.reduce((x, r) => x + r.observaciones, 0);
    return { f, n: g.length, conf: a + b ? pct(a, a + b) : 0 };
  });
  // cobertura con todos los registros de la semana
  const est = estadoTurnos(todas, c.PROG);
  const prog = est.size, cub = [...est.values()].filter(e => e.estado !== 'falta').length;
  const porMonitor = new Map();
  for (const a of c.PROG.asignaciones) for (const m of a.monitores) {
    const e = est.get(claveTurno(a, m));
    if (!porMonitor.has(m)) porMonitor.set(m, { monitor: m, prog: 0, cub: 0 });
    const x = porMonitor.get(m); x.prog++; if (e.estado !== 'falta') x.cub++;
  }
  const otra = [];
  for (const a of c.PROG.asignaciones) for (const m of a.monitores) {
    const e = est.get(claveTurno(a, m));
    if (e.estado === 'otra_fecha') otra.push(Object.assign({}, a, { monitor: m, visita: e.visita, cambio: queCambio(a, e.visita) }));
  }
  const docentes = new Set(tard.map(t => normalizar(t.docente)));
  return {
    n, semana: c.PROG.semana || 'Semana ' + n, periodo: c.PROG.periodo || '',
    registros: filas.length, coord: filas.filter(r => r.Origen === 'Coordinación').length,
    monitores: new Set(filas.map(r => r[MON])).size, ok, obs, conf: ok + obs ? pct(ok, ok + obs) : 0,
    obsReg: filas.length ? obs / filas.length : 0, sedes, momentos, dias, tard, docentes: docentes.size,
    hayCrono: prog > 0, prog, cub, cobertura: prog ? pct(cub, prog) : null, falta: prog - cub,
    porMonitor: [...porMonitor.values()], otra, plazo: fueraDePlazo(todas),
    hallazgos: [puntualidadDe(tard), ...(c.HALL || [])].filter(Boolean),
    filtrado: filas.length !== todas.length
  };
}
function puntualidadDe(tard) {
  if (!tard.length) return null;
  const porSede = [...new Set(tard.map(t => t.sede))].map(s => `${nomSede(s)}: ${tard.filter(t => t.sede === s).length}`);
  const rein = [...new Set(tard.map(t => t.docente))].filter(d => tard.filter(t => t.docente === d).length > 1);
  return ['Puntualidad y arranque', `${tard.length} tardanzas en la semana (${porSede.join(', ')}).`,
    rein.length ? `Seguimiento por reincidencia: ${rein.map(titular).join(', ')}` : 'Registrar nominalmente cada tardanza'];
}

/* ---------- piezas de una lámina ---------- */
const P = {
  tarjeta: (x, y, w, h, fill) => ({ t: 'tarjeta', x, y, w, h, fill: fill || DC.card }),
  texto: (x, y, w, h, runs, o = {}) => ({ t: 'texto', x, y, w, h, runs: typeof runs === 'string' ? [{ text: runs }] : runs, ...o }),
  cabecera: (x, y, w, titulo, bajada) => [P.texto(x, y, w, 0.35, titulo, { size: 17, bold: true, color: DC.navy, valign: 'middle' }),
    bajada ? P.texto(x, y + 0.36, w, 0.26, bajada, { size: 11, color: DC.muted, valign: 'middle' }) : null],
  tabla: (x, y, w, anchos, enc, filas, o = {}) => ({ t: 'tabla', x, y, w, anchos, enc, filas, tam: 11, alto: 0.3, centrar: [], colores: {}, ...o }),
  barras: (x, y, w, h, labels, series, o = {}) => ({ t: 'barras', x, y, w, h, labels, series, dir: 'col', pct: false, ...o }),
  circulo: (x, y, d, color, icono) => ({ t: 'circulo', x, y, d, color, icono })
};
function kpi(x, y, w, h, valor, color, etiqueta, detalle) {
  return [P.tarjeta(x, y, w, h),
    P.texto(x + 0.25, y + 0.18, w - 0.5, 0.65, valor, { size: 40, bold: true, color, valign: 'middle' }),
    P.texto(x + 0.25, y + 0.9, w - 0.5, 0.3, etiqueta, { size: 14, bold: true, color: DC.navy, valign: 'middle' }),
    P.texto(x + 0.25, y + 1.2, w - 0.5, 0.36, detalle, { size: 11, color: DC.muted })];
}
function kpiCmp(x, y, w, h, a, b, color, etiqueta, cambio, colorCambio, detalle) {
  return [P.tarjeta(x, y, w, h),
    P.texto(x + 0.25, y + 0.15, w - 0.5, 0.62, [{ text: a, color: DC.gray }, { text: '  →  ', color: DC.gray, size: 24 }, { text: b, color }], { size: 32, bold: true, valign: 'middle' }),
    P.texto(x + 0.25, y + 0.82, w - 0.5, 0.28, etiqueta, { size: 14, bold: true, color: DC.navy, valign: 'middle' }),
    P.texto(x + 0.25, y + 1.12, w - 0.5, 0.42, [{ text: cambio, bold: true, color: colorCambio }, { text: '  ·  ' + detalle, color: DC.muted }], { size: 11 })];
}
function puntos(x, y, w, items, tam = 13, paso = 0.62) {
  return items.flatMap(([color, neg, txt], i) => [
    P.circulo(x, y + i * paso + 0.07, 0.12, color),
    P.texto(x + 0.25, y + i * paso, w - 0.25, paso - 0.04, neg ? [{ text: neg, bold: true, color: DC.navy }, { text: txt, color: DC.ink }] : [{ text: txt, color: DC.ink }], { size: tam })
  ]);
}
const contenido = (titulo, bajada, piezas) => ({ tipo: 'contenido', titulo, bajada, piezas: piezas.flat(3).filter(Boolean) });
const trozos = (lista, n) => lista.length ? Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, i * n + n)) : [[]];

/* ---------- láminas de una semana ---------- */
function laminasSemana(d, pie) {
  const L = [];
  const w4 = (ANCHO - 3 * 0.25) / 4;
  L.push({ tipo: 'seccion', titulo: `Reporte de la ${d.semana.toLowerCase()}`, bajada: `${d.periodo} · ${d.registros} registros · ${d.monitores} monitores · ${d.sedes.length} sedes` });
  // resultados generales
  L.push(contenido(`${d.semana}: resultados generales`, `${d.periodo} · formulario de monitoreo de visitas a sede${d.filtrado ? ' · con los filtros aplicados' : ''}`, [
    kpi(MX, 1.75, w4, 1.6, String(d.registros), DC.navy, 'Registros de monitoreo', d.coord ? `${d.registros - d.coord} formularios y ${d.coord} de coordinación` : `${d.monitores} monitores · ${d.sedes.length} sedes`),
    kpi(MX + (w4 + 0.25), 1.75, w4, 1.6, d.conf + '%', DC.green, 'Conformidad promedio', `${d.ok} de ${d.ok + d.obs} estados evaluables`),
    kpi(MX + 2 * (w4 + 0.25), 1.75, w4, 1.6, String(d.obs), DC.purple, 'Observaciones', `${d.obsReg.toFixed(2)} por registro`),
    d.hayCrono ? kpi(MX + 3 * (w4 + 0.25), 1.75, w4, 1.6, d.cobertura + '%', d.cobertura < 70 ? DC.red : DC.cyan, 'Cobertura del cronograma', `${d.cub} de ${d.prog} turnos${d.otra.length ? ` (${d.otra.length} en otra fecha)` : ''}`)
      : kpi(MX + 3 * (w4 + 0.25), 1.75, w4, 1.6, String(d.tard.length), DC.red, 'Tardanzas', `${d.docentes} docentes`),
    P.tarjeta(MX, 3.6, 5.85, 3.15), P.cabecera(MX + 0.25, 3.72, 5.4, 'Conformidad por momento de control (%)'),
    P.barras(MX + 0.15, 4.15, 5.55, 2.5, d.momentos.map(m => m.m), [{ name: 'Conformidad', values: d.momentos.map(m => m.conf), color: SERIE2 }], { pct: true, max: 110 }),
    P.tarjeta(MX + 6.05, 3.6, 5.85, 3.15), P.cabecera(MX + 6.3, 3.72, 5.4, 'Conformidad por día (%)'),
    P.barras(MX + 6.2, 4.15, 5.55, 2.5, d.dias.map(x => etiquetaDia(x.f)), [{ name: 'Conformidad', values: d.dias.map(x => x.conf), color: DC.cyan }], { pct: true, max: 110 })
  ]));
  // sedes y tardanzas (las tardanzas siguen en otra lámina si no caben)
  const tardFilas = d.tard.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).map(t =>
    [shortDate(t.fecha).slice(0, 5), CORTO[nomSede(t.sede)] || nomSede(t.sede), recortar(titular(t.docente), 28), recortar(t.detalle || '', 33)]);
  trozos(tardFilas, 10).forEach((filasT, i) => {
    L.push(contenido(`${d.semana}: sedes y tardanzas${i ? ' (continuación)' : ''}`, 'Conformidad, observaciones y tardanzas de cada sede · docentes con tardanza', [
      i === 0 ? [P.tarjeta(MX, 1.75, 4.95, 5.0), P.cabecera(MX + 0.25, 1.88, 4.5, 'Resultado por sede', 'De menor a mayor conformidad'),
        P.tabla(MX + 0.25, 2.6, 4.45, [1.8, 0.7, 0.75, 0.55, 0.65], ['Sede', 'Visitas', 'Conf.', 'Obs.', 'Tard.'],
          d.sedes.map(s => [nomSede(s.sede), s.visitas, fmtPct(s.conf), s.obs, s.tard]),
          { tam: 12, alto: 0.5, centrar: [1, 2, 3, 4], colores: d.sedes.length ? { '0,2': DC.red } : {} })] : null,
      P.tarjeta(i === 0 ? 5.85 : MX, 1.75, i === 0 ? 6.75 : ANCHO, 5.0),
      P.cabecera((i === 0 ? 5.85 : MX) + 0.25, 1.88, 6.25, `Docentes con tardanza (${d.tard.length})`),
      filasT.length ? P.tabla((i === 0 ? 5.85 : MX) + 0.25, 2.35, i === 0 ? 6.25 : ANCHO - 0.5, [0.7, 1.25, 1.95, 2.35], ['Fecha', 'Sede', 'Docente', 'Detalle'], filasT, { tam: 10.5, alto: 0.36, centrar: [0] })
        : P.texto((i === 0 ? 5.85 : MX) + 0.25, 2.4, 6, 0.4, 'Sin tardanzas registradas.', { size: 12, color: DC.muted })
    ]));
  });
  // cobertura del cronograma
  if (d.hayCrono) {
    const pend = d.porMonitor.filter(m => m.cub < m.prog).sort((a, b) => (a.cub / a.prog) - (b.cub / b.prog) || b.prog - a.prog || a.monitor.localeCompare(b.monitor, 'es'));
    trozos(pend, 12).forEach((filasM, i) => L.push(contenido(`${d.semana}: cobertura del cronograma${i ? ' (continuación)' : ''}`,
      `${d.prog} turnos programados con monitor · cubiertos con registro en su turno o con una visita del monitor en otra fecha`, [
        i === 0 ? [
          kpi(MX, 1.75, 3.6, 1.55, d.cobertura + '%', d.cobertura < 70 ? DC.red : DC.cyan, 'Cobertura del cronograma', `${d.cub} de ${d.prog} turnos cubiertos`),
          kpi(MX, 3.47, 3.6, 1.55, String(d.falta), DC.red, 'Turnos sin registro', 'ni en su día ni en otra fecha'),
          kpi(MX, 5.19, 3.6, 1.55, String(d.otra.length), DC.purple, 'Cubiertos en otra fecha', 'el monitor visitó otro día, sede o turno')] : null,
        P.tarjeta(i === 0 ? 4.55 : MX, 1.75, i === 0 ? 8.05 : ANCHO, 5.0),
        P.cabecera((i === 0 ? 4.55 : MX) + 0.25, 1.88, 7.6, 'Monitores con turnos sin registro', 'Turnos cubiertos sobre programados'),
        filasM.length ? P.tabla((i === 0 ? 4.55 : MX) + 0.25, 2.6, i === 0 ? 7.55 : ANCHO - 0.5, [3.8, 1.5, 1.5], ['Monitor', 'Cubiertos', 'Sin registro'],
          filasM.map(m => [titular(m.monitor), `${m.cub} de ${m.prog}`, m.prog - m.cub]),
          { tam: 11.5, alto: 0.33, centrar: [1, 2], colores: Object.fromEntries(filasM.map((m, j) => m.cub === 0 ? [`${j},1`, DC.red] : null).filter(Boolean)) })
          : P.texto((i === 0 ? 4.55 : MX) + 0.25, 2.7, 7, 0.4, 'Todos los turnos programados tienen registro.', { size: 13, color: DC.green })
      ])));
    // turnos en otra fecha y registros fuera de plazo
    if (d.otra.length || d.plazo.length) {
      const piezas = [];
      let y = 1.75;
      if (d.otra.length) {
        const h = 1.0 + 0.36 * (d.otra.length + 1);
        piezas.push(P.tarjeta(MX, y, ANCHO, h), P.cabecera(MX + 0.25, y + 0.13, ANCHO - 0.5, `Turnos cubiertos en otra fecha (${d.otra.length})`, 'El monitor no visitó en su día programado, pero sí en otra fecha, sede o turno'),
          P.tabla(MX + 0.25, y + 0.85, ANCHO - 0.5, [2.8, 2.6, 2.8, 3.2], ['Programado', 'Monitor', 'Monitoreó', 'Qué pasó'],
            d.otra.slice(0, 8).map(f => [`${etiquetaDia(f.fecha)} · ${CORTO[nomSede(f.sede)] || nomSede(f.sede)} · ${turnoCorto(f.turno)}`, titular(f.monitor),
              `${etiquetaDia(f.visita.fecha)} · ${CORTO[nomSede(f.visita[CAMPUS])] || nomSede(f.visita[CAMPUS])} · ${turnoCorto(f.visita[TURN])}`, f.cambio]), { tam: 11, alto: 0.36 }));
        y += h + 0.2;
      }
      if (d.plazo.length && y < 5.6) {
        const h = Math.min(6.75 - y, 1.0 + 0.36 * (d.plazo.length + 1));
        piezas.push(P.tarjeta(MX, y, ANCHO, h, DC.soft), P.cabecera(MX + 0.25, y + 0.13, ANCHO - 0.5, 'Registros llenados fuera de plazo (observado)', 'La visita se cuenta, pero el formulario se llenó después de cerrar la semana'),
          P.tabla(MX + 0.25, y + 0.85, ANCHO - 0.5, [3.2, 3.0, 2.0, 1.8, 1.4], ['Monitor', 'Visita', 'Llenado', 'Demora', 'Registros'],
            d.plazo.slice(0, 4).map(x => [titular(x.monitor), `${etiquetaDia(x.fecha)} · ${nomSede(x.sede)} · ${turnoCorto(x.turno)}`, shortDate(x.llenado), `${x.dias} días después`, x.n]),
            { tam: 11, alto: 0.36, centrar: [2, 3, 4], colores: Object.fromEntries(d.plazo.slice(0, 4).map((_, j) => [`${j},3`, DC.red])) }));
      }
      L.push(contenido(`${d.semana}: visitas en otra fecha y registros tardíos`, 'Cómo se cuentan los turnos que no se registraron en su día', piezas));
    }
  }
  // hallazgos (6 por lámina)
  const colores = [DC.red, DC.red, DC.purple, DC.purple, DC.cyan, DC.cyan];
  trozos(d.hallazgos, 6).forEach((grupo, i) => {
    const w3 = (ANCHO - 2 * 0.25) / 3, h = 2.4;
    L.push(contenido(`${d.semana}: hallazgos y siguientes pasos${i ? ' (continuación)' : ''}`, 'Lectura de las respuestas del formulario, del chat y de lo informado por coordinación',
      grupo.map(([tema, texto, paso], j) => {
        const x = MX + (j % 3) * (w3 + 0.25), y = 1.75 + Math.floor(j / 3) * (h + 0.2);
        const recorte = texto.length > 230 ? texto.slice(0, 227).replace(/\s+\S*$/, '') + '…' : texto;
        return [P.tarjeta(x, y, w3, h), P.circulo(x + 0.25, y + 0.24, 0.16, colores[(i * 6 + j) % 6]),
          P.texto(x + 0.52, y + 0.15, w3 - 0.75, 0.34, tema, { size: 15, bold: true, color: DC.navy, valign: 'middle' }),
          P.texto(x + 0.25, y + 0.6, w3 - 0.5, 1.1, recorte, { size: texto.length > 180 ? 11 : 12, color: DC.ink }),
          P.texto(x + 0.25, y + 1.75, w3 - 0.5, 0.55, [{ text: '→  ', bold: true, color: DC.cyan }, { text: recortar(paso, 90), bold: true, color: DC.navy }], { size: 11 })];
      })));
  });
  return L;
}
function conclusionesSemana(d) {
  const buenas = d.sedes.filter(s => s.conf != null && s.conf >= 90).map(s => nomSede(s.sede));
  const baja = d.sedes[0];
  const peorMom = d.momentos.slice().sort((a, b) => a.conf - b.conf)[0];
  return [
    [DC.green, '✓', 'Lo que funcionó', [
      `La conformidad de la semana es ${d.conf}% en ${d.registros} registros.`,
      buenas.length ? `${buenas.join(', ')} ${buenas.length === 1 ? 'supera' : 'superan'} el 90% de conformidad.` : 'Ninguna sede supera el 90% de conformidad.',
      d.hayCrono ? `${d.cub} de ${d.prog} turnos programados quedan cubiertos.` : `${d.monitores} monitores registraron visitas.`]],
    [DC.red, '!', 'Lo que hay que reforzar', [
      baja ? `${nomSede(baja.sede)} es la sede más baja (${fmtPct(baja.conf)}).` : 'Sin datos por sede.',
      `El momento más bajo es «${peorMom.m}» (${peorMom.conf}%).`,
      d.hayCrono ? `${d.falta} turnos sin registro${d.plazo.length ? ` y ${d.plazo.reduce((n, x) => n + x.n, 0)} registros fuera de plazo` : ''}.` : `${d.tard.length} tardanzas registradas.`]],
    [DC.cyan, '→', 'Siguientes pasos', d.hallazgos.filter(h => h[0] !== 'Puntualidad y arranque').slice(0, 3).map(h => h[2].replace(/\.?$/, '.'))]
  ];
}
function laminaConclusiones(titulo, bajada, columnas) {
  const w3 = (ANCHO - 2 * 0.25) / 3;
  return contenido(titulo, bajada, [
    columnas.map(([color, icono, tit, items], i) => {
      const x = MX + i * (w3 + 0.25);
      return [P.tarjeta(x, 1.75, w3, 4.7), P.circulo(x + 0.3, 2.0, 0.6, color, icono),
        P.texto(x + 1.05, 2.05, w3 - 1.3, 0.5, tit, { size: 17, bold: true, color: DC.navy, valign: 'middle' }),
        items.slice(0, 3).map((it, j) => P.texto(x + 0.3, 2.95 + j * 1.15, w3 - 0.6, 1.05, it, { size: it.length > 110 ? 12.5 : 14, color: DC.ink }))];
    }),
    P.texto(MX, 6.6, ANCHO, 0.3, 'Elaborado por el Equipo COT-PLN · Fuentes: formulario de monitoreo, cronograma por sede y turno, chat de WhatsApp y coordinación',
      { size: 11, italic: true, color: DC.muted, valign: 'middle' })
  ]);
}
function portada(eyebrow, titulo, sub, stats) {
  return { tipo: 'portada', eyebrow, titulo, sub, org: 'Equipo COT-PLN · CERTUS', stats };
}

/* ---------- deck de una semana ---------- */
function deckSemana(n) {
  const d = datosSemana(n, filtered());
  return {
    nombre: `monitoreo_semana${n}`, pie: `Monitoreo de visitas a sede · ${d.semana} · Equipo COT-PLN`,
    laminas: [
      portada('MONITOREO DE VISITAS A SEDE', d.semana, d.periodo, [
        [String(d.registros), 'registros de\nmonitoreo'], [String(d.sedes.length), 'sedes\nvisitadas'],
        [d.conf + '%', 'de conformidad\npromedio'], [d.hayCrono ? d.cobertura + '%' : String(d.tard.length), d.hayCrono ? 'de cobertura del\ncronograma' : 'tardanzas\nregistradas']]),
      ...laminasSemana(d).slice(1),
      laminaConclusiones('Conclusiones y siguientes pasos', `Cierre de la ${d.semana.toLowerCase()} · ${d.periodo}`, conclusionesSemana(d))
    ]
  };
}

/* ---------- deck del comparativo ---------- */
function deckComparativo() {
  const nA = SEMANAS[SEMANAS.length - 2], nB = SEMANAS[SEMANAS.length - 1];
  const A = datosSemana(nA), B = datosSemana(nB);
  const sA = `Semana ${nA}`, sB = `Semana ${nB}`;
  const w3 = (ANCHO - 2 * 0.25) / 3;
  const mejora = (d, alto = true) => d === 0 ? DC.gray : ((d > 0) === alto ? DC.green : DC.red);
  const L = [];
  L.push(portada('MONITOREO DE VISITAS A SEDE', `${sA} y ${sB.toLowerCase()}`, `${A.periodo} · ${B.periodo}`, [
    [String(A.registros + B.registros), 'registros de\nmonitoreo'], [String(new Set([...A.sedes, ...B.sedes].map(s => s.sede)).size), 'sedes en las\ndos semanas'],
    [B.conf + '%', `de conformidad en la\n${sB.toLowerCase()} (${A.conf}% en la ${nA})`], [String(A.tard.length + B.tard.length), 'tardanzas\nregistradas']]));
  L.push({ tipo: 'seccion', titulo: `Evolutivo de la ${sA.toLowerCase()} a la ${sB.toLowerCase()}`, bajada: 'Sedes, docentes, observaciones y monitores' });

  // resumen evolutivo
  const dConf = B.conf - A.conf, dCob = (B.cobertura ?? 0) - (A.cobertura ?? 0);
  const vA = A.sedes.find(s => s.sede === 'VIR'), vB = B.sedes.find(s => s.sede === 'VIR');
  const tarjetas = [
    [String(A.registros), String(B.registros), DC.navy, 'Registros de monitoreo', signo(B.registros - A.registros), DC.gray, `${A.monitores} y ${B.monitores} monitores con registro`],
    [A.conf + '%', B.conf + '%', DC.green, 'Conformidad promedio', signo(dConf, 0, 'pts'), mejora(dConf), `${A.ok}/${A.ok + A.obs} y ${B.ok}/${B.ok + B.obs} conformes`],
    [A.obsReg.toFixed(2), B.obsReg.toFixed(2), DC.purple, 'Observaciones por registro', signo(+(B.obsReg - A.obsReg).toFixed(2), 2), mejora(B.obsReg - A.obsReg, false), `${A.obs} y ${B.obs} observaciones en total`],
    A.hayCrono && B.hayCrono ? [A.cobertura + '%', B.cobertura + '%', DC.red, 'Cobertura del cronograma', signo(dCob, 0, 'pts'), mejora(dCob), `${A.cub} de ${A.prog} y ${B.cub} de ${B.prog} turnos`]
      : [String(A.sedes.length), String(B.sedes.length), DC.navy, 'Sedes visitadas', signo(B.sedes.length - A.sedes.length), DC.gray, 'sedes con al menos un registro'],
    [String(A.tard.length), String(B.tard.length), DC.purple, 'Tardanzas registradas', signo(B.tard.length - A.tard.length), mejora(B.tard.length - A.tard.length, false), `${(A.tard.length / A.registros).toFixed(2)} y ${(B.tard.length / B.registros).toFixed(2)} por registro`],
    vA && vB ? [fmtPct(vA.conf), fmtPct(vB.conf), DC.red, 'Conformidad en Virtual', signo((vB.conf ?? 0) - (vA.conf ?? 0), 0, 'pts'), mejora((vB.conf ?? 0) - (vA.conf ?? 0)), `${vA.obs} y ${vB.obs} observaciones`]
      : [String(A.dias.length), String(B.dias.length), DC.navy, 'Días con registro', signo(B.dias.length - A.dias.length), DC.gray, 'días de la semana con visitas']
  ];
  const repetidos = (() => {
    const g = l => { const m = new Map(); for (const t of l) { const k = normalizar(t.docente); if (!m.has(k)) m.set(k, []); m.get(k).push(t); } return m; };
    const gA = g(A.tard), gB = g(B.tard);
    return [...gA.keys()].filter(k => gB.has(k) && !k.startsWith('DOCENTE NO IDENTIFICADO')).map(k => ({ nombre: gB.get(k)[0].docente, a: gA.get(k), b: gB.get(k) }));
  })();
  L.push(contenido('Resumen evolutivo', `Lo que cambió entre la ${sA.toLowerCase()} (${A.periodo}) y la ${sB.toLowerCase()} (${B.periodo})`, [
    tarjetas.map((c, i) => kpiCmp(MX + (i % 3) * (w3 + 0.25), 1.75 + Math.floor(i / 3) * 1.77, w3, 1.55, ...c)),
    P.tarjeta(MX, 5.3, ANCHO, 1.45, DC.soft), P.cabecera(MX + 0.3, 5.4, ANCHO - 0.6, 'Lectura'),
    puntos(MX + 0.3, 5.82, ANCHO - 0.6, [
      [dConf >= 0 ? DC.green : DC.red, 'Conformidad: ', `${dConf === 0 ? 'se mantiene en' : dConf > 0 ? 'sube de ' + A.conf + '% a' : 'baja de ' + A.conf + '% a'} ${B.conf}%${A.hayCrono && B.hayCrono ? `; la cobertura del cronograma ${dCob >= 0 ? 'sube' : 'baja'} de ${A.cobertura}% a ${B.cobertura}%.` : '.'}`],
      [DC.purple, 'Puntualidad: ', `${A.tard.length} tardanzas en la ${sA.toLowerCase()} y ${B.tard.length} en la ${sB.toLowerCase()}; ${repetidos.length} ${repetidos.length === 1 ? 'docente repite' : 'docentes repiten'} entre semanas.`]
    ], 13, 0.42)
  ]));

  // sedes
  const codigos = [...new Set([...A.sedes, ...B.sedes].map(s => s.sede))];
  const confDe = (d, c) => { const s = d.sedes.find(x => x.sede === c); return s ? s.conf : null; };
  const cambios = codigos.map(c => ({ c, a: confDe(A, c), b: confDe(B, c) })).filter(x => x.a != null && x.b != null).map(x => ({ ...x, d: x.b - x.a })).sort((x, y) => y.d - x.d);
  codigos.sort((x, y) => (confDe(A, x) ?? 0) - (confDe(A, y) ?? 0));
  const lecturaSedes = [
    ...cambios.filter(x => x.d > 0).slice(0, 2).map(x => [DC.green, `${nomSede(x.c)} +${x.d} pts `, `(${x.a}% → ${x.b}%).`]),
    ...cambios.filter(x => x.d < 0).slice(-2).reverse().map(x => [DC.red, `${nomSede(x.c)} −${Math.abs(x.d)} pts `, `(${x.a}% → ${x.b}%).`]),
    ...cambios.filter(x => x.d === 0).slice(0, 1).map(x => [DC.gray, `${nomSede(x.c)} sin cambio `, `(${x.a}% en ambas semanas).`])
  ].slice(0, 4);
  L.push(contenido('Evolutivo por sede', 'Conformidad por sede sobre los estados evaluables (conforme y con observación)', [
    P.tarjeta(MX, 1.75, 7.45, 5.0), P.cabecera(MX + 0.25, 1.88, 7, 'Conformidad por sede (%)', `${sA} frente a ${sB.toLowerCase()}`),
    P.barras(MX + 0.15, 2.5, 7.15, 4.15, codigos.map(nomSede), [{ name: sA, values: codigos.map(c => confDe(A, c) ?? 0), color: SERIE1 }, { name: sB, values: codigos.map(c => confDe(B, c) ?? 0), color: SERIE2 }], { dir: 'bar', pct: true, max: 112 }),
    P.tarjeta(8.4, 1.75, 4.2, 5.0), P.cabecera(8.65, 1.88, 3.8, 'Lectura'),
    puntos(8.65, 2.45, 3.75, lecturaSedes, 13, 1.02)
  ]));

  // docentes
  const tardSede = (d, c) => d.tard.filter(t => t.sede === c).length;
  const sedeMasTard = codigos.slice().sort((x, y) => tardSede(A, y) - tardSede(A, x))[0];
  L.push(contenido('Evolutivo de docentes: puntualidad', 'Tardanzas registradas en el formulario de monitoreo y por coordinación', [
    kpiCmp(MX, 1.75, w3, 1.55, String(A.tard.length), String(B.tard.length), DC.purple, 'Tardanzas registradas', signo(B.tard.length - A.tard.length), mejora(B.tard.length - A.tard.length, false), `${(A.tard.length / A.registros).toFixed(2)} y ${(B.tard.length / B.registros).toFixed(2)} por registro`),
    kpiCmp(MX + w3 + 0.25, 1.75, w3, 1.55, String(A.docentes), String(B.docentes), DC.purple, 'Docentes con tardanza', signo(B.docentes - A.docentes), mejora(B.docentes - A.docentes, false), 'docentes distintos'),
    kpiCmp(MX + 2 * (w3 + 0.25), 1.75, w3, 1.55, String(tardSede(A, sedeMasTard)), String(tardSede(B, sedeMasTard)), DC.green, `Tardanzas en ${nomSede(sedeMasTard)}`, signo(tardSede(B, sedeMasTard) - tardSede(A, sedeMasTard)), mejora(tardSede(B, sedeMasTard) - tardSede(A, sedeMasTard), false), 'la sede con más tardanzas en la semana 1'),
    P.tarjeta(MX, 3.55, ANCHO, 3.2), P.cabecera(MX + 0.25, 3.68, ANCHO - 0.5, `Docentes con tardanza en las dos semanas (${repetidos.length})`),
    repetidos.length ? P.tabla(MX + 0.25, 4.2, ANCHO - 0.5, [3.4, 2.0, 2.5, 2.5], ['Docente', 'Sede', sA, sB],
      repetidos.slice(0, 6).map(r => [titular(r.nombre), nomSede(r.b[0].sede), r.a.map(t => shortDate(t.fecha).slice(0, 5)).join(' y '), r.b.map(t => shortDate(t.fecha).slice(0, 5)).join(' y ')]),
      { tam: 12, alto: 0.4, centrar: [2, 3] }) : P.texto(MX + 0.25, 4.3, 8, 0.4, 'Ningún docente repite tardanza entre las dos semanas.', { size: 13, color: DC.muted })
  ]));

  // observaciones
  const obsSede = (d, c) => { const s = d.sedes.find(x => x.sede === c); return s ? s.obs : 0; };
  const cortos = codigos.map(c => CORTO[nomSede(c)] ? (c === 'SJL' ? 'SJL' : 'VES') : nomSede(c));
  const virA = A.obs ? Math.round(obsSede(A, 'VIR') / A.obs * 100) : 0, virB = B.obs ? Math.round(obsSede(B, 'VIR') / B.obs * 100) : 0;
  L.push(contenido('Evolutivo de observaciones', 'Estados «con observación» registrados por momento de control y por sede', [
    P.tarjeta(MX, 1.75, 5.85, 3.95), P.cabecera(MX + 0.25, 1.88, 5.4, 'Por momento de control'),
    P.barras(MX + 0.15, 2.35, 5.55, 3.25, A.momentos.map(m => m.m), [{ name: sA, values: A.momentos.map(m => m.obs), color: SERIE1 }, { name: sB, values: B.momentos.map(m => m.obs), color: SERIE2 }]),
    P.tarjeta(MX + 6.05, 1.75, 5.85, 3.95), P.cabecera(MX + 6.3, 1.88, 5.4, 'Por sede'),
    P.barras(MX + 6.2, 2.35, 5.55, 3.25, cortos, [{ name: sA, values: codigos.map(c => obsSede(A, c)), color: SERIE1 }, { name: sB, values: codigos.map(c => obsSede(B, c)), color: SERIE2 }]),
    P.tarjeta(MX, 5.85, ANCHO, 0.9, DC.soft),
    [[`${A.obs} → ${B.obs}`, 'observaciones en total', DC.navy], [`${A.obsReg.toFixed(2)} → ${B.obsReg.toFixed(2)}`, 'observaciones por registro', DC.navy],
     [`${virA}% → ${virB}%`, 'del total corresponde a Virtual', DC.red], [`${A.momentos[1].obs} → ${B.momentos[1].obs}`, 'en el 1er monitoreo (inicio)', DC.navy]].map(([v, l, col], i) => [
      P.texto(MX + 0.3 + i * 2.9, 5.92, 2.8, 0.42, v, { size: 20, bold: true, color: col, valign: 'middle' }),
      P.texto(MX + 0.3 + i * 2.9, 6.34, 2.8, 0.3, l, { size: 12, color: DC.ink, valign: 'middle' })])
  ]));

  // monitores
  if (A.hayCrono && B.hayCrono) {
    const mA = new Map(A.porMonitor.map(m => [m.monitor, m])), pendB = B.porMonitor.filter(m => m.cub < m.prog)
      .sort((x, y) => ((mA.get(x.monitor) || { cub: 1 }).cub === 0 ? 0 : 1) - ((mA.get(y.monitor) || { cub: 1 }).cub === 0 ? 0 : 1) || x.cub / x.prog - y.cub / y.prog || y.prog - x.prog);
    L.push(contenido('Evolutivo de monitores y cobertura', `Cronograma de cada semana: ${A.prog} turnos con monitor en la ${sA.toLowerCase()} y ${B.prog} en la ${sB.toLowerCase()}`, [
      kpiCmp(MX, 1.75, 3.6, 1.55, A.cobertura + '%', B.cobertura + '%', DC.red, 'Cobertura del cronograma', signo(dCob, 0, 'pts'), mejora(dCob), `${A.cub} de ${A.prog} y ${B.cub} de ${B.prog} turnos`),
      kpiCmp(MX, 3.47, 3.6, 1.55, String(A.monitores), String(B.monitores), DC.navy, 'Monitores con registro', signo(B.monitores - A.monitores), DC.gray, 'incluye coordinación'),
      kpiCmp(MX, 5.19, 3.6, 1.55, String(A.otra.length), String(B.otra.length), DC.purple, 'Turnos cubiertos en otra fecha', signo(B.otra.length - A.otra.length), DC.gray, 'visita en otro día, sede o turno'),
      P.tarjeta(4.55, 1.75, 8.05, 5.0), P.cabecera(4.8, 1.88, 7.6, `Monitores con turnos sin registro en la ${sB.toLowerCase()}`, 'Turnos cubiertos sobre programados, contando las visitas en otra fecha'),
      P.tabla(4.8, 2.6, 7.55, [3.6, 1.25, 1.25, 1.45], ['Monitor', sA, sB, 'Sin registro'], pendB.slice(0, 12).map(m => {
        const a = mA.get(m.monitor); return [titular(m.monitor), a ? `${a.cub} de ${a.prog}` : '—', `${m.cub} de ${m.prog}`, m.prog - m.cub];
      }), { tam: 11.5, alto: 0.33, centrar: [1, 2, 3], colores: Object.fromEntries(pendB.slice(0, 12).flatMap((m, j) => {
        const a = mA.get(m.monitor); return a && a.cub === 0 && m.cub === 0 ? [[`${j},1`, DC.red], [`${j},2`, DC.red]] : [];
      })) })
    ]));
  }
  L.push(...laminasSemana(B), ...laminasSemana(A));
  L.push(laminaConclusiones('Conclusiones y siguientes pasos', `Cierre del comparativo entre la ${sA.toLowerCase()} y la ${sB.toLowerCase()}`, [
    [DC.green, '✓', 'Lo que se sostiene', [
      dConf > 0 ? `La conformidad sube de ${A.conf}% a ${B.conf}%.` : `La conformidad se mantiene alta: ${A.conf}% y ${B.conf}%.`,
      ...cambios.filter(x => x.d > 0).slice(0, 2).map(x => `${nomSede(x.c)} mejora ${x.d} pts (${x.a}% → ${x.b}%).`)]],
    [DC.red, '!', 'Lo que hay que reforzar', [
      A.hayCrono && B.hayCrono ? `La cobertura del cronograma pasa de ${A.cobertura}% a ${B.cobertura}%: ${B.falta} turnos sin registro en la ${sB.toLowerCase()}.` : `${B.tard.length} tardanzas en la ${sB.toLowerCase()}.`,
      vB ? `Virtual queda en ${fmtPct(vB.conf)} y concentra ${virB}% de las observaciones.` : 'Revisar las sedes con menor conformidad.',
      `${repetidos.length} ${repetidos.length === 1 ? 'docente repite' : 'docentes repiten'} tardanza entre semanas.`]],
    [DC.cyan, '→', 'Siguientes pasos', B.hallazgos.filter(h => h[0] !== 'Puntualidad y arranque').slice(0, 3).map(h => h[2].replace(/\.?$/, '.'))]
  ]));
  return { nombre: `monitoreo_semana${nA}_y_semana${nB}`, pie: `Monitoreo de visitas a sede · ${sA.toLowerCase()} y ${sB.toLowerCase()} · Equipo COT-PLN`, laminas: L };
}

function deckActual() {
  return document.body.classList.contains('comparando') ? deckComparativo() : deckSemana(SEMANA);
}

/* ===================== PPT ===================== */
async function diapositivasPPT() {
  await cargarLibsPPT();
  const deck = deckActual();
  const ppt = new PptxGenJS();
  ppt.layout = 'LAYOUT_WIDE';
  ppt.theme = { headFontFace: 'Cambria', bodyFontFace: 'Calibri' };
  ppt.title = 'Monitoreo de visitas a sede'; ppt.author = 'Equipo COT-PLN'; ppt.company = 'CERTUS';
  ppt.defineSlideMaster({ title: 'PORTADA', background: { color: DC.navy }, objects: [{ rect: { x: 0, y: 0, w: W, h: 0.22, fill: { color: DC.cyan }, line: { color: DC.cyan } } }] });
  ppt.defineSlideMaster({ title: 'SECCION', background: { color: DC.navy }, objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: 1.0, y: 2.85, w: 11.3, h: 1.0, fontFace: 'Cambria', fontSize: 40, bold: true, color: 'FFFFFF', align: 'left', valign: 'middle', margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'body', type: 'body', x: 1.0, y: 3.95, w: 11.3, h: 0.6, fontFace: 'Calibri', fontSize: 18, color: DC.pale, align: 'left', valign: 'top', margin: 0 }, text: '' } }] });
  ppt.defineSlideMaster({ title: 'CONTENIDO', background: { color: 'FFFFFF' }, objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: 0.7, y: 0.45, w: 11.9, h: 0.8, fontFace: 'Cambria', fontSize: 32, bold: true, color: DC.navy, align: 'left', valign: 'middle', margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'body', type: 'body', x: 0.7, y: 1.2, w: 11.9, h: 0.4, fontFace: 'Calibri', fontSize: 14, color: DC.sub, align: 'left', valign: 'top', margin: 0 }, text: '' } },
    { text: { text: deck.pie, options: { x: 0.7, y: 7.0, w: 8, h: 0.3, fontFace: 'Calibri', fontSize: 10, color: DC.gray, margin: 0, valign: 'middle' } } }],
    slideNumber: { x: 12.6, y: 7.0, w: 0.6, h: 0.3, fontFace: 'Calibri', fontSize: 10, color: DC.gray } });

  const runsPPT = (runs, o) => runs.map(r => ({ text: r.text, options: { bold: r.bold ?? o.bold, color: r.color || o.color, fontSize: r.size || o.size, italic: o.italic } }));
  const pieza = (s, p) => {
    if (p.t === 'tarjeta') s.addShape(ppt.ShapeType.roundRect, { x: p.x, y: p.y, w: p.w, h: p.h, rectRadius: 0.08, fill: { color: p.fill }, line: { color: DC.border, width: 1 },
      shadow: { type: 'outer', color: '1F2A5C', opacity: 0.08, blur: 8, offset: 1, angle: 90 } });
    else if (p.t === 'texto') s.addText(runsPPT(p.runs, p), { x: p.x, y: p.y, w: p.w, h: p.h, fontFace: 'Calibri', fontSize: p.size || 12, color: p.color || DC.ink,
      bold: !!p.bold, italic: !!p.italic, align: p.align || 'left', valign: p.valign || 'top', margin: 0, isTextBox: true });
    else if (p.t === 'circulo') {
      s.addShape(ppt.ShapeType.ellipse, { x: p.x, y: p.y, w: p.d, h: p.d, fill: { color: p.color }, line: { color: p.color } });
      if (p.icono) s.addText(p.icono, { x: p.x, y: p.y, w: p.d, h: p.d, fontSize: 22, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0, isTextBox: true });
    } else if (p.t === 'tabla') {
      const total = p.anchos.reduce((a, b) => a + b, 0), colW = p.anchos.map(a => a / total * p.w);
      const centro = i => p.centrar.includes(i) ? 'center' : 'left';
      s.addTable([p.enc.map((h, i) => ({ text: h, options: { bold: true, color: 'FFFFFF', fill: { color: DC.navy }, align: centro(i) } })),
        ...p.filas.map((f, r) => f.map((c, i) => { const col = p.colores[`${r},${i}`];
          return { text: String(c), options: { color: col || DC.ink, bold: !!col || i === 0, fill: { color: r % 2 ? DC.soft : 'FFFFFF' }, align: centro(i) } }; }))],
      { x: p.x, y: p.y, w: p.w, colW, rowH: p.alto, fontFace: 'Calibri', fontSize: p.tam, valign: 'middle', margin: [0.03, 0.08, 0.03, 0.08], border: { type: 'solid', pt: 0.5, color: DC.border } });
    } else if (p.t === 'barras') {
      const series = p.series.map(se => ({ name: se.name, labels: p.labels, values: se.values }));
      s.addChart(ppt.ChartType.bar, series, { x: p.x, y: p.y, w: p.w, h: p.h, barDir: p.dir, barGapWidthPct: 55, chartColors: p.series.map(se => se.color),
        showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 10, dataLabelColor: DC.ink, dataLabelFormatCode: p.pct ? '0"%"' : '0',
        showLegend: p.series.length > 1, legendPos: 'b', legendFontSize: 11, legendColor: DC.ink, catAxisLabelColor: DC.ink, catAxisLabelFontSize: p.labels.length > 6 ? 9 : 10,
        valAxisHidden: true, valGridLine: { style: 'none' }, catGridLine: { style: 'none' }, catAxisLineShow: false, valAxisMinVal: 0,
        ...(p.max ? { valAxisMaxVal: p.max } : {}), ...(p.dir === 'bar' ? { catAxisOrientation: 'maxMin' } : {}) });
    }
  };
  for (const l of deck.laminas) {
    if (l.tipo === 'portada') {
      const s = ppt.addSlide({ masterName: 'PORTADA' });
      const t = (txt, o) => s.addText(txt, Object.assign({ fontFace: 'Calibri', margin: 0, isTextBox: true, valign: 'middle' }, o));
      t(l.eyebrow, { x: 1.0, y: 1.95, w: 10, h: 0.4, fontSize: 15, bold: true, color: DC.cyan, charSpacing: 4 });
      t(l.titulo, { x: 1.0, y: 2.45, w: 11, h: 1.05, fontSize: 54, bold: true, color: 'FFFFFF' });
      t(l.sub, { x: 1.0, y: 3.6, w: 11, h: 0.5, fontSize: 22, color: DC.light });
      t(l.org, { x: 1.0, y: 4.4, w: 11, h: 0.35, fontSize: 15, color: DC.pale });
      l.stats.forEach(([v, et], i) => { t(v, { x: 1.0 + i * 2.75, y: 5.25, w: 2.6, h: 0.65, fontSize: 36, bold: true, color: DC.cyan }); t(et, { x: 1.0 + i * 2.75, y: 5.95, w: 2.6, h: 0.6, fontSize: 13, color: DC.light, valign: 'top' }); });
    } else if (l.tipo === 'seccion') {
      const s = ppt.addSlide({ masterName: 'SECCION' });
      s.addText(l.titulo, { placeholder: 'title' }); s.addText(l.bajada, { placeholder: 'body' });
    } else {
      const s = ppt.addSlide({ masterName: 'CONTENIDO' });
      s.addText(l.titulo, { placeholder: 'title' }); s.addText(l.bajada, { placeholder: 'body' });
      l.piezas.forEach(p => pieza(s, p));
    }
  }
  await ppt.writeFile({ fileName: `${deck.nombre}_diapositivas.pptx` });
}

/* ===================== PDF ===================== */
const rgbDe = hex => [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
const limpiarPDF = s => String(s).replace(/ → /g, ' a ').replace(/→/g, '>').replace(/−/g, '-').replace(/[«»]/g, '"').replace(/…/g, '...');
function textoRico(pdf, runs, x, y, w, h, o) {
  const tamBase = o.size || 12;
  const palabras = [];
  for (const r of runs) {
    const estilo = { bold: r.bold ?? o.bold, color: r.color || o.color || DC.ink, size: r.size || tamBase, italic: o.italic };
    limpiarPDF(r.text).split(/(\s+)/).forEach(p => { if (p) palabras.push({ p, ...estilo }); });
  }
  const ancho = pw => { pdf.setFont('helvetica', pw.bold ? (pw.italic ? 'bolditalic' : 'bold') : (pw.italic ? 'italic' : 'normal')); pdf.setFontSize(pw.size); return pdf.getTextWidth(pw.p); };
  const lineas = [[]]; let usado = 0;
  for (const pw of palabras) {
    const a = ancho(pw);
    if (/^\s+$/.test(pw.p)) { if (lineas[lineas.length - 1].length) { lineas[lineas.length - 1].push(pw); usado += a; } continue; }
    if (usado + a > w && lineas[lineas.length - 1].length) { lineas.push([]); usado = 0; }
    lineas[lineas.length - 1].push(pw); usado += a;
  }
  const alto = tamBase * 1.18 / 72;
  const total = lineas.length * alto;
  let yy = o.valign === 'middle' ? y + (h - total) / 2 : y;
  for (const ln of lineas) {
    while (ln.length && /^\s+$/.test(ln[ln.length - 1].p)) ln.pop();
    const anchoLinea = ln.reduce((s, pw) => s + ancho(pw), 0);
    let xx = o.align === 'center' ? x + (w - anchoLinea) / 2 : x;
    for (const pw of ln) {
      const a = ancho(pw); pdf.setTextColor(...rgbDe(pw.color)); pdf.text(pw.p, xx, yy + alto * 0.78); xx += a;
    }
    yy += alto;
  }
}
async function diapositivasPDF() {
  await cargarLibsPDF();
  const deck = deckActual();
  const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'in', format: [W, H] });
  let primera = true, numero = 0;
  const nueva = fondo => { if (!primera) pdf.addPage([W, H], 'landscape'); primera = false; numero++; pdf.setFillColor(...rgbDe(fondo)); pdf.rect(0, 0, W, H, 'F'); };
  const tituloSerif = (txt, x, y, w, h, tam, color) => { pdf.setFont('times', 'bold'); pdf.setFontSize(tam); pdf.setTextColor(...rgbDe(color)); pdf.text(pdf.splitTextToSize(limpiarPDF(txt), w)[0], x, y + h / 2 + tam / 72 * 0.32); };
  const icono = (p) => {
    const cx = p.x + p.d / 2, cy = p.y + p.d / 2; pdf.setDrawColor(255, 255, 255); pdf.setLineWidth(0.045); pdf.setFillColor(255, 255, 255);
    if (p.icono === '✓') pdf.lines([[p.d * 0.13, p.d * 0.15], [p.d * 0.25, -p.d * 0.32]], cx - p.d * 0.2, cy, [1, 1]);
    else if (p.icono === '!') { pdf.line(cx, cy - p.d * 0.2, cx, cy + p.d * 0.06); pdf.circle(cx, cy + p.d * 0.19, 0.025, 'F'); }
    else if (p.icono === '→') { pdf.line(cx - p.d * 0.2, cy, cx + p.d * 0.18, cy); pdf.lines([[-p.d * 0.13, -p.d * 0.12], [0, 0]], cx + p.d * 0.2, cy, [1, 1]); pdf.lines([[-p.d * 0.13, p.d * 0.12]], cx + p.d * 0.2, cy, [1, 1]); }
  };
  const pieza = p => {
    if (p.t === 'tarjeta') { pdf.setFillColor(...rgbDe(p.fill)); pdf.setDrawColor(...rgbDe(DC.border)); pdf.setLineWidth(0.012); pdf.roundedRect(p.x, p.y, p.w, p.h, 0.08, 0.08, 'FD'); }
    else if (p.t === 'texto') textoRico(pdf, p.runs, p.x, p.y, p.w, p.h, p);
    else if (p.t === 'circulo') { pdf.setFillColor(...rgbDe(p.color)); pdf.circle(p.x + p.d / 2, p.y + p.d / 2, p.d / 2, 'F'); if (p.icono) icono(p); }
    else if (p.t === 'tabla') {
      const total = p.anchos.reduce((a, b) => a + b, 0), columnStyles = {};
      p.anchos.forEach((a, i) => { columnStyles[i] = { cellWidth: a / total * p.w, halign: p.centrar.includes(i) ? 'center' : 'left', fontStyle: i === 0 ? 'bold' : 'normal' }; });
      pdf.autoTable({ head: [p.enc.map(limpiarPDF)], body: p.filas.map(f => f.map(c => limpiarPDF(c))), startY: p.y, margin: { left: p.x, right: W - p.x - p.w, bottom: 0.3 }, tableWidth: p.w,
        styles: { font: 'helvetica', fontSize: p.tam - 1, minCellHeight: p.alto, valign: 'middle', cellPadding: { top: 0.03, bottom: 0.03, left: 0.08, right: 0.08 }, textColor: rgbDe(DC.ink), lineColor: rgbDe(DC.border), lineWidth: 0.007 },
        headStyles: { fillColor: rgbDe(DC.navy), textColor: 255, fontStyle: 'bold' }, bodyStyles: { fillColor: [255, 255, 255] }, alternateRowStyles: { fillColor: rgbDe(DC.soft) },
        columnStyles, pageBreak: 'avoid',
        didParseCell: c => { if (c.section === 'body') { const col = p.colores[`${c.row.index},${c.column.index}`]; if (col) { c.cell.styles.textColor = rgbDe(col); c.cell.styles.fontStyle = 'bold'; } } } });
    } else if (p.t === 'barras') barrasPDF(pdf, p);
  };
  for (const l of deck.laminas) {
    if (l.tipo === 'portada') {
      nueva(DC.navy); pdf.setFillColor(...rgbDe(DC.cyan)); pdf.rect(0, 0, W, 0.22, 'F');
      textoRico(pdf, [{ text: l.eyebrow.split('').join(' ') }], 1.0, 1.95, 10, 0.4, { size: 15, bold: true, color: DC.cyan, valign: 'middle' });
      textoRico(pdf, [{ text: l.titulo }], 1.0, 2.45, 11, 1.05, { size: 54, bold: true, color: 'FFFFFF', valign: 'middle' });
      textoRico(pdf, [{ text: l.sub }], 1.0, 3.6, 11, 0.5, { size: 22, color: DC.light, valign: 'middle' });
      textoRico(pdf, [{ text: l.org }], 1.0, 4.4, 11, 0.35, { size: 15, color: DC.pale, valign: 'middle' });
      l.stats.forEach(([v, et], i) => {
        textoRico(pdf, [{ text: v }], 1.0 + i * 2.75, 5.25, 2.6, 0.65, { size: 36, bold: true, color: DC.cyan, valign: 'middle' });
        et.split('\n').forEach((ln, j) => textoRico(pdf, [{ text: ln }], 1.0 + i * 2.75, 5.95 + j * 0.24, 2.6, 0.24, { size: 13, color: DC.light }));
      });
    } else if (l.tipo === 'seccion') {
      nueva(DC.navy);
      tituloSerif(l.titulo, 1.0, 2.85, 11.3, 1.0, 40, 'FFFFFF');
      textoRico(pdf, [{ text: l.bajada }], 1.0, 3.95, 11.3, 0.6, { size: 18, color: DC.pale });
    } else {
      nueva('FFFFFF');
      tituloSerif(l.titulo, MX, 0.45, ANCHO, 0.8, 32, DC.navy);
      textoRico(pdf, [{ text: l.bajada }], MX, 1.2, ANCHO, 0.4, { size: 14, color: DC.sub });
      l.piezas.forEach(pieza);
      textoRico(pdf, [{ text: deck.pie }], MX, 7.0, 8, 0.3, { size: 10, color: DC.gray, valign: 'middle' });
      textoRico(pdf, [{ text: String(numero) }], 12.6, 7.0, 0.6, 0.3, { size: 10, color: DC.gray, valign: 'middle' });
    }
  }
  pdf.save(`${deck.nombre}_diapositivas.pdf`);
}
/* Gráfico de barras agrupadas dibujado (el PDF no tiene gráficos nativos) */
function barrasPDF(pdf, p) {
  const nS = p.series.length, nC = p.labels.length;
  const max = p.max || Math.max(1, ...p.series.flatMap(s => s.values)) * 1.18;
  const leyenda = nS > 1 ? 0.35 : 0;
  pdf.setFont('helvetica', 'normal');
  if (p.dir === 'bar') {
    const etq = 1.75, areaW = p.w - etq - 0.45, filaH = (p.h - leyenda) / nC, barH = filaH * 0.62 / nS;
    p.labels.forEach((lab, i) => {
      const y0 = p.y + i * filaH + filaH * 0.19;
      pdf.setFontSize(10); pdf.setTextColor(...rgbDe(DC.ink)); pdf.text(limpiarPDF(lab), p.x + etq - 0.1, y0 + barH * nS / 2 + 0.05, { align: 'right' });
      p.series.forEach((s, j) => {
        const v = s.values[i] || 0, bw = areaW * v / max, yb = y0 + j * barH;
        pdf.setFillColor(...rgbDe(s.color)); if (bw > 0) pdf.rect(p.x + etq, yb, bw, barH * 0.92, 'F');
        pdf.setFontSize(9); pdf.setTextColor(...rgbDe(DC.ink)); pdf.text(v + (p.pct ? '%' : ''), p.x + etq + bw + 0.06, yb + barH * 0.62);
      });
    });
  } else {
    const baseY = p.y + p.h - leyenda - 0.32, areaH = baseY - p.y - 0.25, colW = p.w / nC, barW = colW * 0.66 / nS;
    p.labels.forEach((lab, i) => {
      const x0 = p.x + i * colW + colW * 0.17;
      p.series.forEach((s, j) => {
        const v = s.values[i] || 0, bh = areaH * v / max, xb = x0 + j * barW;
        pdf.setFillColor(...rgbDe(s.color)); if (bh > 0) pdf.rect(xb, baseY - bh, barW * 0.94, bh, 'F');
        pdf.setFontSize(9); pdf.setTextColor(...rgbDe(DC.ink)); pdf.text(v + (p.pct ? '%' : ''), xb + barW * 0.47, baseY - bh - 0.06, { align: 'center' });
      });
      pdf.setFontSize(nC > 6 ? 8.5 : 9.5); pdf.setTextColor(...rgbDe(DC.ink)); pdf.text(limpiarPDF(lab), p.x + i * colW + colW / 2, baseY + 0.2, { align: 'center' });
    });
  }
  if (nS > 1) {
    let lx = p.x + p.w / 2 - 1.1; const ly = p.y + p.h - 0.18;
    p.series.forEach(s => { pdf.setFillColor(...rgbDe(s.color)); pdf.rect(lx, ly - 0.1, 0.12, 0.12, 'F'); pdf.setFontSize(10); pdf.setTextColor(...rgbDe(DC.ink)); pdf.text(s.name, lx + 0.18, ly); lx += 1.2; });
  }
}
