/* ===== Dashboard Carga Docente =====
   Fuente: hoja CARGA_HORARIA (una fila por docente).
   Ojo: la hoja repite los encabezados FALTA y CUMPLIMIENTO (uno por modulo),
   por eso las columnas se leen por INDICE y no por nombre. */
const SHEET_ID = '19gd-PXm-8Abftuw706RwQS22rupZe7_sGAzasMNY9cA';
const SHEET_NAME = 'CARGA_HORARIA';
const CSV_URL = () => 'https://docs.google.com/spreadsheets/d/' + SHEET_ID +
  '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(SHEET_NAME) + '&t=' + Date.now();

const COL = { DNI:0, NOMBRE:1, CORREO:2, TIPO:4, SEDE:5, PROG:6, CONTRATO:7,
              JUN_M2:8, AGO_M1:9, SET_M1:10, REGULAR:11, MOD1:12,
              AGO_M2:15, SET_M2:16, MOD2:17, TOTAL:20, VIRT:21, PRES:22 };

const PALETTE = ['#008272','#002d72','#9b51e0','#f2a900','#2e9e5b','#e30613','#00a3b5','#8a94a6'];
const SEDE_FIX = { SURCO:'PRC', NORTE:'NOR', VIRT:'VIRTUAL' };
const TIPO_ORDER = ['PTC','PTC IN','PTD','PTP','PPH','TCxH','SIN DATO'];
const TIPO_MAP = {'PTCIN':'PTC IN','PTC-IN':'PTC IN','TCRXH':'TCxH','TPXH':'TCxH','TCXH':'TCxH'};
function normTipo(raw){
  const s = txt(raw).toUpperCase();
  if(!s) return 'SIN DATO';
  return TIPO_MAP[s.replace(/\s+/g,'')] || TIPO_MAP[s] || s;
}

let DATA = [];
const state = { tipo:new Set(), sede:new Set(), prog:new Set(), estado:null, bucket:null,
                q:'', modulo:'M1', sortKey:'nombre', sortDir:1 };

/* ---------- utilidades ---------- */
function parseCSV(text){
  const rows=[]; let row=[], cell='', q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){
      if(c==='"'){ if(text[i+1]==='"'){cell+='"';i++;} else q=false; }
      else cell+=c;
    }else{
      if(c==='"') q=true;
      else if(c===','){ row.push(cell); cell=''; }
      else if(c==='\n'){ row.push(cell); rows.push(row); row=[]; cell=''; }
      else if(c!=='\r') cell+=c;
    }
  }
  if(cell!=='' || row.length){ row.push(cell); rows.push(row); }
  return rows;
}
const num = v => { const n=parseFloat(String(v==null?'':v).replace(/[^0-9.\-]/g,'')); return isNaN(n)?0:n; };
const txt = v => String(v==null?'':v).replace(/\s+/g,' ').trim();
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function normSede(raw){
  const s = txt(raw).toUpperCase();
  if(!s) return 'SIN SEDE';
  const first = s.split(/[\/\-,]/).map(t=>t.trim()).filter(Boolean)[0] || '';
  return SEDE_FIX[first] || first || 'SIN SEDE';
}
const pctClass = p => p>100.5 ? 'over' : p>=99.5 ? 'ok' : p>0 ? 'mid' : 'low';
function bucketOf(d){
  if(d.contrato<=0) return 'Sin contrato';
  const p = pOf(d);
  if(p<=0) return 'Sin carga';
  if(p<50) return 'Menos de 50%';
  if(p<99.5) return '50 a 99%';
  if(p<=100.5) return 'Completo (100%)';
  return 'Excede';
}
const BUCKETS = ['Sin carga','Menos de 50%','50 a 99%','Completo (100%)','Excede','Sin contrato'];
const BUCKET_COLOR = {'Sin carga':'#8a94a6','Menos de 50%':'#e30613','50 a 99%':'#f2a900',
                      'Completo (100%)':'#2e9e5b','Excede':'#9b51e0','Sin contrato':'#5a5f6b'};
const fmt = n => (Math.round(n*100)/100).toLocaleString('es-PE');

