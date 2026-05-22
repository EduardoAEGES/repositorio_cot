/**
 * Dashboard de Asesorías Empresariales - Equipo COT 2026
 * Lógica e Interactividad
 */

// ==========================================================================
// DATASET POR DEFECTO (Datos iniciales sincronizados de Google Sheets + original)
// ==========================================================================
const DEFAULT_DATASET = [
    {
        "N_Clase": "77",
        "Curso": "EXPERIENCIA FORMATIVA (COT)-IV",
        "Estudiantes": "45",
        "DOCENTE": "PALOMINO QUISPE SAMIR ANTHONY",
        "CORREO": "SPALOMINOQ@CERTUS.EDU.PE",
        "Sede": "VIRTUAL",
        "Turno": "Noche",
        "Horario": "Miércoles 21:15 - 22:45",
        "RUC": "10463051271",
        "CELULAR": "968491373",
        "MYPE": "Corporacion Lort Mister S.A.C",
        "Estado": "x",
        // Estados detallados de coordinación (inicializados a partir del reporte original)
        "wsp": true,
        "correo": true,
        "docente_comunicado": false,
        "horario_confirmado": false,
        "observaciones": ""
    },
    {
        "N_Clase": "957",
        "Curso": "EXPERIENCIA FORMATIVA (COT)-IV",
        "Estudiantes": "14",
        "DOCENTE": "ANYAIPOMA GRANADOS THREICY",
        "CORREO": "TANYAIPOMAG@CERTUS.EDU.PE",
        "Sede": "ATE",
        "Turno": "Noche",
        "Horario": "Miércoles 19:00 - 20:30",
        "RUC": "10406346051",
        "CELULAR": "994203816",
        "MYPE": "Corporacion Textil Nieva Eirl",
        "Estado": "x",
        "wsp": true,
        "correo": false,
        "docente_comunicado": false,
        "horario_confirmado": true,
        "observaciones": "Horario confirmado para las 19:45 - 20:30."
    },
    {
        "N_Clase": "958",
        "Curso": "EXPERIENCIA FORMATIVA (COT)-IV",
        "Estudiantes": "19",
        "DOCENTE": "CHIAPPE SOTELO JOSE LUIS",
        "CORREO": "JCHIAPPES@CERTUS.EDU.PE",
        "Sede": "NORTE",
        "Turno": "Noche",
        "Horario": "Viernes 20:30 - 22:00",
        "RUC": "10414379376",
        "CELULAR": "967932718",
        "MYPE": "Tatiana Rubi Cardenas Atayauri",
        "Estado": "x",
        "wsp": true,
        "correo": true,
        "docente_comunicado": false,
        "horario_confirmado": true,
        "observaciones": "Horario asignado de 21:15 a 22:00."
    },
    {
        "N_Clase": "959",
        "Curso": "EXPERIENCIA FORMATIVA (COT)-IV",
        "Estudiantes": "27",
        "DOCENTE": "MAMANI ROQUE EDUARDO LUIS",
        "CORREO": "EMAMANIR@CERTUS.EDU.PE",
        "Sede": "AQP",
        "Turno": "Mañana",
        "Horario": "Martes 07:00 - 08:30",
        "RUC": "10441412083",
        "CELULAR": "983483735",
        "MYPE": "Empresa Confecciones Y Publicidad S.A.C.",
        "Estado": "",
        "wsp": true,
        "correo": true,
        "docente_comunicado": true,
        "horario_confirmado": true,
        "observaciones": "Horario confirmado: 07:45 - 08:30."
    },
    {
        "N_Clase": "960",
        "Curso": "EXPERIENCIA FORMATIVA (COT)-IV",
        "Estudiantes": "29",
        "DOCENTE": "PECHO GARCIA CARLOS ESTEBAN",
        "CORREO": "CPECHOG@CERTUS.EDU.PE",
        "Sede": "SURCO",
        "Turno": "Noche",
        "Horario": "Miércoles 20:30 - 22:00",
        "RUC": "10180876036",
        "CELULAR": "964078383",
        "MYPE": "Valdez Quispe De Samaniego Haydee Esther",
        "Estado": "",
        "wsp": true,
        "correo": true,
        "docente_comunicado": false,
        "horario_confirmado": false,
        "observaciones": ""
    },
    {
        "N_Clase": "961",
        "Curso": "EXPERIENCIA FORMATIVA (COT)-IV",
        "Estudiantes": "19",
        "DOCENTE": "ROSALES HUAMAN JAIME",
        "CORREO": "JROSALESH@CERTUS.EDU.PE",
        "Sede": "NORTE",
        "Turno": "Mañana",
        "Horario": "Jueves 08:30 - 10:00",
        "RUC": "10403768524",
        "CELULAR": "999376000",
        "MYPE": "Inversora Grupo Romero Sac",
        "Estado": "",
        "wsp": true,
        "correo": true,
        "docente_comunicado": false,
        "horario_confirmado": true,
        "observaciones": "Coordinado para el horario de 09:15 - 10:00."
    },
    {
        "N_Clase": "962",
        "Curso": "EXPERIENCIA FORMATIVA (COT)-IV",
        "Estudiantes": "24",
        "DOCENTE": "ALARCON BERROCAL TOMAS",
        "CORREO": "TALARCONB@CERTUS.EDU.PE",
        "Sede": "SJL",
        "Turno": "Noche",
        "Horario": "Viernes 20:30 - 22:00",
        "RUC": "10105912434",
        "CELULAR": "972712570",
        "MYPE": "Carrillo Llaguento Moises",
        "Estado": "x",
        "wsp": true,
        "correo": false,
        "docente_comunicado": false,
        "horario_confirmado": false,
        "observaciones": ""
    },
    {
        "N_Clase": "1119",
        "Curso": "EXPERIENCIA FORMATIVA (CON)-VI",
        "Estudiantes": "15",
        "DOCENTE": "PALOMINO QUISPE SAMIR ANTHONY",
        "CORREO": "SPALOMINOQ@CERTUS.EDU.PE",
        "Sede": "NORTE",
        "Turno": "Noche",
        "Horario": "Martes 19:00 - 20:30",
        "RUC": "10463051271",
        "CELULAR": "947032101",
        "MYPE": "Tuanama Layza Merlin",
        "Estado": "x",
        "wsp": true,
        "correo": true,
        "docente_comunicado": false,
        "horario_confirmado": false,
        "observaciones": ""
    },
    {
        "N_Clase": "1120",
        "Curso": "EXPERIENCIA FORMATIVA (CON)-VI",
        "Estudiantes": "26",
        "DOCENTE": "POLAR VALDIVIA ERNESTO ANTONIO",
        "CORREO": "EPOLARV@CERTUS.EDU.PE",
        "Sede": "SURCO",
        "Turno": "Noche",
        "Horario": "Martes 19:45 - 21:15",
        "RUC": "10406346051",
        "CELULAR": "928803530",
        "MYPE": "Rivas Chavez Yulay Angelo",
        "Estado": "",
        "wsp": true,
        "correo": true,
        "docente_comunicado": true,
        "horario_confirmado": true,
        "observaciones": "Horario pactado: 20:30 - 21:15."
    },
    {
        "N_Clase": "1121",
        "Curso": "EXPERIENCIA FORMATIVA (CON)-VI",
        "Estudiantes": "13",
        "DOCENTE": "ZEGARRA ESCOBEDO LIZBETH KATHERINE",
        "CORREO": "LZEGARRAE@CERTUS.EDU.PE",
        "Sede": "AQP",
        "Turno": "Mañana",
        "Horario": "Viernes 10:00 - 11:30",
        "RUC": "10414379376",
        "CELULAR": "995987659",
        "MYPE": "Leonardo Barrios Eva",
        "Estado": "",
        "wsp": true,
        "correo": true,
        "docente_comunicado": false,
        "horario_confirmado": true,
        "observaciones": "Asesoría agendada para las 10:00 - 10:44."
    },
    {
        "N_Clase": "1122",
        "Curso": "EXPERIENCIA FORMATIVA (CON)-VI",
        "Estudiantes": "14",
        "DOCENTE": "CARTOLIN FERNANDEZ OSCAR ALEXANDER",
        "CORREO": "OCARTOLINF@CERTUS.EDU.PE",
        "Sede": "ATE",
        "Turno": "Mañana",
        "Horario": "Miércoles 08:30 - 10:00",
        "RUC": "10441412083",
        "CELULAR": "964894231",
        "MYPE": "Gago Quispe Medali Liz",
        "Estado": "x",
        "wsp": true,
        "correo": true,
        "docente_comunicado": false,
        "horario_confirmado": false,
        "observaciones": ""
    },
    {
        "N_Clase": "1123",
        "Curso": "EXPERIENCIA FORMATIVA (CON)-VI",
        "Estudiantes": "16",
        "DOCENTE": "CHIAPPE SOTELO JOSE LUIS",
        "CORREO": "JCHIAPPES@CERTUS.EDU.PE",
        "Sede": "NORTE",
        "Turno": "Mañana",
        "Horario": "Martes 07:45 - 09:15",
        "RUC": "10180876036",
        "CELULAR": "952297681",
        "MYPE": "Nuñez Bardales Nancy Jhouana",
        "Estado": "x",
        "wsp": true,
        "correo": true,
        "docente_comunicado": false,
        "horario_confirmado": false,
        "observaciones": ""
    },
    {
        "N_Clase": "1435",
        "Curso": "EXPERIENCIA FORMATIVA (COT)-VI",
        "Estudiantes": "44",
        "DOCENTE": "ZEGARRA ESCOBEDO LIZBETH KATHERINE",
        "CORREO": "LZEGARRAE@CERTUS.EDU.PE",
        "Sede": "VIRTUAL",
        "Turno": "Noche",
        "Horario": "Viernes 20:30 - 22:00",
        "RUC": "10105912434",
        "CELULAR": "963982246",
        "MYPE": "Mamani Alvarado Brizaida Veronica",
        "Estado": "x",
        "wsp": true,
        "correo": true,
        "docente_comunicado": false,
        "horario_confirmado": true,
        "observaciones": "Horario establecido de 21:15 a 22:00."
    },
    {
        "N_Clase": "1516",
        "Curso": "EXPERIENCIA FORMATIVA (COT)-IV",
        "Estudiantes": "5",
        "DOCENTE": "POLAR VALDIVIA ERNESTO ANTONIO",
        "CORREO": "EPOLARV@CERTUS.EDU.PE",
        "Sede": "VIRTUAL",
        "Turno": "Mañana",
        "Horario": "Jueves 09:15 - 10:45",
        "RUC": "",
        "CELULAR": "",
        "MYPE": "Pendiente MYPE",
        "Estado": "",
        "wsp": false,
        "correo": false,
        "docente_comunicado": false,
        "horario_confirmado": false,
        "observaciones": ""
    },
    {
        "N_Clase": "1517",
        "Curso": "EXPERIENCIA FORMATIVA (COT)-IV",
        "Estudiantes": "8",
        "DOCENTE": "CARRERA RODRIGUEZ DERECK ANTONIO",
        "CORREO": "DCARRERAR@CERTUS.EDU.PE",
        "Sede": "VIRTUAL",
        "Turno": "Noche",
        "Horario": "Jueves 21:15 - 22:45",
        "RUC": "",
        "CELULAR": "",
        "MYPE": "Pendiente MYPE",
        "Estado": "",
        "wsp": false,
        "correo": false,
        "docente_comunicado": false,
        "horario_confirmado": false,
        "observaciones": ""
    }
];

