/**
 * Script para convertir la hoja CARGA HORARIA del formato de malla (franjas de 45 min)
 * al formato plano (una fila por curso-docente) compatible con la hoja destino.
 * 
 * Formato origen: Cada docente tiene 21 filas (franjas 7:00-22:45), con cursos en columnas por día.
 * Formato destino: Carga,DNI,Nombres,Sede,Curso,Sección,Módulo,NRC,Horas,...
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// URL de la hoja CARGA HORARIA publicada (gid=1657026679)
const SOURCE_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQQ6FuzOJ_6Ak54s6Lxgvu3pV6G80XHu99l6wNT9pEDyaJDpknO3NgUe9_OCq6gEm2rLxKibX-vCz3o/pub?gid=1657026679&single=true&output=csv';

// Días de la semana según las columnas de la malla (columnas 6-12: LUNES a DOMINGO)
const DAYS_MAP = {
    6: 'LUNES',
    7: 'MARTES',
    8: 'MIÉRCOLES',
    9: 'JUEVES',
    10: 'VIERNES',
    11: 'SABADO',
    12: 'DOMINGO'
};

/**
 * Parse a cell value like:
 * "C.L.3338-TE-CRT-ATE-207M-12490-CONTABILIDAD-II CICLO-BLOQUE 1 AGOSTO (24/08 al 18/10)-NRC 254"
 * 
 * Returns an array of parsed course objects (a cell can have multiple courses separated by // or newlines)
 */
function parseCellCourses(cellValue) {
    if (!cellValue || typeof cellValue !== 'string') return [];
    const trimmed = cellValue.trim();
    if (!trimmed || trimmed === '#N/A' || trimmed === '#REF!') return [];

    // Split by // or newlines to handle multiple courses in one cell
    const parts = trimmed.split(/\n\/\/\n|\n\/\n|\/{2,}/).map(s => s.trim()).filter(s => s.startsWith('C.L.'));

    if (parts.length === 0 && trimmed.startsWith('C.L.')) {
        parts.push(trimmed);
    }

    const results = [];
    for (const part of parts) {
        const parsed = parseSingleCourse(part);
        if (parsed) results.push(parsed);
    }
    return results;
}

function parseSingleCourse(str) {
    if (!str || !str.startsWith('C.L.')) return null;

    // Remove "C.L." prefix
    const rest = str.substring(4);

    // Try to extract NRC at the end
    let nrc = '';
    let mainPart = rest;
    const nrcMatch = rest.match(/-NRC\s+(\d+)\s*$/i);
    if (nrcMatch) {
        nrc = nrcMatch[1];
        mainPart = rest.substring(0, rest.length - nrcMatch[0].length);
    }

    // Split by '-'
    const segments = mainPart.split('-');
    if (segments.length < 6) return null;

    const carga = segments[0].trim();
    const tipo = segments[1].trim();

    let sede = '';
    let restSegments;

    if (segments[2].trim().toUpperCase() === 'VIRTUAL') {
        sede = 'VIRTUAL';
        restSegments = segments.slice(3);
    } else if (segments[2].trim().toUpperCase() === 'CRT') {
        sede = segments[3].trim();
        restSegments = segments.slice(4);
    } else {
        sede = segments[2].trim();
        restSegments = segments.slice(3);
    }

    if (restSegments.length < 3) return null;

    const seccion = restSegments[0].trim();

    // Extract turno from seccion suffix letter
    const secModMatch = seccion.match(/(\d+)([MNDT])/i);
    let turno = '';
    if (secModMatch) {
        const letter = secModMatch[2].toUpperCase();
        if (letter === 'M') turno = 'M';
        else if (letter === 'N') turno = 'N';
        else if (letter === 'D') turno = 'D';
        else if (letter === 'T') turno = 'T';
    }

    const codInterno = restSegments[1].trim();
    const remainingStr = restSegments.slice(2).join('-');

    // Extract BLOQUE info
    let modulo = '';
    let periodo = '';
    const bloqueMatch = remainingStr.match(/BLOQUE\s+(\d+)\s+(\w+)/i);
    if (bloqueMatch) {
        modulo = bloqueMatch[1];
        periodo = bloqueMatch[2].toUpperCase();
    }

    // Extract Ciclo
    let ciclo = '';
    const cicloMatch = remainingStr.match(/(I{1,3}V?|IV|V?I{0,3})\s+CICLO/i);
    if (cicloMatch) {
        ciclo = cicloMatch[1].trim();
    }

    // Extract course name
    let nameStr = remainingStr;
    const bloqueIdx = nameStr.search(/BLOQUE/i);
    if (bloqueIdx > 0) nameStr = nameStr.substring(0, bloqueIdx);
    const cicloIdx = nameStr.search(/(I{1,3}V?|IV|V?I{0,3})\s+CICLO/i);
    if (cicloIdx > 0) nameStr = nameStr.substring(0, cicloIdx);
    nameStr = nameStr.replace(/[-]?DNI[-]?[NS]\/D[-]?/gi, '');
    const cursoName = nameStr.replace(/^-+|-+$/g, '').trim();

    const modalidad = sede === 'VIRTUAL' ? 'VIRTUAL' : 'PRESENCIAL';

    let sedeNorm = sede.toUpperCase();
    if (sedeNorm === 'NORTE') sedeNorm = 'NOR';

    return {
        carga, tipo, sede: sedeNorm, seccion, codInterno,
        cursoName, ciclo, modulo, periodo, nrc, turno, modalidad
    };
}

