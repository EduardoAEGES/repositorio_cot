// ==========================================================================
// SEGUIMIENTO EVALDO — núcleo de cálculo (sin interfaz)
// Lee los reportes AC_ALUMNOS_GB de Campus Evolution, ubica el docente de cada
// clase en la hoja CARGA_HORARIA y calcula por sección: promedio de cada
// evaluación, reprobados (nota 1 a 11) y qué docentes no han subido notas.
// Nota 0 o vacía = no calificada (no cuenta como reprobado).
// Funciona en el navegador (window.EvaldoCore) y en Node (para pruebas).
// ==========================================================================
(function (raiz, fabrica) {
    if (typeof module === 'object' && module.exports) module.exports = fabrica();
    else raiz.EvaldoCore = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const LIBRO = '1kNqEDwXe5Iqj9m54E--_WEe2wKxjTschDLgYnXeBS7w';
    const GID_CARGA = '1470879596';     // CARGA_HORARIA: Carga + NRC -> docente
    const GID_DOCENTES = '204310163';   // Docentes 2026: DNI -> área (COT/PLN)
    const urlHoja = (gid) => `https://docs.google.com/spreadsheets/d/${LIBRO}/export?format=csv&gid=${gid}`;
    const NOTA_APROBATORIA = 12;

    // Cuántas evaluaciones tiene cada tipo de curso. El reporte a veces lista más
    // (EV3/EV4 vacías en Experiencias Formativas, EV4 en ciclo I); las que sobran se ignoran.
    const EVAL_EXPERIENCIA_FORMATIVA = 2;
    const EVAL_CICLO_I = 3;
    const EVAL_REGULAR = 4;
    const ROMANOS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

    // Valores de los prompts de AC_ALUMNOS_GB en Campus Evolution.
    const GRADOS = [
        { codigo: 'TECH', nombre: 'Instituto (TECH)' },
        { codigo: 'ESCU', nombre: 'Escuela (ESCU)' }
    ];
    const CICLOS = {
        TECH: [
            ['3347', 'OCTUBRE TECH (3VXS)'], ['3346', 'OCTUBRE TECH'],
            ['3343', 'SETIEMBRE TECH (3VXS)'], ['3342', 'SETIEMBRE TECH'],
            ['3339', 'AGOSTO TECH (3VXS)'], ['3338', 'AGOSTO TECH'],
            ['3335', 'JUNIO TECH (3VXS)'], ['3334', 'JUNIO TECH']
        ],
        ESCU: [
            ['3349', 'OCTUBRE ESCUELA (3VXS)'], ['3348', 'OCTUBRE ESCUELA'],
            ['3345', 'SETIEMBRE ESCUELA (3VXS)'], ['3344', 'SETIEMBRE ESCUELA'],
            ['3341', 'AGOSTO ESCUELA (3VXS)'], ['3340', 'AGOSTO ESCUELA'],
            ['3337', 'JUNIO ESCUELA (3VXS)'], ['3336', 'JUNIO ESCUELA']
        ]
    };
    const CAMPUS = [
        ['CRT00', 'Sede Principal'], ['CRT01', 'Sede Virtual'], ['CRT02', 'Sede Ate'],
        ['CRT03', 'Sede Arequipa'], ['CRT04', 'Sede Chiclayo'], ['CRT05', 'Sede Norte'],
        ['CRT06', 'Sede San Juan Lurigancho'], ['CRT07', 'Sede Villa El Salvador'],
        ['CRT08', 'Sede Callao']
    ];

    // Columnas fijas del reporte -> nombre limpio.
    const COLS_FIJAS = {
        'Institución': 'Institucion', 'Grado': 'Grado', 'Ccl Lvo': 'Ciclo',
        'ID': 'ID', 'Apellido': 'Apellido', '2º Apellido': 'Apellido2', 'Nombre': 'Nombre',
        'ID Curso': 'IDCurso', 'Descr': 'Curso', 'Sección': 'Seccion', 'Nº Clase': 'NRC',
        'Prog Acad': 'ProgAcad', 'F Inclusión': 'FInclusion', 'F Baja': 'FBaja',
        'Campus': 'Campus', 'Descr Campus': 'SedeNombre'
    };

    // ------------------------------------------------------------ utilidades
    const norm = (s) => String(s == null ? '' : s).trim().toUpperCase();
    const dni = (s) => String(s == null ? '' : s).replace(/\D/g, '').replace(/^0+/, '');
    const sinTildes = (s) => norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^\x00-\x7f]/g, '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    // Clave de comparación de cabeceras: sin tildes, 'º'/'°' como O, sin espacios.
    const claveCol = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[º°]/g, 'O').toUpperCase().replace(/[^A-Z0-9.]/g, '');
    const sinPuntoCero = (s) => String(s).split('.0').join('');

    function area(texto) {
        const a = norm(texto);
        return a.includes('PLN') ? 'PLN' : ((a.includes('COT') || a.includes('CONTA')) ? 'COT' : '');
    }

    // '1' / '2' / 'REGULAR' a partir de la columna Módulo de la hoja de carga.
    function modulo(texto) {
        const m = norm(texto);
        if (!m) return '';
        if (m.startsWith('REG') || m === 'R') return 'REGULAR';
        const d = m.match(/\d+/);
        return d ? d[0] : m;
    }

    // Texto -> nota, o null si vacío. '0' se conserva (0 = no calificado).
    function aNota(txt) {
        const t = String(txt == null ? '' : txt).trim().replace(/,/g, '.');
        if (t === '') return null;
        const n = Number(t);
        return Number.isFinite(n) ? n : null;
    }

    // Parser CSV con soporte de comillas y saltos de línea dentro de celdas.
    function parseCSV(text) {
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
        const rows = [];
        let row = [], cell = '', q = false;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (q) {
                if (c === '"') {
                    if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
                } else cell += c;
            } else if (c === '"') q = true;
            else if (c === ',') { row.push(cell); cell = ''; }
            else if (c === '\n' || c === '\r') {
                if (c === '\r' && text[i + 1] === '\n') i++;
                row.push(cell); rows.push(row); row = []; cell = '';
            } else cell += c;
        }
        if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
        return rows;
    }

    // ------------------------------------------------- hojas de Google Sheets
    // Área (COT/PLN) de cada docente según Docentes 2026. El DNI es la llave segura:
    // el mismo docente aparece escrito distinto entre hojas.
    function areasPorDocente(filas) {
        const porDni = new Map(), porNombre = new Map();
        if (!filas) return { porDni, porNombre };
        const cab = filas.findIndex((r) => r.some((c) => c.trim().toUpperCase() === 'DNI')
            && r.some((c) => c.toUpperCase().includes('APELLIDO') || c.toUpperCase().includes('NOMBRE')));
        if (cab < 0) return { porDni, porNombre };
        const h = filas[cab].map((c) => c.trim().toUpperCase());
        const iDni = h.findIndex((c) => c === 'DNI');
        const iNom = h.findIndex((c) => c.includes('APELLIDO') || c.includes('NOMBRE'));
        const iArea = h.findIndex((c) => c.includes('AREA'));
        for (const r of filas.slice(cab + 1)) {
            const a = iArea >= 0 && iArea < r.length ? area(r[iArea]) : '';
            if (!a) continue;
            const d = iDni < r.length ? dni(r[iDni]) : '';
            const nombre = iNom < r.length ? sinTildes(r[iNom]) : '';
            if (d && !porDni.has(d)) porDni.set(d, a);
            if (nombre && !nombre.includes('APELLIDO') && !porNombre.has(nombre)) porNombre.set(nombre, a);
        }
        return { porDni, porNombre };
    }

    // Índices de CARGA_HORARIA para ubicar el docente de cada clase.
    // El NRC se REPITE entre cargas (el 1193 de la 3338 no es el 1193 de la 3340): la llave
    // es Carga + NRC (la columna Carga equivale al 'Ccl Lvo' del reporte). El índice por
    // NRC + Sección solo guarda pares sin ambigüedad y sirve de respaldo.
    function indiceCarga(filasCarga, filasDocentes) {
        const { porDni, porNombre } = areasPorDocente(filasDocentes);
        const h = filasCarga[0] || [];
        const col = (nombre) => { const i = h.findIndex((c) => norm(c) === nombre); return i < 0 ? null : i; };
        const buscar = (fn) => { const i = h.findIndex(fn); return i < 0 ? null : i; };
        const iCarga = col('CARGA'), iNrc = col('NRC'), iCur = col('CURSO');
        const iDni = col('DNI'), iTipo = col('TIPO');
        const iSec = buscar((c) => norm(c).startsWith('SECCI'));
        const iDoc = buscar((c) => c.toUpperCase().includes('NOMBRE') || c.toUpperCase().includes('APELLIDO'));
        const iMod = buscar((c) => norm(c).includes('DULO'));
        const iPer = col('PERIODO'), iTur = col('TURNO'), iCic = col('CICLO'), iMda = col('MODALIDAD');
        const txt = (r, i) => (i !== null && i < r.length ? String(r[i]).trim() : '');

        const porCarga = new Map(), porSeccion = new Map();
        for (const r of filasCarga.slice(1)) {
            const nrc = sinPuntoCero(txt(r, iNrc));
            if (!nrc) continue;
            const docente = txt(r, iDoc);
            const info = {
                carga: txt(r, iCarga), seccion: txt(r, iSec), curso: txt(r, iCur),
                docente,
                area: porDni.get(dni(txt(r, iDni))) || porNombre.get(sinTildes(docente)) || area(txt(r, iTipo)),
                dni: txt(r, iDni),
                modulo: modulo(txt(r, iMod)), periodo: norm(txt(r, iPer)),
                turno: norm(txt(r, iTur)), cicloAcad: norm(txt(r, iCic)),
                modalidad: norm(txt(r, iMda))
            };
            const kc = info.carga + '|' + nrc;
            if (!porCarga.has(kc)) porCarga.set(kc, info);
            const ks = nrc + '|' + norm(info.seccion);
            if (!porSeccion.has(ks)) porSeccion.set(ks, []);
            porSeccion.get(ks).push(info);
        }
        const unicos = new Map();
        for (const [k, v] of porSeccion) if (new Set(v.map((x) => x.docente)).size === 1) unicos.set(k, v[0]);
        return { carga: porCarga, seccion: unicos, filas: filasCarga.length - 1 };
    }

    function ubicarClase(doc, reg) {
        const sec = norm(reg.Seccion);
        const info = doc.carga.get((reg.Ciclo || '') + '|' + (reg.NRC || ''));
        if (info && norm(info.seccion) === sec) return [info, 'Carga + NRC + Sección'];
        const alterno = doc.seccion.get((reg.NRC || '') + '|' + sec);
        if (alterno) return [alterno, 'NRC + Sección'];
        if (info) return [info, 'Carga + NRC (sección distinta en la hoja)'];
        return [{}, 'No está en la hoja de carga'];
    }

    // ------------------------------------------------- lectura de un reporte
    // filas: matriz de texto de la primera hoja del .xls (sheet_to_json header:1).
    // 'Ver Resultado' trae 1 línea de título antes de la cabecera; 'Programación de
    // Consultas' trae además los parámetros usados (Institución = CERTU, Grado = ...).
    function origenReporte(filas) {
        for (const fila of filas.slice(0, 8)) {
            if (fila.some((v) => /^(Institución =|Grado =|Ccl Lvo =)/.test(String(v).trim()))) return 'programacion';
        }
        return 'directo';
    }

    function cabeceraReporte(filas) {
        for (let i = 0; i < Math.min(25, filas.length); i++) {
            const claves = filas[i].map(claveCol);
            if (claves.includes('SECCION') && claves.includes('NOCLASE')) {
                // Nombres repetidos numerados como pandas: Calificación, Calificación.1, ...
                const vistos = {};
                const columnas = filas[i].map((x) => {
                    const v = String(x).trim();
                    const n = vistos[v] || 0;
                    vistos[v] = n + 1;
                    return n === 0 ? v : `${v}.${n}`;
                });
                return { fila: i, columnas };
            }
        }
        return null;
    }

    // Empareja cada columna de nombre de evaluación (Descr*/Descripción*) con la
    // columna de nota que le sigue (Calificación*/Grade).
    function paresEvaluacion(cols) {
        const pares = [];
        for (let i = 0; i + 1 < cols.length; i++) {
            const nombre = cols[i], sig = cols[i + 1];
            if ((nombre.startsWith('Descr') || nombre.startsWith('Descripción'))
                && (sig.startsWith('Calificación') || sig === 'Grade')) pares.push([i, i + 1]);
        }
        return pares;
    }

    // Lee un reporte ya convertido a matriz de texto. Devuelve
    // {estado: ok|vacio|no_es_reporte|error, origen, grado, strm, campus, registros, detalle}.
    function leerReporte(filas, nombreArchivo) {
        const cab = cabeceraReporte(filas);
        if (!cab) return { estado: 'no_es_reporte', detalle: 'No tiene el formato AC_ALUMNOS_GB' };
        const cols = cab.columnas;
        const idx = new Map();
        cols.forEach((c, i) => { const k = claveCol(c); if (!idx.has(k)) idx.set(k, i); });
        if (!idx.has('CCLLVO')) return { estado: 'no_es_reporte', detalle: 'No tiene el formato AC_ALUMNOS_GB' };
        const fijas = Object.entries(COLS_FIJAS)
            .map(([col, limpio]) => [idx.get(claveCol(col)), limpio]).filter(([i]) => i !== undefined);
        const iSec = idx.get('SECCION'), iNrc = idx.get('NOCLASE');
        const pares = paresEvaluacion(cols);
        const celda = (r, i) => String(r[i] == null ? '' : r[i]).trim();

        const registros = [];
        for (const r of filas.slice(cab.fila + 1)) {
            if (!celda(r, iSec) && !celda(r, iNrc)) continue;
            const reg = {};
            for (const [i, limpio] of fijas) reg[limpio] = celda(r, i);
            reg.NRC = sinPuntoCero(reg.NRC || '');
            const notas = {};
            for (const [d, c] of pares) {
                const nombre = celda(r, d);
                if (nombre) notas[nombre] = celda(r, c);
            }
            reg._notas = notas;
            reg._archivo = nombreArchivo || '';
            registros.push(reg);
        }
        const conSeccion = registros.filter((r) => r.Seccion);
        if (!conSeccion.length) return { estado: 'vacio', detalle: 'Sin alumnos (solo cabecera)' };
        const primero = (campo) => {
            const v = conSeccion.map((r) => sinPuntoCero(r[campo] || '').trim()).find(Boolean);
            return v ? v.toUpperCase() : '';
        };
        const grado = primero('Grado'), strm = primero('Ciclo'), campus = primero('Campus');
        if (!(grado && strm && campus)) return { estado: 'error', detalle: 'No se pudo leer grado, ciclo o sede' };
        // La 1.ª fila ("Rep Alumnos con calificación | 11652") declara cuántas filas trae.
        const total = (filas[0] || []).map((v) => String(v).trim()).find((v) => /^\d+$/.test(v));
        return {
            estado: 'ok', origen: origenReporte(filas), grado, strm, campus,
            clave: `AC_${grado}_${strm}_${campus}`, filas: conSeccion.length,
            declaradas: total ? parseInt(total, 10) : null, registros
        };
    }

    // ------------------------------------------------- consolidado y análisis
    function ordenEvaluaciones(nombres) {
        const clave = (n) => { const m = n.match(/(\d+)/); return m ? [0, parseInt(m[1], 10), ''] : [1, 0, n]; };
        return [...nombres].sort((a, b) => {
            const x = clave(a), y = clave(b);
            return (x[0] - y[0]) || (x[1] - y[1]) || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0);
        });
    }

    function evaluacionesEsperadas(reg) {
        const curso = norm(reg.CursoHoja || reg.Curso);
        // 'EXPERIENCIA FORMATIVA' o 'EXPERIENCIAS FORMATIVAS' (no 'EXPERIENCIA DEL CLIENTE').
        if (/EXPERIENCIAS?\s+FORMATIVAS?/.test(curso)) return [EVAL_EXPERIENCIA_FORMATIVA, 'Experiencia formativa'];
        let ciclo = reg.CicloAcad || '';
        if (!ciclo) {
            // Sin dato en la hoja: el primer dígito de la sección es el ciclo (109N -> I).
            const m = String(reg.Seccion || '').match(/^(\d)/);
            ciclo = m && parseInt(m[1], 10) < ROMANOS.length ? ROMANOS[parseInt(m[1], 10)] : '';
        }
        if (ciclo === 'I') return [EVAL_CICLO_I, 'Ciclo I'];
        return [EVAL_REGULAR, '4 evaluaciones'];
    }

    // 'EVALUACIÓN 4' no aplica si el curso tiene 3. Las demás (FINAL, PARCIAL...) sí.
    function evaluacionAplica(nombre, esperadas) {
        const m = norm(nombre).match(/^EVALUACI[OÓ]N\s+(\d+)$/);
        return m ? parseInt(m[1], 10) <= esperadas : true;
    }

    // registrosCrudos: los de leerReporte (de todos los archivos). Devuelve copias enriquecidas.
    function consolidar(registrosCrudos, doc) {
        const registros = registrosCrudos.map((crudo) => {
            const reg = Object.assign({}, crudo);
            const [info, como] = ubicarClase(doc, reg);
            reg.Coincidencia = como;
            reg.CursoHoja = info.curso || '';      // nombre completo (el reporte lo recorta)
            reg.Docente = info.docente || '';
            reg.Area = info.area || '';
            reg.Modulo = info.modulo || '';
            reg.Periodo = info.periodo || '';
            reg.Turno = info.turno || '';
            reg.CicloAcad = info.cicloAcad || '';
            reg.Modalidad = info.modalidad || '';
            reg.Estudiante = [reg.Apellido, reg.Apellido2, reg.Nombre].filter(Boolean).join(' ');
            const [esperadas, tipo] = evaluacionesEsperadas(reg);
            reg.EvalEsperadas = esperadas;
            reg.TipoEval = tipo;
            const notas = {};
            for (const [ev, v] of Object.entries(crudo._notas || {})) if (evaluacionAplica(ev, esperadas)) notas[ev] = v;
            reg._notas = notas;
            return reg;
        });
        return { registros, evaluaciones: evaluacionesDe(registros) };
    }

    const evaluacionesDe = (registros) => {
        const s = new Set();
        for (const r of registros) for (const ev in r._notas) s.add(ev);
        return ordenEvaluaciones(s);
    };

    // Filtros de la pantalla. Conjuntos vacíos = sin filtro.
    const CAMPOS_FILTRO = {
        area: 'Area', periodo: 'Periodo', modulo: 'Modulo', cicloAcad: 'CicloAcad',
        turno: 'Turno', modalidad: 'Modalidad', campus: 'Campus', ciclo: 'Ciclo'
    };
    function pasaFiltros(r, filtros) {
        for (const k in CAMPOS_FILTRO) {
            const sel = filtros[k];
            if (sel && sel.size && !sel.has(r[CAMPOS_FILTRO[k]] || '')) return false;
        }
        return true;
    }
    function filtrar(registros, filtros, q) {
        q = String(q || '').trim().toLowerCase();
        return registros.filter((r) => pasaFiltros(r, filtros)
            && (!q || `${r.Docente} ${r.Curso} ${r.CursoHoja} ${r.Seccion} ${r.NRC} ${r.Estudiante}`.toLowerCase().includes(q)));
    }

    const cursoDe = (r) => r.CursoHoja || r.Curso || '';
    const redondear = (n) => Math.round(n * 100) / 100;

    // Una fila por sección-curso (NRC). Promedio, reprobados y sin-nota por evaluación.
    function resumenSecciones(registros, evaluaciones) {
        const grupos = new Map();
        for (const reg of registros) {
            const k = [reg.Grado, reg.Ciclo, reg.Campus, reg.Seccion, reg.NRC].map((x) => x || '').join('|');
            if (!grupos.has(k)) grupos.set(k, []);
            grupos.get(k).push(reg);
        }
        const filas = [];
        for (const regs of grupos.values()) {
            const r0 = regs[0];
            const fila = {
                Grado: r0.Grado || '', Ciclo: r0.Ciclo || '', Campus: r0.Campus || '', Sede: r0.SedeNombre || '',
                Seccion: r0.Seccion || '', NRC: r0.NRC || '', Curso: cursoDe(r0),
                Docente: r0.Docente || '(no está en la hoja de carga)', Coincidencia: r0.Coincidencia || '',
                Area: r0.Area || '', Modulo: r0.Modulo || '', Periodo: r0.Periodo || '', Turno: r0.Turno || '',
                CicloAcad: r0.CicloAcad || '', Modalidad: r0.Modalidad || '',
                Estudiantes: regs.length, evals: {}
            };
            let algunaNota = false;
            for (const ev of evaluaciones) {
                const notas = regs.filter((r) => ev in r._notas).map((r) => aNota(r._notas[ev])).filter((n) => n !== null);
                if (!notas.length) continue;   // esta evaluación no existe para esta sección
                const calificados = notas.filter((n) => n > 0);
                const reprobados = calificados.filter((n) => n < NOTA_APROBATORIA);
                if (calificados.length) algunaNota = true;
                fila.evals[ev] = {
                    total: notas.length, calificados: calificados.length,
                    sin_nota: notas.length - calificados.length, reprobados: reprobados.length,
                    promedio: calificados.length ? redondear(calificados.reduce((a, b) => a + b, 0) / calificados.length) : null
                };
            }
            fila.sin_notas = !algunaNota;   // el docente no ha subido ninguna nota
            fila.reprobados_total = Object.values(fila.evals).reduce((a, e) => a + e.reprobados, 0);
            // Avance: evaluaciones con al menos una nota, sobre las que corresponden al curso.
            // Si la sección usa evaluaciones sin número (FINAL, PARCIAL...), se cuentan las listadas.
            const nombres = Object.keys(fila.evals);
            const numeradas = nombres.some((n) => /^EVALUACI[OÓ]N\s+\d+$/.test(norm(n)));
            const esperadas = r0.EvalEsperadas || EVAL_REGULAR;
            fila.Esperadas = (numeradas || !nombres.length) ? esperadas : nombres.length;
            fila.Subidas = Object.values(fila.evals).filter((e) => e.calificados).length;
            fila.TipoEval = r0.TipoEval || '';
            filas.push(fila);
        }
        filas.sort((a, b) => (a.sin_notas === b.sin_notas ? 0 : a.sin_notas ? -1 : 1)
            || (b.reprobados_total - a.reprobados_total)
            || (a.Seccion < b.Seccion ? -1 : a.Seccion > b.Seccion ? 1 : 0));
        return filas;
    }

    function listaReprobados(registros, evaluaciones) {
        const salida = [];
        for (const r of registros) {
            for (const ev of evaluaciones) {
                const n = aNota(r._notas[ev]);
                if (n !== null && n > 0 && n < NOTA_APROBATORIA) {
                    salida.push({
                        Grado: r.Grado || '', Ciclo: r.Ciclo || '', Campus: r.Campus || '', Sede: r.SedeNombre || '',
                        Seccion: r.Seccion || '', NRC: r.NRC || '', Curso: cursoDe(r), Docente: r.Docente || '',
                        Area: r.Area || '', Modulo: r.Modulo || '', CicloAcad: r.CicloAcad || '', Turno: r.Turno || '',
                        Modalidad: r.Modalidad || '', ID: r.ID || '', Estudiante: r.Estudiante || '',
                        Evaluacion: ev, Nota: n
                    });
                }
            }
        }
        return salida;
    }

    function resumenGeneral(registros, secciones) {
        return {
            archivos: new Set(registros.map((r) => r._archivo)).size,
            registros: registros.length,
            estudiantes: new Set(registros.map((r) => r.ID).filter(Boolean)).size,
            secciones: secciones.length,
            secciones_sin_notas: secciones.filter((s) => s.sin_notas).length,
            reprobados: secciones.reduce((a, s) => a + s.reprobados_total, 0)
        };
    }

    // (promedio de lo calificado, n° calificadas, n° reprobadas, situación) de un alumno.
    function situacion(notasAlumno) {
        const calificadas = Object.values(notasAlumno).map(aNota).filter((n) => n !== null && n > 0);
        const reprobadas = calificadas.filter((n) => n < NOTA_APROBATORIA).length;
        if (!calificadas.length) return [null, 0, 0, 'Sin notas'];
        const prom = redondear(calificadas.reduce((a, b) => a + b, 0) / calificadas.length);
        return [prom, calificadas.length, reprobadas, prom < NOTA_APROBATORIA ? 'Desaprobando' : 'Aprobando'];
    }

    // ------------------------------------------------- tablas para Excel
    // Cada hoja: {nombre, filas: [objetos], color: fila -> 'FDE2E1' | null}.
    function hojasConsolidado(registros, evaluaciones, secciones) {
        const consolidado = registros.map((r) => {
            const f = {
                'Grado': r.Grado || '', 'Ccl Lvo': r.Ciclo || '', 'Campus': r.Campus || '', 'Sede': r.SedeNombre || '',
                'Sección': r.Seccion || '', 'NRC': r.NRC || '', 'Curso': cursoDe(r), 'Docente': r.Docente || '',
                'Área': r.Area || '', 'Periodo': r.Periodo || '', 'Módulo': r.Modulo || '',
                'Ciclo académico': r.CicloAcad || '', 'Turno': r.Turno || '', 'Modalidad': r.Modalidad || '',
                'ID': r.ID || '', 'Estudiante': r.Estudiante || '', 'F Baja': r.FBaja || ''
            };
            for (const ev of evaluaciones) f[ev] = celdaNota(r._notas[ev]);
            return f;
        });
        const resumen = secciones.map((s) => {
            const f = {
                'Estado': s.sin_notas ? 'SIN NOTAS' : 'OK',
                'Grado': s.Grado, 'Ccl Lvo': s.Ciclo, 'Campus': s.Campus, 'Sede': s.Sede,
                'Sección': s.Seccion, 'NRC': s.NRC, 'Curso': s.Curso, 'Docente': s.Docente, 'Área': s.Area,
                'Periodo': s.Periodo, 'Módulo': s.Modulo, 'Ciclo académico': s.CicloAcad, 'Turno': s.Turno,
                'Modalidad': s.Modalidad, 'Estudiantes': s.Estudiantes
            };
            for (const ev of evaluaciones) {
                const e = s.evals[ev];
                f[`${ev} · prom`] = e && e.promedio !== null ? e.promedio : '';
                f[`${ev} · reprob`] = e ? e.reprobados : '';
                f[`${ev} · sin nota`] = e ? e.sin_nota : '';
            }
            f['Reprobados (total)'] = s.reprobados_total;
            f['Tipo de curso'] = s.TipoEval;
            f['Evaluaciones que corresponden'] = s.Esperadas;
            f['Evaluaciones con notas'] = s.Subidas;
            f['Cómo se ubicó el docente'] = s.Coincidencia;
            return f;
        });
        const colsAlerta = ['Grado', 'Ccl Lvo', 'Campus', 'Sección', 'NRC', 'Curso', 'Docente', 'Área', 'Periodo',
            'Módulo', 'Ciclo académico', 'Turno', 'Modalidad', 'Estudiantes', 'Tipo de curso', 'Evaluaciones que corresponden'];
        const alerta = resumen.filter((f) => f.Estado === 'SIN NOTAS')
            .map((f) => Object.fromEntries(colsAlerta.map((c) => [c, f[c]])));
        const reprobados = listaReprobados(registros, evaluaciones).map((r) => ({
            'Grado': r.Grado, 'Ccl Lvo': r.Ciclo, 'Campus': r.Campus, 'Sección': r.Seccion, 'NRC': r.NRC,
            'Curso': r.Curso, 'Docente': r.Docente, 'Módulo': r.Modulo, 'Ciclo académico': r.CicloAcad,
            'Turno': r.Turno, 'Modalidad': r.Modalidad, 'ID': r.ID, 'Estudiante': r.Estudiante,
            'Evaluación': r.Evaluacion, 'Nota': r.Nota
        }));
        return [
            { nombre: 'Resumen por sección', filas: resumen, color: (f) => (f.Estado === 'SIN NOTAS' ? 'FDE2E1' : null) },
            { nombre: 'Docentes sin notas', filas: alerta },
            { nombre: 'Reprobados', filas: reprobados },
            { nombre: 'Consolidado', filas: consolidado }
        ];
    }

    function hojasEstudiantes(registros, evaluaciones) {
        const filas = registros.map((r) => {
            const [prom, nCal, nRep, sit] = situacion(r._notas);
            const f = {
                'Estudiante': r.Estudiante || '', 'ID': r.ID || '',
                'Docente': r.Docente || '(no está en la hoja de carga)',
                'Curso': cursoDe(r), 'Sección': r.Seccion || '', 'NRC': r.NRC || '',
                'Sede': r.SedeNombre || '', 'Área': r.Area || '', 'Periodo': r.Periodo || '',
                'Módulo': r.Modulo || '', 'Ciclo académico': r.CicloAcad || '',
                'Turno': r.Turno || '', 'Modalidad': r.Modalidad || '',
                'Grado': r.Grado || '', 'Ccl Lvo': r.Ciclo || ''
            };
            for (const ev of evaluaciones) f[ev] = celdaNota(r._notas[ev]);
            Object.assign(f, {
                'Promedio (lo calificado)': prom === null ? '' : prom,
                'Evaluaciones que corresponden': r.EvalEsperadas || '',
                'Evaluaciones calificadas': nCal, 'Evaluaciones reprobadas': nRep,
                'Situación': sit, 'F Baja': r.FBaja || ''
            });
            return f;
        });
        const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
        filas.sort((a, b) => cmp(a.Docente, b.Docente) || cmp(a.Curso, b.Curso) || cmp(a['Sección'], b['Sección']) || cmp(a.Estudiante, b.Estudiante));

        const porDoc = new Map();
        for (const f of filas) {
            if (!porDoc.has(f.Docente)) porDoc.set(f.Docente, { secciones: new Set(), estudiantes: 0, notas: [], desaprobando: 0, sinNotas: 0, area: f['Área'] });
            const d = porDoc.get(f.Docente);
            d.secciones.add(`${f['Ccl Lvo']}|${f.NRC}|${f['Sección']}`);
            d.estudiantes += 1;
            if (f['Promedio (lo calificado)'] !== '') d.notas.push(f['Promedio (lo calificado)']);
            if (f['Situación'] === 'Desaprobando') d.desaprobando += 1;
            if (f['Situación'] === 'Sin notas') d.sinNotas += 1;
        }
        const resumenDoc = [...porDoc.entries()].map(([doc, d]) => ({
            'Docente': doc, 'Área': d.area, 'Secciones': d.secciones.size, 'Estudiantes': d.estudiantes,
            'Promedio general': d.notas.length ? redondear(d.notas.reduce((a, b) => a + b, 0) / d.notas.length) : '',
            'Desaprobando': d.desaprobando, 'Sin notas': d.sinNotas
        })).sort((a, b) => cmp(a.Docente, b.Docente));
        const colores = { 'Desaprobando': 'FDE2E1', 'Sin notas': 'FEF3C7' };
        return [
            { nombre: 'Estudiantes', filas, color: (f) => colores[f['Situación']] || null },
            { nombre: 'Resumen por docente', filas: resumenDoc }
        ];
    }

    // Las notas van al Excel como número cuando lo son (para poder sumar/filtrar).
    function celdaNota(v) {
        if (v === undefined || v === null || v === '') return '';
        const n = aNota(v);
        return n === null ? v : n;
    }

    return {
        LIBRO, GID_CARGA, GID_DOCENTES, urlHoja, NOTA_APROBATORIA, GRADOS, CICLOS, CAMPUS,
        norm, dni, sinTildes, area, modulo, aNota, parseCSV,
        areasPorDocente, indiceCarga, ubicarClase,
        origenReporte, leerReporte,
        ordenEvaluaciones, evaluacionesEsperadas, evaluacionAplica, consolidar, evaluacionesDe,
        CAMPOS_FILTRO, pasaFiltros, filtrar,
        resumenSecciones, listaReprobados, resumenGeneral, situacion,
        hojasConsolidado, hojasEstudiantes
    };
});
