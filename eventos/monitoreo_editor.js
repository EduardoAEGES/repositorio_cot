/* ===== Edición local de los datos de monitoreo =====
   «✎ Editar datos» abre una tabla editable de la semana que se está viendo:
   respuestas del formulario, tardanzas, chat de WhatsApp y hallazgos. Al guardar,
   el conjunto completo queda en este navegador (localStorage) y reemplaza al JSON
   de datos/ en todas las vistas, el comparativo y las diapositivas. No se envía
   a ningún servidor: para que lo vean todos, usa «Descargar JSON» y reemplaza el
   archivo de eventos/datos/. Se carga antes de monitoreo_sede.js. */

const ED_LOCAL = (n, clave) => `cot_monitoreo_s${n}_${clave}`;
const ED_CLAVES = ['respuestas', 'tardanzas', 'chat', 'hallazgos'];
const ED_META = {};   // `${semana}|${clave}` -> { editado_en }

/* Lo editado en este navegador para la semana n (lo usa cargarSemana) */
function leerEdiciones(n) {
  const ovr = {};
  for (const c of ED_CLAVES) {
    try {
      const v = localStorage.getItem(ED_LOCAL(n, c));
      if (!v) continue;
      const g = JSON.parse(v);
      if (Array.isArray(g.datos)) { ovr[c] = g.datos; ED_META[n + '|' + c] = g; }
    } catch (e) { /* almacenamiento no disponible: se usan los JSON */ }
  }
  return ovr;
}

/* ---------- definición de cada conjunto ---------- */
const ED_ESTADOS = ['', 'Conforme', 'Con observación', 'No aplica', 'No se pudo verificar'];
const ED_SEDES = ['AQP', 'ATE', 'NOR', 'SJL', 'SUR', 'VES', 'VIR'];
const ED_TURNOS = ['Turno Mañana', 'Turno Tarde', 'Turno Noche'];
const hoyISO = () => new Date().toISOString().slice(0, 10);
function edConjuntos() {
  return {
    respuestas: {
      titulo: 'Respuestas del formulario', archivo: n => `monitoreo_semana${n}.json`,
      columnas: [
        { k: 'Fecha', t: 'fecha-iso' }, { k: 'Monitor', t: 'text', w: 230 },
        { k: 'Sede Monitoreada', l: 'Sede', t: 'select', o: ED_SEDES }, { k: 'Turno', t: 'select', o: ED_TURNOS },
        ...MOMENTOS.flatMap(([e, c]) => [
          { k: e, l: momentoCorto(e), t: 'select', o: ED_ESTADOS },
          { k: c, l: 'Comentario ' + momentoCorto(e).replace(' monitoreo', ''), t: 'area', w: 260 }]),
        { k: 'Recomendaciones', t: 'area', w: 260 }, { k: 'Origen', t: 'select', o: ['', 'Coordinación'] }
      ],
      nuevo: () => Object.assign({ 'Marca temporal': null, Monitor: '', 'Sede Monitoreada': '', Turno: '', Fecha: hoyISO() + 'T00:00:00',
        'Número de semana en la que se hace la visita': 'Semana ' + ED.semana, Recomendaciones: '', Origen: '' },
        Object.fromEntries(MOMENTOS.flatMap(([e, c]) => [[e, ''], [c, '']]))),
      exportar: filas => filas
    },
    tardanzas: {
      titulo: 'Tardanzas', archivo: n => `tardanzas_semana${n}.json`,
      columnas: [{ k: 'fecha', t: 'fecha' }, { k: 'sede', t: 'select', o: ED_SEDES }, { k: 'turno', t: 'select', o: ED_TURNOS },
        { k: 'docente', t: 'text', w: 230 }, { k: 'curso', t: 'text', w: 180 }, { k: 'detalle', t: 'area', w: 300 }, { k: 'fuente', t: 'text', w: 150 }],
      nuevo: () => ({ fecha: hoyISO(), sede: '', turno: 'Turno Mañana', docente: '', curso: '', detalle: '', fuente: 'Formulario' }),
      exportar: filas => Object.assign({}, BASE[ED.semana].tard, { registros: filas })
    },
    chat: {
      titulo: 'Chat de WhatsApp', archivo: n => `chat_semana${n}.json`,
      columnas: [{ k: 'fecha', t: 'fecha' }, { k: 'hora', t: 'hora' }, { k: 'autor', t: 'text', w: 210 },
        { k: 'sede', t: 'select', o: ['', ...ED_SEDES] }, { k: 'tipo', t: 'select', o: ['reporte', 'incidencia', 'pendiente', 'coordinacion'] },
        { k: 'texto', t: 'area', w: 420 }],
      nuevo: () => ({ fecha: hoyISO(), hora: '07:00', autor: '', sede: '', tipo: 'reporte', texto: '' }),
      exportar: filas => Object.assign({}, BASE[ED.semana].chat, { mensajes: filas })
    },
    hallazgos: {
      titulo: 'Hallazgos', archivo: n => `hallazgos_semana${n}.json`,
      columnas: [{ k: 0, l: 'Tema', t: 'text', w: 190 }, { k: 1, l: 'Qué se observó', t: 'area', w: 460 }, { k: 2, l: 'Siguiente paso', t: 'area', w: 280 }],
      nuevo: () => ['', '', ''],
      exportar: filas => ({ semana: 'Semana ' + ED.semana, hallazgos: filas })
    }
  };
}
function edOriginal(n, clave) {
  const b = BASE[n];
  return { respuestas: b.respuestas, tardanzas: b.tard.registros || [], chat: b.chat.mensajes || [], hallazgos: b.hallazgos }[clave];
}
function edActual(n, clave) { return (OVR[n] && OVR[n][clave]) || edOriginal(n, clave); }

