/* ===== Lectura de los Excel de EFSRT (navegador y Node) =====
   Recibe un libro de SheetJS y devuelve las filas listas para efsrt_importar:
     seccion -> "TODOS DOCENTES EFSRT" (+ datos de "LISTA SECCIONES EFSRT CONTA")
     mpe     -> "PROGRAMACIÓN MPE" (seguimiento de la capacitación MPE)
     equipo  -> "EQUIPO ACADÉMICO" (jefe / monitor)
   Cada fila: { id, d: datos del Excel, s: seguimiento editable inicial }. */
(function (raiz) {
  const txt = v => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();
  const norm = s => txt(s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const ent = v => { const t = txt(v); if (!t) return ''; const n = Number(t); return Number.isFinite(n) ? String(Math.round(n)) : t; };
  const num = v => { const n = Number(txt(v)); return txt(v) !== '' && Number.isFinite(n) ? n : null; };
  const mail = v => txt(v).toLowerCase();

  function hora(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date) return String(v.getHours()).padStart(2, '0') + ':' + String(v.getMinutes()).padStart(2, '0');
    if (typeof v === 'number') {
      const m = Math.round((v % 1) * 24 * 60);
      return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    }
    return txt(v);
  }

  // Hoja como matriz; busca la fila de encabezados que contiene `clave`.
  function tabla(wb, nombre, clave) {
    const hoja = wb.SheetNames.find(n => norm(n) === norm(nombre));
    if (!hoja) return null;
    const m = raiz.XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: true, defval: null });
    const ih = m.findIndex(r => (r || []).some(c => norm(c) === norm(clave)));
    if (ih < 0) return null;
    const head = m[ih].map(norm);
    const col = (...nombres) => { for (const n of nombres) { const i = head.indexOf(norm(n)); if (i >= 0) return i; } return -1; };
    const filas = m.slice(ih + 1).filter(r => r && r.some(c => txt(c) !== ''));
    return { head, col, filas };
  }

  function secciones(wb) {
    const t = tabla(wb, 'TODOS DOCENTES EFSRT', 'NRC');
    if (!t) return null;
    const c = {
      carga: t.col('Carga'), dni: t.col('DNI'), docente: t.col('Nombres y Apellidos'), sede: t.col('Sede'),
      curso: t.col('Curso'), seccion: t.col('Sección'), modulo: t.col('Módulo'), nrc: t.col('NRC'), horas: t.col('Horas'),
      periodo: t.col('Periodo'), turno: t.col('TURNO'), ciclo: t.col('CICLO'), modalidad: t.col('MODALIDAD'),
      dias: t.col('HORARIO (DÍAS)'), horario: t.col('HORARIO (HORAS)'), tipo: t.col('TIPO'), contrato: t.col('TIPO DE CONTRATO')
    };
    const g = (r, k) => (c[k] >= 0 ? r[c[k]] : null);

    // Correos por DNI y datos propios de las secciones de Contabilidad
    const correos = new Map();
    const conta = new Map();
    const tc = tabla(wb, 'LISTA SECCIONES EFSRT CONTA', 'NRC');
    if (tc) {
      const k = {
        carga: tc.col('Carga'), dni: tc.col('DNI'), nrc: tc.col('NRC'), bbdd: tc.col('CANT ESTUD S/BBDD'),
        portal: tc.col('CANT ESTUD S/PORTAL'), correo: tc.col('CORREO ELECTRÓNICO'), rubrica: tc.col('Rúbrica S8'), status: tc.col('STATUS')
      };
      const iLink = k.status + 1;
      tc.filas.forEach(r => {
        if (mail(r[k.correo])) correos.set(ent(r[k.dni]), mail(r[k.correo]));
        conta.set(ent(r[k.carga]) + '|' + ent(r[k.nrc]), {
          est_bbdd: num(r[k.bbdd]), est_portal: num(r[k.portal]),
          rubrica: ent(r[k.rubrica]), status: txt(r[k.status]), link: /^https?:/.test(txt(r[iLink])) ? txt(r[iLink]) : ''
        });
      });
    }
    for (const [hoja, dni, cor] of [['DOCENTES', 'DNI', 'CORREO ELECTRÓNICO'], ['Hoja 2', 'DNI', 'CORREO']]) {
      const th = tabla(wb, hoja, dni);
      if (!th) continue;
      const a = th.col(dni), b = th.col(cor);
      if (a < 0 || b < 0) continue;
      th.filas.forEach(r => { const d = ent(r[a]); if (d && mail(r[b]) && !correos.has(d)) correos.set(d, mail(r[b])); });
    }

    const vistos = new Map();
    return t.filas.filter(r => ent(g(r, 'nrc'))).map(r => {
      const carga = ent(g(r, 'carga')), nrc = ent(g(r, 'nrc')), dni = ent(g(r, 'dni'));
      let id = carga + '|' + nrc + '|' + dni;
      const n = (vistos.get(id) || 0) + 1; vistos.set(id, n);
      if (n > 1) id += '|' + n;
      const x = conta.get(carga + '|' + nrc) || {};
      const contrato = txt(g(r, 'contrato'));
      return {
        id,
        d: {
          carga, periodo: txt(g(r, 'periodo')), dni, docente: txt(g(r, 'docente')), correo: correos.get(dni) || '',
          sede: txt(g(r, 'sede')), curso: txt(g(r, 'curso')), seccion: txt(g(r, 'seccion')), modulo: ent(g(r, 'modulo')),
          nrc, horas: num(g(r, 'horas')), turno: txt(g(r, 'turno')), ciclo: txt(g(r, 'ciclo')), modalidad: txt(g(r, 'modalidad')),
          dias: txt(g(r, 'dias')).replace(/[()]/g, ''), horario: txt(g(r, 'horario')).replace(/[()]/g, ''),
          linea: norm(g(r, 'tipo')) === 'COT' || (contrato && norm(contrato) !== 'OTRA LINEA') ? 'COT' : 'Otra línea',
          contrato, est_bbdd: x.est_bbdd ?? null, est_portal: x.est_portal ?? null, rubrica: x.rubrica || '', link: x.link || ''
        },
        s: x.status ? { status: x.status } : {}
      };
    });
  }

  function mpe(wb) {
    const t = tabla(wb, 'PROGRAMACIÓN MPE', 'Nº Clase');
    if (!t) return null;
    const c = {
      carga: t.col('Ccl Lvo'), catalogo: t.col('Catálogo'), seccion: t.col('Sección'), nrc: t.col('Nº Clase'),
      cap: t.col('Capcd Inscr'), inscritos: t.col('Cantidad Inscritos'), aula: t.col('Aula'), hi: t.col('Hr Ini Cls'), hf: t.col('Hr Fin Cls'),
      docente: t.col('Docente'), correo: t.col('Correo Docente'), modulo: t.col('Nº Mlo'), campus: t.col('Campus'),
      monitor: t.col('MONITOR ACADÉMICO'), estrella: t.col('SEGÚN REPORTE ESTRELLA'), verif: t.col('SEGÚN VERIFICACIÓN'),
      comunicado: t.col('Comunicado'), respondio: t.col('Respondió'), verificado: t.col('Verificado'), control: t.col('Actualizado en control')
    };
    const DIAS = [['Lun', 'Lun'], ['Mart', 'Mar'], ['Miérc', 'Mié'], ['Jue', 'Jue'], ['Vier', 'Vie'], ['Sáb', 'Sáb'], ['Dom', 'Dom']]
      .map(([h, l]) => [t.col(h), l]);
    // Columnas sin título a la derecha de "Actualizado en control": observación, teléfono, correo, DNI, mensaje.
    const b = c.control;
    const g = (r, k) => (c[k] >= 0 ? r[c[k]] : null);
    const valor = v => (typeof v === 'number' ? String(v) : txt(v));
    const vistos = new Map();
    return t.filas.filter(r => ent(g(r, 'nrc'))).map(r => {
      const carga = ent(g(r, 'carga')), nrc = ent(g(r, 'nrc'));
      let id = carga + '|' + nrc;
      const n = (vistos.get(id) || 0) + 1; vistos.set(id, n);
      if (n > 1) id += '|' + n;
      const extra = i => (b >= 0 ? r[b + i] : null);
      const alertas = r.slice(b + 6, b + 19).map(txt).filter(v => v && !/^\d+$/.test(v));
      return {
        id,
        d: {
          carga, catalogo: ent(g(r, 'catalogo')), seccion: txt(g(r, 'seccion')), nrc, cap: num(g(r, 'cap')), inscritos: num(g(r, 'inscritos')),
          aula: txt(g(r, 'aula')), horario: [hora(g(r, 'hi')), hora(g(r, 'hf'))].filter(Boolean).join('-'),
          dias: DIAS.filter(([i]) => i >= 0 && norm(r[i]) === 'Y').map(([, l]) => l).join(' '),
          docente: txt(g(r, 'docente')).replace(/\s*,\s*/, ', '), correo: mail(g(r, 'correo')),
          modulo: ent(g(r, 'modulo')), campus: txt(g(r, 'campus')), nota_estrella: valor(g(r, 'estrella')),
          telefono: ent(extra(2)), dni: ent(extra(4))
        },
        s: {
          monitor: txt(g(r, 'monitor')), verificacion: valor(g(r, 'verif')), comunicado: txt(g(r, 'comunicado')),
          respondio: txt(g(r, 'respondio')), verificado: txt(g(r, 'verificado')), control: txt(g(r, 'control')),
          obs: [txt(extra(1)), ...alertas].filter(Boolean).join(' · ')
        }
      };
    });
  }

  function equipo(wb) {
    const t = tabla(wb, 'EQUIPO ACADÉMICO', 'MONITOR ACADÉMICO');
    if (!t) return null;
    const iJ = t.col('JEFE /COORDINADOR ACADÉMICO', 'JEFE/COORDINADOR ACADÉMICO'), iM = t.col('MONITOR ACADÉMICO');
    const iC = t.col('CORREO DEL MONITOR ACADÉMICO');
    const vistos = new Set();
    return t.filas.map(r => ({
      id: norm(r[iM]) + '|' + mail(r[iC]),
      d: { jefe: txt(r[iJ]), correo_jefe: mail(r[iJ + 1]), monitor: txt(r[iM]), correo: mail(r[iC]) },
      s: {}
    })).filter(x => x.d.monitor && !vistos.has(x.id) && vistos.add(x.id));
  }

  // Base de docentes de todas las verticales (correo y vertical por DNI)
  function docentes(wb) {
    const t = tabla(wb, 'BASE DOCENTES V1', 'Vertical');
    if (!t) return null;
    const iV = t.col('Vertical'), iN = t.col('Docentes'), iD = t.col('DNI'), iC = t.col('Correo');
    const vistos = new Set();
    return t.filas.map(r => ({ id: ent(r[iD]), d: { vertical: txt(r[iV]), docente: txt(r[iN]), correo: mail(r[iC]) }, s: {} }))
      .filter(x => x.id && !vistos.has(x.id) && vistos.add(x.id));
  }

  function leer(wb) {
    const out = {};
    const dc = docentes(wb); if (dc) out.docente = dc;
    const s = secciones(wb); if (s) out.seccion = s;
    const m = mpe(wb); if (m) out.mpe = m;
    const e = equipo(wb); if (e) out.equipo = e;
    return out;
  }

  const api = { leer, norm, txt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.EfsrtParse = api;
})(typeof window !== 'undefined' ? window : globalThis);
