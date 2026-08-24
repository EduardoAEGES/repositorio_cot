/* ===== Reporte de docentes por día =====
   Supervision: que docentes dictan cada dia, con curso, seccion, NRC, sede,
   modalidad y horario. Reutiliza los datos que horario.js ya descargo
   (window.googleSheetCourses y window.contractData), no vuelve a bajar nada.
   Los filtros elegidos quedan guardados: al reabrir siguen activos. */
(function () {
  'use strict';

  const LS = 'cot_reporte_dia_filtros';
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

  /* ---------- datos ---------- */
  // Normaliza el modulo: 1, 2 o REGULAR
  function moduloDe(c) {
    const m = norm(c.modulo);
    if (m.startsWith('REG') || m === 'R') return 'REGULAR';
    const d = m.match(/\d+/);
    return d ? d[0] : (m || '—');
  }
  const bloqueDe = c => `${norm(c.periodo) || '—'}|${moduloDe(c)}`;
  const rotuloBloque = b => {
    const [p, m] = b.split('|');
    return m === 'REGULAR' ? `${p} regular` : `${p} M${m}`;
  };

  // Area del docente segun la hoja Docentes 2026 (padron del equipo COT/PLN).
  // El horario incluye docentes de otras carreras que no figuran en ese padron:
  // esos se marcan como OTROS en vez de asumirlos COT, para no falsear el reporte.
  function areaDe(nombre) {
    const cd = window.contractData;
    if (!cd) return 'OTROS';
    let info = cd[nombre] || cd[norm(nombre)];
    if (!info) {
      const n = norm(nombre);
      const k = Object.keys(cd).find(x => isNaN(x) && norm(x) === n);
      info = k ? cd[k] : null;
    }
    if (!info) return 'OTROS';
    const a = norm(info.area);
    if (a.includes('PLN')) return 'PLN';
    if (a.includes('COT') || a.includes('CONTA')) return 'COT';
    return a || 'OTROS';
  }

  // Aplana los cursos a filas: una por docente + curso + dia
  function filas() {
    const gsc = window.googleSheetCourses || {};
    const out = [];
    Object.keys(gsc).forEach(docente => {
      const area = areaDe(docente);
      (gsc[docente] || []).forEach(c => {
        (c.days || []).forEach(d => {
          out.push({
            docente, dni: c.dni || '', area,
            curso: c.name || '', seccion: c.section || '', nrc: c.nrc || '',
            sede: c.sede || '', modalidad: norm(c.modality).includes('VIR') ? 'VIRTUAL' : 'PRESENCIAL',
            dia: d, ini: c.startTime || '', fin: c.endTime || '',
            bloque: bloqueDe(c), ciclo: c.ciclo || ''
          });
        });
      });
    });
    return out;
  }

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
  }

  function chip(txt, activo, extra, cuenta) {
    return `<button class="rd-chip ${extra || ''}${activo ? ' on' : ''}" data-v="${esc(txt)}">` +
           `${esc(txt)}${cuenta != null ? `<span class="rd-n">${cuenta}</span>` : ''}</button>`;
  }

  function pintarFiltros(todas) {
    // Programa
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
      const v = b.dataset.v;
      const i = filtros.programas.indexOf(v);
      if (i >= 0) filtros.programas.splice(i, 1); else filtros.programas.push(v);
      guardarFiltros(); pintar();
    });

    // Dias
    const cd = document.getElementById('rdDias');
    cd.innerHTML = DIAS.slice(0, 6).map((d, i) =>
      chip(d, filtros.dias.includes(i), 'dia-' + i,
           todas.filter(f => f.dia === i && pasaFiltro(f, 'dia')).length)).join(' ');
    cd.querySelectorAll('.rd-chip').forEach((b, i) => b.onclick = () => {
      const k = filtros.dias.indexOf(i);
      if (k >= 0) filtros.dias.splice(k, 1); else filtros.dias.push(i);
      guardarFiltros(); pintar();
    });

    // Periodos disponibles, deducidos de los datos reales
    const bl = {};
    todas.forEach(f => { bl[f.bloque] = (bl[f.bloque] || 0) + 1; });
    const orden = b => {
      const [p, m] = b.split('|');
      const mesOrden = { JUNIO: 1, JULIO: 2, AGOSTO: 3, SETIEMBRE: 4, SEPTIEMBRE: 4, OCTUBRE: 5 };
      return (mesOrden[p] || 9) * 10 + (m === 'REGULAR' ? 3 : parseInt(m, 10) || 9);
    };
    const cb = document.getElementById('rdBloques');
    const claves = Object.keys(bl).sort((a, b) => orden(a) - orden(b));
    cb.innerHTML = claves.map(b =>
      `<button class="rd-chip${filtros.bloques.includes(b) ? ' on' : ''}" data-v="${esc(b)}">` +
      `${esc(rotuloBloque(b))}<span class="rd-n">${todas.filter(f => f.bloque === b && pasaFiltro(f, 'bloque')).length}</span></button>`
    ).join(' ');
    cb.querySelectorAll('.rd-chip').forEach(b => b.onclick = () => {
      const v = b.dataset.v;
      const i = filtros.bloques.indexOf(v);
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
        const v = b.dataset.v;
        const i = filtros[clave].indexOf(v);
        if (i >= 0) filtros[clave].splice(i, 1); else filtros[clave].push(v);
        guardarFiltros(); pintar();
      });
    };
    grupo('rdSedes', 'sede', 'sedes', null);
    grupo('rdModal', 'modalidad', 'modalidades', ['PRESENCIAL', 'VIRTUAL']);
  }

  function pintar() {
    const body = document.getElementById('rdBody');
    const todas = filas();
    if (!todas.length) {
      document.getElementById('rdSub').textContent = '';
      body.innerHTML = '<div class="rd-cargando"><i class="fas fa-spinner fa-spin"></i>' +
        '<br>Esperando los datos del horario…</div>';
      return;
    }
    pintarFiltros(todas);
    pintarSedeModalidad(todas);

    const sel = todas.filter(f => pasaFiltro(f));
    const dias = filtros.dias.length ? filtros.dias.slice().sort((a, b) => a - b) : [0, 1, 2, 3, 4, 5];

    let html = '';
    let totalDocentes = new Set();
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

    body.innerHTML = html || '<div class="rd-vacio">Ningún curso coincide con los filtros elegidos.</div>';
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

  function exportar() {
    const sel = filas().filter(f => pasaFiltro(f));
    const cab = ['Día', 'Horario', 'Docente', 'DNI', 'Programa', 'Curso', 'Sección', 'NRC', 'Sede', 'Modalidad', 'Periodo'];
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const filas_ = sel.map(f => [DIAS[f.dia], `${f.ini} - ${f.fin}`, f.docente, f.dni, f.area,
      f.curso, f.seccion, f.nrc, f.sede, f.modalidad, rotuloBloque(f.bloque)].map(q).join(','));
    const blob = new Blob(['﻿' + [cab.map(q).join(',')].concat(filas_).join('\n')],
      { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'reporte_docentes_por_dia.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function abrir() { construir(); document.getElementById('rdOverlay').classList.add('abierto'); pintar(); }
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
    // Si los datos llegan despues, se repinta solo (el panel puede estar abierto).
    document.addEventListener('cot:cursos-listos', () => { if (construido) pintar(); });
    document.addEventListener('cot:contratos-listos', () => { if (construido) pintar(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
