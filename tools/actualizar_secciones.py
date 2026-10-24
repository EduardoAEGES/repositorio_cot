# -*- coding: utf-8 -*-
"""Genera secciones.json: todos los cursos con sus secciones, NRC, docente,
aula y horario, para el panel «Cursos y secciones» de horario.html.

El Portal de Horarios (https://horarioacademico.certus.edu.pe) no permite
consultas desde otras webs (sin CORS), por eso se consulta desde aqui:

  1. Lee las matriculas de la base de estudiantes (Supabase, bd_est_matriculas):
     DNI del alumno, NRC y DNI del docente.
  2. Elige el minimo de alumnos cuyos NRC cubren todos los NRC (cobertura greedy,
     la misma de actualizar_aulas.py) y agrega los DNI de los docentes.
  3. Consulta cada DNI en el portal y junta las clases por NRC.

Uso:
    python tools/actualizar_secciones.py
    python tools/actualizar_secciones.py --max 5     # prueba rapida

Salida: secciones.json en la raiz del repo. Ningun dato de alumnos (DNI,
nombre, correo) llega al archivo; solo el DNI del docente, que ya es publico
en docentes.html.
"""
import argparse, collections, io, json, os, sys, time
import urllib.request
from datetime import datetime

from actualizar_aulas import cobertura, consultar, sin_tilde, PAUSA, RAIZ

SB_URL = 'https://klmjmlhwuzhymrplemgw.supabase.co'
SB_KEY = ('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsbWptbGh3dXpoeW1ycGxlbWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTMyNjQsImV4cCI6MjA4NzE2OTI2NH0'
          '.xFWMvUJa9n9TBcBG1WSeqCGiWBaCAtCU9aY7GXk4W6E')
SALIDA = os.path.join(RAIZ, 'secciones.json')
DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO']


def rpc(fn, args):
    req = urllib.request.Request(SB_URL + '/rest/v1/rpc/' + fn, data=json.dumps(args).encode('utf-8'),
                                 method='POST', headers={'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY,
                                                         'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))


def leer_matriculas():
    """alumnos {dni: {'nrcs', 'sede'}} y base {nrc: datos de la hoja} desde Supabase."""
    alumnos = collections.defaultdict(lambda: {'nrcs': set(), 'sede': ''})
    base = {}
    off = 0
    while True:
        parte = rpc('bd_est_matriculas', {'f': {}, 'lim': 1000, 'off': off, 'orden': 'alumno', 'dir': 'asc'})
        for m in parte:
            dni, nrc = (m.get('dni') or '').strip(), (m.get('nrc') or '').strip()
            if not (dni and nrc):
                continue
            alumnos[dni]['nrcs'].add(nrc)
            alumnos[dni]['sede'] = (m.get('sede') or '').strip()
            if nrc not in base:
                base[nrc] = {k: (m.get(k) or '').strip() for k in
                             ('curso', 'seccion', 'docente', 'dni_docente', 'sede', 'modalidad', 'programa', 'modulo', 'turno')}
        off += len(parte)
        print('Matriculas leidas: %d' % off, flush=True)
        if len(parte) < 1000:
            break
    return alumnos, base


def recolectar(dnis):
    """nrc -> {'curso','seccion','profesor','clases': [ {dia, ini, fin, aula, desde, hasta} ]}"""
    crudo, errores = {}, []
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
            nrc = str(c.get('idcurso') or '').strip()
            if not nrc:
                continue
            reg = crudo.setdefault(nrc, {'curso': '', 'seccion': '', 'profesor': '', 'clases': []})
            for k in ('curso', 'seccion', 'profesor'):
                reg[k] = reg[k] or (c.get(k) or '').strip()
            clase = {'dia': sin_tilde(c.get('diaclase')), 'ini': (c.get('horainicio') or '').strip(),
                     'fin': (c.get('horafin') or '').strip(), 'aula': (c.get('instalacion') or '').strip(),
                     'desde': c.get('fechainicio') or '', 'hasta': c.get('fechafin') or ''}
            if clase not in reg['clases']:
                reg['clases'].append(clase)
        print('%4d/%d  NRC encontrados: %d' % (i, len(dnis), len(crudo)), flush=True)
        time.sleep(PAUSA)
    return crudo, errores


def armar(crudo, base):
    """Una fila por clase (NRC + dia + horario), completada con la hoja."""
    filas = []
    for nrc, r in crudo.items():
        b = base.get(nrc, {})
        for c in r['clases']:
            aula = c['aula']
            sede = aula.split('-', 1)[0] if '-' in aula else (b.get('sede') or '')
            aula = aula.split('-', 1)[-1] if '-' in aula else aula
            if aula.strip().lower() == 'clase virtual':
                aula, sede = 'Virtual', 'VIRTUAL'
            filas.append({
                'nrc': nrc, 'curso': r['curso'] or b.get('curso', ''), 'seccion': r['seccion'] or b.get('seccion', ''),
                'docente': b.get('docente') or r['profesor'], 'dni': b.get('dni_docente', ''),
                'programa': b.get('programa', ''), 'modalidad': b.get('modalidad', ''), 'modulo': b.get('modulo', ''),
                'sede': sede, 'aula': aula, 'dia': c['dia'], 'ini': c['ini'], 'fin': c['fin'],
                'desde': c['desde'], 'hasta': c['hasta']})
    orden_dia = {d: i for i, d in enumerate(DIAS)}
    filas.sort(key=lambda f: (orden_dia.get(f['dia'], 9), f['ini'], f['sede'], f['aula'], f['nrc']))
    return filas


def main():
    ap = argparse.ArgumentParser(description='Actualiza secciones.json desde el Portal de Horarios')
    ap.add_argument('--max', type=int, default=0, help='limita las consultas (para probar)')
    ap.add_argument('--sin-docentes', action='store_true', help='no consulta los DNI de los docentes')
    args = ap.parse_args()

    alumnos, base = leer_matriculas()
    dnis = cobertura(alumnos, 0)
    if not args.sin_docentes:
        ya = set(dnis)
        dnis += sorted({b['dni_docente'] for b in base.values() if b['dni_docente'] and b['dni_docente'] not in ya})
    if args.max:
        dnis = dnis[:args.max]
    print('Alumnos: %d | NRC en la base: %d | consultas a realizar: %d' % (len(alumnos), len(base), len(dnis)))

    crudo, errores = recolectar(dnis)
    filas = armar(crudo, base)
    salida = {'generado': datetime.now().strftime('%Y-%m-%d %H:%M'), 'consultas': len(dnis),
              'nrc_base': len(base), 'nrc_portal': len(crudo), 'clases': filas}
    with io.open(SALIDA, 'w', encoding='utf-8') as f:
        json.dump(salida, f, ensure_ascii=False, separators=(',', ':'))
    print('\nListo: %s  |  %d NRC con horario de %d  |  %d clases  |  %d consultas fallidas'
          % (SALIDA, len(crudo), len(base), len(filas), len(errores)))


if __name__ == '__main__':
    sys.exit(main())