/* ---------- carga ---------- */
async function load(){
  const st = document.getElementById('status');
  st.className = 'dash-status show info';
  st.textContent = 'Cargando datos de la hoja CARGA_HORARIA...';
  try{
    const res = await fetch(CSV_URL());
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const rows = parseCSV(await res.text());
    if(rows.length < 2) throw new Error('La hoja no devolvio filas.');
    DATA = rows.slice(1).filter(r => txt(r[COL.DNI]) || txt(r[COL.NOMBRE])).map(r => {
      const contrato = num(r[COL.CONTRATO]), m1 = num(r[COL.MOD1]), m2 = num(r[COL.MOD2]);
      const total = num(r[COL.TOTAL]);
      return {
        dni:txt(r[COL.DNI]), nombre:txt(r[COL.NOMBRE]), correo:txt(r[COL.CORREO]).toLowerCase(),
        tipo:normTipo(r[COL.TIPO]),
        sede:normSede(r[COL.SEDE]), prog:txt(r[COL.PROG]) || 'SIN PROGRAMA',
        contrato, m1, m2,
        p1: contrato>0 ? m1/contrato*100 : 0,
        p2: contrato>0 ? m2/contrato*100 : 0,
        d1: contrato-m1, d2: contrato-m2,
        total, virt:num(r[COL.VIRT]), pres:num(r[COL.PRES]), conCarga: total>0
      };
    });
    st.className = 'dash-status';
    render();
  }catch(e){
    st.className = 'dash-status show err';
    st.innerHTML = '<b>No se pudieron cargar los datos.</b> ' + esc(e.message) +
      '<br>Verifica que la hoja este compartida como "cualquiera con el enlace".';
    document.getElementById('tblBody').innerHTML =
      '<tr><td colspan="12"><div class="empty">Sin datos.</div></td></tr>';
  }
}

/* ---------- filtrado ---------- */
const pOf = d => state.modulo==='M2' ? d.p2 : d.p1;
const hOf = d => state.modulo==='M2' ? d.m2 : d.m1;

function passes(d, skip){
  if(skip!=='tipo'   && state.tipo.size && !state.tipo.has(d.tipo)) return false;
  if(skip!=='sede'   && state.sede.size && !state.sede.has(d.sede)) return false;
  if(skip!=='prog'   && state.prog.size && !state.prog.has(d.prog)) return false;
  if(skip!=='estado' && state.estado && (state.estado==='con') !== d.conCarga) return false;
  if(skip!=='bucket' && state.bucket && bucketOf(d) !== state.bucket) return false;
  if(state.q){
    const q = state.q.toLowerCase();
    if(!(d.nombre.toLowerCase().includes(q) || d.dni.includes(q) || d.correo.includes(q))) return false;
  }
  return true;
}
const filtered = skip => DATA.filter(d => passes(d, skip));

/* ---------- render ---------- */
function render(){ renderChips(); renderKPIs(); renderCharts(); renderTable(); }

function countBy(list, key){
  const m = new Map();
  list.forEach(d => m.set(d[key], (m.get(d[key])||0) + 1));
  return m;
}
function chipHTML(val, count, active, dataVal){
  return '<button class="chip' + (active?' on':'') + '" data-v="' + esc(dataVal!==undefined?dataVal:val) +
         '">' + esc(val) + '<span class="n">' + count + '</span></button>';
}

function renderChips(){
  const ordered = (m, order) => {
    const keys = [...m.keys()];
    return order ? order.filter(k => m.has(k)).concat(keys.filter(k => !order.includes(k)).sort())
                 : keys.sort((a,b) => m.get(b) - m.get(a));
  };
  const tipos = countBy(filtered('tipo'), 'tipo');
  document.getElementById('fTipo').innerHTML =
    ordered(tipos, TIPO_ORDER).map(k => chipHTML(k, tipos.get(k), state.tipo.has(k))).join('');
  const sedes = countBy(filtered('sede'), 'sede');
  document.getElementById('fSede').innerHTML =
    ordered(sedes).map(k => chipHTML(k, sedes.get(k), state.sede.has(k))).join('');
  const progs = countBy(filtered('prog'), 'prog');
  document.getElementById('fProg').innerHTML =
    ordered(progs).map(k => chipHTML(k, progs.get(k), state.prog.has(k))).join('');
  const est = filtered('estado');
  document.getElementById('fEstado').innerHTML =
    chipHTML('Con carga', est.filter(d=>d.conCarga).length, state.estado==='con', 'con') +
    chipHTML('Sin carga', est.filter(d=>!d.conCarga).length, state.estado==='sin', 'sin');
  document.querySelectorAll('#fModulo .chip').forEach(b =>
    b.classList.toggle('on', b.dataset.v === state.modulo));
}

