# -*- coding: utf-8 -*-
"""Genera secciones.json: todos los cursos con sus secciones, NRC, docente,
sede, aula y horario, para el panel «Monitoreo sección» de horario.html.

  1. Las clases salen de la hoja CARGA_HORARIA (todos los cursos, secciones,
     NRC, docentes, dias y horas). La hoja no trae el aula.
  2. El aula sale del Portal de Horarios (https://horarioacademico.certus.edu.pe),
     que la da al consultar el DNI de un alumno. El portal no permite consultas
     desde otras webs (sin CORS), por eso se consulta desde aqui.
  3. Para AQP tambien se usa el monitoreo de visitas de esa sede.
  4. Se reutilizan las aulas del secciones.json anterior y solo se consultan
     alumnos de los salones (periodo + sede + seccion) con clases sin aula: de la
     base de estudiantes (Supabase) y, si se pasa, del reporte de notas, se elige
     el minimo de alumnos que cubre esos salones (cobertura greedy).

Uso:
    python tools/actualizar_secciones.py
    python tools/actualizar_secciones.py --max 5     # prueba rapida
    python tools/actualizar_secciones.py --todo      # vuelve a consultar todo
    python tools/actualizar_secciones.py --notas "C:/.../Notas_Filtrado.xlsx"   # mas alumnos por seccion

Salida: secciones.json en la raiz del repo. Ningun dato de alumnos (DNI,
nombre, correo) llega al archivo; solo el DNI del docente, que ya es publico
en docentes.html.
"""
import argparse, collections, csv, io, json, os, re, sys, time
import urllib.request
from datetime import datetime

from actualizar_aulas import consultar, sin_tilde, PAUSA, RAIZ

CARGA_CSV = ('https://docs.google.com/spreadsheets/d/1kNqEDwXe5Iqj9m54E--_WEe2wKxjTschDLgYnXeBS7w'
             '/export?format=csv&gid=1470879596')
SB_URL = 'https://klmjmlhwuzhymrplemgw.supabase.co'
SB_KEY = ('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsbWptbGh3dXpoeW1ycGxlbWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTMyNjQsImV4cCI6MjA4NzE2OTI2NH0'
          '.xFWMvUJa9n9TBcBG1WSeqCGiWBaCAtCU9aY7GXk4W6E')
# Hoja ESTUDIANTES (ALUMNO, DNI): para pasar del nombre del reporte de notas al DNI
ESTUDIANTES_CSV = ('https://docs.google.com/spreadsheets/d/e/2PACX-1vSbJ9v-qxajK2K221OqEeBbUEWNJRnmwNl8TLeAJsqfncUuiaBsRHs_gjzB7DMgJTQAKHLPHoMjJhR_'
                   '/pub?gid=1490857623&single=true&output=csv')
SALIDA = os.path.join(RAIZ, 'secciones.json')
RONDAS = 5           # intentos por salon (otro alumno si el elegido no tiene horario)
# Monitoreo de visitas de AQP: trae el aula de todas las clases de esa sede
MONITOREO_AQP = 'https://monitoreo-aqp.edu-mamaniroque.workers.dev/'
DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO']


