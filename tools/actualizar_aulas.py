# -*- coding: utf-8 -*-
"""Genera aulas.json para el tablero de cursos y docentes.

La hoja "Analisis de cargas asignadas" no trae el aula. El Portal de Horarios
(https://horarioacademico.certus.edu.pe) si la trae: al consultar el DNI de un
alumno devuelve, por cada clase, el NRC (idcurso), el dia y el aula (instalacion).

Para no consultar 5000 alumnos se resuelve una cobertura greedy: el minimo de
alumnos cuyos NRC, juntos, cubren todos los NRC de la base. En la practica son
~156 consultas para ~620 NRC.

Uso:
    python tools/actualizar_aulas.py "D:/ruta/BASE DATOS CERTUS.xlsx"
    python tools/actualizar_aulas.py "...xlsx" --extra 300   # amplia la cobertura

Salida: aulas.json en la raiz del repo -> { "<NRC>": { "LUNES": "A302A", ... } }
Ningun dato personal (DNI, nombre, correo) llega al archivo de salida.
"""
import argparse, collections, json, io, os, random, sys, time, unicodedata
import urllib.request
from datetime import datetime

PORTAL = 'https://horarioacademico.certus.edu.pe/horario?dni='
PAUSA = 1.0          # segundos entre consultas, para no cargar el portal
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.join(RAIZ, 'aulas.json')

COL_SEDE, COL_NRC, COL_DNI = 2, 5, 10   # columnas de la hoja "Participantes"


def sin_tilde(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s or '')
                   if unicodedata.category(c) != 'Mn').upper().strip()


def leer_base(ruta):
    """Devuelve {dni: {'nrcs': set, 'sede': str}} desde la hoja Participantes."""
    import openpyxl
    ws = openpyxl.load_workbook(ruta, read_only=True, data_only=True)['Participantes']
    alumnos = collections.defaultdict(lambda: {'nrcs': set(), 'sede': ''})
    for fila in list(ws.iter_rows(values_only=True))[1:]:
        dni = str(fila[COL_DNI]).strip() if fila[COL_DNI] else ''
        nrc = str(fila[COL_NRC]).strip() if fila[COL_NRC] else ''
        if not (dni and nrc):
            continue
        alumnos[dni]['nrcs'].add(nrc)
        alumnos[dni]['sede'] = str(fila[COL_SEDE]).strip() if fila[COL_SEDE] else ''
    return alumnos


def cobertura(alumnos, extra):
    """Minimo de alumnos que cubre todos los NRC, mas un lote opcional de
    alumnos presenciales (sus otros cursos revelan aulas que la base no tiene)."""
    pendientes = set().union(*(a['nrcs'] for a in alumnos.values()))
    elegidos = []
    while pendientes:
        dni, cubre = max(((d, len(a['nrcs'] & pendientes)) for d, a in alumnos.items()),
                         key=lambda x: x[1])
        if not cubre:
            break
        elegidos.append(dni)
        pendientes -= alumnos[dni]['nrcs']
    if extra:
        ya = set(elegidos)
        resto = [d for d, a in alumnos.items() if d not in ya and a['sede'] not in ('', 'VIRTUAL')]
        random.seed(7)
        random.shuffle(resto)
        elegidos += resto[:extra]
    return elegidos


def consultar(dni):
    req = urllib.request.Request(PORTAL + dni, data=b'', method='POST',
                                 headers={'Accept': 'application/json',
                                          'User-Agent': 'Mozilla/5.0 (reporte interno COT)'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))


def recolectar(dnis):
    """nrc -> dia -> [ {aula, desde, hasta} ]"""
    crudo, errores = {}, []
    for i, dni in enumerate(dnis, 1):
        datos = None
        for intento in range(3):
            try:
                datos = consultar(dni)
                break
            except Exception as e:
                if intento == 2:
                    errores.append(dni)
                else:
                    time.sleep(3)
        for c in (datos or {}).get('data') or []:
            nrc = str(c.get('idcurso') or '').strip()
            dia = sin_tilde(c.get('diaclase'))
            aula = (c.get('instalacion') or '').strip()
            if not (nrc and dia and aula):
                continue
            reg = {'aula': aula, 'desde': c.get('fechainicio'), 'hasta': c.get('fechafin')}
            lista = crudo.setdefault(nrc, {}).setdefault(dia, [])
            if reg not in lista:
                lista.append(reg)
        print('%4d/%d  NRC acumulados: %d' % (i, len(dnis), len(crudo)), flush=True)
        time.sleep(PAUSA)
    return crudo, errores


def resolver(crudo):
    """Se queda con el aula del rango de fechas vigente (o el mas reciente)."""
    hoy = datetime.now()

    def fecha(s):
        try:
            return datetime.strptime(s, '%d/%m/%Y')
        except Exception:
            return None

    final = {}
    for nrc, dias in crudo.items():
        for dia, regs in dias.items():
            vigentes = [r for r in regs
                        if (fecha(r['desde']) or hoy) <= hoy <= (fecha(r['hasta']) or hoy)]
            elegidos = vigentes or sorted(regs, key=lambda r: fecha(r['hasta']) or hoy)[-1:]
            aulas = []
            for r in elegidos:
                a = r['aula'].split('-', 1)[-1] if '-' in r['aula'] else r['aula']
                if a.strip().lower() == 'clase virtual':
                    a = 'Virtual'
                if a not in aulas:
                    aulas.append(a)
            final.setdefault(nrc, {})[dia] = ' o '.join(aulas)
    return final


def main():
    ap = argparse.ArgumentParser(description='Actualiza aulas.json desde el Portal de Horarios')
    ap.add_argument('base', help='ruta de BASE DATOS CERTUS.xlsx (hoja Participantes)')
    ap.add_argument('--extra', type=int, default=0,
                    help='alumnos presenciales adicionales, para cubrir mas NRC')
    args = ap.parse_args()

    alumnos = leer_base(args.base)
    dnis = cobertura(alumnos, args.extra)
    print('Alumnos en la base: %d · consultas a realizar: %d' % (len(alumnos), len(dnis)))

    crudo, errores = recolectar(dnis)
    final = resolver(crudo)

    with io.open(SALIDA, 'w', encoding='utf-8') as f:
        json.dump(final, f, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    print('\nListo: %s  ·  %d NRC con aula  ·  %d consultas fallidas'
          % (SALIDA, len(final), len(errores)))


if __name__ == '__main__':
    main()