// Google Sheet URL de exportación de CSV
const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1T7-kt0lYxkfUmZor41UWyjdrx73zqIj5MzSenElQcCI/export?format=csv';

// ==========================================================================
// ESTADO GLOBAL DE LA APLICACIÓN
// ==========================================================================
let advisories = [];
let activeFilters = {
    search: '',
    sede: 'all',
    turno: 'all',
    estado: 'all'
};
let selectedIndex = null; // Para rastrear qué fila está abierta en el Drawer

// ==========================================================================
// SELECTORES DOM
// ==========================================================================
const DOM = {
    tableBody: document.getElementById('tableBody'),
    noResults: document.getElementById('noResults'),
    searchInput: document.getElementById('searchInput'),
    clearSearchBtn: document.getElementById('clearSearchBtn'),
    filterSede: document.getElementById('filterSede'),
    filterTurno: document.getElementById('filterTurno'),
    filterEstado: document.getElementById('filterEstado'),
    resetFiltersBtn: document.getElementById('resetFiltersBtn'),
    addNewBtn: document.getElementById('addNewBtn'),
    exportBtn: document.getElementById('exportBtn'),
    resetDataBtn: document.getElementById('resetDataBtn'),
    syncBtn: document.getElementById('syncBtn'),
    syncStatus: document.getElementById('syncStatus'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    footerSyncTime: document.getElementById('footerSyncTime'),
    
    // KPIs
    metricTotalClasses: document.getElementById('metricTotalClasses'),
    metricCoordinated: document.getElementById('metricCoordinated'),
    metricInProcess: document.getElementById('metricInProcess'),
    metricPending: document.getElementById('metricPending'),
    metricTotalStudents: document.getElementById('metricTotalStudents'),
    
    // Analítica
    completionCircle: document.getElementById('completionCircle'),
    completionPercent: document.getElementById('completionPercent'),
    progCoordinated: document.getElementById('progCoordinated'),
    progInProcess: document.getElementById('progInProcess'),
    progPending: document.getElementById('progPending'),
    sedeBarsContainer: document.getElementById('sedeBarsContainer'),
    turnoMananaPercent: document.getElementById('turnoMananaPercent'),
    turnoMananaBar: document.getElementById('turnoMananaBar'),
    turnoNochePercent: document.getElementById('turnoNochePercent'),
    turnoNocheBar: document.getElementById('turnoNocheBar'),
    modVirtualCount: document.getElementById('modVirtualCount'),
    modPresencialCount: document.getElementById('modPresencialCount'),
    
    // Drawer
    drawerOverlay: document.getElementById('drawerOverlay'),
    detailDrawer: document.getElementById('detailDrawer'),
    drawerBody: document.getElementById('drawerBody'),
    drawerCloseBtn: document.getElementById('drawerCloseBtn'),
    
    // Modal
    modalOverlay: document.getElementById('modalOverlay'),
    modalTitle: document.getElementById('modalTitle'),
    modalCloseBtn: document.getElementById('modalCloseBtn'),
    advisoryForm: document.getElementById('advisoryForm'),
    formIndex: document.getElementById('formIndex'),
    formClassNo: document.getElementById('formClassNo'),
    formCourse: document.getElementById('formCourse'),
    formStudents: document.getElementById('formStudents'),
    formSede: document.getElementById('formSede'),
    formTurno: document.getElementById('formTurno'),
    formWsp: document.getElementById('formWsp'),
    formCorreoCheck: document.getElementById('formCorreoCheck'),
    formDocenteCheck: document.getElementById('formDocenteCheck'),
    formHorarioConfirmado: document.getElementById('formHorarioConfirmado'),
    formDocente: document.getElementById('formDocente'),
    formCorreo: document.getElementById('formCorreo'),
    formMYPE: document.getElementById('formMYPE'),
    formRUC: document.getElementById('formRUC'),
    formCelular: document.getElementById('formCelular'),
    formHorario: document.getElementById('formHorario'),
    formCancelBtn: document.getElementById('formCancelBtn')
};

// ==========================================================================
// INICIALIZACIÓN
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Cargar Tema
    initTheme();
    
    // Cargar Datos
    initData();
    
    // Escuchar Eventos
    bindEvents();
    
    // Rellenar filtros Sede dinámicamente
    populateSedeFilters();
    
    // Renderizar
    render();
});

