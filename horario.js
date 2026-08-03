// ==========================================================================
// LÍDERES DE DOCENTES (POR SEDE) Y LÍDERES DE CURSOS
// ==========================================================================
const LIDERES_POR_CURSO = [
    // CICLO I
    { p: 'nuevas tendencias en contabilidad', l: 'CARLOS YBARRA MAGUIÑA' },
    { p: 'dinamica del plan contable', l: 'CARLOS YBARRA MAGUIÑA' },
    // CICLO II
    { p: 'contabilidad superior', l: 'CARLOS YBARRA MAGUIÑA' },
    { p: 'contabilidad', l: 'CARLOS YBARRA MAGUIÑA' },
    { p: 'efsrt modulo 1', l: 'CARLOS YBARRA MAGUIÑA' },
    { p: 'fundamentos de costos', l: 'JOSE RAMIREZ PINEDA' },
    { p: 'control y valorizacion de inventarios', l: 'JOSE RAMIREZ PINEDA' },
    // CICLO III
    { p: 'gestion de costos', l: 'JOSE RAMIREZ PINEDA' },
    { p: 'costos y presupuestos', l: 'JOSE RAMIREZ PINEDA' },
    { p: 'contabilidad tributaria y laboral', l: 'EDUARDO MAMANI ROQUE' },
    { p: 'sistemas de procesos contables', l: 'EDUARDO MAMANI ROQUE' },
    // CICLO IV
    { p: 'contabilidad gubernamental', l: 'JOSE RAMIREZ PINEDA' },
    { p: 'efsrt modulo 2', l: 'JOSE RAMIREZ PINEDA' },
    { p: 'constitucion y organizacion de empresas', l: 'EDUARDO MAMANI ROQUE' },
    { p: 'gestion y planeamiento tributario', l: 'EDUARDO MAMANI ROQUE' },
    { p: 'sistemas contables integrados', l: 'EDUARDO MAMANI ROQUE' },
    // CICLO V
    { p: 'formulacion de estados financieros', l: 'CARLOS YBARRA MAGUIÑA' },
    { p: 'control interno', l: 'JORGE DURAN DE LA FUENTE' },
    { p: 'contabilidad de entidades financieras', l: 'JORGE DURAN DE LA FUENTE' },
    { p: 'efsrt modulo 3', l: 'JORGE DURAN DE LA FUENTE' },
    { p: 'cierre contable tributario', l: 'EDUARDO MAMANI ROQUE' },
    // CICLO VI
    { p: 'analisis e interpretacion de los ee ff', l: 'JORGE DURAN DE LA FUENTE' },
    { p: 'analisis e interpretacion de los eeff', l: 'JORGE DURAN DE LA FUENTE' },
    { p: 'analisis e interpretacion de los estados financieros', l: 'JORGE DURAN DE LA FUENTE' },
    { p: 'eeff', l: 'JORGE DURAN DE LA FUENTE' },
    { p: 'auditoria', l: 'JORGE DURAN DE LA FUENTE' },
    { p: 'contabilidad gerencial', l: 'JORGE DURAN DE LA FUENTE' },
    { p: 'calculo financiero y tributario para la dja', l: 'EDUARDO MAMANI ROQUE' },
    // PENSAMIENTO LÓGICO (PLN)
    { p: 'pensamiento logico para los negocios tec', l: 'LUIS CONDOR' },
    { p: 'pensamiento logico para los negocios ec', l: 'MIRKO SANCHEZ' },
    { p: 'pensamiento logico', l: 'LUIS y MIRKO' }
];

const DOCENTES_LIDER_EDUARDO = ['morillo', 'robles marrufo', 'calle velasquez', 'manay velasquez'];

