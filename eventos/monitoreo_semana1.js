const CAMPUS='Sede Monitoreada', TURN='Turno', MON='Monitor', DATE='Fecha';
const MOMENTOS=[
  ['Pre monitoreo (6:40 a 6:50)','Comentario - Pre monitoreo (6:40 a 6:50)'],
  ['1er monitoreo (6:50 a 7:00)','Comentario - 1er monitoreo (6:50 a 7:00)'],
  ['2do monitoreo (7:10 a 7:30)','Comentario - 2do monitoreo (7:10 a 7:30)'],
  ['3er monitoreo (8:30 a 9:00)','Comentario - 3er monitoreo (8:30 a 9:00)'],
  ['4to monitoreo (10:30 a 10:45)','Comentario - 4to monitoreo (10:30 a 10:45)']
];
const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let DATA=[];
const shortDate=v=>{if(!v)return '—';let [y,m,d]=String(v).slice(0,10).split('-');return `${d}/${m}/${y}`};
function unique(key){return [...new Set(DATA.map(r=>r[key]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'es'))}
function fillSelect(id,values){for(const v of values){const o=document.createElement('option');o.value=v;o.textContent=v;$(id).append(o)}}
function filtered(){const s=$('sede').value,t=$('turno').value,m=$('monitor').value,e=$('estado').value,q=$('buscar').value.trim().toLocaleLowerCase('es');return DATA.filter(r=>{
 if(s&&r[CAMPUS]!==s||t&&r[TURN]!==t||m&&r[MON]!==m)return false;
 const states=MOMENTOS.map(([k])=>r[k]).filter(Boolean);if(e&&!states.includes(e))return false;
 if(q&&!Object.values(r).some(v=>String(v??'').toLocaleLowerCase('es').includes(q)))return false;return true;
})}
function render(){const rows=filtered(),momCounts=MOMENTOS.map(([k])=>({name:k.replace(/ \(.+/,''),vals:MOMENTOS.reduce((a,[key])=>a+(rows.filter(r=>r[key]===k).length),0)}));
 const states=rows.flatMap(r=>MOMENTOS.map(([k])=>r[k]).filter(Boolean));const c=Object.fromEntries(['Conforme','Con observación','No aplica','No se pudo verificar'].map(s=>[s,states.filter(x=>x===s).length]));
 const obs=c['Con observación'],ok=c.Conforme, rate=states.length?Math.round(ok/states.length*100):0, monitors=new Set(rows.map(r=>r[MON])).size;
 $('filter-summary').textContent=`${rows.length} de ${DATA.length} respuestas · ${monitors} monitores`;
 $('kpis').innerHTML=[['Respuestas',rows.length,'Registros de formulario','brand'],['Monitores',monitors,'Con al menos un registro',''],['Conformes',ok,`${rate}% de estados registrados`,'ok'],['Con observación',obs,'Puntos que requieren seguimiento','warn'],['Fechas por revisar',rows.filter(r=>String(r[DATE]||'').startsWith('2026-12-19')).length,'AQP aparece con 19/12','red']].map(x=>`<article class="kpi ${x[3]}"><div class="label">${x[0]}</div><div class="value">${x[1]}</div><div class="hint">${x[2]}</div></article>`).join('');
 const max=Math.max(1,...rows.map(r=>MOMENTOS.length));
 $('status-chart').innerHTML=MOMENTOS.map(([key])=>{const vals=['Conforme','Con observación','No aplica','No se pudo verificar'].map(s=>rows.filter(r=>r[key]===s).length),n=vals.reduce((a,b)=>a+b,0);return `<div class="status-row"><span class="status-label">${esc(key.replace(/ \(.+/,''))}</span><div class="stack" title="${vals.join(' / ')}">${vals.map((v,i)=>`<span class="${['ok','warn','neutral','neutral'][i]}" style="width:${n?v/n*100:0}%"></span>`).join('')}</div><span class="status-total">${n}</span></div>`}).join('')||'<div class="no-data">Sin resultados para estos filtros.</div>';
 const campuses=unique(CAMPUS).map(s=>[s,rows.filter(r=>r[CAMPUS]===s).length]).sort((a,b)=>b[1]-a[1]),maxCampus=Math.max(1,...campuses.map(x=>x[1]));
 $('campus-chart').innerHTML=campuses.length?campuses.map(([s,n])=>`<div class="bar-row"><span>${esc(s)}</span><div class="bar-track"><div class="bar-fill" style="width:${n/maxCampus*100}%"></div></div><span class="bar-num">${n}</span></div>`).join(''):'<div class="no-data">Sin resultados.</div>';
 $('rows').innerHTML=rows.length?rows.slice().sort((a,b)=>String(a[DATE]).localeCompare(String(b[DATE]))).map(r=>{
 const chips=MOMENTOS.map(([k])=>r[k]?`<span class="state-chip ${r[k]==='Con observación'?'warn':r[k]==='No aplica'||r[k]==='No se pudo verificar'?'neutral':''}">${esc(k.split(' ')[0])}: ${esc(r[k])}</span>`:'').join('');
 const notes=MOMENTOS.map(([k,comment])=>r[comment]?`<div class="comment"><b>${esc(k.split(' (')[0])}:</b> ${esc(r[comment])}</div>`:'').join('');
 return `<tr><td>${shortDate(r[DATE])}${String(r[DATE]||'').startsWith('2026-12-19')?'<br><span class="tag">revisar</span>':''}</td><td><b>${esc(r[CAMPUS])}</b><br>${esc(r[TURN])}</td><td>${esc(r[MON])}</td><td>${chips}</td><td>${notes||'—'}${r['Recomendaciones']?`<div class="comment"><b>Recomendación:</b> ${esc(r['Recomendaciones'])}</div>`:''}</td></tr>`}).join(''):'<tr><td colspan="5" class="empty">No hay respuestas con los filtros elegidos.</td></tr>';
 $('table-count').textContent=`${rows.length} respuestas · selecciona filtros para explorar`;
}
const HALLAZGOS=[
 ['Puntualidad y arranque','En AQP (chat del 19/10) se reportó asistencia general con tardanzas, sin detallar nombres. En VES se documentaron dos tardanzas y en SJL se pidió reforzar la llegada anticipada.','Consolidar docente, sede, minutos y seguimiento individual.'],
 ['Break y retorno','Se registraron salidas tardías, retornos de hasta ~20 minutos y una demora que afectó el ingreso de estudiantes después del receso.','Alinear el tiempo permitido y comprobar el retorno al aula.'],
 ['Desarrollo de clase','En monitoreos virtuales aparecen sesiones con actividades pendientes, sílabo no presentado, cierres sin ideas clave, fondos desactualizados y dificultades técnicas.','Dar seguimiento docente y resolver accesos/TI antes de observar.'],
 ['Información en sede','El chat reportó pantallas desactualizadas en SJL; el formulario señala listados desactualizados en ATE. También se notificaron incidencias de aula/aforo e infraestructura.','Asignar responsables y fechas para pantallas, aulas y mantenimiento.'],
 ['Asistencia y acceso','Se reportó un grupo sin estudiantes al inicio y ausencia de docentes de otra línea; algunas observaciones no pudieron verificarse por falta de acceso oportuno.','Validar asistencia con coordinación y habilitar acceso al monitoreo.'],
 ['Programación incompleta','Las capturas contienen celdas sin monitor visible; el formulario no basta para afirmar cobertura diaria de todos los turnos.','Cruzar agenda día/sede/turno con las respuestas antes de marcar faltantes.']
];
function renderIssues(){$('issues').innerHTML=HALLAZGOS.map(([h,p,a])=>`<article class="issue"><h4>${h}</h4><p>${p}</p><div class="action">Siguiente paso · ${a}</div></article>`).join('')}
function csv(){const rows=filtered(),cols=['Fecha',MON,CAMPUS,TURN,...MOMENTOS.flatMap(x=>x), 'Recomendaciones'];const cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const text=[cols.map(cell).join(','),...rows.map(r=>cols.map(k=>cell(r[k])).join(','))].join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+text],{type:'text/csv;charset=utf-8'}));a.download='monitoreo_semana1_filtrado.csv';a.click();URL.revokeObjectURL(a.href)}
async function init(){try{const res=await fetch('datos/monitoreo_semana1.json');if(!res.ok)throw new Error('No se encontró el archivo de respuestas.');DATA=await res.json();fillSelect('sede',unique(CAMPUS));fillSelect('turno',unique(TURN));fillSelect('monitor',unique(MON));render();renderIssues();$('date-alert').textContent=`${DATA.filter(r=>String(r[DATE]||'').startsWith('2026-12-19')).length} fechas por revisar`;for(const id of ['sede','turno','monitor','estado'])$(id).addEventListener('change',render);$('buscar').addEventListener('input',render);$('reset').onclick=()=>{$('sede').value=$('turno').value=$('monitor').value=$('estado').value=$('buscar').value='';render()};$('print').onclick=()=>window.print();$('download').onclick=csv}catch(e){document.querySelector('main').innerHTML=`<div class="panel">No se pudieron cargar los datos: ${esc(e.message)}. Abre esta página desde el servidor del proyecto (GitHub Pages o localhost).</div>`}}
if(new URLSearchParams(location.search).has('embed'))document.body.classList.add('embed');
init();