function courseKey(course, dni) {
    return `${dni}|${course.carga}|${course.seccion}|${course.nrc}|${course.cursoName}`;
}

function normalizeTime(t) {
    if (!t) return '';
    const parts = t.split(':');
    if (parts.length >= 2) {
        let h = parts[0];
        let m = parts[1];
        if (h.length === 1) h = '0' + h;
        return `${h}:${m}`;
    }
    return t;
}

async function main() {
    console.log('🔄 Descargando datos de CARGA HORARIA (Programación de Horas)...');

    const response = await fetch(SOURCE_CSV_URL);
    const csvText = await response.text();
    console.log(`📊 Datos descargados: ${csvText.length} bytes`);

    const workbook = XLSX.read(csvText, { type: 'string', raw: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    console.log(`📋 Total de filas en el CSV: ${rows.length}`);

    const HEADER_ROWS = 4;
    const dataRows = rows.slice(HEADER_ROWS);

    const courseAssignments = {};
    let processedTeachers = new Set();

    for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        if (!row || row.length < 7) continue;

        const dni = String(row[1] || '').trim();
        const name = String(row[2] || '').trim();
        const slotN = parseInt(row[3]);

        if (!dni || dni === '' || name === '#N/A' || name === '' || isNaN(slotN)) continue;

        const startTime = String(row[4] || '').trim();
        const endTime = String(row[5] || '').trim();

        let contractType = '';
        let contractHours = '';
        if (slotN === 1) {
            contractType = String(row[13] || '').trim();
            contractHours = String(row[14] || '').trim();
        }

        for (let dayCol = 6; dayCol <= 12; dayCol++) {
            const cellValue = String(row[dayCol] || '').trim();
            if (!cellValue) continue;

            const courses = parseCellCourses(cellValue);
            for (const course of courses) {
                const key = courseKey(course, dni);

                if (!courseAssignments[key]) {
                    courseAssignments[key] = {
                        course, dni, name,
                        contractType: contractType || '',
                        contractHours: contractHours || '',
                        slots: []
                    };
                }

                if (slotN === 1 && contractType) {
                    courseAssignments[key].contractType = contractType;
                    courseAssignments[key].contractHours = contractHours;
                }

                const dayName = DAYS_MAP[dayCol];
                courseAssignments[key].slots.push({
                    day: dayName, dayCol, slotN, startTime, endTime
                });
            }
        }

        if (slotN === 1) processedTeachers.add(dni);
    }

    console.log(`👥 Docentes procesados: ${processedTeachers.size}`);
    console.log(`📚 Asignaciones de cursos únicas: ${Object.keys(courseAssignments).length}`);

    const outputRows = [];
    const dayOrder = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];

    for (const key of Object.keys(courseAssignments)) {
        const { course, dni, name, contractType, contractHours, slots } = courseAssignments[key];

        const slotsByDay = {};
        for (const slot of slots) {
            if (!slotsByDay[slot.day]) slotsByDay[slot.day] = [];
            slotsByDay[slot.day].push(slot);
        }

        const daySchedules = [];
        for (const dayName of dayOrder) {
            if (!slotsByDay[dayName]) continue;
            const daySlots = slotsByDay[dayName].sort((a, b) => a.slotN - b.slotN);

            let rangeStart = daySlots[0];
            let rangeEnd = daySlots[0];

            for (let s = 1; s < daySlots.length; s++) {
                if (daySlots[s].slotN === rangeEnd.slotN + 1) {
                    rangeEnd = daySlots[s];
                } else {
                    daySchedules.push({
                        day: dayName,
                        startTime: rangeStart.startTime,
                        endTime: rangeEnd.endTime,
                        slots: rangeEnd.slotN - rangeStart.slotN + 1
                    });
                    rangeStart = daySlots[s];
                    rangeEnd = daySlots[s];
                }
            }
            daySchedules.push({
                day: dayName,
                startTime: rangeStart.startTime,
                endTime: rangeEnd.endTime,
                slots: rangeEnd.slotN - rangeStart.slotN + 1
            });
        }

        const horarioDias = daySchedules.map(s => `(${s.day})`).join('');
        const prefix = course.modalidad === 'VIRTUAL' ? 'VIR' : 'PRE';
        const horarioHoras = daySchedules.map(s => {
            const start = normalizeTime(s.startTime);
            const end = normalizeTime(s.endTime);
            return `(${prefix} ${start}-${end})`;
        }).join('');

        const totalSlots = daySchedules.reduce((sum, s) => sum + s.slots, 0);

        let turno = course.turno;
        if (!turno) {
            const firstStart = daySchedules[0]?.startTime || '';
            const hour = parseInt(firstStart);
            if (hour >= 7 && hour < 13) turno = 'M';
            else if (hour >= 13 && hour < 18) turno = 'D';
            else turno = 'N';
        }

        let sedaDisplay = course.sede;
        if (sedaDisplay === 'NORTE') sedaDisplay = 'NOR';

        const key1 = `${dni}${name.substring(0, 3).toUpperCase()}`;
        const key2 = `${course.carga}${course.seccion}${course.modulo}${course.nrc}`;
        const periodoDisplay = course.periodo || 'AGOSTO';
        const cicloDisplay = course.ciclo || '';

        outputRows.push({
            'Carga': course.carga,
            'DNI': dni,
            'Nombres y Apellidos': name,
            'Sede': course.sede,
            'Curso': course.cursoName,
            'Sección': course.seccion,
            'Módulo': course.modulo,
            'NRC': course.nrc,
            'Horas': totalSlots,
            'Key 1': key1,
            'Key 2': key2,
            'Periodo': periodoDisplay,
            'TURNO': turno,
            'SEDE': sedaDisplay,
            'CICLO': cicloDisplay,
            'MODALIDAD': course.modalidad,
            'HORARIO (DÍAS)': horarioDias,
            'HORARIO (HORAS)': horarioHoras,
            'ÁREA': 'ASIGNADO',
            'TIPO': '',
            'TIPO DE CONTRATO': contractType
        });
    }

    outputRows.sort((a, b) => {
        const nameCompare = a['Nombres y Apellidos'].localeCompare(b['Nombres y Apellidos']);
        if (nameCompare !== 0) return nameCompare;
        return String(a['Carga']).localeCompare(String(b['Carga']));
    });

    console.log(`\n✅ Total de registros generados: ${outputRows.length}`);

    // Output directory = same as the project
    const outDir = path.resolve(__dirname);

    const outWb = XLSX.utils.book_new();
    const outWs = XLSX.utils.json_to_sheet(outputRows);

    outWs['!cols'] = [
        { wch: 8 }, { wch: 12 }, { wch: 40 }, { wch: 10 }, { wch: 50 },
        { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 6 }, { wch: 18 },
        { wch: 20 }, { wch: 12 }, { wch: 6 }, { wch: 10 }, { wch: 8 },
        { wch: 12 }, { wch: 35 }, { wch: 45 }, { wch: 12 }, { wch: 8 },
        { wch: 18 }
    ];

    XLSX.utils.book_append_sheet(outWb, outWs, 'CARGA_HORARIA');

    const xlsxPath = path.join(outDir, 'CARGA_HORARIA_CONVERTIDA.xlsx');
    XLSX.writeFile(outWb, xlsxPath);
    console.log(`📁 Archivo Excel guardado en: ${xlsxPath}`);

    const csvPath = path.join(outDir, 'CARGA_HORARIA_CONVERTIDA.csv');
    const csvOut = XLSX.utils.sheet_to_csv(outWs);
    fs.writeFileSync(csvPath, '\ufeff' + csvOut, 'utf-8');
    console.log(`📁 Archivo CSV guardado en: ${csvPath}`);

    console.log('\n📋 Muestra de los primeros 10 registros:');
    console.log('─'.repeat(120));
    for (let i = 0; i < Math.min(10, outputRows.length); i++) {
        const r = outputRows[i];
        console.log(`${r.DNI} | ${r['Nombres y Apellidos'].substring(0, 35).padEnd(35)} | ${r.Sede.padEnd(8)} | ${r.Curso.substring(0, 40).padEnd(40)} | ${r.Sección} | NRC ${r.NRC} | ${r['HORARIO (DÍAS)']} | ${r['HORARIO (HORAS)']}`);
    }

    const uniqueTeachers = new Set(outputRows.map(r => r.DNI));
    console.log(`\n📊 Resumen:`);
    console.log(`   Docentes únicos: ${uniqueTeachers.size}`);
    console.log(`   Cursos/secciones: ${outputRows.length}`);
    console.log(`   Archivos generados: CARGA_HORARIA_CONVERTIDA.xlsx y .csv`);
}

main().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