function initTheme() {
    const savedTheme = localStorage.getItem('cot-dashboard-theme') || 'light';
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        document.body.classList.remove('light-theme');
        DOM.themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
    } else {
        document.body.classList.add('light-theme');
        document.body.classList.remove('dark-theme');
        DOM.themeToggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
    }
}

function initData() {
    const savedData = localStorage.getItem('cot-advisories-data');
    if (savedData) {
        advisories = JSON.parse(savedData);
        advisories.forEach(item => {
            item.Estado = calculateStatus(item);
        });
        updateSyncStatus('check', 'Datos locales cargados');
    } else {
        advisories = [...DEFAULT_DATASET];
        advisories.forEach(item => {
            item.Estado = calculateStatus(item);
        });
        saveDataToLocalStorage();
        updateSyncStatus('check', 'Datos iniciales cargados');
    }
    
    const lastSync = localStorage.getItem('cot-last-sync-time') || getFormattedTime();
    DOM.footerSyncTime.innerText = `Última actualización: ${lastSync}`;
}

// ==========================================================================
// MANEJADORES DE EVENTOS
// ==========================================================================
function bindEvents() {
    // Cambio de Tema
    DOM.themeToggleBtn.addEventListener('click', toggleTheme);
    
    // Búsqueda en tiempo real
    DOM.searchInput.addEventListener('input', (e) => {
        activeFilters.search = e.target.value;
        toggleClearSearchButton();
        render();
    });
    
    DOM.clearSearchBtn.addEventListener('click', () => {
        DOM.searchInput.value = '';
        activeFilters.search = '';
        toggleClearSearchButton();
        render();
    });
    
    // Selects de Filtros
    DOM.filterSede.addEventListener('change', (e) => {
        activeFilters.sede = e.target.value;
        render();
    });
    
    DOM.filterTurno.addEventListener('change', (e) => {
        activeFilters.turno = e.target.value;
        render();
    });
    
    DOM.filterEstado.addEventListener('change', (e) => {
        activeFilters.estado = e.target.value;
        render();
    });
    
    // Botón de restablecer filtros
    DOM.resetFiltersBtn.addEventListener('click', resetFilters);
    
    // KPI Cards clic para filtrar
    document.querySelectorAll('.kpi-card').forEach(card => {
        card.addEventListener('click', () => {
            const filterType = card.getAttribute('data-filter');
            if (filterType) {
                DOM.filterEstado.value = filterType;
                activeFilters.estado = filterType;
                render();
            }
        });
    });
    
    // Sincronización Google Sheets
    DOM.syncBtn.addEventListener('click', syncFromGoogleSheets);
    
    // Restablecer base de datos por defecto
    DOM.resetDataBtn.addEventListener('click', confirmResetOriginalData);
    
    // Exportación a Excel/CSV
    DOM.exportBtn.addEventListener('click', exportToCSV);
    
    // CRUD: Modal de añadir
    DOM.addNewBtn.addEventListener('click', () => openModal());
    DOM.modalCloseBtn.addEventListener('click', closeModal);
    DOM.formCancelBtn.addEventListener('click', closeModal);
    DOM.advisoryForm.addEventListener('submit', handleFormSubmit);
    
    // CRUD: Drawer de Detalles
    DOM.drawerCloseBtn.addEventListener('click', closeDrawer);
    DOM.drawerOverlay.addEventListener('click', closeDrawer);
}

