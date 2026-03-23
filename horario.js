document.addEventListener('DOMContentLoaded', () => {
    // State
    const allUsers = ['Eduardo', 'José', 'Jorge', 'Carlos', 'Mirko', 'Luis'];
    let activeUsers = new Set(allUsers);
    
    const initialData = {
        "Luis": [
            { id: "l1", name: "PENSAMIENTO LÓGICO", modality: "Presencial", sede: "ATE", startTime: "07:00", endTime: "10:00", days: [1, 3] }
        ],
        "Jorge": [
            { id: "j1", name: "CONTABILIDAD SUPERIOR", modality: "Virtual", sede: "Virtual", startTime: "07:00", endTime: "10:45", days: [0] },
            { id: "j2", name: "CONTAB. ENT. FINANCIERAS (Ma)", modality: "Virtual", sede: "Virtual", startTime: "07:00", endTime: "08:30", days: [1] },
            { id: "j3", name: "CONTAB. ENT. FINANCIERAS (Ju)", modality: "Virtual", sede: "Virtual", startTime: "07:00", endTime: "09:15", days: [3] },
            { id: "j4", name: "FORM. ESTADOS FINANCIEROS", modality: "Presencial", sede: "ATE", startTime: "19:00", endTime: "22:45", days: [1, 4] },
            { id: "j5", name: "SISTEMAS CONTABLES INT.", modality: "Presencial", sede: "ATE", startTime: "19:00", endTime: "22:45", days: [2, 3] }
        ],
        "Eduardo": [
            { id: "e1", name: "SISTEMAS CONTABLES INT.", modality: "Presencial", sede: "AQP", startTime: "07:00", endTime: "10:45", days: [1, 3] },
            { id: "e2", name: "AUDITORÍA", modality: "Presencial", sede: "AQP", startTime: "07:00", endTime: "11:30", days: [2, 5] },
            { id: "e3", name: "CIERRE CONTABLE TRIB. (Mi)", modality: "Virtual", sede: "NOR", startTime: "20:30", endTime: "22:00", days: [2] },
            { id: "e4", name: "CIERRE CONTABLE TRIB. (Vi)", modality: "Virtual", sede: "NOR", startTime: "19:00", endTime: "22:00", days: [4] }
        ],
        "José": [
            { id: "jo1", name: "CONTABILIDAD", modality: "Presencial", sede: "SJL", startTime: "07:00", endTime: "10:45", days: [1, 4] },
            { id: "jo2", name: "DINÁMICA PLAN CONTABLE", modality: "Presencial", sede: "SJL", startTime: "07:00", endTime: "10:45", days: [2, 5] },
            { id: "jo3", name: "CONTABILIDAD GUBERN.", modality: "Virtual", sede: "Virtual", startTime: "19:00", endTime: "22:45", days: [4] }
        ],
        "Mirko": [
            { id: "m1", name: "PENSAMIENTO LÓGICO", modality: "Presencial", sede: "SJL", startTime: "07:00", endTime: "10:00", days: [0, 2] }
        ],
        "Carlos": [
            { id: "c1", name: "CONTABILIDAD", modality: "Presencial", sede: "NOR", startTime: "07:00", endTime: "10:45", days: [1, 3] },
            { id: "c2", name: "CONTABILIDAD SUPERIOR", modality: "Presencial", sede: "NOR", startTime: "07:00", endTime: "10:45", days: [2, 5] },
            { id: "c3", name: "CONTABILIDAD (T)", modality: "Presencial", sede: "NOR", startTime: "14:30", endTime: "18:15", days: [0, 4] }
        ],
        "TODOS": [
            { id: "all1", name: "Coordinación COT PLN", modality: "Presencial", sede: "Todas", startTime: "11:30", endTime: "13:00", days: [1] }
        ]
    };

    const supabaseUrl = 'https://klmjmlhwuzhymrplemgw.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsbWptbGh3dXpoeW1ycGxlbWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTMyNjQsImV4cCI6MjA4NzE2OTI2NH0.xFWMvUJa9n9TBcBG1WSeqCGiWBaCAtCU9aY7GXk4W6E';
    const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

    let courses = {}; // Will be filled from Supabase

    async function loadFromSupabase() {
        const { data, error } = await supabaseClient
            .from('cot_horarios')
            .select('*');
        
        if (error) {
            console.error('Error loading from Supabase:', error);
            // Fallback to local if DB fails or table doesn't exist yet
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
                startTime: item.start_time,
                endTime: item.end_time,
                days: item.days,
                user: item.user_id
            });
        });
        courses = grouped;
        renderCourses();
    }
    
    // Elements
    const gridBody = document.getElementById('gridBody');
    const userBtns = document.querySelectorAll('.user-btn');
    const modal = document.getElementById('courseModal');
    const addBtn = document.getElementById('addCourseBtn');
    const closeBtn = document.querySelector('.close');
    const form = document.getElementById('courseForm');
    const deleteBtn = document.getElementById('deleteBtn');
    
    // Constants
    const START_HOUR = 7;
    const END_HOUR = 23;
    const MINUTES_PER_PERIOD = 45;
    const PIXELS_PER_PERIOD = 50; // Increased to 50 for more vertical space

    // Supabase Configuration
    initGrid();
    loadFromSupabase();

    // Set up Real-time listener
    supabaseClient
        .channel('schema-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cot_horarios' }, () => {
            loadFromSupabase();
        })
        .subscribe();

    async function saveToSupabase(course, owner) {
        const payload = {
            id: course.id,
            user_id: owner,
            name: course.name,
            modality: course.modality,
            sede: course.sede,
            start_time: course.startTime,
            end_time: course.endTime,
            days: course.days
        };

        const { error } = await supabaseClient
            .from('cot_horarios')
            .upsert(payload, { onConflict: 'id' });

        if (error) alert('Error al guardar en Supabase: ' + error.message);
        // loadFromSupabase() will be called by the channel listener
    }

    async function removeFromSupabase(id) {
        const { error } = await supabaseClient
            .from('cot_horarios')
            .delete()
            .eq('id', id);
        
        if (error) alert('Error al eliminar: ' + error.message);
    }

    // Event Listeners
    userBtns.forEach(btn => {
        const user = btn.dataset.user;
        if (activeUsers.has(user)) btn.classList.add('active');

        btn.addEventListener('click', () => {
            if (activeUsers.has(user)) {
                activeUsers.delete(user);
                btn.classList.remove('active');
            } else {
                activeUsers.add(user);
                btn.classList.add('active');
            }
            renderCourses();
        });
    });

    addBtn.onclick = () => openModal();
    closeBtn.onclick = () => modal.style.display = 'none';
    window.onclick = (e) => { if (e.target == modal) modal.style.display = 'none'; };

    form.onsubmit = (e) => {
        e.preventDefault();
        saveCourse();
    };

    deleteBtn.onclick = () => {
        const id = document.getElementById('courseId').value;
        const owner = document.getElementById('courseUserSelect').value;
        if (confirm('¿Eliminar TODO el curso (todos los días)?')) {
            removeCourse(id, owner);
        }
    };

    document.getElementById('deleteDayBtn').onclick = () => {
        const id = document.getElementById('courseId').value;
        const owner = document.getElementById('courseUserSelect').value;
        const clickedDay = parseInt(document.getElementById('clickedDay').value);
        if (confirm('¿Eliminar solo este día?')) {
            removeCourseDay(id, owner, clickedDay);
        }
    };

    function removeCourseDay(id, owner, day) {
        if (!courses[owner]) return;
        const course = courses[owner].find(c => c.id === id);
        if (course) {
            course.days = course.days.filter(d => d !== day);
            if (course.days.length === 0) {
                courses[owner] = courses[owner].filter(c => c.id !== id);
            }
        }
        persist();
        renderCourses();
        modal.style.display = 'none';
    }

    function initGrid() {
        gridBody.innerHTML = '';
        const totalMinutes = (END_HOUR - START_HOUR) * 60;
        const totalPeriods = Math.ceil(totalMinutes / MINUTES_PER_PERIOD);
        
        for (let i = 0; i < totalPeriods; i++) {
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
            row.style.top = `${i * PIXELS_PER_PERIOD}px`;
            row.style.height = `${PIXELS_PER_PERIOD}px`;
            
            row.innerHTML = `
                <div class="hour-label">${timeStr}</div>
                ${'<div class="grid-cell"></div>'.repeat(6)}
            `;
            gridBody.appendChild(row);
        }
        gridBody.style.height = `${totalPeriods * PIXELS_PER_PERIOD}px`;
    }

    function renderCourses() {
        // Clear previous cards
        const existingCards = document.querySelectorAll('.course-card');
        existingCards.forEach(c => c.remove());

        const activeCoursesList = [];
        
        // Include individual user courses
        activeUsers.forEach(user => {
            if (courses[user]) {
                courses[user].forEach(c => activeCoursesList.push({ ...c, user }));
            }
        });

        // Include global (TODOS) courses
        if (courses['TODOS']) {
            courses['TODOS'].forEach(c => activeCoursesList.push({ ...c, user: 'TODOS' }));
        }

        const coursesByDay = [[], [], [], [], [], []]; // 6 days
        activeCoursesList.forEach(course => {
            course.days.forEach(day => {
                if (day < 6) coursesByDay[day].push(course);
            });
        });

        // For each day, find overlapping groups and render them
        for (let day = 0; day < 6; day++) { // Iterate for 6 days
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
        const start = timeToMinutes(course.startTime) - (START_HOUR * 60);
        const end = timeToMinutes(course.endTime) - (START_HOUR * 60);
        const durationMin = end - start;
        
        const top = (start / MINUTES_PER_PERIOD) * PIXELS_PER_PERIOD;
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
        
        card.innerHTML = `
            <span class="user-tag" style="color: var(--u-${course.user.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")})">${course.user}</span>
            <div class="course-name">${course.name}</div>
            <div class="course-info">${course.startTime} - ${course.endTime}</div>
            <div class="course-info">Sede: ${course.sede}</div>
            <div class="course-info">Modalidad: ${course.modality}</div>
        `;

        card.onclick = (e) => {
            e.stopPropagation();
            openModal(course, course.user, day);
        };
        return card;
    }

    function openModal(course = null, owner = null, clickedDay = null) {
        form.reset();
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
            document.getElementById('startTime').value = course.startTime;
            document.getElementById('endTime').value = course.endTime;
            userSelect.value = owner;
            userSelect.disabled = true;
            
            const checks = document.querySelectorAll('input[name="days"]');
            course.days.forEach(d => {
                const cb = Array.from(checks).find(c => c.value == d);
                if (cb) cb.checked = true;
            });
            deleteOptions.classList.remove('hidden');
            // Set up delete button actions
            const deleteBtn = document.getElementById('deleteBtn');
            const deleteDayBtn = document.getElementById('deleteDayBtn');
            
            deleteBtn.onclick = () => removeCourse(course.id, owner);
            
            if (course.days.length > 1 && clickedDay !== null) {
                deleteDayBtn.style.display = 'block';
                deleteDayBtn.onclick = () => removeCourseDay(course.id, owner, parseInt(clickedDay));
            } else {
                deleteDayBtn.style.display = 'none';
            }
        }

        modal.style.display = 'block';
    }

    async function saveCourse() {
        const id = document.getElementById('courseId').value || Date.now().toString();
        const days = Array.from(document.querySelectorAll('input[name="days"]:checked')).map(c => parseInt(c.value));
        
        if (days.length === 0) {
            alert('Selecciona al menos un día');
            return;
        }

        const owner = document.getElementById('courseUserSelect').value;

        const newCourse = {
            id,
            name: document.getElementById('courseName').value,
            modality: document.getElementById('courseModality').value,
            sede: document.getElementById('courseSede').value,
            startTime: document.getElementById('startTime').value,
            endTime: document.getElementById('endTime').value,
            days
        };

        await saveToSupabase(newCourse, owner);
        modal.style.display = 'none';
    }

    async function removeCourse(id, owner) {
        await removeFromSupabase(id);
        modal.style.display = 'none';
    }

    async function removeCourseDay(id, owner, day) {
        const course = courses[owner].find(c => c.id === id);
        if (course) {
            course.days = course.days.filter(d => d !== day);
            if (course.days.length === 0) {
                await removeFromSupabase(id);
            } else {
                await saveToSupabase(course, owner);
            }
        }
        modal.style.display = 'none';
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