/* ---------- estado del editor ---------- */
const ED = { semana: 1, clave: 'respuestas', filas: [], sucio: false, filtro: '' };
const copia = v => JSON.parse(JSON.stringify(v));

function construirEditor() {
  if ($('modal-editar')) return;
  const m = document.createElement('div');
  m.className = 'modal'; m.id = 'modal-editar';
  m.innerHTML = `<div class="modal-box ed-box">
    <div class="modal-head"><div><h3 id="ed-titulo">Editar datos</h3><p id="ed-estado"></p></div><button class="text-btn" id="ed-cerrar">Cerrar</button></div>
    <nav class="tabs ed-tabs" id="ed-tabs">${ED_CLAVES.map(c => `<button data-clave="${c}">${esc(edConjuntos()[c].titulo)}</button>`).join('')}</nav>
    <div class="ed-barra">
      <button id="ed-agregar">+ Agregar fila</button>
      <input id="ed-buscar" type="search" placeholder="Buscar en esta tabla…">
      <span class="ed-cuenta" id="ed-cuenta"></span><span class="ed-sp"></span>
      <button id="ed-original">Volver a los datos originales</button>
      <button id="ed-descargar">Descargar JSON</button>
      <button id="ed-guardar" class="ed-primario">Guardar cambios</button>
    </div>
    <div class="modal-body ed-body"><div class="table-wrap ed-wrap"><table class="ed-tabla"><thead id="ed-head"></thead><tbody id="ed-filas"></tbody></table></div></div>
  </div>`;
  document.body.appendChild(m);
  $('ed-cerrar').onclick = cerrarEditor;
  m.addEventListener('click', e => { if (e.target === m) cerrarEditor(); });
  for (const b of m.querySelectorAll('#ed-tabs button')) b.onclick = () => { if (confirmarDescarte()) abrirConjunto(b.dataset.clave); };
  $('ed-agregar').onclick = () => { ED.filas.unshift(edConjuntos()[ED.clave].nuevo()); ED.sucio = true; pintarEditor(); };
  $('ed-buscar').oninput = e => { ED.filtro = e.target.value.trim().toLocaleLowerCase('es'); pintarEditor(); };
  $('ed-guardar').onclick = guardarEdicion;
  $('ed-original').onclick = volverOriginal;
  $('ed-descargar').onclick = descargarJSON;
  // edición en la tabla
  $('ed-filas').addEventListener('input', e => {
    const el = e.target; if (!el.dataset || el.dataset.i === undefined) return;
    const fila = ED.filas[+el.dataset.i], k = isNaN(+el.dataset.k) ? el.dataset.k : +el.dataset.k;
    fila[k] = el.dataset.t === 'fecha-iso' ? (el.value ? el.value + 'T00:00:00' : '') : el.value;
    ED.sucio = true; estadoEditor();
  });
  $('ed-filas').addEventListener('click', e => {
    const b = e.target.closest('[data-borrar]'); if (!b) return;
    if (!confirm('¿Eliminar esta fila?')) return;
    ED.filas.splice(+b.dataset.borrar, 1); ED.sucio = true; pintarEditor();
  });
}
function confirmarDescarte() { return !ED.sucio || confirm('Hay cambios sin guardar en esta tabla. ¿Descartarlos?'); }
function abrirEditor() {
  construirEditor();
  ED.semana = SEMANA;
  $('ed-titulo').textContent = `Editar datos · Semana ${ED.semana}`;
  abrirConjunto(ED.clave);
  $('modal-editar').classList.add('abierto');
}
function cerrarEditor() { if (!confirmarDescarte()) return; ED.sucio = false; $('modal-editar').classList.remove('abierto'); }
function abrirConjunto(clave) {
  ED.clave = clave; ED.filas = copia(edActual(ED.semana, clave)); ED.sucio = false; ED.filtro = ''; $('ed-buscar').value = '';
  for (const b of document.querySelectorAll('#ed-tabs button')) b.classList.toggle('on', b.dataset.clave === clave);
  pintarEditor();
}
function estadoEditor() {
  const meta = ED_META[ED.semana + '|' + ED.clave];
  const editado = OVR[ED.semana] && OVR[ED.semana][ED.clave];
  $('ed-estado').textContent = (ED.sucio ? 'Cambios sin guardar · ' : '') +
    (editado ? `Usando la versión editada en este navegador${meta && meta.editado_en ? ' (' + new Date(meta.editado_en).toLocaleString('es-PE') + ')' : ''}`
             : 'Usando los datos originales del reporte') + ' · los cambios se guardan solo en este navegador';
  $('ed-guardar').disabled = !ED.sucio;
  $('ed-original').disabled = !editado && !ED.sucio;
}
function celdaEditor(col, valor, i) {
  const v = valor == null ? '' : String(valor);
  const base = `data-i="${i}" data-k="${esc(String(col.k))}" data-t="${col.t}"`;
  const ancho = col.w ? ` style="min-width:${col.w}px"` : '';
  if (col.t === 'select') {
    const opciones = col.o.includes(v) ? col.o : [v, ...col.o];
    return `<select ${base}>${opciones.map(o => `<option${o === v ? ' selected' : ''} value="${esc(o)}">${esc(o || '—')}</option>`).join('')}</select>`;
  }
  if (col.t === 'area') return `<textarea ${base}${ancho} rows="2">${esc(v)}</textarea>`;
  if (col.t === 'fecha' || col.t === 'fecha-iso') return `<input type="date" ${base} value="${esc(v.slice(0, 10))}">`;
  if (col.t === 'hora') return `<input type="time" ${base} value="${esc(v)}">`;
  return `<input type="text" ${base}${ancho} value="${esc(v)}">`;
}
function pintarEditor() {
  const def = edConjuntos()[ED.clave];
  $('ed-head').innerHTML = '<tr><th></th>' + def.columnas.map(c => `<th>${esc(c.l || c.k)}</th>`).join('') + '</tr>';
  const visibles = ED.filas.map((f, i) => [f, i]).filter(([f]) =>
    !ED.filtro || Object.values(f).some(v => typeof v === 'string' && v.toLocaleLowerCase('es').includes(ED.filtro)));
  $('ed-filas').innerHTML = visibles.length ? visibles.map(([f, i]) =>
    `<tr><td><button class="ed-borrar" data-borrar="${i}" title="Eliminar fila">✕</button></td>` +
    def.columnas.map(c => `<td>${celdaEditor(c, f[c.k], i)}</td>`).join('') + '</tr>').join('')
    : `<tr><td colspan="${def.columnas.length + 1}" class="empty">Sin filas${ED.filtro ? ' que coincidan con la búsqueda' : ''}.</td></tr>`;
  $('ed-cuenta').textContent = `${ED.filas.length} filas`;
  estadoEditor();
}