// ==========================================================================
// CÁLCULO DE ESTADO Y LOGICA DE NEGOCIO
// ==========================================================================
function calculateStatus(item) {
    const hasAllComm = !!item.wsp && !!item.correo && !!item.docente_comunicado;
    // Horario elegido means it is confirmed or Horario text is not empty or '-'
    const hasSchedule = !!item.horario_confirmado || (item.Horario && item.Horario !== '-' && item.Horario.trim() !== '');
    if (hasAllComm && hasSchedule) {
        return 'coordinado';
    } else if (hasAllComm && !hasSchedule) {
        return 'en_proceso';
    } else {
        return 'pendiente';
    }
}

// ==========================================================================
// RENDERIZADOR PRINCIPAL DE LA INTERFAZ
// ==========================================================================
function render() {
    // 1. Filtrar los datos
    const filteredData = filterDataset();
    
    // 2. Renderizar filas en la tabla
    renderTable(filteredData);
    
    // 3. Actualizar KPIs (basados en todo el universo de datos)
    updateKPIs(advisories);
    
    // 4. Actualizar gráficos analíticos (basados en todo el universo de datos)
    updateCharts(advisories);
}

function filterDataset() {
    return advisories.filter(item => {
        // Búsqueda
        const query = activeFilters.search.toLowerCase().trim();
        const matchesSearch = !query || 
            (item.MYPE && item.MYPE.toLowerCase().includes(query)) ||
            (item.RUC && item.RUC.toLowerCase().includes(query)) ||
            (item.CELULAR && item.CELULAR.toLowerCase().includes(query)) ||
            (item.DOCENTE && item.DOCENTE.toLowerCase().includes(query)) ||
            (item.N_Clase && item.N_Clase.toLowerCase().includes(query)) ||
            (item.Curso && item.Curso.toLowerCase().includes(query));
            
        // Sede
        const matchesSede = activeFilters.sede === 'all' || item.Sede === activeFilters.sede;
        
        // Turno
        const matchesTurno = activeFilters.turno === 'all' || item.Turno === activeFilters.turno;
        
        // Estado
        let matchesEstado = true;
        if (activeFilters.estado !== 'all') {
            matchesEstado = item.Estado === activeFilters.estado;
        }
        
        return matchesSearch && matchesSede && matchesTurno && matchesEstado;
    });
}

function renderTable(data) {
    DOM.tableBody.innerHTML = '';
    
    if (data.length === 0) {
        DOM.noResults.style.display = 'block';
        return;
    }
    
    DOM.noResults.style.display = 'none';
    
    data.forEach((item, index) => {
        // Encontrar el índice original en el array global
        const originalIndex = advisories.findIndex(a => a.N_Clase === item.N_Clase);
        
        const tr = document.createElement('tr');
        tr.addEventListener('click', (e) => {
            // Si el clic fue en un botón de acción, no abrir drawer
            if (e.target.closest('.table-actions') || e.target.closest('.status-pill')) return;
            openDrawer(originalIndex);
        });
        
        const status = item.Estado || 'pendiente';
        let statusClass = 'pending';
        let statusText = 'Pendiente';
        let statusIcon = '<i class="fas fa-ellipsis-h"></i>';
        
        if (status === 'coordinado') {
            statusClass = 'coordinated';
            statusText = 'Coordinado';
            statusIcon = '<i class="fas fa-check-circle"></i>';
        } else if (status === 'en_proceso') {
            statusClass = 'in-process';
            statusText = 'En Proceso';
            statusIcon = '<i class="fas fa-spinner fa-spin-slow"></i>';
        }
        
        // Detalle de sede tag
        const sedeClass = item.Sede.toLowerCase().replace(' ', '-');
        
        tr.innerHTML = `
            <td>
                <span class="cell-tag">${item.N_Clase}</span>
            </td>
            <td>
                <div class="cell-title">${item.MYPE || '<span class="text-muted">Pendiente MYPE</span>'}</div>
                <div class="cell-subtitle">
                    ${item.RUC ? `<span>RUC: ${item.RUC}</span>` : ''}
                    ${item.CELULAR ? `<span><i class="fas fa-phone"></i> ${item.CELULAR}</span>` : ''}
                </div>
            </td>
            <td>
                <div style="font-weight: 500;">${item.Curso}</div>
                <div class="cell-subtitle">${item.Turno || ''}</div>
            </td>
            <td>
                <div class="cell-title" style="font-size:0.8rem">${item.DOCENTE}</div>
                <div class="cell-subtitle">${item.CORREO}</div>
            </td>
            <td>
                <span class="badge-sede ${sedeClass}">${item.Sede}</span>
            </td>
            <td>
                <span class="cell-subtitle" style="font-weight:600; color:var(--text-primary)"><i class="far fa-calendar-alt" style="margin-right: 5px; color: var(--color-accent)"></i> ${item.Horario || '-'}</span>
            </td>
            <td>
                <span class="status-pill ${statusClass}" onclick="event.stopPropagation(); toggleRowStatus(${originalIndex})">
                    ${statusIcon} ${statusText}
                </span>
            </td>
            <td>
                <div class="table-actions">
                    <button class="table-btn edit" title="Editar Asesoría" onclick="event.stopPropagation(); openModal(${originalIndex})">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="table-btn delete" title="Eliminar Asesoría" onclick="event.stopPropagation(); deleteAdvisory(${originalIndex})">
                        <i class="fas fa-trash-can"></i>
                    </button>
                </div>
            </td>
        `;
        
        DOM.tableBody.appendChild(tr);
    });
}

