/**
 * Buscador y Carga Docente - Equipo COT PLN 2026
 * Lógica de negocio, consumo de datos y filtrado mediante casillas de verificación nativas (ENE, MARZO, ABRIL, JUNIO)
 */

// ==========================================================================
// CONFIGURACIÓN Y CONSTANTES
// ==========================================================================
const SPREADSHEET_ID = '1kNqEDwXe5Iqj9m54E--_WEe2wKxjTschDLgYnXeBS7w';
const GIDS = {
    contabilidad: '899705187',
    pensamiento: '1197163147',
    docentes: '1494951945',
    carga: '1470879596',
    docentes_carga: '1460914670' // Contiene Responsables y horas asignadas Mod 1/2
};

const ITEMS_PER_PAGE = 50;

// Mapeo estático de Campus a nombres amigables
const CAMPUS_NAMES = {
    'CRT00': 'Principal',
    'CRT01': 'Virtual',
    'CRT02': 'ATE',
    'CRT03': 'Arequipa',
    'CRT04': 'Chiclayo',
    'CRT05': 'Norte',
    'CRT06': 'San Juan de Lurigancho',
    'CRT07': 'Villa El Salvador'
};

// Fallback de códigos de ciclo lectivo a meses correspondientes
const CARGA_CODE_TO_MONTH = {
    '3313': 'ENE', '3314': 'ENE', '3315': 'ENE', '3316': 'ENE',
    '3317': 'MARZO', '3318': 'MARZO', '3319': 'MARZO', '3320': 'MARZO',
    '3328': 'ABRIL', '3329': 'ABRIL', '3330': 'ABRIL', '3331': 'ABRIL',
    '3334': 'JUNIO', '3335': 'JUNIO', '3336': 'JUNIO', '3337': 'JUNIO'
};

// Mapeo de compresión de claves
const KEY_MAP = {
    'DNI': 'd',
    'Nombre estudiante': 'n',
    'Ciclo estudiante': 'c',
    'Ciclo UD': 'u',
    'N_Clase': 'cl',
    'Seccion': 's',
    'Curso': 'cu',
    'ID_Curso': 'id',
    'Catalogo': 'ca',
    'Campus': 'cp',
    'Descripcion_Campus_Clase': 'dc',
    'DOCENTE': 't',
    'Correo CERTUS': 'e',
    'DIAS': 'dy',
    'HORAS': 'h',
    'Ciclo_Lectivo': 'clv',
    'MODULO': 'm',
    'Telef_1': 't1',
    'Telef_2': 't2',
    'Correo-E': 'ce',
    'Descr _2': 'd2'
};

const DOC_KEY_MAP = {
    'APELLIDOS Y NOMBRES': 'n',
    'DNI': 'd',
    'CORREO': 'e',
    'ÁREA': 'a',
    'TIPO DE CONTRATO': 't',
    'HORAS SEGÚN CONTRATO': 'hc',
    'SEDE PRINCIPAL': 'sp',
    'TELÉFONO': 'p',
    'N°': 'no',
    'lider': 'r',
    'col10': 'c10',
    'col11': 'c11',
    'Ene 1': 'e1',
    'Ene 2 + Mar 1': 'em1',
    'Mar 2 + Abr 1 + Jun 1': 'maj1',
    'Abr 2 + Jun 2': 'aj2'
};

const CARGA_KEY_MAP = {
    'period': 'p',
    'dni': 'd',
    'name': 'n',
    'module': 'm',
    'area': 'a'
};

// ==========================================================================
// ESTADO GLOBAL
// ==========================================================================
let appData = {
    contabilidad: [],
    pensamiento: [],
    docentes: [],
    carga: [],
    codeToMonth: {},
    syncTime: null
};

// Opciones de segmentación extraídas dinámicamente
let globalSlicerOptions = {
    areas: []
};

// Filtros activos por pestaña (búsqueda y paginación)
let activeFilters = {
    contabilidad: { search: '', campus: 'all', modulo: 'all', ciclo: 'all', page: 1 },
    pensamiento: { search: '', campus: 'all', modulo: 'all', ciclo: 'all', page: 1 },
    docentes: { search: '', area: 'all', page: 1 },
    reporte: { search: '', area: 'all', page: 1 }
};

// Combo de periodos activo para Reporte (A, B, o C). Por defecto: B
// A = ENE 2 + MAR 1 | B = MAR 2 + ABR 1 + JUN 1 | C = ABR 2 + JUN 2
let activeReporteCombo = 'B';

// Mapa de periodos por combo (month lowercase + module number)
const COMBO_PERIODS = {
    A: ['ene2', 'marzo1'],
    B: ['marzo2', 'abril1', 'junio1'],
    C: ['abril2', 'junio2']
};

// ==========================================================================
// LIFE CYCLE & THEME SELECTION & UTILS
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupTabSwitching();
    setupEventListeners();
    loadData();
});

function initTheme() {
    const savedTheme = localStorage.getItem('cot-buscador-theme') || 'light';
    const btn = document.getElementById('themeToggleBtn');
    if (savedTheme === 'dark') {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
        if (btn) btn.innerHTML = '<i class="fas fa-sun"></i>';
    } else {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        if (btn) btn.innerHTML = '<i class="fas fa-moon"></i>';
    }
    if (btn) {
        btn.addEventListener('click', () => {
            if (document.body.classList.contains('light-theme')) {
                document.body.classList.remove('light-theme');
                document.body.classList.add('dark-theme');
                localStorage.setItem('cot-buscador-theme', 'dark');
                btn.innerHTML = '<i class="fas fa-sun"></i>';
            } else {
                document.body.classList.remove('dark-theme');
                document.body.classList.add('light-theme');
                localStorage.setItem('cot-buscador-theme', 'light');
                btn.innerHTML = '<i class="fas fa-moon"></i>';
            }
        });
    }
}

function setupTabSwitching() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const tabId = btn.getAttribute('data-tab');
            const tabPanes = document.querySelectorAll('.tab-pane');
            tabPanes.forEach(pane => {
                if (pane.id === tabId) {
                    pane.classList.add('active');
                } else {
                    pane.classList.remove('active');
                }
            });
            renderActiveTab();
        });
    });
}

function normalizeText(val) {
    if (val === null || val === undefined) return '';
    return val.toString().toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function parseCSV(text) {
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentCell += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            currentRow.push(currentCell);
            currentCell = '';
        } else if ((char === '\r' || char === '\n') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
                i++;
            }
            currentRow.push(currentCell);
            rows.push(currentRow);
            currentRow = [];
            currentCell = '';
        } else {
            currentCell += char;
        }
    }
    if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell);
        rows.push(currentRow);
    }
    return rows;
}