function normalizeLider(str) {
    if (str === null || str === undefined) return '';
    return String(str).toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\./g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Líder del docente según hoja LISTA DE LIDERES y área (Si es netamente PLN -> LUIS y MIRKO; si es COT o COT y PLN -> respeta archivo)
function getDocenteLider(docenteNombre, sede, dni) {
    const n = normalizeLider(docenteNombre);
    if (DOCENTES_LIDER_EDUARDO.some(k => n.includes(k))) {
        return 'EDUARDO MAMANI ROQUE';
    }
    if (n.includes('luis condor') || n.includes('mirko sanchez') || n === 'luis' || n === 'mirko') {
        return 'LUIS y MIRKO';
    }

    // Identificar el área del docente en contractData o por su carga general (sin importar el curso al que dio click)
    let area = '';
    if (typeof contractData !== 'undefined' && contractData) {
        let docInfo = null;
        if (typeof cleanText === 'function') {
            docInfo = contractData[cleanText(docenteNombre)] || contractData[String(docenteNombre).trim()];
        } else {
            docInfo = contractData[String(docenteNombre).trim()];
        }
        if (!docInfo) {
            const matchedKey = Object.keys(contractData).find(k => normalizeLider(k) === n || n.includes(normalizeLider(k)) || normalizeLider(k).includes(n));
            if (matchedKey) docInfo = contractData[matchedKey];
        }
        if (docInfo && docInfo.area) {
            area = String(docInfo.area).toUpperCase().trim();
        }
    }

    if (!area && typeof googleSheetCourses !== 'undefined' && googleSheetCourses) {
        const docKey = Object.keys(googleSheetCourses).find(k => normalizeLider(k) === n);
        if (docKey && googleSheetCourses[docKey] && googleSheetCourses[docKey].length > 0) {
            const allPln = googleSheetCourses[docKey].every(c => {
                const cNorm = normalizeLider(c.name || '');
                return cNorm.includes('pensamiento logico') || cNorm.includes('pln');
            });
            if (allPln) area = 'PLN';
            else area = 'COT';
        }
    }

    // REGLA: Si el área es ÚNICAMENTE PLN (no contiene COT en absoluto), el líder es LUIS y MIRKO.
    const hasCOT = area.includes('COT');
    const hasPLN = area === 'PLN' || area.includes('PLN');
    if (!hasCOT && hasPLN) {
        return 'LUIS y MIRKO';
    }

    // Si es COT o COT y PLN: se toma estrictamente en cuenta la hoja "LISTA DE LIDERES" (por DNI o por Nombre del docente, sin importar el curso)
    if (window.lideresDocenteSheet) {
        if (dni && window.lideresDocenteSheet[String(dni).trim()]) {
            return window.lideresDocenteSheet[String(dni).trim()];
        }
        if (window.lideresDocenteSheet[n]) {
            return window.lideresDocenteSheet[n];
        }
        const matchedKey = Object.keys(window.lideresDocenteSheet).find(k => k && isNaN(k) && (k.includes(n) || n.includes(k)));
        if (matchedKey && window.lideresDocenteSheet[matchedKey]) {
            return window.lideresDocenteSheet[matchedKey];
        }
    }

    // Respaldo por sede de carga/docente en caso el archivo aún esté cargando o el docente no esté listado en la hoja
    const s = normalizeLider(sede);
    if (!s) return '—';
    if (s.includes('surco') || s.includes('ate') || s.includes('prc')) return 'JORGE DURAN DE LA FUENTE';
    if (s.includes('sjl') || s.includes('san juan') || s.includes('ves') || s.includes('villa el salvador')) return 'JOSE RAMIREZ PINEDA';
    if (s.includes('aqp') || s.includes('arequipa')) return 'EDUARDO MAMANI ROQUE';
    if (s.includes('nor') || s.includes('norte') || s.includes('virtual') || s.includes('cix')) return 'CARLOS YBARRA MAGUIÑA';
    return '—';
}

// Líder del curso según la hoja "LISTA DE LIDERES" y tabla de Unidades Didácticas (con reglas por ciclo para Experiencia Formativa)
function getLiderCurso(cursoNombre, ciclo) {
    const c = normalizeLider(cursoNombre);
    if (!c) return '—';

    // Regla Prioritaria: Experiencia Formativa en Situación Real de Trabajo según Ciclo
    if (c.includes('experiencia formativa') || c.includes('efsrt') || c.includes('situacion real')) {
        const cic = String(ciclo || '').toUpperCase();
        // Ciclo II o Módulo 1 curricular -> CARLOS YBARRA MAGUIÑA
        if ((cic.includes('II') && !cic.includes('VII') && !cic.includes('VIII') && !cic.includes('III')) || c.includes('modulo 1') || c.includes('mod 1') || c.includes('ciclo ii') || c.includes('ciclo 2')) {
            return 'CARLOS YBARRA MAGUIÑA';
        }
        // Ciclo IV o Módulo 2 curricular -> JOSE RAMIREZ PINEDA
        if (cic.includes('IV') || c.includes('modulo 2') || c.includes('mod 2') || c.includes('ciclo iv') || c.includes('ciclo 4')) {
            return 'JOSE RAMIREZ PINEDA';
        }
        // Ciclo VI o Módulo 3 curricular -> JORGE DURAN DE LA FUENTE
        if ((cic.includes('VI') && !cic.includes('VIII') && !cic.includes('VII') && !cic.includes('IV')) || c.includes('modulo 3') || c.includes('mod 3') || c.includes('ciclo vi') || c.includes('ciclo 6')) {
            return 'JORGE DURAN DE LA FUENTE';
        }
    }

    if (window.lideresCursoSheet) {
        if (window.lideresCursoSheet[c]) return window.lideresCursoSheet[c];
        let bestKey = null;
        for (const k in window.lideresCursoSheet) {
            if (c.includes(k) || k.includes(c)) {
                if (!bestKey || k.length > bestKey.length) bestKey = k;
            }
        }
        if (bestKey && window.lideresCursoSheet[bestKey]) return window.lideresCursoSheet[bestKey];
    }
    let best = null;
    for (const item of LIDERES_POR_CURSO) {
        if (c.includes(item.p)) {
            if (!best || item.p.length > best.p.length) best = item;
        }
    }
    if (best) return best.l;
    if (c.includes('pensamiento logico') || c.includes('pln')) return 'LUIS y MIRKO';
    return '—';
}

// Determinar Ciclo (por columna en archivo o por nombre de curso)
function getCiclo(course) {
    if (course && course.ciclo && String(course.ciclo).trim() !== '' && String(course.ciclo).trim() !== '—') {
        let val = String(course.ciclo).trim().toUpperCase();
        if (!val.includes('CICLO') && (val === 'I' || val === 'II' || val === 'III' || val === 'IV' || val === 'V' || val === 'VI' || val === 'VII' || val === 'VIII')) {
            val = 'CICLO ' + val;
        }
        return val;
    }
    // Deducir por el primer dígito del código de la sección (1xx -> I, 2xx -> II, 3xx -> III, etc.)
    if (course && course.section && String(course.section).trim() !== '' && String(course.section).trim() !== '—') {
        const sec = String(course.section).trim();
        const firstChar = sec.charAt(0);
        if (firstChar === '1') return 'CICLO I';
        if (firstChar === '2') return 'CICLO II';
        if (firstChar === '3') return 'CICLO III';
        if (firstChar === '4') return 'CICLO IV';
        if (firstChar === '5') return 'CICLO V';
        if (firstChar === '6') return 'CICLO VI';
    }
    const cName = normalizeLider(course && course.name ? course.name : '');
    if (!cName) return '—';
    if (cName.includes('dinamica del plan') || cName.includes('nuevas tendencias')) return 'CICLO I';
    if (cName.includes('contabilidad superior') || (cName === 'contabilidad') || cName.includes('efsrt modulo 1') || cName.includes('fundamentos de costos') || cName.includes('control y valorizacion')) return 'CICLO II';
    if (cName.includes('gestion de costos') || cName.includes('costos y presupuestos') || cName.includes('tributaria y laboral') || cName.includes('sistemas de procesos')) return 'CICLO III';
    if (cName.includes('contabilidad gubernamental') || cName.includes('efsrt modulo 2') || cName.includes('constitucion y organizacion') || cName.includes('gestion y planeamiento') || cName.includes('sistemas contables integrados')) return 'CICLO IV';
    if (cName.includes('formulacion de estados') || cName.includes('control interno') || cName.includes('entidades financieras') || cName.includes('efsrt modulo 3') || cName.includes('cierre contable')) return 'CICLO V';
    if (cName.includes('ee ff') || cName.includes('eeff') || cName.includes('estados financieros') || cName.includes('auditoria') || cName.includes('contabilidad gerencial') || cName.includes('calculo financiero') || cName.includes('dja')) return 'CICLO VI';
    return '—';
}


// Determinar Tipo de Institución (Instituto TEC vs Escuela EC)
function getTipoInstitucion(course) {
    if (course && course.tipoInstitucion && String(course.tipoInstitucion).trim() !== '') return course.tipoInstitucion;
    const carga = String(course && course.cargaCode ? course.cargaCode : (course && course.carga ? course.carga : '')).trim();
    
    // Mapeo por código de ciclo lectivo (TE vs EC)
    const instCodes = ['3313', '3314', '3317', '3318', '3328', '3329', '3334', '3335', '3338', '3339'];
    const escuCodes = ['3315', '3316', '3319', '3320', '3330', '3331', '3336', '3337', '3340', '3341'];
    
    if (instCodes.includes(carga)) return 'INSTITUTO';
    if (escuCodes.includes(carga)) return 'ESCUELA';

    // Verificación en nombre de curso o strings asociados
    const cName = String(course && course.name ? course.name : '').toUpperCase();
    if (cName.includes(' TEC') || cName.endsWith('TEC') || cName.includes('INSTITUTO')) return 'INSTITUTO';
    if (cName.includes(' EC') || cName.endsWith('EC') || cName.includes('ESCUELA')) return 'ESCUELA';
    
    // Por defecto en la malla regular de Certus
    return 'INSTITUTO';
}

document.addEventListener('DOMContentLoaded', () => {
    // State
    const defaultGroups = {
        "PTC": ['EDUARDO', 'JOSÉ', 'JORGE', 'CARLOS', 'MIRKO', 'LUIS']
    };
    
    let groups = JSON.parse(localStorage.getItem('cot_groups')) || defaultGroups;
    
    // Normalize all names in groups to uppercase
    Object.keys(groups).forEach(gn => {
        groups[gn] = groups[gn].map(u => u.trim().toUpperCase());
    });
    
    // Remove OTROS and AQP-CIX groups if they exist
    if (groups["OTROS"]) delete groups["OTROS"];
    if (groups["AQP-CIX"]) delete groups["AQP-CIX"];
    
    // Ensure default groups exist and are populated if missing
    Object.keys(defaultGroups).forEach(gn => {
        if (!groups[gn] || groups[gn].length === 0) {
            groups[gn] = defaultGroups[gn];
        }
    });
    
    // Save cleaned/updated groups back to storage
    localStorage.setItem('cot_groups', JSON.stringify(groups));

    let isMasterMode = false;
    let activeGroup = Object.keys(groups)[0] || "PTC";
    // Default to CARLOS selected for "Modo Master"
    let activeUsers = new Set(['CARLOS']);
    let lastSearchedUser = null;
    
    console.log('Groups initialized:', groups);
    console.log('Active group:', activeGroup);
    
    // ... initialData stays the same for fallback ...
    const initialData = { /* ... */ }; // Keeping for reference but will use Supabase

    const supabaseUrl = 'https://klmjmlhwuzhymrplemgw.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsbWptbGh3dXpoeW1ycGxlbWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTMyNjQsImV4cCI6MjA4NzE2OTI2NH0.xFWMvUJa9n9TBcBG1WSeqCGiWBaCAtCU9aY7GXk4W6E';
    const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

    const WHITELIST_TEACHERS = [
        "ABANTO QUISPE RUTH MAYRA", "ADRIANZEN VALDEZ JOSE HORACIO", "AGUILAR SIANCAS YANES MARBELA",
        "AGUIRRE QUINTANA MAGALY EVELYN", "ALARCON BERROCAL TOMAS", "ALCANTARA OYOLA ROBERTO FERNANDO",
        "ALDANA SANCHEZ SERGIO GUSTAVO", "ALIAGA CELI NICOLAS", "AMANCA CCASA EDDY RAFAEL",
        "AMORETTI LUIS JESUS ANGEL", "ANYAIPOMA GRANADOS THREICY", "ARRASCUE TORRES KARITO DEL CARMEN",
        "ASTULLE PASTOR MARILYN DIXIE", "BRUMMERT GARGATE CARLO MARTIN", "BULEJE PARIAN FRANKLIN GILLVIN",
        "BURGA ORTEGA GIANFRANCO RAÚL", "BURGOS ALVITRES WENDY VALERY", "CALIZAYA RANILLA AMELIA OLINDA",
        "CALLE GUEVARA MARJIORE LISBHET", "CALLE VELÁSQUEZ JORGE LUIS", "CANELO BARDALES MAXIMO STEFAN",
        "CARBAJAL AÑORGA SANDRA INES", "CARPIO GARCIA CONSUELO ISABEL", "CARRANZA ALBERCA CLEYNER ALFONSO",
        "CARRERA RODRIGUEZ DERECK ANTONIO", "CARRETERO QUEZADA VILMA MARIA", "CARRILLO BRICEÑO YESSICA MILAGROS",
        "CARRILLO TRIVIÑOS DAYSI", "CARTOLIN FERNANDEZ OSCAR ALEXANDER", "CASANOVA QUESQUEN CESAR AUGUSTO",
        "CASTAÑEDA FLORES CARLOS PETER", "CASTILLEJO MEDINA MARLON ALBERT", "CASTILLO FELIX JUAN MANUEL",
        "CENTENO VILCHEZ HUGO JUNIOR", "CERNA VILLOSLADA ROBERT", "CERPA VILLALBA DAVID ALBERTO",
        "CHIAPPE SOTELO JOSE LUIS", "CHILCON LLATAS ALBERTO DAVID", "CISNEROS CRUZADO ROBERT OMAR",
        "CISNEROS DEZA GIULLIANNA DEL PILAR", "COBOS APAZA ANGELA MARIA", "COMUN GALVAN JULIA ADELA",
        "CONCHA BEDOYA KATIUSKA YOLANDA", "CONTRERAS PAREDES ROLDAN PALERMO", "CORDOVA VINCES BETSABE",
        "CORONADO HUAMAN JORGE ALBERTO", "CORTEZ DONAIRE PEDRO CARLOS", "COSTILLA RETUERTO JUAN CARLOS",
        "CUYA ARIAS LUIS ALBERTO", "DAVILA VALDIVIA SAIVA", "DE LA CRUZ YAURI ISABEL MARIA",
        "DELGADO REQUEJO YONEL", "DIAZ DELGADO JEIMY ANTHONNY", "DURAN DE LA FUENTE JORGE ALEJANDRO",
        "ECOS HERNANDEZ JESUS ANGEL", "ESPINOZA GONZALES ISIDRO OSCAR", "FALCON DELGADO LUIS ENRIQUE",
        "FERNÁNDEZ YACTAYO JOSE LUIS", "FERRER RODRIGUEZ YESMINA YESSELI", "FIGUEROA YNCA FERNANDO FREDY",
        "FLORES RIVERA AMIT ROY", "FUENTES REYES LUIS ALBERTO", "GALLARDO CUEVA MARICIELO ANTUANE",
        "GALLARDO ENCISO ELIANA ALCIRA", "GALLUFFI BLAS HUGO", "GARCIA LEYVA RONALD FRANK",
        "GARCIA VERGARA JUAN WALDEMAR", "GAVIDIA MEZA JOSE LUIS", "GONZALES IDROGO OSCAR FERNANDO",
        "GROSSO CURO TERRY BETTY LUCIA", "GUTIERREZ HILASACA CESAR TEODORO", "GUZMAN ESPINOZA WILLY CESAR",
        "HEREDIA GAMBOA LUIS MIGUEL", "HUACASI ARATA FRANCISCA VIREAM", "HUAROTO MUÑOZ MIGUEL ANGEL",
        "HUISA LAGOS JESSICA GIANINA", "IGLESIAS ANDRADE GILMER", "AMORETTI LUIS JESUS ANGEL",
        "ISIDRO AMAO MARIANELA INES", "JIMENEZ CHAVEZ ROXANA CONSUELO", "LAPA SALINAS LUZ ROSANNA",
        "LAURIE GOMEZ CARMEN ELSA IGNACIA", "LEON ORBEGOSO LILIANA FLOR", "LEVANO HUAMAN ANGELA MILAGROS",
        "LLAVE ANGULO IRVIN LUIS", "LLERENA ANCCO CARLOS ALBERTO", "LLONTOP ROJAS MYRIAN MAGDALENA",
        "LOAYZA MARTINEZ MARITZA IVONNE", "LOPE ROJAS PERCY SALVADOR", "LOZADA SILVA KIARA RAQUEL",
        "LUCAS DIEGO JONATHAN CRISTIAN", "LUPERDI YSLA CINDY PAOLA", "MAMANI CUNO DAVID",
        "MAMANI RICO JEANNE ESTHER", "MAMANI ROQUE EDUARDO LUIS", "MANAY VELASQUEZ FRANCIS ABEL",
        "MARIN VARGAS OSWALDO MANUEL MARTIN", "MEDINA DE LA CRUZ CHRISTIAN ADRIAN", "MEDINA FIGUEROA JOSE ALEXIS",
        "MENA BENITES CESAR AUGUSTO", "MIRANDA ENCISO ALBERTO", "MONTENEGRO PEREZ LUIS ANTONIO",
        "MORILLO VALLE YOLANDA LUZ", "MUÑOZ ACOSTA HENRY LEE", "NAMIHAS JÁUREGUI ENITH CAROLINA",
        "NOA CAYALLE EMELY BERTHA", "NUÑEZ MUCHA CARLOS RAUL", "OJEDA DAGA CRISTIAN KEVIN",
        "OLIN ZEGARRA FAUSTINO DIMAS", "ORELLANA ARAGON FERNANDO RAFAEL", "OVIEDO RODRIGUEZ FREDY LUIS",
        "PACHECO PAZ JEANNETT AMELIA", "PADILLA CORDOVA ERIKA GISELLA", "PAJUELO AIQUIPA ABEL DANIEL",
        "PALOMINO QUISPE SAMIR ANTHONY", "PARDAVE PEJE ENRIQUE ALBERTO", "PAREDES LARA LUIS RICARDO",
        "PARICANAZA CHAVEZ JORGE LUIS", "PASTOR AVILA BRENDA CRIZEYDA", "PASTOR AVILA WILFREDO FERNANDO",
        "PAYALICH QUISPE CYNTIA SOLEDAD", "PECHO GARCIA CARLOS ESTEBAN", "PEREZ CAIRO LYNDSAY SYDNEY",
        "PEREZ GRANDE MARUJA NIEVES", "PESCORAN QUISPE RONALD CANCIANO", "POLAR VALDIVIA ERNESTO ANTONIO",
        "PUCUHUAYLA ALFARO ANTONIO", "PUENTE DE LA VEGA PEÑA ANGELA SILVIA", "QUESQUEN LIZA JOSE MAURO",
        "QUEVEDO MONCHON RONALD CHRISTIAN", "QUISPE ARCE RICHARD JUAN", "QUISPE GONZALES PEDRO ALBERTO",
        "RAMIREZ CERRATE ISABEL VICTORIA", "RAMIREZ PINEDA JOSE CIRILO", "RAMIREZ SARMIENTO LUIS FELIPE ALONSO",
        "RAMOS CONGA JAVIER", "RAMOS SALHUA MIRIAM RUTH", "RAMOS TINTAYA JORCH BRAYHAN JESUS",
        "RAMOS ZAMORA DEISY", "RAVELO PINILLOS GUILLERMO FELIPE", "REQUEJO CUEVA ANDERSON",
        "REYES RAMOS JOSE MANUEL", "RIMARACHIN SUAREZ EDWIN FERNANDO", "ROBLES MARRUFO HOILER LEONCIO",
        "RODAS GASPAR VLADIMIR", "RODRIGUEZ FLORES CARLOS SANTIAGO", "ROJAS ALARCON FIORELLA XIOMARA",
        "ROJAS ALCEDO FERNANDO ELEODORO", "ROJAS CONDORI JOSÉ LUIS", "ROMANI QUEZADA LUIS ENRIQUE",
        "ROMERO ALVARADO WALTER FERNANDO", "ROSALES HUAMAN JAIME", "ROSALES RAMOS JORGE LUIS",
        "RUIZ CORONADO MARCO ANTONIO", "RUIZ MENACHO MAX ALEJANDRO", "SAAVEDRA SAMATA JONATHAN",
        "SÁENZ CONTRERAS IVONNE DEL CARMEN", "SALAS HOLGUIN LUIS ASCANIO", "SALAZAR ALCOS CESAR AUGUSTO",
        "SALAZAR CANCINO MARELI", "SALAZAR GRADOS JUAN WILLY", "SALCEDO ARENAS CRISLEY LISSET",
        "SALCEDO MEZA ENRIQUE EDUARDO", "SAMANIEGO LAYA ROSA CINDY", "SANDOVAL ROQUE ELKYN REYNALDO",
        "SANTA CRUZ CALDERON ABEL", "SEGOVIA GARCIA GODOS GUILLERMO RENZO", "SIBAN ESPINOZA CRIS ESTEFANIA",
        "SOLIS VERA PAUL MARTIN", "TASAYCO CARBAJAL GLADYS MARIBEL", "TINEO JIMENEZ RICHARD ALAN",
        "TORRES BUSTAMANTE DEISIS YANET", "TORRES ESTRADA JAVIER ENRIQUE", "TORRES VILLAVICENCIO HENRY",
        "TRINIDAD ALVARADO ANDY BLADIMIR", "UBILLUS TICLLA ANGELICA MARIA", "UGAZ CARRANZA JOHN PIERRE",
        "URBINA CRUZ PERCY WILLIAM", "URETA GUTIERREZ GISELA", "VALENTINO OCARES RODOLFO WILLY",
        "VALENZUELA VEGA STANLEY ROBERTO", "VARGAS LEYVA JESSLY SHANELA", "VASQUEZ GUERRERO LUZ MARISEL",
        "VEGA AREVALO ROBERTO", "VEGA PINTO ROLANDO AUGUSTO", "VERGARA TORRE FERNANDO ALONSO",
        "VERGARA VIRHUEZ MOISES ARTURO", "VICENTE FELIX CRISTINA ZULEIKA", "VIGO AYONA JOSE FELIX",
        "VILCA CCALLOCUNTO DAVID", "VILLACORTA BERTOLOTTO VICTOR MARTIN", "YAHUANA OJEDA URSULA ESPERANZA",
        "YBARRA MAGUIÑA CARLOS SANTIAGO", "YOVERA QUEZADA FLOR MILAGROS", "YOVERA RUIZ NELSON PAUL",
        "ZEGARRA ESCOBEDO LIZBETH KATHERINE", "ZELADA RAMOS JOSE ANTONIO", "ACOSTA ALCANTARÁ YASSER",
        "AGUIRRE PORTAL DAMARIS DINA", "ANCAJIMA OLIVARES PEDRO", "ARANA KAIK EDMUNDO JAVIER",
        "ARANGO OTAEGUI LUCIA LOURDES", "ARGOTT CARRASCO ALEXANDER", "ASPILCUETA ARIAS ALESSANDRA NICOLE",
        "ATACHAO MALLQUI JORGE CUTBERTO", "AVALOS RAMOS CARLOS FRANCISCO", "BALABARCA MUÑOZ OMAR",
        "BAYONA ARANDA ROCIO VALENTINA", "BUSTAMANTE PRINCIPE MARIA ALEJANDRA", "BUSTILLOS HUAYHUA REYNALDO JUNIOR",
        "CABRERA SERPA ALAN JULIO", "CALATAYUD TORVISCO MARIA", "CANLLAHUA CONDORI OSCAR",
        "CAQUI YABAR GILDDER ERDMANN", "CARDENAS MARTINEZ JULIO", "CARRASCO VALENCIA ERICK RUMALDO",
        "CASTILLA ALBARRÁN YSAIAS", "CASTILLO MORENO ALEJANDRO JOSÉ", "CASUSOL CUMPA JORGE LUIS",
        "CERDA MEDINA JOEL EDSON", "CHAVEZ BRONCANO LUIS ALFREDO", "CHAVEZ GOMEZ CHRISTIAN HELVIN",
        "CHINCHA ALVAREZ ANA MARÍA NINOSHKA", "CHUMACERO CALLE JUAN CARLOS", "CONDOR SURICHAQUI LUIS ENRIQUE",
        "CÓRDOVA FERNAN ZEGARRA PAUL ANDRES", "COVEÑAS YATACO ELBER ANTONIO", "CUEVAS PEÑA EUSEBIO JOSE",
        "CUMPA BARRIOS JHERSON MARTÍN", "CUNO SOSA WILLIAM", "DAVILA FLORES SARA MERCEDES",
        "DE LA CRUZ YAURI CESAR ARMANDO", "DIAZ DIAZ HEINER ENRIQUE", "ECHEGARAY FERNANDEZ DEISY VICTORIA",
        "ESPINOZA ALMEDRAS JOSÉ LUIS", "ESPINOZA NEYRA ELIZABET GUADALUPE", "FLORES CUSI WILLY HUGO",
        "FLORES ESPINOZA LEONCIO", "FLORES MUÑOZ RONY NAZARENO", "FRANCO CASAS HUMBERTO",
        "GARRIAZO PINEDA ALEXANDER WENCESLAO", "GONZALES CONCHA RICARDO", "GONZÁLES DÁVILA CRISTINA ANGÉLICA",
        "GUANILO ARANDA CLARA ELVADINA", "GUERRERO CHIRINOS JHONATHAN WILLIAM", "GUTIERREZ AMAYO CESAR DAVID",
        "21558035", "HUAPAYA HURTADO KENYI ABEL ASCENCION", "HUARANCCA VELASQUEZ ELIZABETH LUCIA",
        "JIMENEZ TORRES GUSTAVO LORENZO", "LEON ALVARADO MELISSA RUTH", "LEON CAPCHA JOSE ROMULO",
        "LETONA LIMA RUBY JENNY", "LEZAMETA/PRIMO OSCAR RAFAEL", "LLAJARUNA TELLES ROBERTO ALONZO",
        "LOBATON MURILLO JHONATAN", "LOZANO ROCA MARKO MARTIN", "MAGUIÑA PRUDENCIO EGEL",
        "MALLQUI BARRERA KENNY VLADIMIR", "MAMANI TIPULA ERNESTO ELIAS", "MARQUEZ MILUSSICH REYNALDO",
        "MARTINEZ ALEGRE LUIS ARTURO", "MECHAN RIOS ERNESTO EDUARDO", "MOORE DELGADO JAVIER",
        "MORON CHIL LEANDRO", "OBREGON ROSALINO ALBERTO JONATHAN", "ORTIZ ROJAS LUIS ANIBAL",
        "PADILLA SEGURA JESUS MATEO", "PAREDES ACOSTA LOURDES ISABEL", "PAREDES CASTILLO LUIS ALVARO",
        "PARIZACA CHAMBI DAVID JOEL", "PEÑA SANCHEZ FERNANDO ALEXANDER", "PIEDRA VALDEZ JOVITA MARIA",
        "PITA ESPINOZA JOSE LUIS", "PONCE FRETEL SANTIAGO ELÍ", "PONCE HUANQUI ALBERTO JASEL",
        "QUIÑONES BORDA JORGE VICTOR", "QUISPE CERNA LUIS ANTONIO", "RAFO PERALTA ALEJO",
        "RAYGADA LUQUE PEDRO MANUEL", "REYES CATIRI HENRY GUSTAVO", "REYES TÁMARA ALEX MARIO",
        "RIOS HENCKEL MARIA CRISTINA.", "RIVEROS HUAMAN MISSEY BLANCA", "ROJAS REVOREDO ELIO JUAN PABLO",
        "ROMERO LLERENA MIGUEL ANGEL", "SANCHEZ CESPEDES MIRKO NAPOLEÓN", "SANCHEZ MONZON ROBERTO CARLOS",
        "SANCHEZ PEREYRA MIRTHA MARLEN", "SANDOVAL LAURA HANY ISABEL", "SANDOVAL MONTOYA ALEXIS AARON",
        "SANTA CRUZ ESPINOZA CESAR LEONARDO", "SARAVIA AGUILAR VICTOR IVAN", "SEQUEIROS VARGAS DAVID",
        "SOLIS PALOMINO EDWARD ARTURO", "SOSA SALES JORGE AUGUSTO", "TANTARICO MINCHOLA, GALIA LIZBETH",
        "TOBIAS ANDRADE ADHEMIR OCTAVIO", "TORRES QUIROZ ROGER RODOLFO", "TORRES CAHUANA MELBA",
        "VASQUEZ CUEVA MIGUEL ANGEL", "VERA INGA MARIA DEL PILAR", "VERGARAY ALBUJAR CESAR AUGUSTO",
        "VILCA ALCANTARA CESAR", "ESCALANTE RODRIGUEZ SANDRA", "CHERRE ARGUEDAS JUAN",
        "CHAVEZ TENORIO LUIS ALBERTO", "ESCOBEDO PAJUELO JOSE", "MARTINEZ SAN MIGUEL CESAR",
        "FERNANDEZ GARCIA JAVIER", "PEÑA LUJAN EDGARD", "QUIÑONES LABRIN HOWELL MOISES", "ZEGARRA CASTAÑEDA JOSE"
    ];

    let courses = {}; // Will be filled from Supabase
    let googleSheetCourses = {}; // Will be filled from Google Sheet

    async function loadFromSupabase() {
        let res1, res2;
        
        if (isMasterMode) {
            // Master mode only loads from the private table
            res1 = await supabaseClient.from('cot_horarios_privados').select('*');
            res2 = { data: [], error: null }; // No external schedules in Master mode
        } else {
            // Regular mode loads from public and external tables
            res1 = await supabaseClient.from('cot_horarios').select('*');
            res2 = await supabaseClient.from('cot_horarios_externos').select('*');
        }
        
        const data = [...(res1.data || []), ...(res2.data || [])];
        const error = res1.error;

        if (error) {
            console.error('Error loading from Supabase:', error);
            courses = JSON.parse(localStorage.getItem('cot_horarios')) || initialData;
            renderCourses();
            return;
        }

        const grouped = {};
        data.forEach(item => {
            const uid = item.user_id ? item.user_id.trim().toUpperCase() : 'UNKNOWN';
            if (!grouped[uid]) grouped[uid] = [];
            grouped[uid].push({
                id: item.id,
                name: item.name,
                modality: item.modality,
                sede: item.sede,
                section: item.seccion || '',
                nrc: item.nrc || '',
                room: item.salon || '',
                startTime: item.start_time,
                endTime: item.end_time,
                days: item.days,
                user: uid,
                sourceTable: isMasterMode ? 'cot_horarios_privados' : ((res2.data && res2.data.some(d => d.id === item.id)) ? 'cot_horarios_externos' : 'cot_horarios')
            });
        });
        courses = grouped;
        renderCourses();
    }

    function parseHorarios(diasStr, horasStr) {
        if (!diasStr || !horasStr) return [];
        
        let daysRaw = [];
        const dayRegex = /\((.*?)\)/g;
        let match;
        while ((match = dayRegex.exec(diasStr)) !== null) {
            daysRaw.push(match[1].trim().toUpperCase());
        }
        if (daysRaw.length === 0) {
            if (diasStr.includes('-')) {
                daysRaw = diasStr.split('-').map(s => s.trim().toUpperCase());
            } else {
                daysRaw = [diasStr.trim().toUpperCase()];
            }
        }

        let hoursRaw = [];
        const hourRegex = /\((.*?)\)/g;
        while ((match = hourRegex.exec(horasStr)) !== null) {
            hoursRaw.push(match[1].trim());
        }
        if (hoursRaw.length === 0) {
            hoursRaw = [horasStr.trim()];
        }

        const dayMap = {
            'LUNES': 0, 'MARTES': 1, 'MIERCOLES': 2, 'MIÉRCOLES': 2,
            'JUEVES': 3, 'VIERNES': 4, 'SABADO': 5, 'SÁBADO': 5, 'DOMINGO': 6
        };

        const results = [];
        for (let i = 0; i < daysRaw.length; i++) {
            const dStr = daysRaw[i];
            let hStr = hoursRaw[i] || hoursRaw[0]; 
            if (!hStr) continue;

            const dayIdx = dayMap[dStr];
            if (dayIdx === undefined) continue;

            const timeMatch = hStr.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
            if (timeMatch) {
                results.push({
                    day: dayIdx,
                    startTime: timeMatch[1].padStart(5, '0'),
                    endTime: timeMatch[2].padStart(5, '0')
                });
            }
        }
        return results;
    }

    async function loadFromGoogleSheet() {
        try {
            const res = await fetch('https://docs.google.com/spreadsheets/d/1kNqEDwXe5Iqj9m54E--_WEe2wKxjTschDLgYnXeBS7w/export?format=csv&gid=1470879596&t=' + Date.now());
            const text = await res.text();
            const workbook = XLSX.read(text, { type: 'string' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const dataRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }).slice(1); // skip header
            
            googleSheetCourses = {};
            
            dataRows.forEach(row => {
                const name = row[2] != null ? String(row[2]).trim().toUpperCase() : '';
                const dni = row[1] != null ? String(row[1]).trim() : '';
                if (!name) return;
                
                const cursoName = row[4] != null ? String(row[4]).trim() : '';
                const seccion = row[5] != null ? String(row[5]).trim() : '';
                const modulo = row[6] != null ? String(row[6]).trim() : '';
                const nrc = row[7] != null ? String(row[7]).trim() : '';
                const sede = row[3] != null ? String(row[3]).trim() : '';
                const periodo = row[11] != null ? String(row[11]).trim().toUpperCase() : '';
                const modalidad = row[15] != null ? String(row[15]).trim() : '';
                const carga = row[0] != null ? String(row[0]).trim() : '';
                const ciclo = row[14] != null ? String(row[14]).trim() : '';
                const diasStr = row[16] != null ? String(row[16]).trim() : '';
                const horasStr = row[17] != null ? String(row[17]).trim() : '';

                const parsedSchedules = parseHorarios(diasStr, horasStr);
                
                if (!googleSheetCourses[name]) googleSheetCourses[name] = [];
                
                parsedSchedules.forEach(sch => {
                    googleSheetCourses[name].push({
                        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                        name: cursoName,
                        modality: modalidad,
                        sede: sede,
                        section: seccion,
                        nrc: nrc,
                        modulo: modulo,
                        dni: dni,
                        periodo: periodo,
                        cargaCode: carga,
                        ciclo: ciclo,
                        room: '',
                        startTime: sch.startTime,
                        endTime: sch.endTime,
                        days: [sch.day],
                        user: name,
                        sourceTable: 'google_sheet'
                    });
                });
            });
            
            // Cargar la hoja "LISTA DE LIDERES" desde el mismo archivo Google Sheets
            try {
                const resLid = await fetch('https://docs.google.com/spreadsheets/d/1kNqEDwXe5Iqj9m54E--_WEe2wKxjTschDLgYnXeBS7w/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent('LISTA DE LIDERES') + '&t=' + Date.now());
                if (resLid.ok) {
                    const textLid = await resLid.text();
                    const wbLid = XLSX.read(textLid, { type: 'string' });
                    const wsLid = wbLid.Sheets[wbLid.SheetNames[0]];
                    const lidRows = XLSX.utils.sheet_to_json(wsLid, { header: 1 });
                    
                    window.lideresDocenteSheet = {};
                    window.lideresCursoSheet = {};
                    
                    const formatLeaderName = (val) => {
                        if (!val) return '—';
                        const str = String(val).trim().toUpperCase();
                        if (str === 'EDUARDO' || str === 'MAMANI' || str.includes('MAMANI ROQUE')) return 'EDUARDO MAMANI ROQUE';
                        if (str === 'JORGE' || str.includes('DURAN')) return 'JORGE DURAN DE LA FUENTE';
                        if (str === 'JOSÉ' || str === 'JOSE' || str.includes('RAMIREZ')) return 'JOSE RAMIREZ PINEDA';
                        if (str === 'CARLOS' || str === 'VIRTUAL' || str === 'NORTE' || str === 'NOR' || str.includes('YBARRA')) return 'CARLOS YBARRA MAGUIÑA';
                        if (str.includes('LUIS') && str.includes('MIRKO')) return 'LUIS y MIRKO';
                        return val;
                    };

                    lidRows.forEach((row, idx) => {
                        if (idx === 0) return;
                        if (row[0] && row[1]) {
                            const cName = normalizeLider(String(row[0]));
                            window.lideresCursoSheet[cName] = formatLeaderName(row[1]);
                        }
                        const dni = row[4] != null ? String(row[4]).trim() : '';
                        const docName = row[5] != null ? normalizeLider(String(row[5])) : '';
                        const liderSede = row[8] != null ? formatLeaderName(row[8]) : '';
                        
                        if (liderSede && liderSede !== '—') {
                            if (dni && dni !== '—' && dni !== 'N/D') window.lideresDocenteSheet[dni] = liderSede;
                            if (docName) window.lideresDocenteSheet[docName] = liderSede;
                        }
                    });
                }
            } catch (eLid) {
                console.warn("Error al cargar la hoja LISTA DE LIDERES:", eLid);
            }

            console.log("Loaded Google Sheet Data");
            setupAutocomplete();
            renderCourses();
        } catch (err) {
            console.error("Error loading Google Sheet:", err);
        }
    }

    function setupAutocomplete() {
        const searchInput = document.getElementById('userSearchInput');
        const searchResults = document.getElementById('searchResults');
        const clearSearchBtn = document.getElementById('clearSearchBtn');
        const searchScheduleBtn = document.getElementById('searchScheduleBtn');
        
        if (!searchInput || !searchResults) return;

        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => {
                searchInput.value = '';
                clearSearchBtn.style.display = 'none';
                searchResults.classList.add('hidden');
            });
        }

        if (searchScheduleBtn) {
            searchScheduleBtn.addEventListener('click', () => {
                const val = searchInput.value.trim().toUpperCase();
                if (val) {
                    const allTeachers = Object.keys(googleSheetCourses);
                    const normalizedVal = val.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    const matches = allTeachers.filter(t => {
                        const normT = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                        return normT.includes(normalizedVal);
                    });
                    
                    matches.forEach(m => {
                        activeUsers.add(m);
                        if (groups[activeGroup] && !groups[activeGroup].includes(m)) {
                            groups[activeGroup].push(m);
                        }
                    });
                    persistGroups();
                    renderLegacyButtons();
                    updateModalUserSelect();
                }
                searchResults.classList.add('hidden');
                renderCourses();
            });
        }

        searchInput.addEventListener('input', (e) => {
            const val = e.target.value.trim().toUpperCase();
            searchResults.innerHTML = '';
            
            if (clearSearchBtn) {
                clearSearchBtn.style.display = val ? 'block' : 'none';
            }
            
            if (!val) {
                searchResults.classList.add('hidden');
                return;
            }

            const allTeachers = Object.keys(googleSheetCourses);
            const normalizedVal = val.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

            const matches = allTeachers.filter(t => {
                const normT = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return normT.includes(normalizedVal);
            }).sort();

            if (matches.length > 0) {
                searchResults.classList.remove('hidden');
                matches.forEach(m => {
                    const li = document.createElement('li');
                    li.className = 'search-result-item';
                    
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.checked = activeUsers.has(m);

                    const span = document.createElement('span');
                    span.textContent = m;
                    span.style.flex = '1';

                    li.appendChild(cb);
                    li.appendChild(span);

                    li.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        if (ev.target !== cb) {
                            cb.checked = !cb.checked;
                        }
                        
                        if (cb.checked) {
                            activeUsers.add(m);
                            if (groups[activeGroup] && !groups[activeGroup].includes(m)) {
                                groups[activeGroup].push(m);
                                persistGroups();
                            }
                        } else {
                            activeUsers.delete(m);
                        }
                        
                        renderLegacyButtons();
                        updateModalUserSelect();
                        renderCourses();
                    });

                    searchResults.appendChild(li);
                });
            } else {
                searchResults.classList.add('hidden');
            }
        });

        // Hide when clicking outside
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
                searchResults.classList.add('hidden');
            }
        });
    }

    // --- Teacher Contract & Schedule Stats Logic ---
    let contractData = {};

    function cleanText(str) {
        if (!str) return '';
        return str.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    }

    async function loadContractData() {
        try {
            console.log("Iniciando carga de datos de contratos...");
            const [resConta, resPln] = await Promise.all([
                fetch('https://docs.google.com/spreadsheets/d/1CAx1uAYYlUBSBzZx0Yhp9fbyzURHTjACwYLLUJ6XROI/export?format=csv&gid=710892901&t=' + Date.now()),
                fetch('https://docs.google.com/spreadsheets/d/1CAx1uAYYlUBSBzZx0Yhp9fbyzURHTjACwYLLUJ6XROI/export?format=csv&gid=2112711805&t=' + Date.now())
            ]);

            if (!resConta.ok || !resPln.ok) throw new Error("Error al descargar los CSV de contratos");

            const textConta = await resConta.text();
            const textPln = await resPln.text();

            const rowsConta = textConta.split(/\r?\n/).filter(r => r.trim() !== '');
            const rowsPln = textPln.split(/\r?\n/).filter(r => r.trim() !== '');

            contractData = {};

            // 1. Procesar CONTA (COT)
            let contaHeaderIdx = 0;
            for (let r = 0; r < Math.min(10, rowsConta.length); r++) {
                if (rowsConta[r].toUpperCase().includes('DNI') && rowsConta[r].toUpperCase().includes('APELLIDO')) {
                    contaHeaderIdx = r;
                    break;
                }
            }
            const headersConta = parseCSVLine(rowsConta[contaHeaderIdx]).map(h => h.trim().toUpperCase());
            const dniIdxC = headersConta.indexOf('DNI') !== -1 ? headersConta.indexOf('DNI') : 1;
            const nameIdxC = headersConta.findIndex(h => h.includes('APELLIDO') || h.includes('NOMBRE'));
            const typeIdxC = headersConta.findIndex(h => h.includes('TIPO') && h.includes('CONTRATO'));
            const hoursIdxC = headersConta.findIndex(h => h.includes('HORAS') && h.includes('CONTRATO'));
            const sedeIdxC = headersConta.findIndex(h => h.includes('SEDE'));

            for (let i = contaHeaderIdx + 1; i < rowsConta.length; i++) {
                const cols = parseCSVLine(rowsConta[i]);
                if (cols.length < 5) continue;
                const dni = cols[dniIdxC] ? cols[dniIdxC].trim() : '';
                const name = (nameIdxC !== -1 && cols[nameIdxC]) ? cols[nameIdxC].trim() : (cols[2] ? cols[2].trim() : '');
                const contractType = (typeIdxC !== -1 && cols[typeIdxC]) ? cols[typeIdxC].trim() : (cols[5] ? cols[5].trim() : '');
                const contractHours = (hoursIdxC !== -1 && cols[hoursIdxC]) ? cols[hoursIdxC].trim() : (cols[7] ? cols[7].trim() : '');
                let sede = (sedeIdxC !== -1 && cols[sedeIdxC]) ? cols[sedeIdxC].trim() : '';
                if (!sede && sedeIdxC !== -1 && cols[sedeIdxC + 1] && !cols[sedeIdxC + 1].includes('/') && cols[sedeIdxC + 1].length < 15) {
                    sede = cols[sedeIdxC + 1].trim();
                }

                if (name && !name.toUpperCase().includes('APELLIDO')) {
                    const cleanN = cleanText(name);
                    const teacherObj = {
                        dni: dni || '—',
                        name,
                        contractType: contractType || '—',
                        contractHours: parseInt(contractHours) || 0,
                        sede: sede || '—',
                        area: 'COT',
                        source: "DOCENTES CONTA 2026"
                    };
                    contractData[cleanN] = teacherObj;
                    if (dni && dni !== '—') {
                        contractData[dni] = teacherObj;
                        contractData[dni.replace(/^0+/, '')] = teacherObj;
                    }
                }
            }

            // 2. Procesar PLN (PLN)
            let plnHeaderIdx = 1;
            for (let r = 0; r < Math.min(15, rowsPln.length); r++) {
                if (rowsPln[r].toUpperCase().includes('DNI') && rowsPln[r].toUpperCase().includes('APELLIDO')) {
                    plnHeaderIdx = r;
                    break;
                }
            }
            const headersPln = parseCSVLine(rowsPln[plnHeaderIdx]).map(h => h.trim().toUpperCase());
            const dniIdxP = headersPln.indexOf('DNI') !== -1 ? headersPln.indexOf('DNI') : 1;
            const nameIdxP = headersPln.findIndex(h => h.includes('APELLIDO') || h.includes('NOMBRE'));
            const typeIdxP = headersPln.findIndex(h => h.includes('TIPO') && h.includes('CONTRATO'));
            const hoursIdxP = headersPln.findIndex(h => h.includes('HORAS') && h.includes('CONTRATO'));
            const sedeIdxP = headersPln.findIndex(h => h === 'SEDE' || h.includes('SEDE'));

            for (let i = plnHeaderIdx + 1; i < rowsPln.length; i++) {
                const cols = parseCSVLine(rowsPln[i]);
                if (cols.length < 5) continue;
                const dni = cols[dniIdxP] ? cols[dniIdxP].trim() : '';
                const name = (nameIdxP !== -1 && cols[nameIdxP]) ? cols[nameIdxP].trim() : (cols[2] ? cols[2].trim() : '');
                const contractType = (typeIdxP !== -1 && cols[typeIdxP]) ? cols[typeIdxP].trim() : (cols[7] ? cols[7].trim() : '');
                const contractHours = (hoursIdxP !== -1 && cols[hoursIdxP]) ? cols[hoursIdxP].trim() : (cols[9] ? cols[9].trim() : '');
                const sede = (sedeIdxP !== -1 && cols[sedeIdxP]) ? cols[sedeIdxP].trim() : '';

                if (name && !name.toUpperCase().includes('APELLIDO')) {
                    const cleanN = cleanText(name);
                    const cleanDni = dni ? dni.replace(/^0+/, '') : '';
                    let existing = contractData[cleanN] || (dni ? contractData[dni] : null) || (cleanDni ? contractData[cleanDni] : null);

                    if (existing) {
                        existing.area = 'COT y PLN';
                        if ((!existing.dni || existing.dni === '—') && dni) existing.dni = dni;
                        if (parseInt(contractHours) > 0 && existing.contractHours === 0) existing.contractHours = parseInt(contractHours);
                        if (contractType && (existing.contractType === '—' || !existing.contractType)) {
                            existing.contractType = contractType;
                        } else if (contractType && existing.contractType !== contractType && !existing.contractType.includes(contractType)) {
                            existing.contractType = `${existing.contractType} / ${contractType}`;
                        }
                        if (sede && (existing.sede === '—' || !existing.sede)) {
                            existing.sede = sede;
                        } else if (sede && !existing.sede.includes(sede)) {
                            existing.sede = `${existing.sede}/${sede}`;
                        }
                    } else {
                        const teacherObj = {
                            dni: dni || '—',
                            name,
                            contractType: contractType || '—',
                            contractHours: parseInt(contractHours) || 0,
                            sede: sede || '—',
                            area: 'PLN',
                            source: "DOCENTES PLN 2026"
                        };
                        contractData[cleanN] = teacherObj;
                        if (dni && dni !== '—') {
                            contractData[dni] = teacherObj;
                            contractData[cleanDni] = teacherObj;
                        }
                    }
                }
            }

            console.log("Datos de contratos cargados exitosamente. Total registros:", Object.keys(contractData).length / 2);
            
            // Render stats once loaded (in case teachers are already selected)
            if (typeof activeCoursesListGlobal !== 'undefined') {
                renderTeacherStats(activeCoursesListGlobal);
            }
        } catch (err) {
            console.error("Error al cargar contratos:", err);
        }
    }

    // Keep a global reference to active courses list so we can update stats outside renderCourses if needed
    let activeCoursesListGlobal = [];

    function renderTeacherStats(activeCoursesList) {
        activeCoursesListGlobal = activeCoursesList || [];
        const statsContainer = document.getElementById('teacherStatsContainer');
        if (!statsContainer) return;

        statsContainer.innerHTML = '';

        if (!activeUsers || activeUsers.size === 0) {
            return; // No statistics if no teachers are selected
        }

        activeUsers.forEach(activeUser => {
            const cleanActiveUser = cleanText(activeUser);

            // 1. Resolve teacher contract info
            const userDniMap = {
                'EDUARDO': '46069339',
                'JOSÉ': '41403863',
                'JOSE': '41403863',
                'JORGE': '70092982',
                'CARLOS': '8133862',
                'LUIS': '40073403',
                'MIRKO': '42670470'
            };
            let customDnis = JSON.parse(localStorage.getItem('cot_custom_dnis')) || {};
            const reqDni = userDniMap[cleanActiveUser] || customDnis[cleanActiveUser];

            let contractInfo = null;
            if (reqDni) {
                const cleanReqDni = reqDni.trim().replace(/^0+/, '');
                contractInfo = contractData[cleanReqDni] || contractData[cleanReqDni.padStart(8, '0')];
            }
            if (!contractInfo) {
                contractInfo = contractData[cleanActiveUser];
            }
            if (!contractInfo) {
                // Fuzzy lookup in contractData keys
                const matchedKey = Object.keys(contractData).find(k => k.includes(cleanActiveUser) || cleanActiveUser.includes(k));
                if (matchedKey) {
                    contractInfo = contractData[matchedKey];
                }
            }

            let name, dni, contractType, contractHours, source, sede, area;
            if (contractInfo) {
                name = contractInfo.name;
                dni = contractInfo.dni || reqDni || '—';
                contractType = contractInfo.contractType || '—';
                contractHours = contractInfo.contractHours || 0;
                source = contractInfo.source;
                sede = contractInfo.sede || '—';
                area = contractInfo.area || (source && source.includes('CONTA') ? 'COT' : 'PLN');
            } else {
                name = activeUser;
                dni = reqDni || '—';
                contractType = '—';
                contractHours = 0;
                source = 'Externo';
                sede = '—';
                area = '—';
            }

            // 2. Calculate actual programmed hours from grid and collect scheduled Sedes
            const userCourses = activeCoursesList.filter(c => {
                const cleanCourseUser = cleanText(c.user);
                if (reqDni && c.dni) {
                    const cDniClean = c.dni.trim().replace(/^0+/, '');
                    const reqDniClean = reqDni.trim().replace(/^0+/, '');
                    if (cDniClean === reqDniClean) return true;
                }
                return cleanCourseUser.includes(cleanActiveUser) || cleanActiveUser.includes(cleanCourseUser);
            });

            let totalProgrammedMinutes = 0;
            let sedeSet = new Set();
            if (sede && sede !== '—') {
                sede.split('/').forEach(s => { if (s.trim()) sedeSet.add(s.trim().toUpperCase()); });
            }

            userCourses.forEach(c => {
                const start = timeToMinutes(c.startTime);
                const end = timeToMinutes(c.endTime);
                if (start && end && end > start) {
                    const duration = end - start;
                    const daysCount = (c.days && c.days.length > 0) ? c.days.length : 1;
                    totalProgrammedMinutes += duration * daysCount;
                }
                if (c.sede && c.sede.trim() && c.sede !== '—' && c.sede.toUpperCase() !== 'VIRTUAL') {
                    c.sede.split('/').forEach(s => { if (s.trim()) sedeSet.add(s.trim().toUpperCase()); });
                } else if (c.sede && c.sede.trim() && c.sede.toUpperCase() === 'VIRTUAL' && sedeSet.size === 0) {
                    sedeSet.add('VIRTUAL');
                }
            });
            const sedeDisplay = sedeSet.size > 0 ? Array.from(sedeSet).join('/') : '—';

            const totalProgrammedHours = totalProgrammedMinutes / 45; // academic hours (45 min)
            const roundedProgrammed = Math.round(totalProgrammedHours * 10) / 10;

            // 3. Render Card
            const card = document.createElement('div');
            card.className = 'teacher-stat-card';
            
            const cleanUserTag = activeUser.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const userColor = getUserColor(cleanUserTag);
            card.style.borderLeftColor = userColor;

            const percentage = contractHours > 0 ? (roundedProgrammed / contractHours) * 100 : 0;
            const pctText = contractHours > 0 ? `${Math.round(percentage)}%` : '—';
            
            // Badge style for contract
            let badgeClass = 'badge-other';
            const normType = contractType.toUpperCase().replace(/\s+/g, '');
            if (normType.includes('PTCIN')) badgeClass = 'badge-ptcin';
            else if (normType.includes('PTC')) badgeClass = 'badge-ptc';
            else if (normType.includes('PTD')) badgeClass = 'badge-ptd';
            else if (normType.includes('PTP')) badgeClass = 'badge-ptp';
            else if (normType.includes('TCXH') || normType.includes('TCR')) badgeClass = 'badge-tcr';
            else if (normType.includes('PPH')) badgeClass = 'badge-pph';

            // Area Badge style
            let areaBadgeClass = 'badge-other';
            if (area === 'COT y PLN') areaBadgeClass = 'badge-area-cot-pln';
            else if (area === 'COT') areaBadgeClass = 'badge-area-cot';
            else if (area === 'PLN') areaBadgeClass = 'badge-area-pln';

            // Fill color style
            let fillClass = 'fill-zero';
            if (contractHours > 0) {
                if (roundedProgrammed === 0) fillClass = 'fill-zero';
                else if (percentage < 90) fillClass = 'fill-underload';
                else if (percentage <= 105) fillClass = 'fill-optimal';
                else if (percentage <= 125) fillClass = 'fill-overload';
                else fillClass = 'fill-excessive';
            }

            card.className = 'teacher-stat-card odoo-stat-bar';
            card.innerHTML = `
                <div class="odoo-stat-main" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <span class="teacher-stat-name" title="${name}">${name}</span>
                    <span class="teacher-info-pill" title="Documento de Identidad"><i class="far fa-id-card" style="color: #64748b;"></i> <strong>${dni}</strong></span>
                    <span class="teacher-info-pill" title="Sede del Docente"><i class="fas fa-map-marker-alt" style="color: #ef4444;"></i> Sede: <strong>${sedeDisplay}</strong></span>
                    ${area !== '—' ? `<span class="teacher-stat-badge ${areaBadgeClass}" title="Área de Origen">${area}</span>` : ''}
                    <span class="teacher-stat-badge ${badgeClass}" title="Tipo de Contrato">${contractType}</span>
                </div>
                <div class="odoo-stat-metrics" style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <span class="metric-item"><i class="far fa-clock"></i> Prog: <strong style="color: ${userColor};">${roundedProgrammed} h</strong></span>
                    <span class="metric-sep">|</span>
                    <span class="metric-item"><i class="fas fa-file-signature"></i> Contrato: <strong>${contractHours > 0 ? `${contractHours} h` : '—'}</strong></span>
                    <span class="metric-sep">|</span>
                    <span class="metric-item"><i class="fas fa-tasks"></i> Cumpl.: <strong>${pctText}</strong></span>
                    ${contractHours > 0 ? `
                    <div class="odoo-progress-wrap" title="Cumplimiento: ${pctText}">
                        <div class="teacher-progress-bar-bg">
                            <div class="teacher-progress-bar-fill ${fillClass}" style="width: ${Math.min(percentage, 100)}%;"></div>
                        </div>
                    </div>
                    ` : ''}
                </div>
            `;
            statsContainer.appendChild(card);
        });
    }

    async function saveToSupabase(course, owner, tableName = 'cot_horarios') {
        const targetTable = isMasterMode ? 'cot_horarios_privados' : (tableName || 'cot_horarios');
        const payload = {
            id: course.id,
            user_id: owner,
            name: course.name,
            modality: course.modality,
            sede: course.sede,
            seccion: course.section || null,
            nrc: course.nrc || null,
            salon: course.room || null,
            start_time: course.startTime,
            end_time: course.endTime,
            days: course.days
        };

        const { error } = await supabaseClient
            .from(targetTable)
            .upsert(payload, { onConflict: 'id' });

        if (error) {
            if (error.code === '42P01' && !isMasterMode && tableName !== 'cot_horarios') {
                 console.warn(`Table ${tableName} not found, falling back to cot_horarios`);
                 return saveToSupabase(course, owner, 'cot_horarios');
            }
            alert('Error al guardar en Supabase: ' + error.message);
        }
    }

    async function removeFromSupabase(id, tableName = 'cot_horarios') {
        // If tableName is provided specifically from sourceTable, use that. 
        // Otherwise fallback to context-based logic.
        const targetTable = tableName || (isMasterMode ? 'cot_horarios_privados' : 'cot_horarios');
        
        const { error } = await supabaseClient
            .from(targetTable)
            .delete()
            .eq('id', id);
        
        if (error && !tableName && !isMasterMode && targetTable === 'cot_horarios') {
            return removeFromSupabase(id, 'cot_horarios_externos');
        } else if (error) {
            console.error(`Error removing ${id} from ${targetTable}:`, error);
        }
    }
    
    // Elements
    const gridBody = document.getElementById('gridBody');
    const groupSelector = document.getElementById('groupSelector');
    const userSelector = document.getElementById('userSelector');
    const addGroupBtn = document.getElementById('addGroupBtn');
    const modal = document.getElementById('courseModal');
    const addBtn = document.getElementById('addCourseBtn');
    const closeBtn = document.querySelector('.close');
    const form = document.getElementById('courseForm');
    const deleteBtn = document.getElementById('deleteBtn');
    const schedulesContainer = document.getElementById('schedulesContainer');
    const addScheduleBlockBtn = document.getElementById('addScheduleBlockBtn');
    
    // Optional/Legacy elements (might be null)
    const userSearchInput = document.getElementById('userSearchInput');
    const returnToPtcBtn = document.getElementById('returnToPtcBtn');
    const userSearchResults = document.getElementById('userSearchResults');
    const selectedUsersContainer = document.getElementById('selectedUsersContainer');
    const masterBtn = document.getElementById('masterBtn');
    
    if (masterBtn) {
        masterBtn.onclick = () => {
            if (isMasterMode) {
                isMasterMode = false;
                document.querySelector('h1').innerText = 'HORARIOS - EQUIPO COT PLN';
                document.querySelector('.app-container').style.borderColor = 'transparent';
                if (groupSelector) groupSelector.style.display = 'flex';
                switchGroup('PTC');
                alert('Modo Master desactivado');
            } else {
                const pwd = prompt('Ingrese contraseña Master:');
                if (pwd === 'Conta-2026') {
                    isMasterMode = true;
                    document.querySelector('h1').innerText = 'EQUIPO COT - MODO MASTER';
                    document.querySelector('.app-container').style.border = '2px solid #7c3aed';
                    if (groupSelector) groupSelector.style.display = 'none';
                    activeUsers = new Set(['EDUARDO']);
                    renderUserSelector();
                    renderCourses();
                    alert('Modo Master Activado - Vista de Eduardo');
                } else {
                    alert('Contraseña incorrecta');
                }
            }
            updateReturnVisibility();
        };
    }

    if (returnToPtcBtn) {
        returnToPtcBtn.onclick = () => {
            isMasterMode = false;
            document.querySelector('h1').innerText = 'HORARIOS - EQUIPO COT PLN';
            document.querySelector('.app-container').style.borderColor = 'transparent';
            if (groupSelector) groupSelector.style.display = 'flex';
            switchGroup('PTC');
            activeUsers = new Set(['EDUARDO']);
            renderUserSelector();
            renderCourses();
            updateReturnVisibility();
        };
    }

    function updateReturnVisibility() {
        if (!returnToPtcBtn) return;
        if (isMasterMode || activeGroup !== 'PTC') {
            returnToPtcBtn.style.display = 'inline-flex';
        } else {
            returnToPtcBtn.style.display = 'none';
        }
    }
    
    // Constants
    const START_HOUR = 7;
    const END_HOUR = 23;
    const MINUTES_PER_PERIOD = 45;
    const PIXELS_PER_PERIOD = 25;
    let periodToIndexMap = {}; 

    // Initialization
    initGrid();
    renderGroupSelector();
    renderUserSelector();
    loadFromSupabase();
    loadFromGoogleSheet();
    loadContractData();

    ['junio1Check', 'junio2Check', 'agosto1Check', 'agosto2Check', 'setiembre1Check', 'setiembre2Check', 'octubre1Check', 'octubre2Check', 'mod1Check', 'mod2Check', 'abril1Check', 'abril2Check'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', renderCourses);
    });

    // Toggle Controls Panel Logic
    const toggleControlsBtn = document.getElementById('toggleControlsBtn');
    const collapsibleControls = document.getElementById('collapsibleControls');
    if (toggleControlsBtn && collapsibleControls) {
        toggleControlsBtn.addEventListener('click', () => {
            const isCollapsed = collapsibleControls.classList.toggle('collapsed');
            const icon = toggleControlsBtn.querySelector('i');
            const text = toggleControlsBtn.querySelector('span');
            if (isCollapsed) {
                if (icon) icon.className = 'fas fa-expand-arrows-alt';
                if (text) text.textContent = 'Mostrar Controles';
            } else {
                if (icon) icon.className = 'fas fa-compress-arrows-alt';
                if (text) text.textContent = 'Ocultar Controles';
            }
        });
    }

    // Group Logic
    function renderGroupSelector() {
        if (!groupSelector) return;
        groupSelector.innerHTML = '';
        Object.keys(groups).forEach(groupName => {
            const btn = document.createElement('button');
            btn.className = `group-btn ${activeGroup === groupName ? 'active' : ''}`;
            btn.innerText = groupName;
            btn.onclick = () => switchGroup(groupName);
            groupSelector.appendChild(btn);
        });
    }

    function switchGroup(groupName) {
        if (groupName === 'AQP-CIX' && activeGroup !== 'AQP-CIX') {
            const pass = prompt('Ingrese contraseña para acceder a AQP-CIX:');
            if (pass !== 'Software-2026') {
                alert('Contraseña incorrecta');
                return;
            }
        }
        activeGroup = groupName;
        activeUsers = new Set(); // Start empty for all groups
        renderGroupSelector();
        renderUserSelector();
        updateModalUserSelect(); // CRITICAL: Update the modal dropdown when group changes
        updateReturnVisibility();
        renderCourses();
    }

    if (addGroupBtn) {
        addGroupBtn.onclick = () => {
            const name = prompt('Nombre del nuevo grupo (ej: DOCENTES):');
            if (name && !groups[name]) {
                groups[name] = [];
                persistGroups();
                switchGroup(name);
            }
        };
    }

    function renderUserSelector() {
        const legacySelector = document.getElementById('userSelector');
        legacySelector.style.display = 'flex';
        renderLegacyButtons();
    }


    // Helper to generate a stable color from a string
    function stringToColor(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
        return '#' + '00000'.substring(0, 6 - c.length) + c;
    }

    function getUserColor(cleanName) {
        const hardcoded = ["eduardo", "jose", "jorge", "carlos", "mirko", "luis"];
        if (hardcoded.includes(cleanName)) {
            return `var(--u-${cleanName})`;
        }
        return stringToColor(cleanName);
    }

    function renderLegacyButtons() {
        userSelector.innerHTML = '';
        const users = groups[activeGroup] || [];
        
        users.forEach(user => {
            const btn = document.createElement('button');
            const normalizedUser = user.trim().toUpperCase();
            const cleanName = normalizedUser.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const isActive = activeUsers.has(normalizedUser);
            
            btn.className = `user-btn ${isActive ? 'active' : ''}`;
            btn.style.display = 'inline-flex';
            btn.style.alignItems = 'center';
            btn.style.gap = '8px';
            
            const userColor = getUserColor(cleanName);
            
            if (isActive) {
                btn.style.backgroundColor = userColor;
                btn.style.borderColor = userColor;
                btn.style.color = 'white';
            }
            
            const nameSpan = document.createElement('span');
            nameSpan.innerText = user;
            btn.appendChild(nameSpan);
            
            // Delete button for user
            const delIcon = document.createElement('i');
            delIcon.className = 'fas fa-times';
            delIcon.style.opacity = '0.5';
            delIcon.style.fontSize = '0.8em';
            delIcon.style.transition = 'opacity 0.2s';
            delIcon.onmouseover = () => delIcon.style.opacity = '1';
            delIcon.onmouseout = () => delIcon.style.opacity = '0.5';
            delIcon.title = `Eliminar a ${user}`;
            delIcon.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`¿Estás seguro de eliminar a ${user} de este grupo?`)) {
                    groups[activeGroup] = groups[activeGroup].filter(u => u !== user);
                    activeUsers.delete(normalizedUser);
                    persistGroups();
                    updateModalUserSelect();
                    renderLegacyButtons();
                    renderCourses();
                }
            };
            btn.appendChild(delIcon);
            
            btn.onclick = (e) => {
                if (e.target === delIcon) return; // handled above
                if (activeUsers.has(normalizedUser)) {
                    activeUsers.delete(normalizedUser);
                } else {
                    activeUsers.add(normalizedUser);
                }
                


                renderLegacyButtons();
                renderCourses();
            };
            userSelector.appendChild(btn);
        });

        const addUserBtn = document.createElement('button');
        addUserBtn.className = 'add-user-btn-legacy';
        addUserBtn.innerHTML = '<i class="fas fa-plus"></i> Añadir';
        addUserBtn.onclick = () => {
            const name = prompt('Nombre del docente:');
            if (name) {
                const normalizedName = name.trim().toUpperCase();
                if (!groups[activeGroup].includes(normalizedName)) {
                    const dni = prompt(`DNI de ${normalizedName} (Para ubicarlo con exactitud en Google Sheets):`);
                    groups[activeGroup].push(normalizedName);
                    activeUsers.add(normalizedName);
                    
                    if (dni && dni.trim()) {
                        let customDnis = JSON.parse(localStorage.getItem('cot_custom_dnis')) || {};
                        customDnis[normalizedName] = dni.trim();
                        localStorage.setItem('cot_custom_dnis', JSON.stringify(customDnis));
                    }
                    
                    persistGroups();
                    renderLegacyButtons();
                    updateModalUserSelect();
                    renderCourses();
                }
            }
        };
        userSelector.appendChild(addUserBtn);
    }


    function persistGroups() {
        localStorage.setItem('cot_groups', JSON.stringify(groups));
    }

    function updateModalUserSelect() {
        const userSelect = document.getElementById('courseUserSelect');
        const currentValue = userSelect.value;
        userSelect.innerHTML = '<option value="TODOS">👥 TODOS (Evento Conjunto)</option>';
        
        // Only add users from the currently active group
        const groupUsers = groups[activeGroup] || [];
        
        groupUsers.forEach(user => {
            const opt = document.createElement('option');
            const normalized = user.trim().toUpperCase();
            opt.value = normalized;
            opt.textContent = normalized;
            userSelect.appendChild(opt);
        });
        
        // If we are editing and the owner isn't in this group (unlikely but possible), add them
        if (currentValue && currentValue !== 'TODOS' && !groupUsers.map(u => u.toUpperCase()).includes(currentValue.toUpperCase())) {
            const normalized = currentValue.trim().toUpperCase();
            const opt = document.createElement('option');
            opt.value = normalized;
            opt.textContent = normalized;
            userSelect.appendChild(opt);
            userSelect.value = normalized;
        } else if (currentValue) {
            userSelect.value = currentValue.toUpperCase();
        }
    }

    // Call updateModalUserSelect initially
    updateModalUserSelect();

    if (addBtn) addBtn.onclick = () => {
        console.log('Add button clicked');
        openModal();
    };
    if (closeBtn) closeBtn.onclick = () => modal.style.display = 'none';
    window.onclick = (e) => { if (modal && e.target == modal) modal.style.display = 'none'; };

    // Cierre del modal de detalle de curso (solo lectura)
    const courseDetailModal = document.getElementById('courseDetailModal');
    const courseDetailCloseBtn = document.getElementById('courseDetailClose');
    const courseDetailOkBtn = document.getElementById('courseDetailOkBtn');
    if (courseDetailCloseBtn) courseDetailCloseBtn.onclick = () => courseDetailModal.style.display = 'none';
    if (courseDetailOkBtn) courseDetailOkBtn.onclick = () => courseDetailModal.style.display = 'none';
    window.addEventListener('click', (e) => {
        if (courseDetailModal && e.target == courseDetailModal) courseDetailModal.style.display = 'none';
    });

    async function processCSV(text) {
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length < 5) {
            alert('Formato de CSV no reconocido (muy corto).');
            return;
        }

        // Simple CSV parser that handles quotes
        function parseCSVLine(line) {
            const result = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            result.push(current.trim());
            return result;
        }

        const dataRows = lines.slice(4).map(parseCSVLine);
        const importedBlocks = [];
        
        // Group by teacher and day to merge contiguous slots
        // structure: teacherName -> dayIndex -> [{courseString, startTime, endTime}]
        const tempStorage = {};

        const normalizeText = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
        const normalizeTime = (t) => t.split(':').slice(0, 2).map(p => p.padStart(2, '0')).join(':');

        dataRows.forEach(row => {
            if (row.length < 13) return;
            const teacherName = row[2] ? row[2].trim().toUpperCase() : '';
            const startTime = row[4] ? row[4].trim() : '';
            const endTime = row[5] ? row[5].trim() : '';
            
            if (!teacherName || !startTime || !endTime || teacherName === '#N/A') return;

            const normStart = normalizeTime(startTime);

            for (let dayCol = 6; dayCol <= 11; dayCol++) {
                const dayIndex = dayCol - 6;
                const courseString = row[dayCol] ? row[dayCol].trim() : '';
                if (!courseString) continue;

                if (!tempStorage[teacherName]) tempStorage[teacherName] = {};
                if (!tempStorage[teacherName][dayIndex]) tempStorage[teacherName][dayIndex] = [];

                const teacherWork = tempStorage[teacherName][dayIndex];
                const lastBlock = teacherWork[teacherWork.length - 1];

                const normCourseCurrent = normalizeText(courseString);
                const normCourseLast = lastBlock ? normalizeText(lastBlock.courseString) : '';

                // If contiguous and same course, merge
                if (lastBlock && 
                    normCourseLast === normCourseCurrent && 
                    normalizeTime(lastBlock.endTime) === normStart) {
                    
                    // console.log(`Merging ${teacherName} on day ${dayIndex}: ${lastBlock.endTime} -> ${endTime}`);
                    lastBlock.endTime = endTime;
                } else {
                    teacherWork.push({ courseString, startTime, endTime });
                }
            }
        });

        // Convert merged slots to app format and save
        // Prepare data for bulk insertion
        const teachersToImport = Object.keys(tempStorage).filter(name => {
            const normalized = name.trim().toUpperCase();
            return WHITELIST_TEACHERS.includes(normalized) && 
                   !(groups["PTC"] && groups["PTC"].includes(normalized));
        });

        if (teachersToImport.length > 0) {
            // 1. Delete old external records for these teachers to avoid duplicates
            await supabaseClient
                .from('cot_horarios_externos')
                .delete()
                .in('user_id', teachersToImport);

            const recordsToInsert = [];
            let updatedGroups = false;

            for (const name of teachersToImport) {
                const normalizedName = name.trim().toUpperCase();
                
                const days = tempStorage[name];
                for (const [dayIndexStr, blocks] of Object.entries(days)) {
                    const dayIndex = parseInt(dayIndexStr);
                    for (const block of blocks) {
                        const extracted = extractCourseInfo(block.courseString);
                        recordsToInsert.push({
                            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                            user_id: normalizedName,
                            name: extracted.name,
                            modality: extracted.modality,
                            sede: extracted.sede,
                            start_time: block.startTime,
                            end_time: block.endTime,
                            days: [dayIndex]
                        });
                    }
                }
            }

            if (updatedGroups) {
                persistGroups();
                updateModalUserSelect();
                renderUserSelector();
            }

            if (recordsToInsert.length > 0) {
                const { error } = await supabaseClient
                    .from('cot_horarios_externos')
                    .insert(recordsToInsert);

                if (error) {
                    console.error('Error saving records:', error);
                    alert('Error al guardar horarios en Supabase');
                } else {
                    alert(`Importación exitosa: ${recordsToInsert.length} bloques guardados.`);
                    loadFromSupabase(); // Refresh grid
                }
            } else {
                alert('No se encontraron bloques de horario válidos.');
            }
        } else {
            alert('No hay docentes para importar (ya están en PTC o no están en la whitelist).');
        }
    }

    function extractCourseInfo(str) {
        // Example: C.L.3319-EC-CRT-VES-111M-12460-NAME-INFO
        const parts = str.split('-');
        
        let sede = 'Sede';
        const sedes = ['ATE', 'VES', 'NOR', 'AQP', 'SJL', 'CAL', 'CIX'];
        sedes.forEach(s => { if (str.includes(s)) sede = s; });

        let modality = 'Presencial';
        if (str.includes('VIRTUAL') || str.includes('ASINCRONO')) modality = 'Virtual';
        if (str.includes('PRC')) modality = 'Presencial';
        if (str.includes('HYB')) modality = 'Híbrido';

        // Name extraction: Often the longest part or indices 6+
        // Let's try to find the part between the NRC (numbers) and the "I CICLO"
        let name = str.substring(0, 30) + '...'; // Fallback
        
        // Better name extraction:
        const match = str.match(/\d+-(.*?)-[IV]+ CICLO/);
        if (match && match[1]) {
            name = match[1].trim();
        } else if (parts.length > 7) {
            name = parts[7];
        } else if (parts.length > 6) {
            name = parts[6];
        }

        return { name, modality, sede };
    }

    if (form) form.onsubmit = (e) => {
        e.preventDefault();
        saveCourse();
    };

    if (addScheduleBlockBtn) addScheduleBlockBtn.onclick = () => addScheduleBlock();

    function addScheduleBlock(data = {}) {
        const block = document.createElement('div');
        block.className = 'schedule-block';
        
        const blockId = Date.now() + Math.random().toString(36).substr(2, 9);
        
        block.innerHTML = `
            <button type="button" class="remove-block-btn" title="Eliminar este horario">&times;</button>
            <div class="form-row">
                <div class="form-group">
                    <label>Hora Inicio</label>
                    <input type="time" name="startTime" value="${data.startTime || ''}" required>
                </div>
                <div class="form-group">
                    <label>Hora Fin</label>
                    <input type="time" name="endTime" value="${data.endTime || ''}" required>
                </div>
            </div>
            <div class="form-group">
                <label>Días</label>
                <div class="days-checklist">
                    ${[0,1,2,3,4,5,6].map(d => {
                        const daysShort = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
                        const checked = data.days && data.days.includes(d) ? 'checked' : '';
                        return `<label><input type="checkbox" name="days_${blockId}" value="${d}" ${checked}> ${daysShort[d]}</label>`;
                    }).join('')}
                </div>
            </div>
        `;
        
        block.querySelector('.remove-block-btn').onclick = () => {
            if (schedulesContainer.querySelectorAll('.schedule-block').length > 1) {
                block.remove();
            } else {
                alert('El curso debe tener al menos un horario.');
            }
        };
        
        schedulesContainer.appendChild(block);
    }

    deleteBtn.onclick = () => {
        const name = document.getElementById('courseName').value;
        const owner = document.getElementById('courseUserSelect').value;
        const modality = document.getElementById('courseModality').value;
        const sede = document.getElementById('courseSede').value;
        
        if (confirm(`¿Eliminar TODO el curso "${name}" (todos sus horarios)?`)) {
            removeCourseGroup(owner, name, modality, sede);
        }
    };

    async function removeCourseGroup(owner, name, modality, sede) {
        try {
            const oldName = document.getElementById('oldCourseName').value || name;
            const oldOwner = (document.getElementById('oldCourseUser').value || owner).trim().toUpperCase();
            const oldModality = document.getElementById('oldCourseModality').value || modality;
            const oldSede = document.getElementById('oldCourseSede').value || sede;
            const oldSection = document.getElementById('oldCourseSection').value || '';
            const oldNRC = document.getElementById('oldCourseNRC').value || '';

            const related = (courses[oldOwner] || []).filter(c => 
                c.name === oldName && 
                c.modality === oldModality && 
                c.sede === oldSede &&
                (c.section || '') === oldSection &&
                (c.nrc || '') === oldNRC
            );
            
            if (related.length === 0) {
                console.warn('No related records found to delete.');
            }

            for (const c of related) {
                await removeFromSupabase(c.id, c.sourceTable);
            }
        } catch (err) {
            console.error('Error in removeCourseGroup:', err);
        } finally {
            modal.style.display = 'none';
            await loadFromSupabase();
        }
    }

    document.getElementById('deleteDayBtn').onclick = async () => {
        const id = document.getElementById('courseId').value;
        const owner = document.getElementById('courseUserSelect').value;
        const clickedDay = parseInt(document.getElementById('clickedDay').value);
        if (confirm('¿Eliminar solo este día?')) {
            await removeCourseDay(id, owner, clickedDay);
        }
    };



    function initGrid(visiblePeriods = null) {
        gridBody.innerHTML = '';
        const totalMinutes = (END_HOUR - START_HOUR) * 60;
        const totalPeriods = Math.ceil(totalMinutes / MINUTES_PER_PERIOD);
        
        periodToIndexMap = {};
        let currentIndex = 0;

        for (let i = 0; i < totalPeriods; i++) {
            // If we have a filter and this period isn't in it, skip
            if (visiblePeriods && !visiblePeriods.has(i)) continue;

            periodToIndexMap[i] = currentIndex;

            const startMin = i * MINUTES_PER_PERIOD;
            const endMin = (i + 1) * MINUTES_PER_PERIOD;
            
            const formatTime = (totalMin) => {
                const h = Math.floor((START_HOUR * 60 + totalMin) / 60);
                const m = (START_HOUR * 60 + totalMin) % 60;
                return `${h}:${m.toString().padStart(2, '0')}`;
            };

            const timeStr = `${formatTime(startMin)} - ${formatTime(endMin)}`;

            const row = document.createElement('div');
            row.className = 'hour-row';
            row.style.top = `${currentIndex * PIXELS_PER_PERIOD}px`;
            row.style.height = `${PIXELS_PER_PERIOD}px`;
            
            if (i === 15) {
                row.innerHTML = `
                    <div class="hour-label" style="background-color: #493a4d; color: white; display: flex; flex-direction: column; justify-content: center; line-height: 1.1;">
                        <span>${timeStr}</span>
                        <span style="font-size: 0.65rem; color: #fbbf24; font-weight: bold;">TURNO NOCHE</span>
                    </div>
                    ${'<div class="grid-cell" style="border-top: 2px solid #493a4d;"></div>'.repeat(6)}
                `;
            } else {
                row.innerHTML = `
                    <div class="hour-label">${timeStr}</div>
                    ${'<div class="grid-cell"></div>'.repeat(6)}
                `;
            }
            gridBody.appendChild(row);
            currentIndex++;
        }
        gridBody.style.height = `${currentIndex * PIXELS_PER_PERIOD}px`;
    }

    function renderCourses() {
        const existingCards = document.querySelectorAll('.course-card');
        existingCards.forEach(c => c.remove());

        const activeCoursesList = [];
        const renderedCourseKeys = new Set();
        
        const junio1El = document.getElementById('junio1Check');
        const junio2El = document.getElementById('junio2Check');
        const agosto1El = document.getElementById('agosto1Check') || document.getElementById('mod1Check');
        const agosto2El = document.getElementById('agosto2Check') || document.getElementById('mod2Check');
        const setiembre1El = document.getElementById('setiembre1Check') || document.getElementById('abril1Check');
        const setiembre2El = document.getElementById('setiembre2Check') || document.getElementById('abril2Check');
        const octubre1El = document.getElementById('octubre1Check');
        const octubre2El = document.getElementById('octubre2Check');

        const showJunio1 = junio1El ? junio1El.checked : true;
        const showJunio2 = junio2El ? junio2El.checked : true;
        const showAgosto1 = agosto1El ? agosto1El.checked : true;
        const showAgosto2 = agosto2El ? agosto2El.checked : true;
        const showSetiembre1 = setiembre1El ? setiembre1El.checked : true;
        const showSetiembre2 = setiembre2El ? setiembre2El.checked : true;
        const showOctubre1 = octubre1El ? octubre1El.checked : true;
        const showOctubre2 = octubre2El ? octubre2El.checked : true;

        const isCourseVisible = (c) => {
            const p = (c.periodo || '').toUpperCase();
            const m = (c.modulo || '').toString();

            if (p === '' && m === '') {
                return showJunio1 || showJunio2 || showAgosto1 || showAgosto2 || showSetiembre1 || showSetiembre2 || showOctubre1 || showOctubre2;
            }

            if (showJunio1 && (p === 'JUN' || p === 'JUNIO') && m === '1') return true;
            if (showJunio2 && (p === 'JUN' || p === 'JUNIO') && m === '2') return true;
            if (showAgosto1 && (p === 'AGO' || p === 'AGOSTO') && m === '1') return true;
            if (showAgosto2 && (p === 'AGO' || p === 'AGOSTO') && m === '2') return true;
            if (showSetiembre1 && (p === 'SET' || p === 'SETIEMBRE' || p === 'SEPTIEMBRE') && m === '1') return true;
            if (showSetiembre2 && (p === 'SET' || p === 'SETIEMBRE' || p === 'SEPTIEMBRE') && m === '2') return true;
            if (showOctubre1 && (p === 'OCT' || p === 'OCTUBRE') && m === '1') return true;
            if (showOctubre2 && (p === 'OCT' || p === 'OCTUBRE') && m === '2') return true;

            return false;
        };

        activeUsers.forEach(user => {
            if (isMasterMode && courses[user]) {
                courses[user].forEach(c => {
                    if (!isCourseVisible(c)) return;
                    activeCoursesList.push({ ...c, user });
                });
            }
            
            const userDniMap = {
                'EDUARDO': '46069339',
                'JOSÉ': '41403863',
                'JOSE': '41403863',
                'JORGE': '70092982',
                'CARLOS': '8133862',
                'LUIS': '40073403',
                'MIRKO': '42670470'
            };
            let customDnis = JSON.parse(localStorage.getItem('cot_custom_dnis')) || {};
            const reqDni = userDniMap[user.trim().toUpperCase()] || customDnis[user.trim().toUpperCase()];

            Object.keys(googleSheetCourses).forEach(gsUser => {
                const normalizedGsUser = gsUser.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const normalizedUser = user.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const isMatch = normalizedGsUser.includes(normalizedUser);

                googleSheetCourses[gsUser].forEach(c => {
                    if (reqDni) {
                        if (c.dni === reqDni || c.dni === reqDni.padStart(8, '0')) {
                            if (!isCourseVisible(c)) return;
                            const courseKey = `${c.dni}-${c.nrc}-${c.startTime}-${c.days[0]}`;
                            if (!renderedCourseKeys.has(courseKey)) {
                                activeCoursesList.push({ ...c, user: gsUser });
                                renderedCourseKeys.add(courseKey);
                            }
                        }
                    } else if (isMatch) {
                        if (!isCourseVisible(c)) return;
                        const courseKey = `${c.dni}-${c.nrc}-${c.startTime}-${c.days[0]}`;
                        if (!renderedCourseKeys.has(courseKey)) {
                            activeCoursesList.push({ ...c, user: gsUser });
                            renderedCourseKeys.add(courseKey);
                        }
                    }
                });
            });
        });

        if (isMasterMode && activeGroup === 'PTC' && courses['TODOS']) {
            courses['TODOS'].forEach(c => activeCoursesList.push({ ...c, user: 'TODOS' }));
        }

        // --- Dynamic Grid logic ---
        const activePeriods = new Set();
        activePeriods.add(15); // Ensure TURNO NOCHE divider (18:15) always appears
        
        activeCoursesList.forEach(course => {
            const start = timeToMinutes(course.startTime) - (START_HOUR * 60);
            const end = timeToMinutes(course.endTime) - (START_HOUR * 60);
            
            const startPeriod = Math.floor(start / MINUTES_PER_PERIOD);
            const endPeriod = Math.ceil(end / MINUTES_PER_PERIOD);
            
            for (let p = startPeriod; p < endPeriod; p++) {
                activePeriods.add(p);
            }
        });

        // Re-init grid with only these periods (or all if none selected yet)
        if (activePeriods.size > 0 && activeUsers.size > 0) {
            initGrid(activePeriods);
        } else {
            initGrid(); // Show all if no one selected or no courses
        }
        // --- End Dynamic Grid logic ---

        const coursesByDay = [[], [], [], [], [], []]; // 6 days (excluding Sunday)
        activeCoursesList.forEach(course => {
            course.days.forEach(day => {
                if (day < 6) coursesByDay[day].push(course);
            });
        });

        // For each day, find overlapping groups and render them
        for (let day = 0; day < 6; day++) { // Iterate for 6 days (Monday-Saturday)
            const dayCourses = coursesByDay[day];
            renderDayCourses(dayCourses, day);
        }
        renderTeacherStats(activeCoursesList);
    }

    function renderDayCourses(dayCourses, day) {
        if (dayCourses.length === 0) return;

        // Simple overlap logic: check for concurrent courses
        // Rank courses by start time
        dayCourses.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

        dayCourses.forEach((course, index) => {
            // Check how many other active courses for this day overlap with this one
            const overlaps = dayCourses.filter(other => {
                if (course.id === other.id && course.user === other.user) return false;
                const start1 = timeToMinutes(course.startTime);
                const end1 = timeToMinutes(course.endTime);
                const start2 = timeToMinutes(other.startTime);
                const end2 = timeToMinutes(other.endTime);
                return (start1 < end2 && start2 < end1);
            });

            const card = createCourseCard(course, day, overlaps.length, dayCourses);
            gridBody.appendChild(card);
        });
    }

    function createCourseCard(course, day, overlapCount, allDayCourses) {
        const startRaw = timeToMinutes(course.startTime) - (START_HOUR * 60);
        const endRaw = timeToMinutes(course.endTime) - (START_HOUR * 60);
        const durationMin = endRaw - startRaw;
        
        const startPeriod = Math.floor(startRaw / MINUTES_PER_PERIOD);
        const mappedIndex = periodToIndexMap[startPeriod] ?? -1;
        
        // Offset within the period if the course doesn't start exactly at the boundary
        const subPeriodOffset = (startRaw % MINUTES_PER_PERIOD) / MINUTES_PER_PERIOD;
        
        const top = (mappedIndex + subPeriodOffset) * PIXELS_PER_PERIOD;
        const height = (durationMin / MINUTES_PER_PERIOD) * PIXELS_PER_PERIOD;
        
        // Horizontal positioning logic for overlaps
        // We look for concurrent courses and divide the width
        let concurrent = allDayCourses.filter(other => {
            const s1 = timeToMinutes(course.startTime);
            const e1 = timeToMinutes(course.endTime);
            const s2 = timeToMinutes(other.startTime);
            const e2 = timeToMinutes(other.endTime);
            return (s1 < e2 && s2 < e1);
        });

        const overlapIndex = concurrent.findIndex(c => c.id === course.id && c.user === course.user);
        const totalConcurrent = concurrent.length;

        const cellWidth = (gridBody.offsetWidth - 120) / 6;
        const cardWidth = (cellWidth - 4) / totalConcurrent;
        const left = 120 + (day * cellWidth) + (overlapIndex * cardWidth) + 2;

        const card = document.createElement('div');
        const isShort = durationMin <= 90;
        const isTiny = durationMin <= 45;
        
        card.className = `course-card ${isMasterMode ? 'master-card' : ''} ${isShort ? 'card-short' : ''} ${isTiny ? 'card-tiny' : ''}`;
        card.dataset.user = course.user;
        card.style.top = `${top}px`;
        card.style.height = `${height}px`;
        card.style.left = `${left}px`;
        card.style.width = `${cardWidth - 4}px`;
        
        const cleanName = course.user.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const userColorVar = getUserColor(cleanName);

        let nrcSecText = "";
        if (course.nrc) nrcSecText += `NRC: ${course.nrc} `;
        if (course.section) nrcSecText += `Sec: ${course.section}`;
        
        let roomText = course.room ? ` - Salón: ${course.room}` : "";
        
        const cantHoras = Math.round(durationMin / MINUTES_PER_PERIOD);
        const horasText = `${cantHoras} ${cantHoras === 1 ? 'hora' : 'horas'}`;

        if (isShort || isTiny) {
            // Priority: NRC -> Time -> Name -> Mod -> Sede -> User
            card.innerHTML = `
                ${nrcSecText ? `<div class="course-info nrc-info" style="font-weight:700; font-size: 0.65rem; color: #1e40af;">${nrcSecText}</div>` : ''}
                <div class="course-info time-info" style="font-weight:600;">${course.startTime} - ${course.endTime} (${horasText})</div>
                <div class="course-name" title="${course.name}">${course.name}</div>
                <div class="course-info sede-info"><span class="info-label">Sede:</span> ${course.sede}${roomText}</div>
                <div class="course-info mod-info"><span class="info-label">Mod:</span> ${course.modality}</div>
                <span class="user-tag" style="color: ${userColorVar}">${course.user}</span>
            `;
        } else {
            card.innerHTML = `
                <div class="course-name" title="${course.name}">${course.name}</div>
                <span class="user-tag" style="color: ${userColorVar}">${course.user}</span>
                ${nrcSecText ? `<div class="course-info nrc-info" style="font-weight:600;">${nrcSecText}</div>` : ''}
                <div class="course-info time-info">${course.startTime} - ${course.endTime} (${horasText})</div>
                <div class="course-info sede-info"><span class="info-label">Sede:</span> ${course.sede}${roomText}</div>
                <div class="course-info mod-info"><span class="info-label">Mod:</span> ${course.modality}</div>
            `;
        }

        // Apply background and border color if teacher is not one of the hardcoded BTC ones
        // The hardcoded ones have data-user CSS rules, others will use this fallback
        const hardcoded = ["eduardo", "jose", "jorge", "carlos", "mirko", "luis"];
        if (!hardcoded.includes(cleanName)) {
            card.style.borderLeft = `4px solid ${userColorVar}`;
            // Add slight transparency by appending '15' (hex for ~8% opacity) if it's a hex code, or use a trick for variables
            if (userColorVar.startsWith('#')) {
                card.style.backgroundColor = `${userColorVar}15`;
            } else {
                card.style.backgroundColor = `${userColorVar}15`; // Variables still have fallback
            }
        }

        if (course.modality?.toLowerCase() === 'virtual') {
            card.style.border = '2px dashed #64748b';
            // Use an overlay to keep the teacher color visible
            card.style.backgroundImage = 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.4) 5px, rgba(255,255,255,0.4) 10px)';
        } else if (course.sede?.toUpperCase() === 'OTROS' || course.sede?.toUpperCase() === 'OTRO') {
            card.style.backgroundColor = '#f1f5f9';
            card.style.opacity = '0.9';
        }

        card.onclick = (e) => {
            e.stopPropagation();
            if (typeof isMasterMode !== 'undefined' && isMasterMode) {
                openModal(course, course.user, day);
            } else {
                openCourseDetail(course, course.user);
            }
        };
        return card;
    }

    function openModal(course = null, owner = null, clickedDay = null) {
        updateModalUserSelect(); // Ensure correct users show up for the active group
        form.reset();
        schedulesContainer.innerHTML = '';
        const deleteOptions = document.getElementById('deleteOptions');
        deleteOptions.classList.add('hidden');
        document.getElementById('modalTitle').innerText = course ? 'Editar Curso' : 'Nuevo Curso';
        document.getElementById('clickedDay').value = clickedDay !== null ? clickedDay : '';
        
        // Reset original values
        document.getElementById('oldCourseName').value = '';
        document.getElementById('oldCourseUser').value = '';
        document.getElementById('oldCourseModality').value = '';
        document.getElementById('oldCourseSede').value = '';
        
        const userSelect = document.getElementById('courseUserSelect');
        userSelect.disabled = false;

        if (course) {
            document.getElementById('courseId').value = course.id;
            document.getElementById('courseName').value = course.name;
            document.getElementById('courseModality').value = course.modality;
            document.getElementById('courseSede').value = course.sede;
            
            document.getElementById('oldCourseName').value = course.name;
            document.getElementById('oldCourseUser').value = owner.trim().toUpperCase();
            document.getElementById('oldCourseModality').value = course.modality;
            document.getElementById('oldCourseSede').value = course.sede;
            document.getElementById('oldCourseSection').value = course.section || '';
            document.getElementById('oldCourseNRC').value = course.nrc || '';

            document.getElementById('courseSection').value = course.section || '';
            document.getElementById('courseNRC').value = course.nrc || '';
            document.getElementById('courseRoom').value = course.room || '';
            
            if (owner && !Array.from(userSelect.options).some(o => o.value.toUpperCase() === owner.toUpperCase())) {
                const opt = document.createElement('option');
                opt.value = owner.toUpperCase();
                opt.textContent = owner.toUpperCase();
                userSelect.appendChild(opt);
            }
            userSelect.value = owner.toUpperCase();
            userSelect.disabled = true;

            // Normalize modality to Title Case for dropdown compatibility
            if (course.modality) {
                const m = course.modality.toLowerCase();
                if (m === 'virtual') document.getElementById('courseModality').value = 'Virtual';
                else if (m === 'presencial') document.getElementById('courseModality').value = 'Presencial';
                else if (m === 'híbrido' || m === 'hibrido') document.getElementById('courseModality').value = 'Híbrido';
            }

            // Find all related schedules (soft grouping)
            const relatedSchedules = (courses[owner] || []).filter(c => 
                c.name === course.name && 
                c.modality === course.modality && 
                c.sede === course.sede &&
                (c.section || '') === (course.section || '') &&
                (c.nrc || '') === (course.nrc || '')
            );

            relatedSchedules.forEach(s => addScheduleBlock(s));
            
            deleteOptions.classList.remove('hidden');
            
            if (relatedSchedules.some(s => s.days.length > 1) || relatedSchedules.length > 1) {
                document.getElementById('deleteDayBtn').style.display = 'block';
            } else {
                document.getElementById('deleteDayBtn').style.display = 'none';
            }
        } else {
            addScheduleBlock();
        }

        modal.style.display = 'block';
    }

    // Vista de detalle (solo lectura) decorada y horizontal en una sola pantalla
    function openCourseDetail(course, owner) {
        const detailModal = document.getElementById('courseDetailModal');
        const body = document.getElementById('courseDetailBody');
        if (!detailModal || !body) return;

        const daysNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
        const dayText = (course.days && course.days.length)
            ? course.days.map(d => daysNames[d]).filter(Boolean).join(', ')
            : '—';
        const horarioText = (course.startTime && course.endTime)
            ? `${course.startTime} - ${course.endTime}`
            : '—';

        const docenteNombre = (owner || course.user || '—').toUpperCase();
        const docenteLider = getDocenteLider(docenteNombre, course.sede, course.dni);
        const cicloText = getCiclo(course);
        const cursoLider = getLiderCurso(course.name, cicloText);

        let queryParts = [];
        if (course.section && String(course.section).trim() !== '' && String(course.section).trim() !== '—') {
            queryParts.push(String(course.section).trim());
        }
        if (course.nrc && String(course.nrc).trim() !== '' && String(course.nrc).trim() !== '—') {
            queryParts.push(String(course.nrc).trim());
        }
        const queryStr = queryParts.join('|');
        const campusUrl = queryStr 
            ? `https://campusdigital.certus.edu.pe/course/search.php?areaids=core_course-course&q=${encodeURIComponent(queryStr)}`
            : `https://campusdigital.certus.edu.pe/course/search.php`;

        const periodoModulo = (course.periodo || course.modulo)
            ? `${course.periodo || ''} ${course.modulo ? '· Mod ' + course.modulo : ''}`.trim()
            : 'Período Regular';
        const tipoInsText = getTipoInstitucion(course);

        body.innerHTML = `
            <!-- Cabecera Decorativa Compacta con Gradiente -->
            <div style="background: linear-gradient(135deg, #32213b 0%, #714b67 50%, #985b88 100%); padding: 14px 24px; color: #ffffff; position: relative; border-bottom: 2px solid #f1f5f9; display: flex; flex-direction: column; justify-content: center;">
                <button type="button" id="courseDetailCloseBtnTop" style="position: absolute; top: 16px; right: 20px; background: rgba(255,255,255,0.18); border: none; color: #ffffff; width: 28px; height: 28px; border-radius: 50%; font-size: 1.1rem; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">&times;</button>
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 6px;">
                    <span style="background: rgba(255, 255, 255, 0.24); color: #ffffff; font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 10px; letter-spacing: 0.4px; text-transform: uppercase;">
                        <i class="fas fa-bookmark" style="margin-right: 4px;"></i> ${course.modality || 'PRESENCIAL'}
                    </span>
                    <span style="background: #fbbf24; color: #1e1b4b; font-size: 0.7rem; font-weight: 800; padding: 2px 8px; border-radius: 10px; text-transform: uppercase;">
                        <i class="far fa-calendar-check" style="margin-right: 4px;"></i> ${periodoModulo}
                    </span>
                    <span style="background: rgba(16, 185, 129, 0.28); border: 1px solid rgba(16, 185, 129, 0.45); color: #ffffff; font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 10px; letter-spacing: 0.4px; text-transform: uppercase;">
                        <i class="fas fa-layer-group" style="margin-right: 4px;"></i> ${cicloText}
                    </span>
                    <span style="background: #38bdf8; color: #0f172a; font-size: 0.7rem; font-weight: 800; padding: 2px 8px; border-radius: 10px; text-transform: uppercase; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
                        <i class="fas fa-university" style="margin-right: 4px;"></i> ${tipoInsText}
                    </span>
                </div>
                <h2 style="margin: 0; font-size: 1.3rem; font-weight: 700; letter-spacing: -0.2px; line-height: 1.2; color: #ffffff; padding-right: 30px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${course.name || '—'}
                </h2>
            </div>

            <!-- Contenido Principal - 3 Columnas Horizontales Fijas (Sin Scroll) -->
            <div style="padding: 16px 24px; background: #fbf9fc; display: flex; flex-direction: column;">
                <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; align-items: stretch;">
                    
                    <!-- Columna 1: Docente y Sede -->
                    <div style="background: #ffffff; border: 1px solid #e8e2ec; border-radius: 10px; padding: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); display: flex; flex-direction: column; justify-content: space-between;">
                        <div>
                            <div style="font-size: 0.72rem; font-weight: 800; color: #8c768a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: flex; align-items: center; gap: 5px;">
                                <i class="fas fa-user-tie" style="font-size: 0.9rem; color: #714b67;"></i> Datos del Docente
                            </div>
                            <div style="font-size: 0.98rem; font-weight: 700; color: #2d1e32; margin-bottom: 4px; line-height: 1.2;">
                                ${docenteNombre}
                            </div>
                            ${course.dni ? `<div style="font-size: 0.8rem; color: #64748b; margin-bottom: 8px;"><i class="fas fa-id-card" style="margin-right:4px; color:#94a3b8;"></i> DNI: <strong style="color:#334155;">${course.dni}</strong></div>` : ''}
                        </div>
                        <div style="background: #fdf2f8; border-left: 4px solid #e11d48; padding: 8px 10px; border-radius: 0 6px 6px 0; margin-top: 8px;">
                            <span style="font-size: 0.65rem; font-weight: 700; color: #9f1239; display: block; text-transform: uppercase; letter-spacing: 0.3px;">Sede Asignada</span>
                            <span style="font-size: 0.92rem; font-weight: 800; color: #881337; display: block; margin-top: 1px;"><i class="fas fa-map-marker-alt" style="margin-right: 4px; color: #e11d48;"></i> ${course.sede || '—'}</span>
                        </div>
                    </div>

                    <!-- Columna 2: Programación y Datos del Curso -->
                    <div style="background: #ffffff; border: 1px solid #e8e2ec; border-radius: 10px; padding: 14px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); display: flex; flex-direction: column; justify-content: space-between;">
                        <div>
                            <div style="font-size: 0.72rem; font-weight: 800; color: #8c768a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: flex; align-items: center; gap: 5px;">
                                <i class="fas fa-calendar-alt" style="font-size: 0.9rem; color: #6366f1;"></i> Programación y Aula
                            </div>
                            <div style="margin-bottom: 8px;">
                                <div style="font-size: 0.72rem; font-weight:600; color: #64748b; text-transform: uppercase;">Días y Horario:</div>
                                <div style="font-size: 0.9rem; font-weight: 700; color: #1e293b; margin-top: 2px;"><i class="far fa-clock" style="color:#10b981; margin-right:4px;"></i> ${dayText} (${horarioText})</div>
                            </div>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; border-top: 1px dashed #e2e8f0; padding-top: 10px;">
                            <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 5px 4px; border-radius: 6px; text-align: center;">
                                <span style="font-size: 0.60rem; font-weight: 700; color: #64748b; display: block; text-transform: uppercase;">SECCIÓN</span>
                                <span style="font-size: 0.85rem; font-weight: 800; color: #0f172a; display: block; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${course.section || '—'}</span>
                            </div>
                            <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 5px 4px; border-radius: 6px; text-align: center;">
                                <span style="font-size: 0.60rem; font-weight: 700; color: #3b82f6; display: block; text-transform: uppercase;">NRC</span>
                                <span style="font-size: 0.85rem; font-weight: 800; color: #1e40af; display: block; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${course.nrc || '—'}</span>
                            </div>
                            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 5px 4px; border-radius: 6px; text-align: center;">
                                <span style="font-size: 0.60rem; font-weight: 700; color: #16a34a; display: block; text-transform: uppercase;">CICLO</span>
                                <span style="font-size: 0.85rem; font-weight: 800; color: #14532d; display: block; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${cicloText}</span>
                            </div>
                            <div style="background: #fdf4ff; border: 1px solid #f3e8ff; padding: 5px 4px; border-radius: 6px; text-align: center;">
                                <span style="font-size: 0.60rem; font-weight: 700; color: #9333ea; display: block; text-transform: uppercase;">NIVEL</span>
                                <span style="font-size: 0.85rem; font-weight: 800; color: #581c87; display: block; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${tipoInsText}</span>
                            </div>
                            ${course.room ? `
                            <div style="grid-column: span 2; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 5px; border-radius: 6px; text-align: center;">
                                <span style="font-size: 0.60rem; font-weight: 700; color: #10b981; display: block; text-transform: uppercase;">SALÓN</span>
                                <span style="font-size: 0.85rem; font-weight: 800; color: #065f46; display: block; margin-top: 1px;">${course.room}</span>
                            </div>` : ''}
                        </div>
                    </div>

                    <!-- Columna 3: Líderes Académicos (Resaltado Especial) -->
                    <div style="background: linear-gradient(145deg, #f8f5fb 0%, #f0e6f5 100%); border: 1.5px solid #d4c1df; border-radius: 10px; padding: 14px; box-shadow: 0 4px 10px rgba(113, 75, 103, 0.06); display: flex; flex-direction: column; justify-content: space-between;">
                        <div>
                            <div style="font-size: 0.72rem; font-weight: 800; color: #613957; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; display: flex; align-items: center; gap: 5px;">
                                <i class="fas fa-sitemap" style="color: #d97706; font-size: 0.9rem;"></i> Liderazgo y Coordinación
                            </div>
                            
                            <div style="margin-bottom: 8px; background: #ffffff; padding: 8px 10px; border-radius: 6px; border-left: 4px solid #714b67; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                                <span style="font-size: 0.64rem; font-weight: 700; color: #714b67; text-transform: uppercase; display: block;">Líder del Docente (Sede / PLN)</span>
                                <span style="font-size: 0.86rem; font-weight: 700; color: #2d1e32; display: block; margin-top: 2px;">
                                    <i class="fas fa-user-check" style="color: #714b67; margin-right: 4px; font-size: 0.8rem;"></i> ${docenteLider || '—'}
                                </span>
                            </div>

                            <div style="background: #ffffff; padding: 8px 10px; border-radius: 6px; border-left: 4px solid #9e6490; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                                <span style="font-size: 0.64rem; font-weight: 700; color: #9e6490; text-transform: uppercase; display: block;">Líder del Curso (Unidad Didact.)</span>
                                <span style="font-size: 0.86rem; font-weight: 700; color: #2d1e32; display: block; margin-top: 2px;">
                                    <i class="fas fa-graduation-cap" style="color: #9e6490; margin-right: 4px; font-size: 0.8rem;"></i> ${cursoLider || '—'}
                                </span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            <!-- Barra Inferior Fija -->
            <div style="padding: 12px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;">
                <a href="${campusUrl}" target="_blank" rel="noopener noreferrer" 
                   style="display: inline-flex; align-items: center; gap: 8px; background: linear-gradient(135deg, #714b67 0%, #493a4d 100%); color: #ffffff; font-size: 0.88rem; font-weight: 700; padding: 9px 18px; border-radius: 8px; text-decoration: none; box-shadow: 0 3px 8px rgba(113, 75, 103, 0.25); transition: opacity 0.2s;">
                    <i class="fas fa-external-link-alt" style="font-size: 0.95rem; color: #fbbf24;"></i> 
                    <span>Buscar en Campus Digital Certus <strong>${queryStr ? `(${queryStr})` : ''}</strong></span>
                </a>
                
                <button type="button" id="courseDetailCloseBtnBottom" 
                        style="background: #ffffff; color: #475569; border: 1px solid #cbd5e1; font-weight: 700; font-size: 0.85rem; padding: 8px 18px; border-radius: 8px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.05); transition: all 0.2s;">
                    <i class="fas fa-times" style="margin-right: 4px;"></i> Cerrar ventana
                </button>
            </div>
        `;

        detailModal.style.display = 'flex';

        // Bind events to buttons inside dynamically rendered HTML
        const closeTop = document.getElementById('courseDetailCloseBtnTop');
        const closeBot = document.getElementById('courseDetailCloseBtnBottom');
        const closeModalHandler = () => { detailModal.style.display = 'none'; };
        if (closeTop) closeTop.onclick = closeModalHandler;
        if (closeBot) closeBot.onclick = closeModalHandler;
    }

    async function saveCourse() {
        let owner = document.getElementById('courseUserSelect').value.trim().toUpperCase();
        if (isMasterMode) owner = 'EDUARDO'; // Force Eduardo in Master Mode
        
        const name = document.getElementById('courseName').value;
        const modality = document.getElementById('courseModality').value;
        const sede = document.getElementById('courseSede').value;
        const section = document.getElementById('courseSection').value;
        const nrc = document.getElementById('courseNRC').value;
        const room = document.getElementById('courseRoom').value;
        const isEditing = !!document.getElementById('courseId').value;

        const scheduleBlocks = schedulesContainer.querySelectorAll('.schedule-block');
        const newSchedules = [];

        for (const block of scheduleBlocks) {
            const startTime = block.querySelector('input[name="startTime"]').value;
            const endTime = block.querySelector('input[name="endTime"]').value;
            const daysCheckboxes = block.querySelectorAll('input[type="checkbox"]:checked');
            const days = Array.from(daysCheckboxes).map(cb => parseInt(cb.value));

            if (days.length === 0) {
                alert('Cada bloque de horario debe tener al menos un día seleccionado');
                return;
            }
            if (!startTime || !endTime) {
                alert('Por favor completa las horas de inicio y fin');
                return;
            }

            newSchedules.push({ startTime, endTime, days });
        }

        // If editing, find and remove old related records first to avoid duplicates or orphans
        if (isEditing) {
            const oldName = document.getElementById('oldCourseName').value;
            const oldOwner = document.getElementById('oldCourseUser').value.trim().toUpperCase();
            const oldModality = document.getElementById('oldCourseModality').value;
            const oldSede = document.getElementById('oldCourseSede').value;
            const oldSection = document.getElementById('oldCourseSection').value;
            const oldNRC = document.getElementById('oldCourseNRC').value;

            // Use original values to find related records, in case user changed name/owner/etc.
            const related = (courses[oldOwner] || []).filter(c => 
                c.name === oldName && 
                c.modality === oldModality && 
                c.sede === oldSede &&
                (c.section || '') === oldSection &&
                (c.nrc || '') === oldNRC
            );
            
            for (const c of related) {
                await removeFromSupabase(c.id, c.sourceTable);
            }
        }

        const successBtn = form.querySelector('.success-btn');
        const originalBtnText = successBtn.innerText;
        successBtn.disabled = true;
        successBtn.innerText = 'Guardando...';

        try {
            // Save all blocks as new records
            for (const sched of newSchedules) {
                const newCourse = {
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                    name,
                    modality,
                    sede,
                    section,
                    nrc,
                    room,
                    startTime: sched.startTime,
                    endTime: sched.endTime,
                    days: sched.days
                };
                
                let targetTable = 'cot_horarios';
                if (groups["OTROS"] && groups["OTROS"].includes(owner.trim().toUpperCase())) {
                    targetTable = 'cot_horarios_externos';
                }
                
                await saveToSupabase(newCourse, owner, targetTable);
            }
        } finally {
            successBtn.disabled = false;
            successBtn.innerText = originalBtnText;
            modal.style.display = 'none';
            await loadFromSupabase();
        }
    }

    async function removeCourse(id, owner) {
        const course = (courses[owner] || []).find(c => c.id === id);
        await removeFromSupabase(id, course ? course.sourceTable : 'cot_horarios');
        modal.style.display = 'none';
        await loadFromSupabase();
    }

    async function removeCourseDay(id, owner, day) {
        const course = (courses[owner] || []).find(c => c.id === id);
        if (course) {
            course.days = course.days.filter(d => d !== day);
            if (course.days.length === 0) {
                await removeFromSupabase(id, course.sourceTable);
            } else {
                await saveToSupabase(course, owner, course.sourceTable);
            }
        }
        modal.style.display = 'none';
        await loadFromSupabase();
    }

    function persist() {
        // No longer needed for Supabase version, but keep as fallback if desired
        localStorage.setItem('cot_horarios', JSON.stringify(courses));
    }

    function timeToMinutes(timeStr) {
        if (!timeStr) return 0;
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    }

    // --- CSV to Excel Converter Logic ---
    const btnConvertExcel = document.getElementById('btnConvertExcel');

    if (btnConvertExcel) {
        btnConvertExcel.addEventListener('click', async () => {
            const originalText = btnConvertExcel.innerHTML;
            btnConvertExcel.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando Excel...';
            btnConvertExcel.disabled = true;

            try {
                // Download the CSV from the source Google Sheet
                const res = await fetch('https://docs.google.com/spreadsheets/d/1kjTbXxll7tWa76whBj04P-7cBV7EkOwEhM4OK3CukIs/export?format=csv&t=' + Date.now());
                if (!res.ok) throw new Error("Error downloading CSV");
                
                const blob = await res.blob();
                const data = await processRawCSVToExcelData(blob);
                
                if (data.length === 0) {
                    alert('No se encontraron datos procesables en el archivo origen.');
                } else {
                    const ws = XLSX.utils.json_to_sheet(data);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, "CARGA_HORARIA");
                    XLSX.writeFile(wb, "CARGA_HORARIA.xlsx");
                }
            } catch (err) {
                console.error(err);
                alert('Error al generar el archivo Excel.');
            } finally {
                btnConvertExcel.innerHTML = originalText;
                btnConvertExcel.disabled = false;
            }
        });
    }

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



    function processRawCSVToExcelData(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    // Dynamically detect encoding (UTF-8 with fatal check, fallback to Windows-1252)
                    let decodedString;
                    try {
                        const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
                        decodedString = utf8Decoder.decode(data);
                    } catch (err) {
                        const win1252Decoder = new TextDecoder("windows-1252");
                        decodedString = win1252Decoder.decode(data);
                    }
                    
                    const workbook = XLSX.read(decodedString, { type: 'string' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

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

                    const groups = new Map(); 

                    for (let i = headerRowIdx + 1; i < rawData.length; i++) {
                        const row = rawData[i];
                        if (!row || row.length === 0) continue;

                        let dni = String(row[dniIdx] || "").trim();
                        if (!dni || dni === "nan" || !/^\d+$/.test(dni)) continue;
                        
                        const name = String(row[nameIdx] || "").trim();
                        let hInicioStr = String(row[horaInicioIdx] || "").trim();
                        let hFinStr = String(row[horaFinIdx] || "").trim();

                        if (hInicioStr.length === 7) hInicioStr = "0" + hInicioStr; 
                        if (hFinStr.length === 7) hFinStr = "0" + hFinStr;
                        
                        const hInicio = hInicioStr.substring(0, 5);
                        const hFin = hFinStr.substring(0, 5);

                        dayIndices.forEach(dObj => {
                            const cellValue = String(row[dObj.idx] || "").trim();
                            if (!cellValue || cellValue === "nan" || cellValue.startsWith('#')) return;

                            const entries = cellValue.split(/(?=C\.L\.)/);

                            for (let entry of entries) {
                                entry = entry.trim();
                                if (!entry) continue;

                                const contextualSede = colSedeMap.get(dObj.idx) || "VIRTUAL";
                                const parsed = parseCourseStringToRow(entry, contextualSede);
                                
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

                    const results = [];
                    groups.forEach((groupData, key) => {
                        const { parsed, dni, name, blocks } = groupData;
                        
                        const dayMap = {};
                        blocks.forEach(b => {
                            if (!dayMap[b.day]) dayMap[b.day] = [];
                            dayMap[b.day].push(b);
                        });

                        const horariosDias = [];
                        const horariosHoras = [];

                        const dayOrder = { 'LUNES': 1, 'MARTES': 2, 'MIERCOLES': 3, 'JUEVES': 4, 'VIERNES': 5, 'SABADO': 6, 'DOMINGO': 7 };
                        const sortedDays = Object.keys(dayMap).sort((a, b) => dayOrder[a] - dayOrder[b]);

                        sortedDays.forEach(day => {
                            const bList = dayMap[day];
                            bList.sort((a, b) => a.start.localeCompare(b.start));
                            
                            let currentStart = bList[0].start;
                            let currentEnd = bList[0].end;
                            
                            for (let i = 1; i < bList.length; i++) {
                                if (bList[i].start === currentEnd) {
                                    currentEnd = bList[i].end;
                                } else {
                                    horariosDias.push(`(${day})`);
                                    const prefix = (parsed.modalidad === 'VIRTUAL') ? 'VIR ' : 'PRE ';
                                    horariosHoras.push(`(${prefix}${currentStart}-${currentEnd})`);
                                    currentStart = bList[i].start;
                                    currentEnd = bList[i].end;
                                }
                            }
                            horariosDias.push(`(${day})`);
                            const prefix = (parsed.modalidad === 'VIRTUAL') ? 'VIR ' : 'PRE ';
                            horariosHoras.push(`(${prefix}${currentStart}-${currentEnd})`);
                        });

                        const turno = parsed.seccion ? parsed.seccion.slice(-1) : "";
                        const key1 = `${dni}${name.substring(0, 3).toUpperCase()}`;
                        const key2 = `${parsed.carga}${parsed.seccion}${parsed.modulo}${parsed.nrc}`;

                        const dStr = horariosDias.join('');
                        const hStr = horariosHoras.join('');
                        
                        const fullCourseText = `Curso: ${parsed.curso}/Periodo: ${parsed.periodo}/Módulo: ${parsed.modulo}/Sede: ${parsed.sedeCorta}/Modalidad: ${parsed.modalidad}/Días: ${dStr}/Horas: ${hStr}/Sección: ${parsed.seccion}/NRC: ${parsed.nrc}`;

                        const rowResult = {
                            "Carga": parsed.carga,
                            "DNI": dni,
                            "Nombres y Apellidos": name,
                            "Sede": parsed.sedeLarga,
                            "Curso": parsed.curso,
                            "Sección": parsed.seccion,
                            "Módulo": parsed.modulo,
                            "NRC": parsed.nrc,
                            "Horas": blocks.length,
                            "Key 1": key1,
                            "Key 2": key2,
                            "Periodo": parsed.periodo,
                            "TURNO": turno,
                            "SEDE": parsed.sedeCorta,
                            "CICLO": parsed.ciclo,
                            "MODALIDAD": parsed.modalidad,
                            "HORARIO (DÍAS)": dStr,
                            "HORARIO (HORAS)": hStr,
                            "ÁREA": "" // Adding AREA column as placeholder
                        };

                        const allDays = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];
                        allDays.forEach(d => {
                            if (dayMap[d]) {
                                rowResult[d] = fullCourseText;
                            } else {
                                rowResult[d] = "";
                            }
                        });

                        results.push(rowResult);
                    });

                    resolve(results);
                } catch (err) {
                    reject(err);
                }
            };

            reader.onerror = (err) => reject(err);
            reader.readAsArrayBuffer(file);
        });
    }

    window.processRawCSVToExcelData = processRawCSVToExcelData; // Expose for testing
    window.addEventListener('resize', renderCourses);
});