// ==========================================================================
// KPIs Y ESTADÍSTICAS REACTIVAS
// ==========================================================================
function updateKPIs(data) {
    const total = data.length;
    const coordinated = data.filter(item => item.Estado === 'coordinado').length;
    const inProcess = data.filter(item => item.Estado === 'en_proceso').length;
    const pending = data.filter(item => item.Estado === 'pendiente').length;
    
    // Suma de Estudiantes
    const totalStudents = data.reduce((sum, item) => sum + parseInt(item.Estudiantes || 0), 0);
    
    DOM.metricTotalClasses.innerText = total;
    DOM.metricCoordinated.innerText = coordinated;
    DOM.metricInProcess.innerText = inProcess;
    DOM.metricPending.innerText = pending;
    DOM.metricTotalStudents.innerText = totalStudents;
}

function updateCharts(data) {
    const total = data.length;
    if (total === 0) return;
    
    const coordinated = data.filter(item => item.Estado === 'coordinado').length;
    const inProcess = data.filter(item => item.Estado === 'en_proceso').length;
    const pending = data.filter(item => item.Estado === 'pendiente').length;
    const completionPercent = Math.round((coordinated / total) * 100);
    
    // 1. Gráfico Circular Progress
    DOM.completionPercent.innerText = `${completionPercent}%`;
    DOM.progCoordinated.innerText = coordinated;
    DOM.progInProcess.innerText = inProcess;
    DOM.progPending.innerText = pending;
    
    // Ajustar offset del círculo SVG (circunferencia = 2 * PI * radio -> r=40 -> circ=251.2)
    const circleCircumference = 251.2;
    const offset = circleCircumference - (completionPercent / 100) * circleCircumference;
    DOM.completionCircle.style.strokeDashoffset = offset;
    
    // 2. Gráfico de Turnos
    const mananaCount = data.filter(item => item.Turno === 'Mañana').length;
    const nocheCount = data.filter(item => item.Turno === 'Noche').length;
    
    const mananaPercent = Math.round((mananaCount / total) * 100) || 0;
    const nochePercent = Math.round((nocheCount / total) * 100) || 0;
    
    DOM.turnoMananaPercent.innerText = `${mananaPercent}%`;
    DOM.turnoMananaBar.style.width = `${mananaPercent}%`;
    DOM.turnoNochePercent.innerText = `${nochePercent}%`;
    DOM.turnoNocheBar.style.width = `${nochePercent}%`;
    
    // Modalidades
    const virtualCount = data.filter(item => item.Sede === 'VIRTUAL').length;
    const presencialCount = total - virtualCount;
    DOM.modVirtualCount.innerText = `${virtualCount} Virtual`;
    DOM.modPresencialCount.innerText = `${presencialCount} Presencial`;
    
    // 3. Distribución por Sede (Barras horizontales dinámicas)
    const sedeCounts = {};
    data.forEach(item => {
        sedeCounts[item.Sede] = (sedeCounts[item.Sede] || 0) + 1;
    });
    
    DOM.sedeBarsContainer.innerHTML = '';
    
    // Ordenar de mayor a menor
    const sortedSedes = Object.entries(sedeCounts).sort((a, b) => b[1] - a[1]);
    
    const colorClasses = ['blue', 'purple', 'green', 'orange', 'cyan', 'indigo'];
    
    sortedSedes.forEach(([sede, count], idx) => {
        const percent = Math.round((count / total) * 100);
        const color = colorClasses[idx % colorClasses.length];
        
        const barItem = document.createElement('div');
        barItem.className = 'bar-item';
        barItem.innerHTML = `
            <div class="bar-info">
                <span class="bar-label">${sede}</span>
                <span class="bar-value">${count} (${percent}%)</span>
            </div>
            <div class="bar-bg">
                <div class="bar-fill ${color}" style="width: ${percent}%"></div>
            </div>
        `;
        DOM.sedeBarsContainer.appendChild(barItem);
    });
}

// Rellenar filtros select de Sedes automáticamente
function populateSedeFilters() {
    const sedes = [...new Set(advisories.map(item => item.Sede))].sort();
    
    // Limpiar options anteriores guardando la primera
    DOM.filterSede.innerHTML = '<option value="all">Sede: Todas</option>';
    
    sedes.forEach(sede => {
        const option = document.createElement('option');
        option.value = sede;
        option.innerText = sede;
        DOM.filterSede.appendChild(option);
    });
}

// ==========================================================================
// INTERACCIONES Y FILTROS
// ==========================================================================
function toggleClearSearchButton() {
    if (DOM.searchInput.value) {
        DOM.clearSearchBtn.style.display = 'flex';
    } else {
        DOM.clearSearchBtn.style.display = 'none';
    }
}

function resetFilters() {
    DOM.searchInput.value = '';
    DOM.filterSede.value = 'all';
    DOM.filterTurno.value = 'all';
    DOM.filterEstado.value = 'all';
    
    activeFilters = {
        search: '',
        sede: 'all',
        turno: 'all',
        estado: 'all'
    };
    
    toggleClearSearchButton();
    render();
}