function renderKPIs(){
  const f = filtered(), con = f.filter(d=>d.conCarga);
  const hAsig = f.reduce((s,d)=>s+hOf(d),0), hCont = f.reduce((s,d)=>s+d.contrato,0);
  const exceden = f.filter(d => d.contrato>0 && (d.m1>d.contrato || d.m2>d.contrato)).length;
  const completos = f.filter(d => d.contrato>0 && pOf(d)>=99.5 && pOf(d)<=100.5).length;
  const sinCont = f.filter(d => d.contrato<=0).length;
  const virt = f.reduce((s,d)=>s+d.virt,0), pres = f.reduce((s,d)=>s+d.pres,0);
  const pct = hCont>0 ? hAsig/hCont*100 : 0;
  const kpi = (lab,val,sub,cls) => '<div class="kpi ' + (cls||'') + '"><div class="k-lab">' + lab +
    '</div><div class="k-val">' + val + '</div><div class="k-sub">' + sub + '</div></div>';
  document.getElementById('kpis').innerHTML =
    kpi('Docentes', f.length, DATA.length + ' en total', 'k-blue') +
    kpi('Con carga', con.length, f.length ? (con.length/f.length*100).toFixed(1) + '% del filtro' : '-', 'k-green') +
    kpi('Sin carga', f.length - con.length, 'sin cursos asignados', '') +
    kpi('Horas ' + state.modulo, fmt(hAsig), 'de ' + fmt(hCont) + ' h contratadas', 'k-purple') +
    kpi('Ocupacion ' + state.modulo, pct.toFixed(1) + '%', 'asignadas / contrato', 'k-amber') +
    kpi('Al 100%', completos, 'cumplen exacto', 'k-green') +
    kpi('Exceden', exceden, 'sobre su contrato', 'k-red') +
    kpi('Sin contrato', sinCont, 'horas de contrato en blanco', sinCont ? 'k-red' : '') +
    kpi('Cursos', fmt(virt + pres), fmt(virt) + ' virt / ' + fmt(pres) + ' pres', '');
}

function donut(pairs, total, colorFn, unit){
  const R = 40, C = 2*Math.PI*R;
  let off = 0;
  const segs = pairs.map(([k,v],i) => {
    const len = (total ? v/total : 0) * C;
    const s = '<circle r="' + R + '" cx="55" cy="55" fill="none" stroke="' + colorFn(k,i) +
      '" stroke-width="20" stroke-dasharray="' + len + ' ' + (C-len) + '" stroke-dashoffset="' + (-off) +
      '" transform="rotate(-90 55 55)"><title>' + esc(k) + ': ' + v + '</title></circle>';
    off += len;
    return s;
  }).join('');
  return '<svg viewBox="0 0 110 110" width="110" height="110">' + segs +
    '<text x="55" y="53" text-anchor="middle" font-size="17" font-weight="700" fill="#714B67">' + total + '</text>' +
    '<text x="55" y="67" text-anchor="middle" font-size="8" fill="#7d7d7d">' + unit + '</text></svg>';
}
function legend(pairs, total, colorFn, activeSet){
  return pairs.map(([k,v],i) => {
    const off = activeSet && activeSet.size && !activeSet.has(k) ? ' off' : '';
    return '<div class="leg' + off + '" data-v="' + esc(k) + '"><span class="dot" style="background:' +
      colorFn(k,i) + '"></span>' + esc(k) + '<span class="lv">' + v +
      (total ? ' (' + (v/total*100).toFixed(0) + '%)' : '') + '</span></div>';
  }).join('');
}
function barList(pairs, max, colorFn, activeSet, suffix){
  return pairs.map(([k,v],i) => {
    const off = activeSet && activeSet.size && !activeSet.has(k) ? ' off' : '';
    return '<div class="bar-row' + off + '" data-v="' + esc(k) + '"><div class="bar-lab"><span>' + esc(k) +
      '</span><span class="v">' + fmt(v) + (suffix||'') + '</span></div><div class="bar-track"><div class="bar-fill" style="width:' +
      (max ? v/max*100 : 0) + '%;background:' + colorFn(k,i) + '"></div></div></div>';
  }).join('');
}

