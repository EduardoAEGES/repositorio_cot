/* ===== Reporte de docentes por día =====
   Supervision: que docentes dictan cada dia, con curso, seccion, NRC, sede,
   modalidad y horario.

   Carga: no depende de horario.js. Si los datos ya estan en memoria los usa al
   instante; si no, descarga las hojas por su cuenta (las dos en paralelo) y las
   guarda en sessionStorage, asi la siguiente vez el panel abre de inmediato.
   Ademas precarga en segundo plano al entrar a la pagina.
   Los filtros elegidos quedan guardados entre sesiones. */
(function () {
  'use strict';

  const LIBRO = '1kNqEDwXe5Iqj9m54E--_WEe2wKxjTschDLgYnXeBS7w';
  const GID_CARGA = '1470879596';     // hoja CARGA_HORARIA
  const GID_DOCENTES = '204310163';   // hoja Docentes 2026 (area COT / PLN)
  const urlHoja = gid => `https://docs.google.com/spreadsheets/d/${LIBRO}/export?format=csv&gid=${gid}`;

  const LS = 'cot_reporte_dia_filtros';
  const CACHE = 'cot_reporte_dia_datos_v1';
  const CACHE_MIN = 15;               // minutos de vigencia del cache

  const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  // Por defecto se supervisa el modulo 1 de agosto y el regular de agosto.
  const POR_DEFECTO = {
    programas: ['COT'],
    dias: [0, 1, 2, 3, 4, 5],
    bloques: ['AGOSTO|1', 'AGOSTO|REGULAR'],
    sedes: [],          // vacio = todas
    modalidades: [],    // vacio = todas
    q: ''
  };

  let filtros = cargarFiltros();
  let construido = false;
  let DATOS = null;        // { filas: [...] }
  let promesaCarga = null; // descarga en curso

  const esc = s => String(s == null ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s == null ? '' : s).trim().toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

  function cargarFiltros() {
    try {
      const g = JSON.parse(localStorage.getItem(LS));
      if (g && Array.isArray(g.bloques)) {
        return {
          programas: Array.isArray(g.programas) && g.programas.length ? g.programas : POR_DEFECTO.programas.slice(),
          dias: Array.isArray(g.dias) ? g.dias : POR_DEFECTO.dias.slice(),
          bloques: g.bloques,
          sedes: Array.isArray(g.sedes) ? g.sedes : [],
          modalidades: Array.isArray(g.modalidades) ? g.modalidades : [],
          q: typeof g.q === 'string' ? g.q : ''
        };
      }
    } catch (e) { /* usa los valores por defecto */ }
    return JSON.parse(JSON.stringify(POR_DEFECTO));
  }
  const guardarFiltros = () => {
    try { localStorage.setItem(LS, JSON.stringify(filtros)); } catch (e) { /* sin persistencia */ }
  };

  /* ---------- utilidades de datos ---------- */
  function parseCSV(texto) {
    const filas = [];
    let fila = [], celda = '', entre = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (entre) {
        if (c === '"') { if (texto[i + 1] === '"') { celda += '"'; i++; } else entre = false; }
        else celda += c;
      } else if (c === '"') entre = true;
      else if (c === ',') { fila.push(celda); celda = ''; }
      else if (c === '\n') { fila.push(celda); filas.push(fila); fila = []; celda = ''; }
      else if (c !== '\r') celda += c;
    }
    if (celda !== '' || fila.length) { fila.push(celda); filas.push(fila); }
    return filas;
  }

  // Misma logica que horario.js: "(LUNES)(JUEVES)" + "(PRE 07:00-10:00)(...)"
  const MAPA_DIA = {
    'LUNES': 0, 'MARTES': 1, 'MIERCOLES': 2, 'MIÉRCOLES': 2,
    'JUEVES': 3, 'VIERNES': 4, 'SABADO': 5, 'SÁBADO': 5, 'DOMINGO': 6
  };
  function parseHorarios(diasStr, horasStr) {
    if (!diasStr || !horasStr) return [];
    const sacar = txt => {
      const out = []; const re = /\((.*?)\)/g; let m;
      while ((m = re.exec(txt)) !== null) out.push(m[1].trim());
      return out;
    };
    let dias = sacar(diasStr).map(d => d.toUpperCase());
    if (!dias.length) dias = [String(diasStr).trim().toUpperCase()];
    let horas = sacar(horasStr);
    if (!horas.length) horas = [String(horasStr).trim()];

    const res = [];
    for (let i = 0; i < dias.length; i++) {
      const d = MAPA_DIA[dias[i]];
      if (d === undefined) continue;
      const h = horas[i] || horas[0];
      if (!h) continue;
      const t = h.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
      if (t) res.push({ dia: d, ini: t[1].padStart(5, '0'), fin: t[2].padStart(5, '0') });
    }
    return res;
  }

  function moduloDe(mod) {
    const m = norm(mod);
    if (m.startsWith('REG') || m === 'R') return 'REGULAR';
    const d = m.match(/\d+/);
    return d ? d[0] : (m || '—');
  }
  const rotuloBloque = b => {
    const [p, m] = b.split('|');
    return m === 'REGULAR' ? `${p} regular` : `${p} M${m}`;
  };
  const areaNorm = a => {
    const x = norm(a);
    if (x.includes('PLN')) return 'PLN';
    if (x.includes('COT') || x.includes('CONTA')) return 'COT';
    return x || 'OTROS';
  };

  /* ---------- origen de los datos ---------- */
  // 1) lo que horario.js ya tenga en memoria (instantaneo)
  function desdeMemoria() {
    const gsc = window.googleSheetCourses;
    if (!gsc || !Object.keys(gsc).length) return null;
    const areas = areasDesdeContract();
    const out = [];
    Object.keys(gsc).forEach(docente => {
      const area = areas[norm(docente)] || 'OTROS';
      (gsc[docente] || []).forEach(c => {
        (c.days || []).forEach(d => out.push({
          docente, dni: c.dni || '', area,
          curso: c.name || '', seccion: c.section || '', nrc: c.nrc || '',
          sede: c.sede || '', modalidad: norm(c.modality).includes('VIR') ? 'VIRTUAL' : 'PRESENCIAL',
          dia: d, ini: c.startTime || '', fin: c.endTime || '',
          bloque: `${norm(c.periodo) || '—'}|${moduloDe(c.modulo)}`
        }));
      });
    });
    return out.length ? out : null;
  }
  function areasDesdeContract() {
    const cd = window.contractData, mapa = {};
    if (!cd) return mapa;
    Object.keys(cd).forEach(k => {
      const v = cd[k];
      if (v && v.name) mapa[norm(v.name)] = areaNorm(v.area);
    });
    return mapa;
  }

  // 2) descarga propia de las dos hojas, en paralelo
  async function descargar(aviso) {
    if (aviso) aviso('Descargando el horario…');
    const t = '&t=' + Date.now();
    const [rCarga, rDoc] = await Promise.all([
      fetch(urlHoja(GID_CARGA) + t),
      fetch(urlHoja(GID_DOCENTES) + t).catch(() => null)
    ]);
    if (!rCarga || !rCarga.ok) throw new Error('No se pudo descargar la hoja CARGA_HORARIA.');

    if (aviso) aviso('Procesando los cursos…');
    const filasCsv = parseCSV(await rCarga.text());

    // areas COT / PLN desde Docentes 2026 (si esa hoja responde)
    const areas = {};
    if (rDoc && rDoc.ok) {
      const rows = parseCSV(await rDoc.text());
      const cab = rows.findIndex(r => r.some(c => norm(c) === 'DNI') &&
        r.some(c => norm(c).includes('APELLIDO') || norm(c).includes('NOMBRE')));
      if (cab >= 0) {
        const h = rows[cab].map(norm);
        const iN = h.findIndex(x => x.includes('APELLIDO') || x.includes('NOMBRE'));
        const iA = h.findIndex(x => x.includes('AREA'));
        for (let i = cab + 1; i < rows.length; i++) {
          const r = rows[i];
          const nombre = iN >= 0 ? norm(r[iN]) : '';
          if (!nombre || nombre.includes('APELLIDO')) continue;
          if (areas[nombre]) continue;             // vale la primera aparicion
          areas[nombre] = iA >= 0 ? areaNorm(r[iA]) : 'OTROS';
        }
      }
    }

    const out = [];
    for (let i = 1; i < filasCsv.length; i++) {
      const r = filasCsv[i];
      if (!r || r.length < 18) continue;
      const docente = String(r[2] || '').trim().toUpperCase();
      if (!docente) continue;
      const horarios = parseHorarios(String(r[16] || ''), String(r[17] || ''));
      if (!horarios.length) continue;
      const area = areas[norm(docente)] || 'OTROS';
      const bloque = `${norm(r[11]) || '—'}|${moduloDe(r[6])}`;
      const modalidad = norm(r[15]).includes('VIR') ? 'VIRTUAL' : 'PRESENCIAL';
      horarios.forEach(h => out.push({
        docente, dni: String(r[1] || '').trim(), area,
        curso: String(r[4] || '').trim(), seccion: String(r[5] || '').trim(),
        nrc: String(r[7] || '').trim(), sede: String(r[3] || '').trim(),
        modalidad, dia: h.dia, ini: h.ini, fin: h.fin, bloque
      }));
    }
    if (!out.length) throw new Error('La hoja no devolvió cursos con horario.');
    return out;
  }

  function leerCache() {
    try {
      const c = JSON.parse(sessionStorage.getItem(CACHE));
      if (c && Array.isArray(c.filas) && c.filas.length &&
          (Date.now() - c.momento) < CACHE_MIN * 60000) return c.filas;
    } catch (e) { /* cache invalido */ }
    return null;
  }
  const guardarCache = filas => {
    try { sessionStorage.setItem(CACHE, JSON.stringify({ filas, momento: Date.now() })); }
    catch (e) { /* sessionStorage lleno: no es critico */ }
  };

  function obtenerDatos(aviso) {
    if (DATOS) return Promise.resolve(DATOS);
    if (promesaCarga) return promesaCarga;

    const mem = desdeMemoria();
    if (mem) { DATOS = { filas: mem }; guardarCache(mem); return Promise.resolve(DATOS); }

    const cache = leerCache();
    if (cache) { DATOS = { filas: cache }; return Promise.resolve(DATOS); }

    promesaCarga = descargar(aviso)
      .then(filas => { DATOS = { filas }; guardarCache(filas); promesaCarga = null; return DATOS; })
      .catch(err => { promesaCarga = null; throw err; });
    return promesaCarga;
  }

  const filas = () => (DATOS && DATOS.filas) || [];

  function pasaFiltro(f, saltar) {
    if (saltar !== 'prog' && filtros.programas.length && !filtros.programas.includes(f.area)) return false;
    if (saltar !== 'dia' && filtros.dias.length && !filtros.dias.includes(f.dia)) return false;
    if (saltar !== 'bloque' && filtros.bloques.length && !filtros.bloques.includes(f.bloque)) return false;
    if (saltar !== 'sede' && filtros.sedes.length && !filtros.sedes.includes(f.sede)) return false;
    if (saltar !== 'mod' && filtros.modalidades.length && !filtros.modalidades.includes(f.modalidad)) return false;
    if (filtros.q) {
      const q = norm(filtros.q);
      if (!(norm(f.docente).includes(q) || norm(f.curso).includes(q) ||
            norm(f.nrc).includes(q) || norm(f.seccion).includes(q))) return false;
    }
    return true;
  }

  /* ---------- interfaz ---------- */
  function construir() {
    if (construido) return;
    construido = true;
    const ov = document.createElement('div');
    ov.className = 'rd-overlay';
    ov.id = 'rdOverlay';
    ov.innerHTML =
      '<div class="rd-panel">' +
        '<div class="rd-head"><i class="fas fa-user-check"></i>' +
          '<div><h3>Reporte de docentes por día</h3>' +
          '<div class="rd-sub" id="rdSub"></div></div>' +
          '<button class="rd-cerrar" id="rdCerrar"><i class="fas fa-xmark"></i></button></div>' +
        '<div class="rd-filtros">' +
          '<div class="rd-fila"><span class="rd-lab">Programa</span><span id="rdProg"></span>' +
            '<span class="rd-sep"></span><span class="rd-lab">Días</span><span id="rdDias"></span>' +
            '<div class="rd-tools">' +
              '<div class="rd-buscar"><i class="fas fa-search"></i>' +
                '<input type="text" id="rdQ" placeholder="Docente, curso, NRC..."></div>' +
              '<button class="rd-mini" id="rdCsv"><i class="fas fa-file-csv"></i> Exportar</button>' +
              '<button class="rd-mini" id="rdRecargar"><i class="fas fa-rotate"></i> Recargar</button>' +
              '<button class="rd-mini" id="rdReset"><i class="fas fa-rotate-left"></i> Restablecer</button>' +
            '</div>' +
          '</div>' +
          '<div class="rd-fila"><span class="rd-lab">Periodo</span><span id="rdBloques"></span></div>' +
          '<div class="rd-fila"><span class="rd-lab">Sede</span><span id="rdSedes"></span>' +
            '<span class="rd-sep"></span><span class="rd-lab">Modalidad</span>' +
            '<span id="rdModal"></span></div>' +
        '</div>' +
        '<div class="rd-body" id="rdBody"></div>' +
        '<div class="rd-pie"><span id="rdPie"></span>' +
          '<span>Los filtros quedan guardados para la próxima vez.</span></div>' +
      '</div>';
    document.body.appendChild(ov);

    document.getElementById('rdCerrar').onclick = cerrar;
    ov.addEventListener('click', e => { if (e.target === ov) cerrar(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && ov.classList.contains('abierto')) cerrar();
    });
    const q = document.getElementById('rdQ');
    q.value = filtros.q;
    q.addEventListener('input', e => { filtros.q = e.target.value.trim(); guardarFiltros(); pintar(); });
    document.getElementById('rdCsv').onclick = exportar;
    document.getElementById('rdReset').onclick = () => {
      filtros = JSON.parse(JSON.stringify(POR_DEFECTO));
      guardarFiltros();
      document.getElementById('rdQ').value = '';
      pintar();
    };
    document.getElementById('rdRecargar').onclick = () => {
      DATOS = null;
      try { sessionStorage.removeItem(CACHE); } catch (e) { /* nada */ }
      asegurarDatos(true);
    };
  }

  function chip(txt, activo, extra, cuenta) {
    return `<button class="rd-chip ${extra || ''}${activo ? ' on' : ''}" data-v="${esc(txt)}">` +
           `${esc(txt)}${cuenta != null ? `<span class="rd-n">${cuenta}</span>` : ''}</button>`;
  }

  function pintarFiltros(todas) {
    const cont = {};
    todas.forEach(f => { cont[f.area] = (cont[f.area] || 0) + 1; });
    const fijos = ['COT', 'PLN', 'OTROS'];
    const progs = fijos.filter(x => cont[x]).concat(
      Object.keys(cont).filter(a => !fijos.includes(a)).sort());
    const cp = document.getElementById('rdProg');
    cp.innerHTML = progs.map(p =>
      chip(p, filtros.programas.includes(p), 'prog-' + p.toLowerCase(),
           todas.filter(f => f.area === p && pasaFiltro(f, 'prog')).length)).join(' ');
    cp.querySelectorAll('.rd-chip').forEach(b => b.onclick = () => {
      const v = b.dataset.v, i = filtros.programas.indexOf(v);
      if (i >= 0) filtros.programas.splice(i, 1); else filtros.programas.push(v);
      guardarFiltros(); pintar();
    });

    const cd = document.getElementById('rdDias');
    cd.innerHTML = DIAS.slice(0, 6).map((d, i) =>
      chip(d, filtros.dias.includes(i), 'dia-' + i,
           todas.filter(f => f.dia === i && pasaFiltro(f, 'dia')).length)).join(' ');
    cd.querySelectorAll('.rd-chip').forEach((b, i) => b.onclick = () => {
      const k = filtros.dias.indexOf(i);
      if (k >= 0) filtros.dias.splice(k, 1); else filtros.dias.push(i);
      guardarFiltros(); pintar();
    });

    const bl = {};
    todas.forEach(f => { bl[f.bloque] = (bl[f.bloque] || 0) + 1; });
    const orden = b => {
      const [p, m] = b.split('|');
      const mes = { JUNIO: 1, JULIO: 2, AGOSTO: 3, SETIEMBRE: 4, SEPTIEMBRE: 4, OCTUBRE: 5 };
      return (mes[p] || 9) * 10 + (m === 'REGULAR' ? 3 : parseInt(m, 10) || 9);
    };
    const cb = document.getElementById('rdBloques');
    cb.innerHTML = Object.keys(bl).sort((a, b) => orden(a) - orden(b)).map(b =>
      `<button class="rd-chip${filtros.bloques.includes(b) ? ' on' : ''}" data-v="${esc(b)}">` +
      `${esc(rotuloBloque(b))}<span class="rd-n">${todas.filter(f => f.bloque === b && pasaFiltro(f, 'bloque')).length}</span></button>`
    ).join(' ');
    cb.querySelectorAll('.rd-chip').forEach(b => b.onclick = () => {
      const v = b.dataset.v, i = filtros.bloques.indexOf(v);
      if (i >= 0) filtros.bloques.splice(i, 1); else filtros.bloques.push(v);
      guardarFiltros(); pintar();
    });
  }

  // Sede y modalidad: las opciones salen de los datos reales
  function pintarSedeModalidad(todas) {
    const grupo = (contId, campo, clave, orden) => {
      const cont = {};
      todas.forEach(f => { if (f[campo]) cont[f[campo]] = (cont[f[campo]] || 0) + 1; });
      let claves = Object.keys(cont);
      claves = orden ? orden.filter(x => cont[x]).concat(claves.filter(x => !orden.includes(x)).sort())
                     : claves.sort();
      const cajon = document.getElementById(contId);
      cajon.innerHTML = claves.map(v =>
        chip(v, filtros[clave].includes(v), campo === 'modalidad' ? 'mod-' + v.toLowerCase() : '',
             todas.filter(f => f[campo] === v && pasaFiltro(f, campo === 'sede' ? 'sede' : 'mod')).length)
      ).join(' ');
      cajon.querySelectorAll('.rd-chip').forEach(b => b.onclick = () => {
        const v = b.dataset.v, i = filtros[clave].indexOf(v);
        if (i >= 0) filtros[clave].splice(i, 1); else filtros[clave].push(v);
        guardarFiltros(); pintar();
      });
    };
    grupo('rdSedes', 'sede', 'sedes', null);
    grupo('rdModal', 'modalidad', 'modalidades', ['PRESENCIAL', 'VIRTUAL']);
  }

  function mensaje(html) {
    const b = document.getElementById('rdBody');
    if (b) b.innerHTML = html;
  }

  function pintar() {
    const todas = filas();
    if (!todas.length) return;
    pintarFiltros(todas);
    pintarSedeModalidad(todas);

    const sel = todas.filter(f => pasaFiltro(f));
    const dias = filtros.dias.length ? filtros.dias.slice().sort((a, b) => a - b) : [0, 1, 2, 3, 4, 5];
    const totalDocentes = new Set();
    let html = '';

    dias.forEach(d => {
      const delDia = sel.filter(f => f.dia === d)
        .sort((a, b) => (a.ini || '').localeCompare(b.ini || '') || a.docente.localeCompare(b.docente, 'es'));
      if (!delDia.length) return;
      const docs = new Set(delDia.map(f => f.docente));
      docs.forEach(x => totalDocentes.add(x));
      html += '<div class="rd-dia"><div class="rd-dia-tit"><i class="fas fa-calendar-day"></i>' +
        esc(DIAS[d]) + `<span class="rd-cuenta">${docs.size} docente${docs.size === 1 ? '' : 's'} · ${delDia.length} clase${delDia.length === 1 ? '' : 's'}</span></div>` +
        '<table class="rd-tabla"><thead><tr>' +
        '<th>Horario</th><th>Docente</th><th>Curso</th><th>Sec.</th><th>NRC</th>' +
        '<th>Sede</th><th>Modalidad</th><th>Periodo</th></tr></thead><tbody>' +
        delDia.map(f =>
          '<tr>' +
          `<td class="rd-hora">${esc(f.ini)} - ${esc(f.fin)}</td>` +
          `<td class="rd-doc">${esc(f.docente)}<small>${esc(f.dni)} · <span class="rd-tag rd-area${f.area === 'PLN' ? ' pln' : ''}">${esc(f.area)}</span></small></td>` +
          `<td class="rd-curso">${esc(f.curso)}</td>` +
          `<td>${esc(f.seccion)}</td><td>${esc(f.nrc)}</td><td>${esc(f.sede)}</td>` +
          `<td><span class="rd-tag ${f.modalidad === 'VIRTUAL' ? 'rd-vir' : 'rd-pre'}">${esc(f.modalidad)}</span></td>` +
          `<td>${esc(rotuloBloque(f.bloque))}</td>` +
          '</tr>').join('') +
        '</tbody></table></div>';
    });

    mensaje(html || '<div class="rd-vacio">Ningún curso coincide con los filtros elegidos.</div>');

    const extras = [];
    if (filtros.sedes.length) extras.push('Sede: ' + filtros.sedes.join('/'));
    if (filtros.modalidades.length) extras.push(filtros.modalidades.join('/'));
    document.getElementById('rdSub').textContent =
      `${filtros.programas.join(' + ') || 'sin programa'} · ` +
      `${filtros.bloques.map(rotuloBloque).join(', ') || 'sin periodo'}` +
      (extras.length ? ' · ' + extras.join(' · ') : '');
    document.getElementById('rdPie').textContent =
      `${totalDocentes.size} docentes · ${sel.length} clases en los días elegidos`;
  }

  // Carga los datos mostrando el avance y pinta al terminar
  function asegurarDatos(forzar) {
    if (DATOS && !forzar) { pintar(); return; }
    mensaje('<div class="rd-cargando"><i class="fas fa-spinner fa-spin"></i>' +
            '<br><span id="rdPaso">Preparando…</span></div>');
    const aviso = txt => { const p = document.getElementById('rdPaso'); if (p) p.textContent = txt; };
    obtenerDatos(aviso).then(() => pintar()).catch(err => {
      mensaje('<div class="rd-vacio"><b>No se pudieron cargar los datos.</b><br>' +
              esc(err.message) + '<br><br>Revisa tu conexión y pulsa <b>Recargar</b>.</div>');
    });
  }

  function exportar() {
    const sel = filas().filter(f => pasaFiltro(f));
    const cab = ['Día', 'Horario', 'Docente', 'DNI', 'Programa', 'Curso', 'Sección', 'NRC', 'Sede', 'Modalidad', 'Periodo'];
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const cuerpo = sel.map(f => [DIAS[f.dia], `${f.ini} - ${f.fin}`, f.docente, f.dni, f.area,
      f.curso, f.seccion, f.nrc, f.sede, f.modalidad, rotuloBloque(f.bloque)].map(q).join(','));
    const blob = new Blob(['﻿' + [cab.map(q).join(',')].concat(cuerpo).join('\n')],
      { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'reporte_docentes_por_dia.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function abrir() {
    construir();
    document.getElementById('rdOverlay').classList.add('abierto');
    asegurarDatos(false);
  }
  function cerrar() { const o = document.getElementById('rdOverlay'); if (o) o.classList.remove('abierto'); }

  /* ---------- boton, al lado de Dashboard ---------- */
  function ponerBoton() {
    if (document.getElementById('btnReporteDia')) return;
    const dash = document.querySelector('.dashboard-btn');
    if (!dash || !dash.parentNode) return;
    const b = document.createElement('button');
    b.id = 'btnReporteDia';
    b.className = 'rd-btn';
    b.innerHTML = '<i class="fas fa-user-check"></i> Reporte docentes por día';
    b.onclick = abrir;
    dash.parentNode.insertBefore(b, dash.nextSibling);
  }

  function iniciar() {
    ponerBoton();
    // Precarga en segundo plano: al abrir el panel los datos ya estan listos.
    const precargar = () => { if (!DATOS && !promesaCarga) obtenerDatos(null).catch(() => {}); };
    if (window.requestIdleCallback) requestIdleCallback(precargar, { timeout: 3000 });
    else setTimeout(precargar, 2000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