function toggleTheme() {
    if (document.body.classList.contains('light-theme')) {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
        localStorage.setItem('cot-dashboard-theme', 'dark');
        DOM.themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
    } else {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        localStorage.setItem('cot-dashboard-theme', 'light');
        DOM.themeToggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
    }
}

// Cambiar estado directo en fila (limpiar o marcar todo)
function toggleRowStatus(index) {
    const item = advisories[index];
    const status = item.Estado;
    
    if (status === 'coordinado') {
        // Desmarcar todo
        item.wsp = false;
        item.correo = false;
        item.docente_comunicado = false;
        item.horario_confirmado = false;
    } else {
        // Marcar todo
        item.wsp = true;
        item.correo = true;
        item.docente_comunicado = true;
        item.horario_confirmado = true;
    }
    
    item.Estado = calculateStatus(item);
    saveDataToLocalStorage();
    render();
    
    // Si el drawer está abierto en este elemento, actualizar drawer
    if (selectedIndex === index) {
        updateDrawerContent(index);
    }
}

// ==========================================================================
// SINCRONIZACIÓN Y PARSEO DE GOOGLE SHEETS (CSV)
// ==========================================================================
function syncFromGoogleSheets() {
    updateSyncStatus('syncing', 'Sincronizando...');
    
    fetch(GOOGLE_SHEET_CSV_URL)
        .then(response => {
            if (!response.ok) throw new Error('Error al descargar el archivo de Google Sheets');
            return response.text();
        })
        .then(csvText => {
            const parsedRows = parseCSV(csvText);
            if (parsedRows.length === 0) throw new Error('El archivo CSV está vacío.');
            
            // Combinar con los datos locales existentes para mantener las observaciones, wsp, correo, etc.
            mergeSyncedData(parsedRows);
            
            const nowTime = getFormattedTime();
            localStorage.setItem('cot-last-sync-time', nowTime);
            DOM.footerSyncTime.innerText = `Última actualización: ${nowTime}`;
            
            updateSyncStatus('check', 'Sincronizado');
            render();
            populateSedeFilters();
        })
        .catch(error => {
            console.error(error);
            updateSyncStatus('error', 'Fallo al sincronizar, usando base local');
            alert('CORS o error de red al contactar Google Sheets.\nEl dashboard continuará operando de forma offline con los datos almacenados localmente.');
        });
}

// Analizador simple de CSV que soporta comillas dobles y comas internas
function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0 || !lines[0]) return [];
    
    // Parsear cabeceras y limpiar espacios
    const headers = parseCSVLine(lines[0]);
    
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cells = parseCSVLine(lines[i]);
        if (cells.length < headers.length) continue;
        
        const rowObj = {};
        headers.forEach((header, idx) => {
            // Eliminar espacios adicionales o comillas
            let cleanHeader = header.trim();
            // Reemplazar la cabecera vacía del final (columna x) por "Estado"
            if (cleanHeader === '') {
                cleanHeader = 'Estado';
            }
            rowObj[cleanHeader] = cells[idx] ? cells[idx].trim() : '';
        });
        rows.push(rowObj);
    }
    return rows;
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
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

function mergeSyncedData(syncedRows) {
    const merged = [];
    
    syncedRows.forEach(row => {
        // Buscar si ya existe por Nº Clase
        const classNo = row.N_Clase;
        if (!classNo) return; // Omitir si no tiene clase
        
        const existing = advisories.find(a => a.N_Clase === classNo);
        
        // Mapear los campos del CSV a nuestro esquema interno
        const cleanRow = {
            "N_Clase": classNo,
            "Curso": row.Curso || 'Experiencia Formativa',
            "Estudiantes": row.Estudiantes || '0',
            "DOCENTE": row.DOCENTE || 'Sin Asignar',
            "CORREO": row.CORREO || '',
            "Sede": row.Sede || 'VIRTUAL',
            "Turno": row.Turno || 'Noche',
            "Horario": row.Horario || '-',
            "RUC": row.RUC || '',
            "CELULAR": row.CELULAR || '',
            "MYPE": row.MYPE || '',
            "Estado": row.Estado || ''
        };
        
        let item;
        if (existing) {
            // Mantener notas, toggles manuales del timeline, etc.
            item = {
                ...cleanRow,
                wsp: existing.wsp !== undefined ? existing.wsp : (cleanRow.Estado === 'x'),
                correo: existing.correo !== undefined ? existing.correo : (cleanRow.Estado === 'x'),
                docente_comunicado: existing.docente_comunicado || false,
                horario_confirmado: existing.horario_confirmado || (cleanRow.Horario !== '-'),
                observaciones: existing.observaciones || ''
            };
        } else {
            // Registro nuevo
            item = {
                ...cleanRow,
                wsp: cleanRow.Estado === 'x',
                correo: cleanRow.Estado === 'x',
                docente_comunicado: false,
                horario_confirmado: cleanRow.Horario !== '-',
                observaciones: ''
            };
        }
        item.Estado = calculateStatus(item);
        merged.push(item);
    });
    
    advisories = merged;
    saveDataToLocalStorage();
}

function updateSyncStatus(type, text) {
    DOM.syncStatus.className = `sync-status ${type}`;
    if (type === 'check') {
        DOM.syncStatus.innerHTML = `<i class="fas fa-circle-check"></i> <span>${text}</span>`;
    } else if (type === 'syncing') {
        DOM.syncStatus.innerHTML = `<i class="fas fa-rotate"></i> <span>${text}</span>`;
    } else if (type === 'error') {
        DOM.syncStatus.innerHTML = `<i class="fas fa-triangle-exclamation"></i> <span>${text}</span>`;
    }
}

// ==========================================================================
// DRAWER DE DETALLES Y TIMELINE
// ==========================================================================
function openDrawer(index) {
    selectedIndex = index;
    updateDrawerContent(index);
    DOM.detailDrawer.classList.add('active');
    DOM.drawerOverlay.classList.add('active');
}

function closeDrawer() {
    DOM.detailDrawer.classList.remove('active');
    DOM.drawerOverlay.classList.remove('active');
    selectedIndex = null;
}