function renderCharts(){
  const cTipo = k => PALETTE[Math.max(0, TIPO_ORDER.indexOf(k)) % PALETTE.length];

  // 1. docentes por tipo de contrato
  const t = countBy(filtered('tipo'), 'tipo');
  const tp = TIPO_ORDER.filter(k => t.has(k))
    .concat([...t.keys()].filter(k => !TIPO_ORDER.includes(k)).sort())
    .map(k => [k, t.get(k)]);
  const tot = tp.reduce((s,[,v]) => s+v, 0);
  document.getElementById('chTipo').innerHTML = '<div class="donut-wrap">' +
    donut(tp, tot, cTipo, 'docentes') +
    '<div class="legend" id="legTipo">' + legend(tp, tot, cTipo, state.tipo) + '</div></div>';

  // 2. docentes por sede
  const sp = [...countBy(filtered('sede'), 'sede').entries()].sort((a,b) => b[1]-a[1]);
  document.getElementById('chSede').innerHTML =
    barList(sp, Math.max(...sp.map(x=>x[1]), 1), (k,i) => PALETTE[i%PALETTE.length], state.sede);

  // 3. cumplimiento por rango
  const bc = new Map(BUCKETS.map(b => [b,0]));
  filtered('bucket').forEach(d => { const b = bucketOf(d); bc.set(b, bc.get(b)+1); });
  const bp = BUCKETS.map(b => [b, bc.get(b)]);
  document.getElementById('chCumpl').innerHTML =
    barList(bp, Math.max(...bp.map(x=>x[1]), 1), k => BUCKET_COLOR[k],
            state.bucket ? new Set([state.bucket]) : null);

  // 4. ocupacion por tipo de contrato
  const ff = filtered(), agg = new Map();
  ff.forEach(d => { const a = agg.get(d.tipo) || {as:0, co:0}; a.as += hOf(d); a.co += d.contrato; agg.set(d.tipo, a); });
  const rows = TIPO_ORDER.filter(k => agg.has(k))
    .concat([...agg.keys()].filter(k => !TIPO_ORDER.includes(k)).sort()).map(k => {
    const a = agg.get(k);
    return [k, a.co>0 ? a.as/a.co*100 : 0];
  });
  document.getElementById('chOcup').innerHTML =
    barList(rows, Math.max(100, ...rows.map(x=>x[1])), cTipo, null, '%');

  // 5. modalidad de los cursos
  const v = ff.reduce((s,d)=>s+d.virt,0), p = ff.reduce((s,d)=>s+d.pres,0);
  const cMod = k => k==='VIRTUAL' ? '#008272' : '#002d72';
  const mp = [['VIRTUAL',v],['PRESENCIAL',p]];
  document.getElementById('chModal').innerHTML = '<div class="donut-wrap">' +
    donut(mp, v+p, cMod, 'cursos') +
    '<div class="legend">' + legend(mp, v+p, cMod, null) + '</div></div>';
}

const SORTS = { nombre:d=>d.nombre, tipo:d=>d.tipo, sede:d=>d.sede, prog:d=>d.prog,
                contrato:d=>d.contrato, m1:d=>d.m1, p1:d=>d.p1, d1:d=>d.d1,
                m2:d=>d.m2, p2:d=>d.p2, d2:d=>d.d2, total:d=>d.total };

