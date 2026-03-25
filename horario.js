document.addEventListener('DOMContentLoaded', () => {
    // State
    const defaultGroups = {
        "PTC": ['Eduardo', 'José', 'Jorge', 'Carlos', 'Mirko', 'Luis'],
        "AQP-CIX": ['MARILYN ASTULLE', 'JUAN CARLOS COSTILLA']
    };
    
    let groups = JSON.parse(localStorage.getItem('cot_groups')) || defaultGroups;
    
    // Force cleanup of specific groups if they exist
    if (groups["OTROS"]) delete groups["OTROS"];
    
    // Ensure default groups exist and are populated if missing
    Object.keys(defaultGroups).forEach(gn => {
        if (!groups[gn] || groups[gn].length === 0) {
            groups[gn] = defaultGroups[gn];
        }
    });
    
    // Save cleaned/updated groups back to storage
    localStorage.setItem('cot_groups', JSON.stringify(groups));

    let activeGroup = Object.keys(groups)[0] || "PTC";
    let activeUsers = new Set();
    
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

    async function loadFromSupabase() {
        const [res1, res2] = await Promise.all([
            supabaseClient.from('cot_horarios').select('*'),
            supabaseClient.from('cot_horarios_externos').select('*')
        ]);
        
        const data = [...(res1.data || []), ...(res2.data || [])];
        const error = res1.error; // Primary error check

        if (error) {
            console.error('Error loading from Supabase:', error);
            courses = JSON.parse(localStorage.getItem('cot_horarios')) || initialData;
            renderCourses();
            return;
        }

        // Group by user
        const grouped = {};
        data.forEach(item => {
            if (!grouped[item.user_id]) grouped[item.user_id] = [];
            grouped[item.user_id].push({
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
                user: item.user_id,
                sourceTable: (res2.data && res2.data.some(d => d.id === item.id)) ? 'cot_horarios_externos' : 'cot_horarios'
            });
        });
        courses = grouped;
        renderCourses();
    }

    async function saveToSupabase(course, owner, tableName = 'cot_horarios') {
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
            .from(tableName || 'cot_horarios')
            .upsert(payload, { onConflict: 'id' });

        if (error) {
            if (error.code === '42P01' && tableName !== 'cot_horarios') {
                 console.warn(`Table ${tableName} not found, falling back to cot_horarios`);
                 return saveToSupabase(course, owner, 'cot_horarios');
            }
            alert('Error al guardar en Supabase: ' + error.message);
        }
    }

    async function removeFromSupabase(id, tableName = 'cot_horarios') {
        const { error } = await supabaseClient
            .from(tableName || 'cot_horarios')
            .delete()
            .eq('id', id);
        
        if (error && tableName === 'cot_horarios') {
            return removeFromSupabase(id, 'cot_horarios_externos');
        } else if (error) {
            console.error('Error removing from Supabase:', error);
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
    const userSearchResults = document.getElementById('userSearchResults');
    const selectedUsersContainer = document.getElementById('selectedUsersContainer');
    
    // Constants
    const START_HOUR = 7;
    const END_HOUR = 23;
    const MINUTES_PER_PERIOD = 45;
    const PIXELS_PER_PERIOD = 35;
    let periodToIndexMap = {}; 

    // Initialization
    initGrid();
    renderGroupSelector();
    renderUserSelector();
    loadFromSupabase();

    // Group Logic
    function renderGroupSelector() {
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
        activeGroup = groupName;
        activeUsers = new Set(); // Start empty for all groups
        renderGroupSelector();
        renderUserSelector();
        updateModalUserSelect(); // CRITICAL: Update the modal dropdown when group changes
        renderCourses();
    }

    addGroupBtn.onclick = () => {
        const name = prompt('Nombre del nuevo grupo (ej: DOCENTES):');
        if (name && !groups[name]) {
            groups[name] = [];
            persistGroups();
            switchGroup(name);
        }
    };

    function renderUserSelector() {
        const legacySelector = document.getElementById('userSelector');
        legacySelector.style.display = 'flex';
        renderLegacyButtons();
    }


    function renderLegacyButtons() {
        userSelector.innerHTML = '';
        const users = groups[activeGroup] || [];
        
        users.forEach(user => {
            const btn = document.createElement('button');
            const cleanName = user.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const isActive = activeUsers.has(user);
            
            btn.className = `user-btn ${isActive ? 'active' : ''}`;
            if (isActive) {
                btn.style.backgroundColor = `var(--u-${cleanName})`;
                btn.style.borderColor = `var(--u-${cleanName})`;
                btn.style.color = 'white';
            }
            
            btn.innerText = user;
            btn.onclick = () => {
                if (activeUsers.has(user)) {
                    activeUsers.delete(user);
                } else {
                    activeUsers.add(user);
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
            if (name && !groups[activeGroup].includes(name)) {
                groups[activeGroup].push(name);
                activeUsers.add(name);
                persistGroups();
                renderLegacyButtons();
                updateModalUserSelect();
                renderCourses();
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
            opt.value = user;
            opt.textContent = user;
            userSelect.appendChild(opt);
        });
        
        // If we are editing and the owner isn't in this group (unlikely but possible), add them
        if (currentValue && currentValue !== 'TODOS' && !groupUsers.includes(currentValue)) {
            const opt = document.createElement('option');
            opt.value = currentValue;
            opt.textContent = currentValue;
            userSelect.appendChild(opt);
            userSelect.value = currentValue;
        } else if (currentValue) {
            userSelect.value = currentValue;
        }
    }

    // Call updateModalUserSelect initially
    updateModalUserSelect();

    const importCSVBtn = document.getElementById('importCSVBtn');
    const csvInput = document.getElementById('csvInput');

    if (addBtn) addBtn.onclick = () => {
        console.log('Add button clicked');
        openModal();
    };
    if (closeBtn) closeBtn.onclick = () => modal.style.display = 'none';
    window.onclick = (e) => { if (modal && e.target == modal) modal.style.display = 'none'; };

    if (importCSVBtn) importCSVBtn.onclick = () => csvInput.click();
    if (csvInput) csvInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => processCSV(event.target.result);
        reader.readAsText(file);
        // Clear input so same file can be uploaded again
        csvInput.value = '';
    };

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
                    ${[0,1,2,3,4,5].map(d => {
                        const daysShort = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
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
        const related = courses[owner].filter(c => 
            c.name === name && 
            c.modality === modality && 
            c.sede === sede
        );
        
        for (const c of related) {
            await removeFromSupabase(c.id, c.sourceTable);
        }
        modal.style.display = 'none';
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
            
            row.innerHTML = `
                <div class="hour-label">${timeStr}</div>
                ${'<div class="grid-cell"></div>'.repeat(6)}
            `;
            gridBody.appendChild(row);
            currentIndex++;
        }
        gridBody.style.height = `${currentIndex * PIXELS_PER_PERIOD}px`;
    }

    function renderCourses() {
        // Clear previous cards
        const existingCards = document.querySelectorAll('.course-card');
        existingCards.forEach(c => c.remove());

        const activeCoursesList = [];
        
        activeUsers.forEach(user => {
            if (courses[user]) {
                courses[user].forEach(c => activeCoursesList.push({ ...c, user }));
            }
        });

        if (activeGroup === 'PTC' && courses['TODOS']) {
            courses['TODOS'].forEach(c => activeCoursesList.push({ ...c, user: 'TODOS' }));
        }

        // --- Dynamic Grid logic ---
        const activePeriods = new Set();
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

        const coursesByDay = [[], [], [], [], [], []]; // 6 days
        activeCoursesList.forEach(course => {
            course.days.forEach(day => {
                if (day < 6) coursesByDay[day].push(course);
            });
        });

        for (let day = 0; day < 6; day++) {
            const dayCourses = coursesByDay[day];
            renderDayCourses(dayCourses, day);
        }
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
        card.className = `course-card`;
        card.dataset.user = course.user;
        card.style.top = `${top}px`;
        card.style.height = `${height}px`;
        card.style.left = `${left}px`;
        card.style.width = `${cardWidth - 4}px`;
        
        const cleanName = course.user.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const userColorVar = `var(--u-${cleanName})`;

        let nrcSecText = "";
        if (course.nrc) nrcSecText += `NRC: ${course.nrc} `;
        if (course.section) nrcSecText += `Sec: ${course.section}`;
        
        let roomText = course.room ? ` - Salón: ${course.room}` : "";

        card.innerHTML = `
            <span class="user-tag" style="color: ${userColorVar}">${course.user}</span>
            <div class="course-name">${course.name}</div>
            ${nrcSecText ? `<div class="course-info" style="font-weight:600; font-size: 0.75rem;">${nrcSecText}</div>` : ''}
            <div class="course-info">${course.startTime} - ${course.endTime}</div>
            <div class="course-info"><span class="info-label">Sede:</span> ${course.sede}${roomText}</div>
            <div class="course-info"><span class="info-label">Mod:</span> ${course.modality}</div>
        `;

        // Apply background and border color if teacher is not one of the hardcoded BTC ones
        // The hardcoded ones have data-user CSS rules, others will use this fallback
        const hardcoded = ["eduardo", "jose", "jorge", "carlos", "mirko", "luis"];
        if (!hardcoded.includes(cleanName)) {
            card.style.borderLeft = `4px solid ${userColorVar}`;
        }

        if (course.modality?.toLowerCase() === 'virtual') {
            card.style.border = '2px dashed #64748b';
            card.style.background = 'repeating-linear-gradient(45deg, #f8fafc, #f8fafc 5px, #ffffff 5px, #ffffff 10px)';
        } else if (course.sede?.toUpperCase() === 'OTROS' || course.sede?.toUpperCase() === 'OTRO') {
            card.style.backgroundColor = '#f1f5f9';
            card.style.opacity = '0.9';
        }

        card.onclick = (e) => {
            e.stopPropagation();
            openModal(course, course.user, day);
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
        
        const userSelect = document.getElementById('courseUserSelect');
        userSelect.disabled = false;

        if (course) {
            document.getElementById('courseId').value = course.id;
            document.getElementById('courseName').value = course.name;
            document.getElementById('courseModality').value = course.modality;
            document.getElementById('courseSede').value = course.sede;
            document.getElementById('courseSection').value = course.section || '';
            document.getElementById('courseNRC').value = course.nrc || '';
            document.getElementById('courseRoom').value = course.room || '';
            userSelect.value = owner;
            userSelect.disabled = true;

            // Find all related schedules (soft grouping)
            const relatedSchedules = (courses[owner] || []).filter(c => 
                c.name === course.name && 
                c.modality === course.modality && 
                c.sede === course.sede
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

    async function saveCourse() {
        const owner = document.getElementById('courseUserSelect').value;
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
            const related = (courses[owner] || []).filter(c => 
                c.name === name && 
                c.modality === modality && 
                c.sede === sede
            );
            for (const c of related) {
                await removeFromSupabase(c.id, c.sourceTable);
            }
        }

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
            // Default to main table for manual entries
            await saveToSupabase(newCourse, owner, 'cot_horarios');
        }

        modal.style.display = 'none';
        await loadFromSupabase();
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

    window.addEventListener('resize', renderCourses);
});