/* Vuelve a dibujar lo que se está viendo con los datos nuevos */
function refrescarVistas() {
  armarSemana(ED.semana);
  const sel = document.querySelector('#selector-semana button.on');
  mostrar(sel ? sel.dataset.sem : String(ED.semana));
}
function guardarEdicion() {
  const g = { datos: ED.filas, editado_en: new Date().toISOString() };
  try { localStorage.setItem(ED_LOCAL(ED.semana, ED.clave), JSON.stringify(g)); }
  catch (e) { alert('No se pudo guardar en este navegador: ' + e.message + '. Usa «Descargar JSON» para no perder los cambios.'); return; }
  OVR[ED.semana][ED.clave] = copia(ED.filas);
  ED_META[ED.semana + '|' + ED.clave] = g;
  ED.sucio = false;
  refrescarVistas();
  estadoEditor();
}
function volverOriginal() {
  if (!confirm('¿Volver a los datos originales del reporte? Se pierde lo editado en esta tabla.')) return;
  try { localStorage.removeItem(ED_LOCAL(ED.semana, ED.clave)); } catch (e) { /* nada */ }
  delete OVR[ED.semana][ED.clave];
  delete ED_META[ED.semana + '|' + ED.clave];
  refrescarVistas();
  abrirConjunto(ED.clave);
}
function descargarJSON() {
  const def = edConjuntos()[ED.clave];
  const texto = JSON.stringify(def.exportar(ED.filas), null, 1);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
  a.download = def.archivo(ED.semana);
  a.click(); URL.revokeObjectURL(a.href);
}

function iniciarEditor() {
  const b = $('editar');
  if (b) b.onclick = abrirEditor;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('modal-editar') && $('modal-editar').classList.contains('abierto')) cerrarEditor(); });
  window.addEventListener('beforeunload', e => { if (ED.sucio) { e.preventDefault(); e.returnValue = ''; } });
}