function parseDaysCount(dias) {
    if (!dias) return 1;
    const matches = dias.match(/\(/g);
    if (matches) return matches.length;
    const clean = dias.replace(/[()]/g, '').trim();
    if (!clean) return 1;
    const parts = clean.split(/[\s,/-]+/);
    return Math.max(1, parts.filter(p => p.trim().length > 2).length);
}

function parseClassHours(horas) {
    if (!horas) return 0;
    const matchSingle = horas.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (!matchSingle) return 0;
    const startH = parseInt(matchSingle[1]);
    const startM = parseInt(matchSingle[2]);
    const endH = parseInt(matchSingle[3]);
    const endM = parseInt(matchSingle[4]);
    return ((endH * 60 + endM) - (startH * 60 + startM)) / 45;
}

function getPeriodMonth(code) {
    return appData.codeToMonth[code] || CARGA_CODE_TO_MONTH[code] || '';
}

function compressData(data) {
    return {
        co: data.contabilidad.map(item => {
            const res = {};
            for (const k in KEY_MAP) {
                if (item[k] !== undefined) res[KEY_MAP[k]] = item[k];
            }
            return res;
        }),
        pe: data.pensamiento.map(item => {
            const res = {};
            for (const k in KEY_MAP) {
                if (item[k] !== undefined) res[KEY_MAP[k]] = item[k];
            }
            return res;
        }),
        do: data.docentes.map(item => {
            const res = {};
            for (const k in DOC_KEY_MAP) {
                if (item[k] !== undefined) res[DOC_KEY_MAP[k]] = item[k];
            }
            return res;
        }),
        ca: data.carga.map(item => {
            const res = {};
            for (const k in CARGA_KEY_MAP) {
                if (item[k] !== undefined) res[CARGA_KEY_MAP[k]] = item[k];
            }
            return res;
        }),
        cm: data.codeToMonth || {},
        st: data.syncTime
    };
}

function decompressData(compressed) {
    const decompressed = {
        contabilidad: [],
        pensamiento: [],
        docentes: [],
        carga: [],
        codeToMonth: compressed.cm || {},
        syncTime: compressed.st || null
    };

    const REV_KEY_MAP = {};
    for (const k in KEY_MAP) REV_KEY_MAP[KEY_MAP[k]] = k;

    const REV_DOC_KEY_MAP = {};
    for (const k in DOC_KEY_MAP) REV_DOC_KEY_MAP[DOC_KEY_MAP[k]] = k;

    if (compressed.co) {
        compressed.co.forEach(item => {
            const res = {};
            for (const k in item) {
                const origKey = REV_KEY_MAP[k];
                if (origKey) res[origKey] = item[k];
            }
            decompressed.contabilidad.push(res);
        });
    }

    if (compressed.pe) {
        compressed.pe.forEach(item => {
            const res = {};
            for (const k in item) {
                const origKey = REV_KEY_MAP[k];
                if (origKey) res[origKey] = item[k];
            }
            decompressed.pensamiento.push(res);
        });
    }

    if (compressed.do) {
        compressed.do.forEach(item => {
            const res = {};
            for (const k in item) {
                const origKey = REV_DOC_KEY_MAP[k];
                if (origKey) res[origKey] = item[k];
            }
            if (res['lider'] === undefined) res['lider'] = '';
            if (res['col10'] === undefined) res['col10'] = 0;
            if (res['col11'] === undefined) res['col11'] = 0;
            res['Ene 1'] = parseFloat(res['Ene 1']) || 0;
            res['Ene 2 + Mar 1'] = parseFloat(res['Ene 2 + Mar 1']) || 0;
            res['Mar 2 + Abr 1 + Jun 1'] = parseFloat(res['Mar 2 + Abr 1 + Jun 1']) || 0;
            res['Abr 2 + Jun 2'] = parseFloat(res['Abr 2 + Jun 2']) || 0;
            decompressed.docentes.push(res);
        });
    }

    if (compressed.ca) {
        compressed.ca.forEach(item => {
            decompressed.carga.push({
                period: item.p || '',
                dni: item.d || '',
                name: item.n || '',
                module: item.m || '',
                area: item.a || ''
            });
        });
    }

    return decompressed;
}

// ==========================================================================
// CARGA Y SINCRONIZACIÓN DE DATOS
// ==========================================================================
async function loadData(forceSync = false) {
    const cachedData = localStorage.getItem('cot-buscador-data-v4');
    const syncTime = document.getElementById('syncTime');
    const syncBtn = document.getElementById('syncBtn');

    if (cachedData && !forceSync) {
        try {
            const compressed = JSON.parse(cachedData);
            appData = decompressData(compressed);
            syncTime.innerText = `Sincronizado: ${appData.syncTime}`;
            initSlicerOptions();
            initDropdownFilters();
            renderActiveTab();
            return;
        } catch (e) {
            console.error("Error al cargar caché, re-sincronizando...", e);
        }
    }

    syncTime.innerText = "Sincronizando...";
    syncBtn.classList.add('spinning');
    
    try {
        const [contaText, pensamientoText, docentesText, cargaText, docentesCargaText] = await Promise.all([
            fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${GIDS.contabilidad}`).then(r => r.text()),
            fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${GIDS.pensamiento}`).then(r => r.text()),
            fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${GIDS.docentes}`).then(r => r.text()),
            fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${GIDS.carga}`).then(r => r.text()),
            fetch(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${GIDS.docentes_carga}`).then(r => r.text())
        ]);

        // Construir mapa de Líderes y Horas Asignadas (col10 y col11) por DNI
        const rawDocentesCarga = parseCSV(docentesCargaText);
        const headersCargaTab = rawDocentesCarga[0];
        const dniCargaIdx = headersCargaTab.indexOf('DNI');
        const respCargaIdx = headersCargaTab.indexOf('Responsable');
        
        const dniToWorkload = {};
        if (dniCargaIdx !== -1) {
            rawDocentesCarga.slice(1).forEach(row => {
                const dniVal = row[dniCargaIdx];
                if (dniVal) {
                    dniToWorkload[dniVal.trim()] = {
                        lider: respCargaIdx !== -1 ? row[respCargaIdx].trim() : '',
                        col10: parseFloat(row[10]) || 0,
                        col11: parseFloat(row[11]) || 0
                    };
                }
            });
        }

        // Construir mapa de periodos dinámicamente
        const rawCarga = parseCSV(cargaText);
        const periodIdx = rawCarga[0].indexOf('Periodo');
        const cargaCodeIdx = rawCarga[0].indexOf('Carga');
        appData.codeToMonth = {};
        rawCarga.slice(1).forEach(row => {
            const code = row[cargaCodeIdx];
            const periodName = row[periodIdx];
            if (code && periodName) {
                appData.codeToMonth[code] = periodName;
            }
        });

        // Fusionar fallback estático para mayor seguridad
        Object.keys(CARGA_CODE_TO_MONTH).forEach(code => {
            if (!appData.codeToMonth[code]) {
                appData.codeToMonth[code] = CARGA_CODE_TO_MONTH[code];
            }
        });

        const STU_FIELDS = [
            'DNI', 'Nombre estudiante', 'Ciclo estudiante', 'Ciclo UD', 
            'N_Clase', 'Seccion', 'Curso', 'ID_Curso', 'Catalogo', 
            'Campus', 'Descripcion_Campus_Clase', 'DOCENTE', 'Correo CERTUS', 
            'DIAS', 'HORAS', 'Ciclo_Lectivo', 'MODULO',
            'Telef_1', 'Telef_2', 'Correo-E', 'Descr _2'
        ];

        // Procesar Contabilidad
        const rawConta = parseCSV(contaText);
        const headersConta = rawConta[0];
        appData.contabilidad = rawConta.slice(1).map(row => {
            const obj = {};
            headersConta.forEach((h, i) => {
                if (STU_FIELDS.includes(h)) {
                    obj[h] = row[i] || '';
                }
            });
            return obj;
        });

        // Procesar Pensamiento
        const rawPensamiento = parseCSV(pensamientoText);
        const headersPensamiento = rawPensamiento[0];
        appData.pensamiento = rawPensamiento.slice(1).map(row => {
            const obj = {};
            headersPensamiento.forEach((h, i) => {
                if (STU_FIELDS.includes(h)) {
                    obj[h] = row[i] || '';
                }
            });
            return obj;
        });

        // Procesar Docentes (Enriqueciendo con col10, col11 y líder)
        const rawDocentes = parseCSV(docentesText);
        const headersDocentes = rawDocentes[0];
        appData.docentes = rawDocentes.slice(1).map(row => {
            const obj = {};
            headersDocentes.forEach((h, i) => {
                obj[h.trim()] = row[i] || '';
            });
            
            const dni = obj['DNI'] ? obj['DNI'].trim() : '';
            const w = dniToWorkload[dni] || { lider: '', col10: 0, col11: 0 };
            obj['lider'] = (obj['LÍDER'] || obj['LIDER'] || w.lider || '').trim();
            obj['col10'] = w.col10;
            obj['col11'] = w.col11;
            obj['Ene 1'] = parseFloat(obj['Ene 1']) || 0;
            obj['Ene 2 + Mar 1'] = parseFloat(obj['Ene 2 + Mar 1']) || 0;
            obj['Mar 2 + Abr 1 + Jun 1'] = parseFloat(obj['Mar 2 + Abr 1 + Jun 1']) || 0;
            obj['Abr 2 + Jun 2'] = parseFloat(obj['Abr 2 + Jun 2']) || 0;
            return obj;
        });

        // Procesar Carga Horaria
        appData.carga = rawCarga.slice(1).map(row => {
            return {
                period: row[0] || '', 
                dni: row[1] || '',
                name: row[2] || '',
                module: row[6] || '', 
                area: row[18] || ''  
            };
        });

        const now = new Date();
        const formattedTime = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        appData.syncTime = formattedTime;

        // Guardar en localStorage
        try {
            const compressed = compressData(appData);
            localStorage.setItem('cot-buscador-data-v4', JSON.stringify(compressed));
        } catch (e) {
            console.warn("Failed to save to localStorage. Continuing with in-memory state.", e);
        }
        
        syncTime.innerText = `Sincronizado: ${formattedTime}`;
        
        initSlicerOptions();
        initDropdownFilters();
        renderActiveTab();
    } catch (err) {
        console.error("Error al sincronizar datos:", err);
        syncTime.innerText = "Error de sincronización";
        alert("Ocurrió un error al descargar la información de Google Sheets.");
    } finally {
        syncBtn.classList.remove('spinning');
    }
}

// Extraer opciones de segmentación extraídas dinámicamente
function initSlicerOptions() {
    globalSlicerOptions.areas = [...new Set(appData.docentes.map(x => x['ÁREA']).filter(Boolean))].sort();
}

// Llenar selectores dropdown
function initDropdownFilters() {
    const fillSedeSelect = (selectId, dataset) => {
        const select = document.getElementById(selectId);
        if (!select) return;
        const sedes = [...new Set(dataset.map(x => x.Campus).filter(Boolean))].sort();
        select.innerHTML = '<option value="all">Todos los Campus</option>';
        sedes.forEach(s => {
            const friendlyName = CAMPUS_NAMES[s] || s;
            select.innerHTML += `<option value="${s}">${friendlyName}</option>`;
        });
    };

    fillSedeSelect('filter-sede-conta', appData.contabilidad);
    fillSedeSelect('filter-sede-pln', appData.pensamiento);

    // Dropdown de áreas en Docentes
    const areaDocSelect = document.getElementById('filter-area-doc');
    if (areaDocSelect) {
        areaDocSelect.innerHTML = '<option value="all">Todas las Áreas</option>';
        globalSlicerOptions.areas.forEach(a => {
            areaDocSelect.innerHTML += `<option value="${a}">${a}</option>`;
        });
        areaDocSelect.value = activeFilters.docentes.area;
    }
}

// ==========================================================================
// RENDERIZADO DE SEGMENTADORES (NO HACEN NADA YA QUE ESTÁN ESTRUCTURADOS EN EL HTML)
// ==========================================================================
function renderTabSlicers(tabKey) {
    // No hacemos nada dinámico aquí ya que las casillas están en el HTML estático
}

// ==========================================================================
// LEER ESTADOS DE LOS CHECKBOXES DE FILTROS DIRECTAMENTE DE LA PÁGINA
// ==========================================================================
function isPeriodModuleActive(tabKey, code, module) {
    const month = getPeriodMonth(code);
    if (!month) return false;
    const mod = module || '1';
    const key = `${month.toLowerCase()}${mod}`;

    // Para el tab Reporte: usa el combo activo (mutualmente exclusivos)
    if (tabKey === 'reporte') {
        const activePeriods = COMBO_PERIODS[activeReporteCombo] || [];
        return activePeriods.includes(key);
    }

    // Para los demás tabs: usa checkboxes individuales
    const prefix = tabKey === 'contabilidad' ? 'chk-conta-' :
                   tabKey === 'pensamiento' ? 'chk-pln-' : 'chk-doc-';
    const el = document.getElementById(`${prefix}${key}`);
    return el ? el.checked : false;
}

function getActiveContractsDoc() {
    const contracts = new Set();
    const mapping = {
        'ptp': 'PTP',
        'ptc': 'PTC',
        'ptd': 'PTD',
        'pph': 'PPH',
        'tcxh': 'TCxH',
        'ptcin': 'PTC IN'
    };
    Object.keys(mapping).forEach(id => {
        const el = document.getElementById(`chk-doc-${id}`);
        if (el && el.checked) {
            contracts.add(mapping[id]);
        }
    });
    return contracts;
}

function getActiveContractsRep() {
    const contracts = new Set();
    const mapping = {
        'ptp': 'PTP',
        'ptc': 'PTC',
        'ptd': 'PTD',
        'tcxh': 'TCxH',
        'ptcin': 'PTC IN',
        'pph': 'PPH'
    };
    Object.keys(mapping).forEach(id => {
        const el = document.getElementById(`chk-rep-${id}`);
        if (el && el.checked) {
            contracts.add(mapping[id]);
        }
    });
    return contracts;
}

// Verifica si un tipo de contrato coincide EXACTAMENTE con los contratos activos
// (evita que PTC coincida con PTC IN)
function contractMatchesActive(contractType, activeContracts) {
    if (activeContracts.size === 0) return false;
    const ct = (contractType || '').trim();
    return activeContracts.has(ct);
}

function teacherMatchesPeriodAndModule(tabKey, teacherName) {
    const normName = normalizeText(teacherName);
    
    if (tabKey === 'reporte') {
        const docObj = appData.docentes.find(d => normalizeText(d['APELLIDOS Y NOMBRES']) === normName);
        if (docObj) {
            let programmedHours = 0;
            if (activeReporteCombo === 'A') {
                programmedHours = docObj['Ene 2 + Mar 1'] || 0;
            } else if (activeReporteCombo === 'B') {
                programmedHours = docObj['Mar 2 + Abr 1 + Jun 1'] || 0;
            } else if (activeReporteCombo === 'C') {
                programmedHours = docObj['Abr 2 + Jun 2'] || 0;
            }
            if (programmedHours > 0) return true;
        }
    }

    return appData.carga.some(c => {
        if (normalizeText(c.name) !== normName) return false;
        return isPeriodModuleActive(tabKey, c.period, c.module);
    });
}

// ==========================================================================
// CONTROLADORES DE RENDERIZADO DE TABLAS
// ==========================================================================
function renderActiveTab() {
    const activeBtn = document.querySelector('.tab-btn.active');
    if (!activeBtn) return;
    const tabName = activeBtn.getAttribute('data-tab').replace('tab-', '');
    renderTab(tabName);
}

function renderTab(tabName) {
    if (tabName === 'contabilidad') renderContabilidad();
    else if (tabName === 'pensamiento') renderPensamiento();
    else if (tabName === 'docentes') renderDocentes();
    else if (tabName === 'reporte') renderReporte();
}
// 1. Renderizar Estudiantes Contabilidad
function renderContabilidad() {
    const filters = activeFilters.contabilidad;
    const query = normalizeText(filters.search);
    
    let filtered = appData.contabilidad.filter(item => {
        const matchesSearch = !query || 
            normalizeText(item['Nombre estudiante']).includes(query) ||
            normalizeText(item['DNI']).includes(query) ||
            normalizeText(item['N_Clase']).includes(query) ||
            normalizeText(item['DOCENTE']).includes(query) ||
            normalizeText(item['Curso']).includes(query);
            
        const matchesSede = filters.campus === 'all' || item['Campus'] === filters.campus;
        const matchesModulo = filters.modulo === 'all' || item['MODULO'] === filters.modulo;
        
        const studentCiclo = (item['Ciclo estudiante'] || item['Ciclo UD'] || '').toString().trim();
        const matchesCiclo = filters.ciclo === 'all' || studentCiclo === filters.ciclo;

        return matchesSearch && matchesSede && matchesModulo && matchesCiclo;
    });

    const tbody = document.getElementById('tbody-conta');
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">No se encontraron estudiantes.</td></tr>`;
        document.getElementById('pagination-conta').innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    if (filters.page > totalPages) filters.page = 1;
    
    const startIndex = (filters.page - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filtered.length);
    const paginated = filtered.slice(startIndex, endIndex);

    tbody.innerHTML = paginated.map(item => `
        <tr>
            <td class="bold-cell">${item['DNI'] || '—'}</td>
            <td class="bold-cell">
                <div>${item['Nombre estudiante']}</div>
                <div class="text-muted" style="font-size:0.75rem; font-weight:normal; margin-top:2px;">
                    <i class="fas fa-phone-alt"></i> ${item['Telef_1'] || '—'}${item['Telef_2'] ? ' / ' + item['Telef_2'] : ''}
                </div>
                <div class="text-muted" style="font-size:0.75rem; font-weight:normal; margin-top:2px;">
                    <i class="fas fa-envelope"></i> ${item['Correo-E'] || '—'}
                </div>
            </td>
            <td><span class="badge badge-turno">Ciclo ${item['Ciclo estudiante'] || item['Ciclo UD'] || '—'}</span></td>
            <td>
                <span class="badge badge-contrato">Clase: ${item['N_Clase']}</span>
                <div class="text-muted" style="font-size:0.75rem">Sección: ${item['Seccion']}</div>
            </td>
            <td>
                <div>${item['Curso']}</div>
                <div class="text-muted" style="font-size:0.75rem">ID: ${item['ID_Curso']} | Cat: ${item['Catalogo']}</div>
            </td>
            <td>
                <span class="badge badge-campus">${CAMPUS_NAMES[item['Campus']] || item['Campus'] || 'VIRTUAL'}</span>
                <div class="text-muted" style="font-size:0.75rem">${item['Descripcion_Campus_Clase'] || ''}</div>
            </td>
            <td>
                <div class="bold-cell" style="font-size:0.8rem">${item['DOCENTE'] || 'SIN DOCENTE'}</div>
                <div class="text-muted" style="font-size:0.75rem">${item['Correo CERTUS'] || ''}</div>
            </td>
            <td>
                <div style="font-size:0.8rem">${item['DIAS'] || '—'}</div>
                <div class="text-muted" style="font-size:0.75rem">${item['HORAS'] || '—'}</div>
            </td>
        </tr>
    `).join('');

    renderPagination('conta', filtered.length, filters.page, totalPages);
}

// 2. Renderizar Estudiantes Pensamiento Lógico
function renderPensamiento() {
    const filters = activeFilters.pensamiento;
    const query = normalizeText(filters.search);
    
    let filtered = appData.pensamiento.filter(item => {
        const matchesSearch = !query || 
            normalizeText(item['Nombre estudiante']).includes(query) ||
            normalizeText(item['DNI']).includes(query) ||
            normalizeText(item['N_Clase']).includes(query) ||
            normalizeText(item['DOCENTE']).includes(query) ||
            normalizeText(item['Curso']).includes(query) ||
            normalizeText(item['Descr _2']).includes(query);
            
        const matchesSede = filters.campus === 'all' || item['Campus'] === filters.campus;
        const matchesModulo = filters.modulo === 'all' || item['MODULO'] === filters.modulo;
        
        const studentCiclo = (item['Ciclo estudiante'] || item['Ciclo UD'] || '').toString().trim();
        const matchesCiclo = filters.ciclo === 'all' || studentCiclo === filters.ciclo;

        return matchesSearch && matchesSede && matchesModulo && matchesCiclo;
    });

    const tbody = document.getElementById('tbody-pln');
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">No se encontraron estudiantes.</td></tr>`;
        document.getElementById('pagination-pln').innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    if (filters.page > totalPages) filters.page = 1;
    
    const startIndex = (filters.page - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filtered.length);
    const paginated = filtered.slice(startIndex, endIndex);

    tbody.innerHTML = paginated.map(item => `
        <tr>
            <td class="bold-cell">${item['DNI'] || '—'}</td>
            <td class="bold-cell">
                <div>${item['Nombre estudiante']}</div>
                <div class="text-muted" style="font-size:0.75rem; font-weight:normal; margin-top:2px;">
                    <i class="fas fa-phone-alt"></i> ${item['Telef_1'] || '—'}${item['Telef_2'] ? ' / ' + item['Telef_2'] : ''}
                </div>
                <div class="text-muted" style="font-size:0.75rem; font-weight:normal; margin-top:2px;">
                    <i class="fas fa-envelope"></i> ${item['Correo-E'] || '—'}
                </div>
            </td>
            <td><span class="badge badge-turno">Ciclo ${item['Ciclo estudiante'] || item['Ciclo UD'] || '—'}</span></td>
            <td>
                <span class="badge badge-contrato">Clase: ${item['N_Clase']}</span>
                <div class="text-muted" style="font-size:0.75rem">Sección: ${item['Seccion']}</div>
            </td>
            <td>
                <div>${item['Descr _2'] || '—'}</div>
                <div class="text-muted" style="font-size:0.75rem">ID: ${item['ID_Curso']}</div>
            </td>
            <td>
                <span class="badge badge-campus">${CAMPUS_NAMES[item['Campus']] || item['Campus'] || 'VIRTUAL'}</span>
                <div class="text-muted" style="font-size:0.75rem">${item['Descripcion_Campus_Clase'] || ''}</div>
            </td>
            <td>
                <div class="bold-cell" style="font-size:0.8rem">${item['DOCENTE'] || 'SIN DOCENTE'}</div>
                <div class="text-muted" style="font-size:0.75rem">${item['Correo CERTUS'] || ''}</div>
            </td>
            <td>
                <div style="font-size:0.8rem">${item['DIAS'] || '—'}</div>
                <div class="text-muted" style="font-size:0.75rem">${item['HORAS'] || '—'}</div>
            </td>
        </tr>
    `).join('');

    renderPagination('pln', filtered.length, filters.page, totalPages);
}



// 3. Renderizar Docentes
function renderDocentes() {
    const filters = activeFilters.docentes;
    const query = normalizeText(filters.search);
    const activeContracts = getActiveContractsDoc();

    let filtered = appData.docentes.filter(item => {
        const matchesSearch = !query ||
            normalizeText(item['APELLIDOS Y NOMBRES']).includes(query) ||
            normalizeText(item['DNI']).includes(query) ||
            normalizeText(item['CORREO']).includes(query);
            
        const matchesArea = filters.area === 'all' || item['ÁREA'] === filters.area;
        const matchesContrato = activeContracts.size === 0 || activeContracts.has(item['TIPO DE CONTRATO']);
        const matchesPeriodMod = teacherMatchesPeriodAndModule('docentes', item['APELLIDOS Y NOMBRES']);

        return matchesSearch && matchesArea && matchesContrato && matchesPeriodMod;
    });

    const tbody = document.getElementById('tbody-doc');
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">No se encontraron docentes.</td></tr>`;
        document.getElementById('pagination-doc').innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    if (filters.page > totalPages) filters.page = 1;
    
    const startIndex = (filters.page - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filtered.length);
    const paginated = filtered.slice(startIndex, endIndex);

    tbody.innerHTML = paginated.map(item => `
        <tr>
            <td>${item['N°'] || '—'}</td>
            <td class="bold-cell">${item['DNI'] || '—'}</td>
            <td class="bold-cell">
                <div>${item['APELLIDOS Y NOMBRES']}</div>
                ${item['lider'] ? `<div class="text-muted" style="font-size:0.75rem; margin-top:2px; font-weight:500;"><i class="fas fa-user-shield" style="color:var(--primary-color)"></i> Líder: ${item['lider']}</div>` : ''}
            </td>
            <td>${item['ÁREA'] || '—'}</td>
            <td>${item['TELÉFONO'] || '—'}</td>
            <td>${item['CORREO'] || '—'}</td>
            <td><span class="badge badge-contrato">${item['TIPO DE CONTRATO'] || '—'}</span></td>
            <td class="bold-cell text-center">${item['HORAS SEGÚN CONTRATO'] || '0'} h</td>
            <td><span class="badge badge-campus">${item['SEDE PRINCIPAL'] || '—'}</span></td>
        </tr>
    `).join('');

    renderPagination('doc', filtered.length, filters.page, totalPages);
}

// Constante de horas de contrato PTC (fijas según convenio)
const PTC_CONTRACT_HOURS = 30;

// Retorna las horas asignadas según contrato del docente.
// PTC exacto: siempre 30h fijas.
// Resto (PTD=40, PTP=20, PPH=23, TCxH=variable, PTC IN=variable):
//   usa directamente la columna 'HORAS SEGÚN CONTRATO' del padrón.
// Los combos de periodos SOLO afectan las Horas Programadas (clases asignadas).
function getAssignedHoursForDoc(doc) {
    const contractType = (doc['TIPO DE CONTRATO'] || '').trim();
    if (contractType === 'PTC') {
        return PTC_CONTRACT_HOURS;
    }
    // Para todos los demás, leer directamente el campo de la hoja
    return parseFloat(doc['HORAS SEGÚN CONTRATO']) || 0;
}

// 4. Renderizar Reporte Carga Horaria Docentes
function renderReporte() {
    const filters = activeFilters.reporte;
    const query = normalizeText(filters.search);
    const activeContracts = getActiveContractsRep();
    const areaFilter = filters.area || 'all';

    const teacherClasses = {};

    function extractClasses(list, areaTag) {
        list.forEach(item => {
            const docente = item['DOCENTE'];
            const clase = item['N_Clase'];
            const dias = item['DIAS'];
            const horas = item['HORAS'];
            const code = item['Ciclo_Lectivo'] || '';
            const module = item['MODULO'] || '';
            
            if (!docente || !clase) return;

            // Solo procesar clases que caigan dentro de los periodos y módulos activos
            if (!isPeriodModuleActive('reporte', code, module)) return;

            const normDocente = normalizeText(docente);
            if (!teacherClasses[normDocente]) {
                teacherClasses[normDocente] = { hours: {}, areas: new Set() };
            }
            teacherClasses[normDocente].areas.add(areaTag);

            const uniqueKey = `${clase}_${code}_${module}`;
            if (!teacherClasses[normDocente].hours[uniqueKey]) {
                const hours = parseClassHours(horas);
                const days = parseDaysCount(dias);
                teacherClasses[normDocente].hours[uniqueKey] = hours * days;
            }
        });
    }

    extractClasses(appData.contabilidad, 'Contabilidad');
    extractClasses(appData.pensamiento, 'Pensamiento Logico');

    // Calcular las horas programadas de los docentes (sin multiplicador)
    const teacherProgrammedHours = {};
    const teacherAreas = {};
    Object.keys(teacherClasses).forEach(t => {
        let total = 0;
        Object.keys(teacherClasses[t].hours).forEach(key => {
            total += teacherClasses[t].hours[key];
        });
        teacherProgrammedHours[t] = total; // sin *2
        teacherAreas[t] = teacherClasses[t].areas;
    });

    // PTP, PTC, PTD, TCxH, PTC IN, PPH — coincidencia exacta + sin duplicados por DNI
    const seenDNI = new Set();
    let reportDocentes = appData.docentes.filter(doc => {
        const ct = (doc['TIPO DE CONTRATO'] || '').trim();
        const valid = ct === 'PTP' || ct === 'PTC' || ct === 'PTC IN' || ct === 'PTD' || ct === 'TCxH' || ct === 'PPH';
        if (!valid) return false;
        const dni = doc['DNI'];
        if (seenDNI.has(dni)) return false; // deduplicar por DNI
        seenDNI.add(dni);
        return true;
    });

    let reportData = reportDocentes.map(doc => {
        const name = doc['APELLIDOS Y NOMBRES'];
        const normName = normalizeText(name);
        const dni = doc['DNI'] || '';
        const contractType = doc['TIPO DE CONTRATO'] || '';
        
        const assignedHours = getAssignedHoursForDoc(doc);
        
        let programmedHours = 0;
        if (activeReporteCombo === 'A') {
            programmedHours = doc['Ene 2 + Mar 1'] || 0;
        } else if (activeReporteCombo === 'B') {
            programmedHours = doc['Mar 2 + Abr 1 + Jun 1'] || 0;
        } else if (activeReporteCombo === 'C') {
            programmedHours = doc['Abr 2 + Jun 2'] || 0;
        } else {
            programmedHours = teacherProgrammedHours[normName] || 0;
        }
        
        const freeHours = assignedHours - programmedHours;
        const compliance = assignedHours > 0 ? (programmedHours / assignedHours) * 100 : 0;

        let complianceStatus = 'zero';
        if (assignedHours > 0) {
            if (programmedHours === 0) complianceStatus = 'zero';
            else if (compliance < 90) complianceStatus = 'underload';
            else if (compliance <= 100) complianceStatus = 'optimal';
            else complianceStatus = 'overload';
        }

        // Determinar áreas del docente (donde enseña)
        const docenteAreas = teacherAreas[normName] || new Set();

        return {
            name,
            dni,
            contractType,
            assignedHours: Math.round(assignedHours * 10) / 10,
            programmedHours: Math.round(programmedHours * 10) / 10,
            freeHours: Math.round(freeHours * 10) / 10,
            compliance: Math.round(compliance),
            complianceStatus,
            docenteAreas
        };
    });

    // Filtrar la lista del reporte
    let filteredReport = reportData.filter(item => {
        const matchesSearch = !query || 
            normalizeText(item.name).includes(query) ||
            normalizeText(item.dni).includes(query);
            
        // Filtro de Contrato — coincidencia EXACTA (PTC no coincide con PTC IN)
        const matchesContrato = activeContracts.size === 0 || contractMatchesActive(item.contractType, activeContracts);

        // Filtro de Área (por el área donde imparte clases el docente)
        let matchesArea = areaFilter === 'all';
        if (!matchesArea) {
            matchesArea = item.docenteAreas.has(areaFilter);
        }

        // Filtro de Periodos Cruzados (docente tiene carga en los seleccionados)
        const matchesCruce = teacherMatchesPeriodAndModule('reporte', item.name);

        return matchesSearch && matchesContrato && matchesArea && matchesCruce;
    });

    const tbody = document.getElementById('tbody-report');
    if (filteredReport.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No se encontraron registros de docentes.</td></tr>`;
        document.getElementById('pagination-report').innerHTML = '';
        return;
    }

    const totalPages = Math.ceil(filteredReport.length / ITEMS_PER_PAGE);
    if (filters.page > totalPages) filters.page = 1;
    
    const startIndex = (filters.page - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredReport.length);
    const paginated = filteredReport.slice(startIndex, endIndex);

    tbody.innerHTML = paginated.map(item => {
        let barClass = 'zero';
        let badgeClass = 'zero';
        let badgeText = 'Sin Carga';
        
        if (item.complianceStatus === 'overload') {
            barClass = 'overload';
            badgeClass = 'overload';
            badgeText = 'Sobre-carga';
        } else if (item.complianceStatus === 'optimal') {
            barClass = 'optimal';
            badgeClass = 'optimal';
            badgeText = 'Óptimo';
        } else if (item.complianceStatus === 'underload') {
            barClass = 'underload';
            badgeClass = 'underload';
            badgeText = 'Sub-carga';
        }

        const barWidth = Math.min(item.compliance, 100);

        return `
            <tr>
                <td class="bold-cell">${item.name}</td>
                <td>${item.dni}</td>
                <td><span class="badge badge-contrato">${item.contractType}</span></td>
                <td class="bold-cell text-center">${item.assignedHours} h</td>
                <td class="bold-cell text-center">${item.programmedHours} h</td>
                <td class="bold-cell text-center" style="color: ${item.freeHours < 0 ? '#ef4444' : 'inherit'}">${item.freeHours} h</td>
                <td>
                    <div class="compliance-container">
                        <div class="compliance-info">
                            <span>${item.compliance}%</span>
                            <span class="load-pill ${badgeClass}">${badgeText}</span>
                        </div>
                        <div class="prog-bar-bg">
                            <div class="prog-bar-fill ${barClass}" style="width: ${barWidth}%;"></div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    renderPagination('report', filteredReport.length, filters.page, totalPages);
}

// (KPI cards removed - function no longer needed)

// ==========================================================================
// COMPONENTE DE PAGINACIÓN
// ==========================================================================
function renderPagination(tabKey, totalItems, currentPage, totalPages) {
    const container = document.getElementById(`pagination-${tabKey}`);
    if (!container) return;

    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE + 1;
    const endIdx = Math.min(startIdx + ITEMS_PER_PAGE - 1, totalItems);

    let html = `
        <div>
            Mostrando <span class="bold-cell">${startIdx}</span> a <span class="bold-cell">${endIdx}</span> de <span class="bold-cell">${totalItems}</span> registros
        </div>
        <div class="pagination-controls">
            <button class="pag-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage('${tabKey}', ${currentPage - 1})">
                <i class="fas fa-chevron-left"></i> Ant.
            </button>
    `;

    const maxButtons = 5;
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    
    if (endPage - startPage < maxButtons - 1) {
        startPage = Math.max(1, endPage - maxButtons + 1);
    }

    if (startPage > 1) {
        html += `<button class="pag-btn" onclick="changePage('${tabKey}', 1)">1</button>`;
        if (startPage > 2) html += `<span style="padding: 6px">...</span>`;
    }

    for (let p = startPage; p <= endPage; p++) {
        html += `<button class="pag-btn ${p === currentPage ? 'active' : ''}" onclick="changePage('${tabKey}', ${p})">${p}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<span style="padding: 6px">...</span>`;
        html += `<button class="pag-btn" onclick="changePage('${tabKey}', ${totalPages})">${totalPages}</button>`;
    }

    html += `
            <button class="pag-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage('${tabKey}', ${currentPage + 1})">
                Sig. <i class="fas fa-chevron-right"></i>
            </button>
        </div>
    `;

    container.innerHTML = html;
}

window.changePage = function(tabKey, pageNum) {
    activeFilters[tabKey].page = pageNum;
    renderTab(tabKey);
};

// ==========================================================================
// EVENTOS Y EXPORTACIONES
// ==========================================================================
function setupEventListeners() {
    document.getElementById('syncBtn').addEventListener('click', () => {
        loadData(true);
    });

    // Registrar oyentes de cambio en casillas de verificación nativas
    const setupCheckboxesGroup = (tabKey, prefix, ids) => {
        ids.forEach(id => {
            const el = document.getElementById(`${prefix}${id}`);
            if (el) {
                el.addEventListener('change', () => {
                    activeFilters[tabKey].page = 1;
                    renderTab(tabKey);
                });
            }
        });
    };

    // Contabilidad and Pensamiento native checkboxes removed, now using modulo and ciclo dropdowns.

    // Docentes checkboxes
    setupCheckboxesGroup('docentes', 'chk-doc-', ['ene1', 'ene2', 'marzo1', 'marzo2', 'abril1', 'abril2', 'junio1', 'junio2', 'ptp', 'ptc', 'ptd', 'pph', 'tcxh', 'ptcin']);

    // Reporte: solo checkboxes de tipo contrato (los periodos ahora son botones combo)
    setupCheckboxesGroup('reporte', 'chk-rep-', ['ptp', 'ptc', 'ptd', 'tcxh', 'ptcin', 'pph']);

    // Combo buttons de periodos para Reporte (mutualmente exclusivos)
    document.querySelectorAll('.combo-btn[data-combo]').forEach(btn => {
        btn.addEventListener('click', () => {
            const combo = btn.getAttribute('data-combo');
            activeReporteCombo = combo;
            // Desactivar todos y activar solo el seleccionado
            document.querySelectorAll('.combo-btn[data-combo]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilters.reporte.page = 1;
            renderReporte();
        });
    });

    // Filtro de área en Reporte
    const areaRepSelect = document.getElementById('filter-area-rep');
    if (areaRepSelect) {
        areaRepSelect.addEventListener('change', (e) => {
            activeFilters.reporte.area = e.target.value;
            activeFilters.reporte.page = 1;
            renderReporte();
        });
    }

    // Inputs de búsqueda y desplegables
    document.getElementById('search-conta').addEventListener('input', (e) => {
        activeFilters.contabilidad.search = e.target.value;
        activeFilters.contabilidad.page = 1;
        renderContabilidad();
    });
    document.getElementById('filter-sede-conta').addEventListener('change', (e) => {
        activeFilters.contabilidad.campus = e.target.value;
        activeFilters.contabilidad.page = 1;
        renderContabilidad();
    });
    document.getElementById('filter-modulo-conta').addEventListener('change', (e) => {
        activeFilters.contabilidad.modulo = e.target.value;
        activeFilters.contabilidad.page = 1;
        renderContabilidad();
    });
    document.getElementById('filter-ciclo-conta').addEventListener('change', (e) => {
        activeFilters.contabilidad.ciclo = e.target.value;
        activeFilters.contabilidad.page = 1;
        renderContabilidad();
    });

    document.getElementById('search-pln').addEventListener('input', (e) => {
        activeFilters.pensamiento.search = e.target.value;
        activeFilters.pensamiento.page = 1;
        renderPensamiento();
    });
    document.getElementById('filter-sede-pln').addEventListener('change', (e) => {
        activeFilters.pensamiento.campus = e.target.value;
        activeFilters.pensamiento.page = 1;
        renderPensamiento();
    });
    document.getElementById('filter-modulo-pln').addEventListener('change', (e) => {
        activeFilters.pensamiento.modulo = e.target.value;
        activeFilters.pensamiento.page = 1;
        renderPensamiento();
    });
    document.getElementById('filter-ciclo-pln').addEventListener('change', (e) => {
        activeFilters.pensamiento.ciclo = e.target.value;
        activeFilters.pensamiento.page = 1;
        renderPensamiento();
    });

    document.getElementById('search-doc').addEventListener('input', (e) => {
        activeFilters.docentes.search = e.target.value;
        activeFilters.docentes.page = 1;
        renderDocentes();
    });
    const areaDocSelect = document.getElementById('filter-area-doc');
    if (areaDocSelect) {
        areaDocSelect.addEventListener('change', (e) => {
            activeFilters.docentes.area = e.target.value;
            activeFilters.docentes.page = 1;
            renderDocentes();
        });
    }

    document.getElementById('search-report').addEventListener('input', (e) => {
        activeFilters.reporte.search = e.target.value;
        activeFilters.reporte.page = 1;
        renderReporte();
    });

    // Botones Limpiar (Reset)
    const resetCheckboxes = (prefix, ids) => {
        ids.forEach(id => {
            const el = document.getElementById(`${prefix}${id}`);
            if (el) el.checked = true;
        });
    };

    document.getElementById('reset-conta-btn').addEventListener('click', () => {
        document.getElementById('search-conta').value = '';
        document.getElementById('filter-sede-conta').value = 'all';
        document.getElementById('filter-modulo-conta').value = 'all';
        document.getElementById('filter-ciclo-conta').value = 'all';
        activeFilters.contabilidad = { search: '', campus: 'all', modulo: 'all', ciclo: 'all', page: 1 };
        renderContabilidad();
    });

    document.getElementById('reset-pln-btn').addEventListener('click', () => {
        document.getElementById('search-pln').value = '';
        document.getElementById('filter-sede-pln').value = 'all';
        document.getElementById('filter-modulo-pln').value = 'all';
        document.getElementById('filter-ciclo-pln').value = 'all';
        activeFilters.pensamiento = { search: '', campus: 'all', modulo: 'all', ciclo: 'all', page: 1 };
        renderPensamiento();
    });

    document.getElementById('reset-doc-btn').addEventListener('click', () => {
        document.getElementById('search-doc').value = '';
        if (areaDocSelect) areaDocSelect.value = 'all';
        resetCheckboxes('chk-doc-', ['ene1', 'ene2', 'marzo1', 'marzo2', 'abril1', 'abril2', 'junio1', 'junio2', 'ptp', 'ptc', 'ptd', 'pph', 'tcxh', 'ptcin']);
        activeFilters.docentes = { search: '', area: 'all', page: 1 };
        renderDocentes();
    });

    document.getElementById('reset-report-btn').addEventListener('click', () => {
        document.getElementById('search-report').value = '';
        const areaRepEl = document.getElementById('filter-area-rep');
        if (areaRepEl) areaRepEl.value = 'all';
        // Restaurar contratos: solo PTC
        ['ptp', 'ptd', 'tcxh', 'ptcin', 'pph'].forEach(id => {
            const el = document.getElementById(`chk-rep-${id}`);
            if (el) el.checked = false;
        });
        const ptcEl = document.getElementById('chk-rep-ptc');
        if (ptcEl) ptcEl.checked = true;
        // Restaurar combo a B (MAR 2 + ABR 1 + JUN 1)
        activeReporteCombo = 'B';
        document.querySelectorAll('.combo-btn[data-combo]').forEach(b => b.classList.remove('active'));
        const btnB = document.getElementById('combo-rep-B');
        if (btnB) btnB.classList.add('active');
        activeFilters.reporte = { search: '', area: 'all', page: 1 };
        renderReporte();
    });

    document.getElementById('export-conta-btn').addEventListener('click', () => exportData('contabilidad'));
    document.getElementById('export-pln-btn').addEventListener('click', () => exportData('pensamiento'));
    document.getElementById('export-doc-btn').addEventListener('click', () => exportData('docentes'));
    document.getElementById('export-report-btn').addEventListener('click', () => exportData('reporte'));
}

// Exportación en formato CSV
function exportData(tabName) {
    let dataToExport = [];
    let filename = '';
    let headers = [];

    if (tabName === 'contabilidad') {
        const filters = activeFilters.contabilidad;
        const query = normalizeText(filters.search);

        dataToExport = appData.contabilidad.filter(item => {
            const matchesSearch = !query || 
                normalizeText(item['Nombre estudiante']).includes(query) ||
                normalizeText(item['DNI']).includes(query) ||
                normalizeText(item['N_Clase']).includes(query) ||
                normalizeText(item['DOCENTE']).includes(query) ||
                normalizeText(item['Curso']).includes(query);
            const matchesSede = filters.campus === 'all' || item['Campus'] === filters.campus;
            const matchesModulo = filters.modulo === 'all' || item['MODULO'] === filters.modulo;
            const studentCiclo = (item['Ciclo estudiante'] || item['Ciclo UD'] || '').toString().trim();
            const matchesCiclo = filters.ciclo === 'all' || studentCiclo === filters.ciclo;
            return matchesSearch && matchesSede && matchesModulo && matchesCiclo;
        });
        filename = 'estudiantes_contabilidad_2026.csv';
        headers = ['DNI', 'Nombre Estudiante', 'Teléfono 1', 'Teléfono 2', 'Correo Personal', 'Curso', 'Seccion', 'Clase', 'Campus', 'Docente', 'Dias', 'Horas', 'Modulo', 'Ciclo'];
        dataToExport = dataToExport.map(x => [
            x.DNI, 
            x['Nombre estudiante'], 
            x.Telef_1 || '—', 
            x.Telef_2 || '', 
            x['Correo-E'] || '—', 
            x.Curso, 
            x.Seccion, 
            x.N_Clase, 
            CAMPUS_NAMES[x.Campus] || x.Campus, 
            x.DOCENTE, 
            x.DIAS, 
            x.HORAS, 
            x.MODULO, 
            x['Ciclo estudiante'] || x['Ciclo UD'] || '—'
        ]);
    } 
    else if (tabName === 'pensamiento') {
        const filters = activeFilters.pensamiento;
        const query = normalizeText(filters.search);

        dataToExport = appData.pensamiento.filter(item => {
            const matchesSearch = !query || 
                normalizeText(item['Nombre estudiante']).includes(query) ||
                normalizeText(item['DNI']).includes(query) ||
                normalizeText(item['N_Clase']).includes(query) ||
                normalizeText(item['DOCENTE']).includes(query) ||
                normalizeText(item['Curso']).includes(query) ||
                normalizeText(item['Descr _2']).includes(query);
            const matchesSede = filters.campus === 'all' || item['Campus'] === filters.campus;
            const matchesModulo = filters.modulo === 'all' || item['MODULO'] === filters.modulo;
            const studentCiclo = (item['Ciclo estudiante'] || item['Ciclo UD'] || '').toString().trim();
            const matchesCiclo = filters.ciclo === 'all' || studentCiclo === filters.ciclo;
            return matchesSearch && matchesSede && matchesModulo && matchesCiclo;
        });
        filename = 'estudiantes_pensamiento_logico_2026.csv';
        headers = ['DNI', 'Nombre Estudiante', 'Teléfono 1', 'Teléfono 2', 'Correo Personal', 'Carrera (Descr_2)', 'Seccion', 'Clase', 'Campus', 'Docente', 'Dias', 'Horas', 'Modulo', 'Ciclo'];
        dataToExport = dataToExport.map(x => [
            x.DNI, 
            x['Nombre estudiante'], 
            x.Telef_1 || '—', 
            x.Telef_2 || '', 
            x['Correo-E'] || '—', 
            x['Descr _2'] || '—', 
            x.Seccion, 
            x.N_Clase, 
            CAMPUS_NAMES[x.Campus] || x.Campus, 
            x.DOCENTE, 
            x.DIAS, 
            x.HORAS, 
            x.MODULO, 
            x['Ciclo estudiante'] || x['Ciclo UD'] || '—'
        ]);
    }
    else if (tabName === 'docentes') {
        const filters = activeFilters.docentes;
        const query = normalizeText(filters.search);
        const activeContracts = getActiveContractsDoc();

        dataToExport = appData.docentes.filter(item => {
            const matchesSearch = !query ||
                normalizeText(item['APELLIDOS Y NOMBRES']).includes(query) ||
                normalizeText(item['DNI']).includes(query);
            const matchesArea = filters.area === 'all' || item['ÁREA'] === filters.area;
            const matchesContrato = activeContracts.size === 0 || activeContracts.has(item['TIPO DE CONTRATO']);
            const matchesPeriodMod = teacherMatchesPeriodAndModule('docentes', item['APELLIDOS Y NOMBRES']);
            return matchesSearch && matchesArea && matchesContrato && matchesPeriodMod;
        });
        filename = 'docentes_cot_pln_2026.csv';
        headers = ['N°', 'DNI', 'Apellidos y Nombres', 'Líder de Sede', 'Área', 'Teléfono', 'Correo', 'Tipo Contrato', 'Horas Contrato', 'Sede Principal'];
        dataToExport = dataToExport.map(x => [x['N°'], x.DNI, x['APELLIDOS Y NOMBRES'], x.lider, x['ÁREA'], x['TELÉFONO'], x['CORREO'], x['TIPO DE CONTRATO'], x['HORAS SEGÚN CONTRATO'], x['SEDE PRINCIPAL']]);
    } 
    else if (tabName === 'reporte') {
        const filters = activeFilters.reporte;
        const activeContracts = getActiveContractsRep();

        const teacherClasses = {};

        function extractClasses(list) {
            list.forEach(item => {
                const docente = item['DOCENTE'];
                const clase = item['N_Clase'];
                const dias = item['DIAS'];
                const horas = item['HORAS'];
                const code = item['Ciclo_Lectivo'] || '';
                const module = item['MODULO'] || '';
                if (!docente || !clase) return;

                if (!isPeriodModuleActive('reporte', code, module)) return;

                const normDoc = normalizeText(docente);
                if (!teacherClasses[normDoc]) teacherClasses[normDoc] = {};
                
                const uniqueKey = `${clase}_${code}_${module}`;
                if (!teacherClasses[normDoc][uniqueKey]) {
                    teacherClasses[normDoc][uniqueKey] = parseClassHours(horas) * parseDaysCount(dias);
                }
            });
        }
        extractClasses(appData.contabilidad);
        extractClasses(appData.pensamiento);

        const teacherProgrammed = {};
        Object.keys(teacherClasses).forEach(t => {
            let total = 0;
            Object.keys(teacherClasses[t]).forEach(key => {
                total += teacherClasses[t][key];
            });
            teacherProgrammed[t] = total; // sin *2
        });

        const seenDNIExp = new Set();
        const reportDocentes = appData.docentes.filter(doc => {
            const ct = (doc['TIPO DE CONTRATO'] || '').trim();
            const valid = ct === 'PTP' || ct === 'PTC' || ct === 'PTC IN' || ct === 'PTD' || ct === 'TCxH' || ct === 'PPH';
            if (!valid) return false;
            const dni = doc['DNI'];
            if (seenDNIExp.has(dni)) return false;
            seenDNIExp.add(dni);
            return true;
        });

        const reportData = reportDocentes.map(doc => {
            const name = doc['APELLIDOS Y NOMBRES'];
            const normName = normalizeText(name);
            const dni = doc['DNI'] || '';
            const contractType = doc['TIPO DE CONTRATO'] || '';
            
            const assignedHours = getAssignedHoursForDoc(doc);
            
            let programmedHours = 0;
            if (activeReporteCombo === 'A') {
                programmedHours = doc['Ene 2 + Mar 1'] || 0;
            } else if (activeReporteCombo === 'B') {
                programmedHours = doc['Mar 2 + Abr 1 + Jun 1'] || 0;
            } else if (activeReporteCombo === 'C') {
                programmedHours = doc['Abr 2 + Jun 2'] || 0;
            } else {
                programmedHours = teacherProgrammed[normName] || 0;
            }
            
            const freeHours = assignedHours - programmedHours;
            const compliance = assignedHours > 0 ? (programmedHours / assignedHours) * 100 : 0;

            let compText = 'Sin Carga';
            if (compliance > 100) compText = 'Sobre-carga';
            else if (compliance >= 90) compText = 'Óptimo';
            else if (compliance > 0) compText = 'Sub-carga';

            return {
                name, dni, contractType, assignedHours,
                programmedHours: Math.round(programmedHours * 10) / 10,
                freeHours: Math.round(freeHours * 10) / 10,
                compliance: Math.round(compliance),
                compText
            };
        });

        const query = normalizeText(filters.search);
        const filteredReport = reportData.filter(item => {
            const matchesSearch = !query || normalizeText(item.name).includes(query) || normalizeText(item.dni).includes(query);
            // Exact match — PTC no coincide con PTC IN
            const matchesContrato = activeContracts.size === 0 || contractMatchesActive(item.contractType, activeContracts);
            const matchesCruce = teacherMatchesPeriodAndModule('reporte', item.name);
            return matchesSearch && matchesContrato && matchesCruce;
        });

        filename = 'reporte_carga_docente_2026.csv';
        headers = ['Docente', 'DNI', 'Tipo Contrato', 'Horas Asignadas (Contrato)', 'Horas Programadas', 'Horas Libres', 'Cumplimiento %', 'Estado de Carga'];
        dataToExport = filteredReport.map(x => [x.name, x.dni, x.contractType, x.assignedHours, x.programmedHours, x.freeHours, x.compliance, x.compText]);
    }

    if (dataToExport.length === 0) {
        alert('No hay datos para exportar.');
        return;
    }

    const csvContent = [
        headers.join(','),
        ...dataToExport.map(row => row.map(val => {
            const strVal = val !== undefined && val !== null ? val.toString() : '';
            if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
                return `"${strVal.replace(/"/g, '""')}"`;
            }
            return strVal;
        }).join(','))
    ].join('\r\n');

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}