function renderTable(){
  const f = filtered().slice();
  const g = SORTS[state.sortKey] || SORTS.nombre;
  f.sort((a,b) => {
    const x = g(a), y = g(b);
    return (typeof x === 'string' ? x.localeCompare(y,'es') : x-y) * state.sortDir;
  });
  const cells = (m,p,d) => '<td class="num">' + fmt(m) + '</td><td class="num"><span class="pct ' +
    pctClass(p) + '">' + p.toFixed(1) + '%</span></td><td class="num">' + fmt(Math.abs(d)) + '</td>';
  document.getElementById('tblBody').innerHTML = f.length ? f.map(d =>
    '<tr><td class="name">' + esc(d.nombre) +
    '<br><span class="dni">' + esc(d.dni) + '</span></td>' +
    '<td><span class="pill pill-t">' + esc(d.tipo) + '</span></td>' +
    '<td><span class="pill pill-s">' + esc(d.sede) + '</span></td>' +
    '<td>' + esc(d.prog) + '</td>' +
    '<td class="num">' + fmt(d.contrato) + '</td>' +
    cells(d.m1, d.p1, d.d1) + cells(d.m2, d.p2, d.d2) +
    '<td class="num">' + fmt(d.total) + '</td></tr>').join('')
    : '<tr><td colspan="12"><div class="empty">Ningun docente coincide con los filtros.</div></td></tr>';
  document.getElementById('tblCount').textContent = f.length + ' de ' + DATA.length + ' docentes';
  const hGrp = document.querySelector('thead tr.g1 th.grp');
  if(hGrp){
    const top = Math.round(hGrp.getBoundingClientRect().height) + 'px';
    document.querySelectorAll('thead tr.g2 th').forEach(th => th.style.top = top);
  }
  document.querySelectorAll('th[data-k]').forEach(th => {
    const base = th.dataset.lab || th.textContent.replace(/ [▲▼]$/,'');
    th.dataset.lab = base;
    th.textContent = base + (th.dataset.k===state.sortKey ? (state.sortDir>0 ? ' ▲' : ' ▼') : '');
  });
}

/* ---------- exportar ---------- */
function exportCSV(){
  const head = ['DNI','Docente','Correo','Tipo','Sede','Programa','Horas contrato',
    'Modulo 1','Cumpl. M1 %','Dif. M1','Modulo 2','Cumpl. M2 %','Dif. M2','Total','Virtuales','Presenciales'];
  const q = v => '"' + String(v).replace(/"/g,'""') + '"';
  const body = filtered().map(d => [d.dni,d.nombre,d.correo,d.tipo,d.sede,d.prog,d.contrato,
    d.m1,d.p1.toFixed(2),Math.abs(d.d1),d.m2,d.p2.toFixed(2),Math.abs(d.d2),
    d.total,d.virt,d.pres].map(q).join(','));
  const blob = new Blob(['﻿' + [head.map(q).join(',')].concat(body).join('\n')],
    {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'carga_docente_filtrado.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- eventos ---------- */
const toggleSet = (set,v) => { set.has(v) ? set.delete(v) : set.add(v); };

document.addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if(chip){
    const box = chip.parentElement.id, v = chip.dataset.v;
    if(box==='fTipo') toggleSet(state.tipo, v);
    else if(box==='fSede') toggleSet(state.sede, v);
    else if(box==='fProg') toggleSet(state.prog, v);
    else if(box==='fEstado') state.estado = state.estado===v ? null : v;
    else if(box==='fModulo') state.modulo = v;
    render();
    return;
  }
  const leg = e.target.closest('#legTipo .leg');
  if(leg){ toggleSet(state.tipo, leg.dataset.v); render(); return; }
  const bar = e.target.closest('#chSede .bar-row');
  if(bar){ toggleSet(state.sede, bar.dataset.v); render(); return; }
  const cb = e.target.closest('#chCumpl .bar-row');
  if(cb){ state.bucket = state.bucket===cb.dataset.v ? null : cb.dataset.v; render(); return; }
  const th = e.target.closest('th[data-k]');
  if(th){
    const k = th.dataset.k;
    if(state.sortKey===k) state.sortDir *= -1; else { state.sortKey = k; state.sortDir = 1; }
    renderTable();
  }
});
document.getElementById('q').addEventListener('input', e => { state.q = e.target.value.trim(); render(); });
document.getElementById('btnClear').addEventListener('click', () => {
  state.tipo.clear(); state.sede.clear(); state.prog.clear();
  state.estado = null; state.bucket = null; state.q = '';
  document.getElementById('q').value = '';
  render();
});
document.getElementById('btnReload').addEventListener('click', load);
document.getElementById('btnExport').addEventListener('click', exportCSV);

load();