def leer_url(url, datos=None, cabeceras=None):
    req = urllib.request.Request(url, data=datos, method='POST' if datos is not None else 'GET',
                                 headers=cabeceras or {'User-Agent': 'Mozilla/5.0 (reporte interno COT)'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode('utf-8')


def rpc(fn, args):
    return json.loads(leer_url(SB_URL + '/rest/v1/rpc/' + fn, json.dumps(args).encode('utf-8'),
                               {'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY,
                                'Content-Type': 'application/json'}))


def leer_carga():
    """Una fila por clase (NRC + dia) desde CARGA_HORARIA."""
    filas = list(csv.reader(io.StringIO(leer_url(CARGA_CSV))))[1:]
    clases = []
    for r in filas:
        r = r + [''] * (20 - len(r))
        nrc, sec = r[7].strip(), r[5].strip().upper()
        if not (nrc and sec):
            continue
        dias = [sin_tilde(d) for d in re.findall(r'\(([^)]*)\)', r[16])]
        horas = re.findall(r'(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})', r[17])
        for i, dia in enumerate(dias):
            if dia not in DIAS:
                continue
            ini, fin = horas[i] if i < len(horas) else (horas[-1] if horas else ('', ''))
            clases.append({
                'carga': r[0].strip(), 'nrc': nrc, 'curso': r[4].strip(), 'seccion': sec,
                'docente': r[2].strip(), 'dni': r[1].strip(), 'programa': r[19].strip(),
                'modalidad': r[15].strip().upper(), 'modulo': r[6].strip().upper(), 'periodo': r[11].strip().upper(),
                'sede': r[3].strip().upper(), 'aula': '', 'dia': dia,
                'ini': ini.zfill(5), 'fin': fin.zfill(5), 'desde': '', 'hasta': ''})
    return clases


def clave(nrc, sec, dia):
    return '%s|%s|%s' % (str(nrc).strip(), str(sec).strip().upper(), dia)


def aulas_previas():
    """Aulas y fechas ya conocidas: del secciones.json anterior."""
    if not os.path.exists(SALIDA):
        return {}
    with io.open(SALIDA, encoding='utf-8') as f:
        viejo = json.load(f)
    return {clave(c['nrc'], c['seccion'], c['dia']): {k: c.get(k, '') for k in ('aula', 'sede', 'desde', 'hasta')}
            for c in viejo.get('clases', []) if c.get('aula')}


def aulas_monitoreo():
    """Aulas de AQP publicadas en el monitoreo de visitas (const RAW = [...])."""
    try:
        m = re.search(r'const RAW = (\[.*?\]);', leer_url(MONITOREO_AQP), re.S)
        raw = json.loads(m.group(1)) if m else []
    except Exception as e:
        print('Monitoreo AQP no disponible: %s' % e)
        return {}
    out = {}
    for r in raw:
        inst = (r.get('aula') or '').strip()
        if '-' in inst:
            sede, aula = inst.split('-', 1)
            out[clave(r.get('clase'), r.get('sec'), sin_tilde(r.get('dia')))] = {
                'aula': aula.strip(), 'sede': sede.strip().upper(), 'desde': '', 'hasta': ''}
    print('Aulas del monitoreo AQP: %d' % len(out))
    return out


# Un salon es periodo + sede + seccion: tiene los mismos alumnos en todos sus
# cursos y en los dos modulos, asi que basta un alumno del salon para ver sus aulas.
def grupo(carga, sede, seccion):
    return '%s|%s|%s' % (str(carga or '').strip(), str(sede or '').strip().upper(), str(seccion or '').strip().upper())


# Campus del reporte de notas -> sede de CARGA_HORARIA
CAMPUS = {'CRT00': 'PRC', 'CRT01': 'VIRTUAL', 'CRT02': 'ATE', 'CRT03': 'AQP',
          'CRT05': 'NOR', 'CRT06': 'SJL', 'CRT07': 'VES'}


def nombre(s):
    return ' '.join(sin_tilde(s).replace(',', ' ').split())


def leer_matriculas(nombres):
    """{dni: set(grupo)} desde la base de estudiantes; llena nombres {nombre: {dni}}."""
    alumnos = collections.defaultdict(set)
    off = 0
    while True:
        parte = rpc('bd_est_matriculas', {'f': {}, 'lim': 1000, 'off': off, 'orden': 'alumno', 'dir': 'asc'})
        for m in parte:
            dni = (m.get('dni') or '').strip()
            if dni and m.get('alumno'):
                nombres[nombre(m['alumno'])].add(dni)
            if dni and m.get('nrc'):
                alumnos[dni].add(grupo(m.get('ciclo'), m.get('sede'), m.get('seccion')))
        off += len(parte)
        print('Matriculas leidas: %d' % off, flush=True)
        if len(parte) < 1000:
            break
    return alumnos


def leer_notas(ruta, alumnos, nombres, sede_nrc):
    """Suma a alumnos las secciones del reporte de notas (hoja Consolidado).
    El reporte trae el ID interno, no el DNI: se cruza por nombre con la hoja
    ESTUDIANTES y la base; los nombres que dan mas de un DNI se descartan."""
    import openpyxl
    for r in list(csv.reader(io.StringIO(leer_url(ESTUDIANTES_CSV))))[1:]:
        if len(r) > 1 and r[0].strip() and r[1].strip():
            nombres[nombre(r[0])].add(r[1].strip())
    ws = openpyxl.load_workbook(ruta, read_only=True, data_only=True)['Consolidado']
    col, cruzados, sin_dni = None, set(), set()
    for fila in ws.iter_rows(values_only=True):
        celdas = [str(x).strip() if x is not None else '' for x in fila]
        if col is None:
            if 'NRC' in celdas and 'Estudiante' in celdas:
                col = {n: celdas.index(n) for n in celdas if n}
            continue
        if celdas[col['F Baja']] or not celdas[col['NRC']]:
            continue
        dnis = nombres.get(nombre(celdas[col['Estudiante']]), set())
        if len(dnis) != 1:
            sin_dni.add(celdas[col['Estudiante']])
            continue
        dni = next(iter(dnis))
        cruzados.add(dni)
        carga = celdas[col['Ccl Lvo']]
        sede = sede_nrc.get((carga, celdas[col['NRC']])) or CAMPUS.get(celdas[col['Campus']], '')
        alumnos[dni].add(grupo(carga, sede, celdas[col['Sección']]))
    print('Reporte de notas: %d alumnos con DNI | %d sin DNI identificable' % (len(cruzados), len(sin_dni)))


def elegir(alumnos, pendientes):
    """Minimo de alumnos que cubre las secciones pendientes (greedy)."""
    pendientes, elegidos = set(pendientes), []
    while pendientes:
        dni, cubre = max(((d, len(s & pendientes)) for d, s in alumnos.items()), key=lambda x: x[1])
        if not cubre:
            break
        elegidos.append(dni)
        pendientes -= alumnos[dni]
    return elegidos, pendientes


def recolectar(dnis):
    """clave(nrc, seccion, dia) -> [{aula, sede, desde, hasta}] desde el portal."""
    vistos, errores = collections.defaultdict(list), []
    for i, dni in enumerate(dnis, 1):
        datos = None
        for intento in range(3):
            try:
                datos = consultar(dni)
                break
            except Exception:
                if intento == 2:
                    errores.append(dni)
                else:
                    time.sleep(3)
        for c in (datos or {}).get('data') or []:
            inst = (c.get('instalacion') or '').strip()
            if not inst:
                continue
            sede, aula = inst.split('-', 1) if '-' in inst else ('', inst)
            if aula.strip().lower() == 'clase virtual':
                sede, aula = 'VIRTUAL', 'Virtual'
            reg = {'aula': aula.strip(), 'sede': sede.strip().upper(),
                   'desde': c.get('fechainicio') or '', 'hasta': c.get('fechafin') or ''}
            k = clave(c.get('idcurso'), c.get('seccion'), sin_tilde(c.get('diaclase')))
            if reg not in vistos[k]:
                vistos[k].append(reg)
        print('%4d/%d  secciones con aula: %d' % (i, len(dnis), len(vistos)), flush=True)
        time.sleep(PAUSA)
    return vistos, errores


def fecha(s):
    try:
        return datetime.strptime(s, '%d/%m/%Y')
    except Exception:
        return None


def vigente(regs):
    """El registro cuyo rango incluye hoy, o el mas reciente."""
    hoy = datetime.now()
    v = [r for r in regs if (fecha(r['desde']) or hoy) <= hoy <= (fecha(r['hasta']) or hoy)]
    return (v or sorted(regs, key=lambda r: fecha(r['hasta']) or hoy))[-1]


def completar(clases, conocidas):
    """Pone aula y fechas; las fechas que falten salen del resto de su periodo/modulo."""
    rangos = collections.defaultdict(collections.Counter)
    for c in clases:
        r = conocidas.get(clave(c['nrc'], c['seccion'], c['dia']))
        if r:
            c['aula'] = r['aula']
            c['desde'], c['hasta'] = r['desde'], r['hasta']
            if r['sede'] and c['sede'] != 'VIRTUAL':
                c['sede'] = r['sede']
            if c['desde']:
                rangos[(c['periodo'], c['modulo'])][(c['desde'], c['hasta'])] += 1
    for c in clases:
        if not c['desde'] and rangos[(c['periodo'], c['modulo'])]:
            c['desde'], c['hasta'] = rangos[(c['periodo'], c['modulo'])].most_common(1)[0][0]
        if c['modalidad'] == 'VIRTUAL' and not c['aula']:
            c['aula'] = 'Virtual'


def main():
    ap = argparse.ArgumentParser(description='Actualiza secciones.json (CARGA_HORARIA + aulas del Portal de Horarios)')
    ap.add_argument('--max', type=int, default=0, help='limita las consultas (para probar)')
    ap.add_argument('--notas', help='reporte de notas .xlsx (hoja Consolidado): mas alumnos por seccion')
    ap.add_argument('--todo', action='store_true', help='ignora las aulas ya conocidas y consulta todo')
    args = ap.parse_args()

    base = leer_carga()
    conocidas = {} if args.todo else aulas_previas()
    for k, v in aulas_monitoreo().items():
        conocidas.setdefault(k, v)
    hoy = datetime.now()

    def pendientes():
        """Salones con clases presenciales vigentes o futuras sin aula conocida."""
        clases = json.loads(json.dumps(base))
        completar(clases, conocidas)
        return {grupo(c['carga'], c['sede'], c['seccion']) for c in clases
                if not c['aula'] and c['modalidad'] != 'VIRTUAL' and (fecha(c['hasta']) or hoy).date() >= hoy.date()}

    faltan = pendientes()
    print('Clases en CARGA_HORARIA: %d | aulas conocidas: %d | salones presenciales con clases sin aula: %d'
          % (len(base), len(conocidas), len(faltan)))

    dnis, errores = [], []
    if faltan:
        nombres = collections.defaultdict(set)
        alumnos = leer_matriculas(nombres)
        if args.notas:
            leer_notas(args.notas, alumnos, nombres, {(c['carga'], c['nrc']): c['sede'] for c in base})
        # Si el alumno elegido ya no tiene horario (retirado), se prueba con otro del salon
        for ronda in range(1, RONDAS + 1):
            lote, sin_alumno = elegir(alumnos, faltan)
            if args.max:
                lote = lote[:max(0, args.max - len(dnis))]
            if not lote:
                break
            print('Ronda %d: %d salones sin aula | %d consultas | %d salones sin alumnos conocidos'
                  % (ronda, len(faltan), len(lote), len(sin_alumno)))
            vistos, err = recolectar(lote)
            for k, regs in vistos.items():
                conocidas[k] = vigente(regs)
            for dni in lote:
                alumnos.pop(dni, None)
            dnis += lote
            errores += err
            faltan = pendientes()

    clases = base
    completar(clases, conocidas)
    orden_dia = {d: i for i, d in enumerate(DIAS)}
    clases.sort(key=lambda c: (orden_dia.get(c['dia'], 9), c['ini'], c['sede'], c['aula'], c['nrc']))
    con_aula = sum(1 for c in clases if c['aula'])
    salida = {'generado': hoy.strftime('%Y-%m-%d %H:%M'), 'consultas': len(dnis),
              'total': len(clases), 'con_aula': con_aula, 'clases': clases}
    with io.open(SALIDA, 'w', encoding='utf-8') as f:
        json.dump(salida, f, ensure_ascii=False, separators=(',', ':'))
    print('\nListo: %s  |  %d clases  |  %d con aula  |  %d consultas fallidas'
          % (SALIDA, len(clases), con_aula, len(errores)))


if __name__ == '__main__':
    main()