function updateDrawerContent(index) {
    const item = advisories[index];
    
    // Badges
    const status = item.Estado || 'pendiente';
    let statusText = 'Pendiente';
    let statusClass = 'pending';
    if (status === 'coordinado') {
        statusText = 'Coordinado';
        statusClass = 'coordinated';
    } else if (status === 'en_proceso') {
        statusText = 'En Proceso';
        statusClass = 'in-process';
    }
    const progressPercent = calculateTimelineProgress(item);
    
    DOM.drawerBody.innerHTML = `
        <!-- Cabecera de Datos -->
        <div class="drawer-section">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="cell-tag" style="font-size:0.8rem">Clase ${item.N_Clase}</span>
                <span class="status-pill ${statusClass}">${statusText}</span>
            </div>
            <h3 style="font-family:'Outfit'; font-size:1.3rem; margin-top:5px; color:var(--text-primary)">
                ${item.MYPE || 'Pendiente MYPE'}
            </h3>
            <p style="font-size:0.8rem; color:var(--text-secondary)">Curso: <strong>${item.Curso}</strong></p>
        </div>
        
        <!-- Grid de Información -->
        <div class="drawer-section">
            <h4>Información de la Clase</h4>
            <div class="drawer-info-grid">
                <div class="info-box">
                    <small>DOCENTE</small>
                    <span>${item.DOCENTE}</span>
                </div>
                <div class="info-box">
                    <small>CORREO</small>
                    <span style="font-size:0.7rem; font-weight:normal;">${item.CORREO}</span>
                </div>
                <div class="info-box">
                    <small>SEDE / TURNO</small>
                    <span>${item.Sede} (${item.Turno})</span>
                </div>
                <div class="info-box">
                    <small>HORARIO</small>
                    <span style="font-size:0.75rem">${item.Horario || '-'}</span>
                </div>
                <div class="info-box">
                    <small>CELULAR MYPE</small>
                    <span>${item.CELULAR || 'No registrado'}</span>
                </div>
                <div class="info-box">
                    <small>RUC</small>
                    <span>${item.RUC || 'No registrado'}</span>
                </div>
            </div>
        </div>
        
        <!-- Timeline Checklist -->
        <div class="drawer-section">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h4>Línea de Proceso</h4>
                <strong style="color:var(--color-success); font-size:0.8rem;">${progressPercent}%</strong>
            </div>
            <div class="timeline-checklist">
                <div class="timeline-step ${item.wsp ? 'done' : ''}" onclick="toggleTimelineStep(${index}, 'wsp')">
                    <span class="step-indicator"></span>
                    <div class="step-content">
                        <strong>WhatsApp Enviado</strong>
                        <small>Contacto inicial con el empresario</small>
                    </div>
                </div>
                <div class="timeline-step ${item.correo ? 'done' : ''}" onclick="toggleTimelineStep(${index}, 'correo')">
                    <span class="step-indicator"></span>
                    <div class="step-content">
                        <strong>Correo de Asesoría</strong>
                        <small>Envío de presentación formal y requisitos</small>
                    </div>
                </div>
                <div class="timeline-step ${item.docente_comunicado ? 'done' : ''}" onclick="toggleTimelineStep(${index}, 'docente_comunicado')">
                    <span class="step-indicator"></span>
                    <div class="step-content">
                        <strong>Docente Comunicado</strong>
                        <small>Notificación y alineación con el docente asesor</small>
                    </div>
                </div>
                <div class="timeline-step ${item.horario_confirmado ? 'done' : ''}" onclick="toggleTimelineStep(${index}, 'horario_confirmado')">
                    <span class="step-indicator"></span>
                    <div class="step-content">
                        <strong>Horario de Asesoría Confirmado</strong>
                        <small>Pactada la reunión semanal</small>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Observaciones / Notas -->
        <div class="drawer-section notes-area">
            <h4>Observaciones y Comentarios</h4>
            <textarea id="drawerNotes" placeholder="Escribe aquí notas sobre las llamadas o acuerdos con el empresario...">${item.observaciones || ''}</textarea>
            <button class="drawer-save-btn" onclick="saveDrawerNotes(${index})">Guardar Notas</button>
        </div>
    `;
}

function calculateTimelineProgress(item) {
    let done = 0;
    if (item.wsp) done++;
    if (item.correo) done++;
    if (item.docente_comunicado) done++;
    if (item.horario_confirmado) done++;
    return Math.round((done / 4) * 100);
}

function toggleTimelineStep(index, field) {
    const item = advisories[index];
    item[field] = !item[field];
    
    // Auto-actualizar Estado general
    item.Estado = calculateStatus(item);
    
    saveDataToLocalStorage();
    updateDrawerContent(index);
    render();
}

function saveDrawerNotes(index) {
    const text = document.getElementById('drawerNotes').value;
    advisories[index].observaciones = text;
    saveDataToLocalStorage();
    alert('Observaciones guardadas con éxito.');
}

// ==========================================================================
// CRUD OPERACIONES (CREAR / EDITAR / ELIMINAR)
// ==========================================================================
function openModal(index = null) {
    DOM.advisoryForm.reset();
    
    if (index !== null) {
        // Modo Editar
        const item = advisories[index];
        DOM.modalTitle.innerText = `Editar Asesoría (Clase ${item.N_Clase})`;
        DOM.formIndex.value = index;
        DOM.formClassNo.value = item.N_Clase;
        DOM.formClassNo.disabled = true; // No permitir cambiar clave primaria
        DOM.formCourse.value = item.Curso;
        DOM.formStudents.value = item.Estudiantes;
        DOM.formSede.value = item.Sede;
        DOM.formTurno.value = item.Turno;
        DOM.formDocente.value = item.DOCENTE;
        DOM.formCorreo.value = item.CORREO;
        DOM.formMYPE.value = item.MYPE;
        DOM.formRUC.value = item.RUC;
        DOM.formCelular.value = item.CELULAR;
        DOM.formHorario.value = item.Horario;
        
        // Cargar checkboxes
        DOM.formWsp.checked = !!item.wsp;
        DOM.formCorreoCheck.checked = !!item.correo;
        DOM.formDocenteCheck.checked = !!item.docente_comunicado;
        DOM.formHorarioConfirmado.checked = !!item.horario_confirmado;
    } else {
        // Modo Añadir
        DOM.modalTitle.innerText = 'Nueva Asesoría';
        DOM.formIndex.value = '';
        DOM.formClassNo.disabled = false;
        
        // Resetear checkboxes
        DOM.formWsp.checked = false;
        DOM.formCorreoCheck.checked = false;
        DOM.formDocenteCheck.checked = false;
        DOM.formHorarioConfirmado.checked = false;
    }
    
    DOM.modalOverlay.classList.add('active');
}

