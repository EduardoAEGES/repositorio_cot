const fs = require('fs');
const XLSX = require('xlsx');

function parseCourseStringToRow(text, defaultSede) {
    if (!text || typeof text !== 'string') return null;

    let d = {
        curso: "DESCONOCIDO",
        seccion: "N/A",
        modulo: "",
        nrc: "0",
        sedeLarga: defaultSede,
        sedeCorta: defaultSede,
        carga: "",
        periodo: "",
        ciclo: "",
        modalidad: ""
    };

    const parts = text.split('-').map(p => p.trim());
    const secMatch = text.match(/(\d{3,4}[A-Z])/i); 

    let extractedSede = defaultSede;
    if (secMatch) {
        const seccion = secMatch[1].toUpperCase();
        const idx = parts.findIndex(p => p.toUpperCase() === seccion);
        if (idx > 0) {
            extractedSede = parts[idx - 1].toUpperCase();
        }
    }

    const sedesMap = {
        'AQP': 'AREQUIPA',
        'ATE': 'ATE',
        'VES': 'VILLA EL SALVADOR',
        'NOR': 'NORTE',
        'VIRTUAL': 'VIRTUAL',
        'PRC': 'SURCO',
        'SJL': 'SAN JUAN DE LURIGANCHO',
        'CRT': 'CERTUS',
        'SUR': 'SURCO',
        'CEN': 'CENTRO',
        'CHY': 'CHICLAYO'
    };

    d.sedeCorta = extractedSede;
    d.sedeLarga = sedesMap[extractedSede] || extractedSede;

    const nrcMatch = text.match(/NRC[\s:-]*(\d+)/i);
    if (nrcMatch) { d.nrc = nrcMatch[1]; }
    else {
        const lastParts = parts.slice(-2);
        for (let p of lastParts) {
            const pClean = p.replace(/[^\w\s]/g, '').trim();
            if (/^\d{3,5}$/.test(pClean)) {
                d.nrc = pClean;
                break;
            }
        }
    }

    const bloqueMatch = text.match(/BLOQUE\s*(\d)/i);
    if (bloqueMatch) { d.modulo = bloqueMatch[1]; }

    if (secMatch) { d.seccion = secMatch[1]; }

    const clMatch = text.match(/C\.L\.(\d{4})/i);
    if (clMatch) { d.carga = clMatch[1]; }

    const periodoMatch = text.match(/BLOQUE \d (\w+) \(/i) || text.match(/(MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)/i);
    if (periodoMatch) { d.periodo = periodoMatch[1].toUpperCase(); }

    const cicloMatch = text.match(/([IVXLCDM]+)\s*CICLO/i);
    if (cicloMatch) { d.ciclo = cicloMatch[1].toUpperCase(); }

    const matchCurso = text.match(/-(\d{4,5})-(.*?)-(?:[IVXLCDM]+)\s*CICLO/i);
    if (matchCurso) {
        d.curso = matchCurso[2].trim();
    } else {
        if (parts.length > 6) {
            d.curso = parts.slice(6, parts.length - 2).join('-').replace(/-[IVXLCDM]+\s*CICLO.*$/, '').trim();
            if (d.curso === "") d.curso = parts[6] || "DESCONOCIDO";
        }
    }
    
    d.modalidad = (d.sedeCorta === 'VIRTUAL') ? 'VIRTUAL' : 'PRESENCIAL';

    return d;
}

function runLogic(rawData) {
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(20, rawData.length); i++) {
        const row = rawData[i];
        if (row && row.some(cell => typeof cell === 'string' && cell.toUpperCase().includes('DNI'))) {
            headerRowIdx = i;
            break;
        }
    }

    if (headerRowIdx === -1) {
        throw new Error("No se encontró la fila con 'DNI'.");
    }

    const colHeaders = Array.from(rawData[headerRowIdx] || []).map(h => String(h || "").trim().toUpperCase());
    const dniIdx = colHeaders.indexOf('DNI');
    const nameIdx = colHeaders.findIndex(h => h.includes('NOMBRE'));
    const horaInicioIdx = colHeaders.findIndex(h => h.includes('HORA INICIO'));
    const horaFinIdx = colHeaders.findIndex(h => h.includes('HORA FIN'));

    const dayIndices = [];
    const dayMatchers = [
        { day: 'LUNES', match: h => h.includes('LUNES') || h.includes('LUN') },
        { day: 'MARTES', match: h => h.includes('MARTES') || (h.includes('MAR') && !h.includes('MARZO')) },
        { day: 'MIERCOLES', match: h => h.includes('MIER') || h.includes('MIÉ') || h.includes('MIÃ') },
        { day: 'JUEVES', match: h => h.includes('JUEVES') || h.includes('JUE') },
        { day: 'VIERNES', match: h => h.includes('VIERNES') || h.includes('VIE') },
        { day: 'SABADO', match: h => h.includes('SAB') || h.includes('SÁB') || h.includes('SÃ') },
        { day: 'DOMINGO', match: h => h.includes('DOMINGO') || h.includes('DOM') }
    ];

    dayMatchers.forEach(m => {
        const idx = colHeaders.findIndex(h => m.match(h));
        if (idx !== -1) dayIndices.push({ day: m.day, idx });
    });

    const colSedeMap = new Map();
    let lastSedeFound = "VIRTUAL";
    const knownSedes = ['ATE', 'VES', 'NOR', 'AQP', 'VIRTUAL', 'PRC', 'SJL', 'CRT', 'CEN', 'SUR', 'CHY'];

    for (let c = 0; c < colHeaders.length; c++) {
        for (let r = 0; r < headerRowIdx; r++) {
            const val = String(rawData[r][c] || "").trim().toUpperCase();
            if (knownSedes.includes(val)) {
                lastSedeFound = val;
                break;
            }
        }
        colSedeMap.set(c, lastSedeFound);
    }

    // --- Pass 1: Collect complete strings ---
    const completeStringsByTeacherDay = new Map();
    const completeStringsByTeacher = new Map();
    const completeStringsGlobal = new Set();

    for (let i = headerRowIdx + 1; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || row.length === 0) continue;

        let dni = String(row[dniIdx] || "").trim();
        if (!dni || dni === "nan" || !/^\d+$/.test(dni)) continue;

        dayIndices.forEach(dObj => {
            const cellValue = String(row[dObj.idx] || "").trim();
            if (!cellValue || cellValue === "nan" || cellValue.startsWith('#')) return;

            const entries = cellValue.split(/\/\/|\n/);

            for (let entry of entries) {
                entry = entry.trim();
                if (!entry) continue;

                const contextualSede = colSedeMap.get(dObj.idx) || "VIRTUAL";
                const parsed = parseCourseStringToRow(entry, contextualSede);
                if (parsed && parsed.nrc && parsed.nrc !== "0" && entry.toUpperCase().includes('NRC')) {
                    const teacherDayKey = `${dni}-${dObj.day}`;
                    if (!completeStringsByTeacherDay.has(teacherDayKey)) {
                        completeStringsByTeacherDay.set(teacherDayKey, new Set());
                    }
                    completeStringsByTeacherDay.get(teacherDayKey).add(entry);

                    if (!completeStringsByTeacher.has(dni)) {
                        completeStringsByTeacher.set(dni, new Set());
                    }
                    completeStringsByTeacher.get(dni).add(entry);

                    completeStringsGlobal.add(entry);
                }
            }
        });
    }

    // --- Helper function to reconstruct truncated strings ---
    function reconstructTruncatedString(entry, dni, day) {
        const cleanEntry = entry.trim();
        const upperEntry = cleanEntry.toUpperCase();
        
        const tempParsed = parseCourseStringToRow(cleanEntry, "VIRTUAL");
        if (tempParsed && tempParsed.nrc && tempParsed.nrc !== "0" && upperEntry.includes('NRC')) {
            return cleanEntry;
        }

        // 1. Same teacher, same day
        const teacherDayKey = `${dni}-${day}`;
        if (completeStringsByTeacherDay.has(teacherDayKey)) {
            for (const fullStr of completeStringsByTeacherDay.get(teacherDayKey)) {
                if (fullStr.toUpperCase().startsWith(upperEntry)) {
                    return fullStr;
                }
            }
        }

        // 2. Same teacher, any day
        if (completeStringsByTeacher.has(dni)) {
            for (const fullStr of completeStringsByTeacher.get(dni)) {
                if (fullStr.toUpperCase().startsWith(upperEntry)) {
                    return fullStr;
                }
            }
        }

        // 3. Global match
        for (const fullStr of completeStringsGlobal) {
            if (fullStr.toUpperCase().startsWith(upperEntry)) {
                return fullStr;
            }
        }

        // Fuzzy match by C.L. Code
        const clMatch = cleanEntry.match(/C\.L\.(\d{4})/i);
        if (clMatch) {
            const clCode = clMatch[1];
            if (completeStringsByTeacherDay.has(teacherDayKey)) {
                for (const fullStr of completeStringsByTeacherDay.get(teacherDayKey)) {
                    if (fullStr.includes(`C.L.${clCode}`)) return fullStr;
                }
            }
            if (completeStringsByTeacher.has(dni)) {
                for (const fullStr of completeStringsByTeacher.get(dni)) {
                    if (fullStr.includes(`C.L.${clCode}`)) return fullStr;
                }
            }
            for (const fullStr of completeStringsGlobal) {
                if (fullStr.includes(`C.L.${clCode}`)) return fullStr;
            }
        }

        return cleanEntry;
    }

    // --- Pass 2: Process and group ---
    const groups = new Map(); 

    for (let i = headerRowIdx + 1; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || row.length === 0) continue;

        let dni = String(row[dniIdx] || "").trim();
        if (!dni || dni === "nan" || !/^\d+$/.test(dni)) continue;
        
        const name = String(row[nameIdx] || "").trim();
        if (!name.includes("CONDOR SURICHAQUI")) continue; // Filter for debugging

        let hInicioStr = String(row[horaInicioIdx] || "").trim();
        let hFinStr = String(row[horaFinIdx] || "").trim();

        if (hInicioStr.length === 7) hInicioStr = "0" + hInicioStr; 
        if (hFinStr.length === 7) hFinStr = "0" + hFinStr;
        
        const hInicio = hInicioStr.substring(0, 5);
        const hFin = hFinStr.substring(0, 5);

        dayIndices.forEach(dObj => {
            const cellValue = String(row[dObj.idx] || "").trim();
            if (!cellValue || cellValue === "nan" || cellValue.startsWith('#')) return;

            const entries = cellValue.split(/\/\/|\n/);

            for (let entry of entries) {
                entry = entry.trim();
                if (!entry) continue;

                const reconstructed = reconstructTruncatedString(entry, dni, dObj.day);

                const contextualSede = colSedeMap.get(dObj.idx) || "VIRTUAL";
                const parsed = parseCourseStringToRow(reconstructed, contextualSede);
                
                if (parsed && parsed.nrc && parsed.nrc !== "0") {
                    const key = `${dni}-${parsed.nrc}-${parsed.carga}-${parsed.seccion}`;
                    
                    if (!groups.has(key)) {
                        groups.set(key, {
                            parsed: parsed,
                            dni: dni,
                            name: name,
                            blocks: []
                        });
                    }
                    groups.get(key).blocks.push({
                        day: dObj.day,
                        start: hInicio,
                        end: hFin
                    });
                }
            }
        });
    }

    return Array.from(groups.values()).map(g => {
        const dayMap = {};
        g.blocks.forEach(b => {
            if (!dayMap[b.day]) dayMap[b.day] = [];
            dayMap[b.day].push(b);
        });

        const rowResult = {};
        const allDays = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];
        allDays.forEach(d => {
            if (dayMap[d]) {
                rowResult[d] = "PRESENT (" + dayMap[d].length + " periods)";
            } else {
                rowResult[d] = "";
            }
        });
        
        return {
            parsed: g.parsed,
            blocks: g.blocks,
            rowResult
        };
    });
}

try {
    const csvContent = fs.readFileSync('original.csv', 'utf8');
    const workbook = XLSX.read(csvContent, { type: 'string' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

    const results = runLogic(rawData);
    console.log("Total groups for CONDOR SURICHAQUI:", results.length);
    results.forEach(r => {
        console.log(`\n--- Row for NRC ${r.parsed.nrc} ---`);
        console.log(`Course: ${r.parsed.curso}`);
        console.log(`MIERCOLES: ${r.rowResult['MIERCOLES'] || 'no'}`);
        console.log(`LUNES: ${r.rowResult['LUNES'] || 'no'}`);
        console.log(`Blocks:`, r.blocks);
    });
} catch(e) {
    console.error(e);
}