function closeModal() {
    DOM.modalOverlay.classList.remove('active');
}

function handleFormSubmit(e) {
    e.preventDefault();
    
    const indexStr = DOM.formIndex.value;
    const classNo = DOM.formClassNo.value.trim();
    
    // Construir objeto de datos
    const formData = {
        "N_Clase": classNo,
        "Curso": DOM.formCourse.value.trim(),
        "Estudiantes": DOM.formStudents.value.trim(),
        "DOCENTE": DOM.formDocente.value.trim(),
        "CORREO": DOM.formCorreo.value.trim(),
        "Sede": DOM.formSede.value,
        "Turno": DOM.formTurno.value,
        "Horario": DOM.formHorario.value.trim(),
        "RUC": DOM.formRUC.value.trim(),
        "CELULAR": DOM.formCelular.value.trim(),
        "MYPE": DOM.formMYPE.value.trim()
    };
    
    const wspVal = DOM.formWsp.checked;
    const correoVal = DOM.formCorreoCheck.checked;
    const docenteVal = DOM.formDocenteCheck.checked;
    const horarioConfirmadoVal = DOM.formHorarioConfirmado.checked;
    
    if (indexStr !== '') {
        // EDITAR REGISTRO
        const index = parseInt(indexStr);
        const existing = advisories[index];
        
        const updatedItem = {
            ...existing,
            ...formData,
            wsp: wspVal,
            correo: correoVal,
            docente_comunicado: docenteVal,
            horario_confirmado: horarioConfirmadoVal,
            observaciones: existing.observaciones || ''
        };
        updatedItem.Estado = calculateStatus(updatedItem);
        advisories[index] = updatedItem;
    } else {
        // NUEVO REGISTRO
        // Validar si existe Nº Clase
        if (advisories.some(a => a.N_Clase === classNo)) {
            alert('Ya existe una asesoría registrada con ese Nº Clase.');
            return;
        }
        
        const newRecord = {
            ...formData,
            wsp: wspVal,
            correo: correoVal,
            docente_comunicado: docenteVal,
            horario_confirmado: horarioConfirmadoVal,
            observaciones: ""
        };
        newRecord.Estado = calculateStatus(newRecord);
        advisories.push(newRecord);
    }
    
    saveDataToLocalStorage();
    closeModal();
    render();
    populateSedeFilters();
}

function deleteAdvisory(index) {
    const item = advisories[index];
    if (confirm(`¿Estás seguro de que deseas eliminar la asesoría de la clase "${item.N_Clase}" (${item.MYPE})?`)) {
        advisories.splice(index, 1);
        saveDataToLocalStorage();
        render();
        populateSedeFilters();
        
        if (selectedIndex === index) {
            closeDrawer();
        }
    }
}

function confirmResetOriginalData() {
    if (confirm('¿Estás seguro de que deseas restablecer la base de datos a sus valores originales?\nEsto eliminará todas las ediciones locales hechas.')) {
        advisories = [...DEFAULT_DATASET];
        saveDataToLocalStorage();
        localStorage.removeItem('cot-last-sync-time');
        DOM.footerSyncTime.innerText = `Última actualización: ${getFormattedTime()}`;
        updateSyncStatus('check', 'Datos locales restaurados');
        render();
        populateSedeFilters();
    }
}

// ==========================================================================
// EXPORTACIÓN A CSV
// ==========================================================================
function exportToCSV() {
    const dataToExport = filterDataset();
    if (dataToExport.length === 0) {
        alert('No hay registros en la vista actual para exportar.');
        return;
    }
    
    // Headers del CSV
    const headers = ['N_Clase', 'Curso', 'Estudiantes', 'DOCENTE', 'CORREO', 'Sede', 'Turno', 'Horario', 'RUC', 'CELULAR', 'MYPE', 'Estado'];
    
    let csvContent = '\uFEFF'; // UTF-8 BOM
    csvContent += headers.join(',') + '\r\n';
    
    dataToExport.forEach(item => {
        const row = [
            escapeCSVCell(item.N_Clase),
            escapeCSVCell(item.Curso),
            escapeCSVCell(item.Estudiantes),
            escapeCSVCell(item.DOCENTE),
            escapeCSVCell(item.CORREO),
            escapeCSVCell(item.Sede),
            escapeCSVCell(item.Turno),
            escapeCSVCell(item.Horario),
            escapeCSVCell(item.RUC),
            escapeCSVCell(item.CELULAR),
            escapeCSVCell(item.MYPE),
            escapeCSVCell(item.Estado)
        ];
        csvContent += row.join(',') + '\r\n';
    });
    
    // Crear el link de descarga
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.setAttribute('href', url);
    link.setAttribute('download', `reporte_asesorias_cot_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function escapeCSVCell(value) {
    if (value === null || value === undefined) return '';
    let valStr = String(value);
    // Si contiene comas o comillas dobles, escapar
    if (valStr.includes(',') || valStr.includes('"') || valStr.includes('\n')) {
        valStr = valStr.replace(/"/g, '""');
        return `"${valStr}"`;
    }
    return valStr;
}

// ==========================================================================
// UTILERÍAS DE APOYO
// ==========================================================================
function saveDataToLocalStorage() {
    localStorage.setItem('cot-advisories-data', JSON.stringify(advisories));
}

function getFormattedTime() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
