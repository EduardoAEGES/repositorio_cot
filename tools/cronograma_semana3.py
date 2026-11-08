"""Genera eventos/datos/programacion_semana3.json con el cronograma real de la
semana 3 (2 al 7 de noviembre de 2026), transcrito de la imagen compartida por
el equipo. Las celdas naranjas (sin monitoreo) y vacías no llevan monitor.
Los nombres se escriben igual que en el formulario (mayúsculas, con tildes donde
el formulario las usa) para que el cruce con las respuestas funcione.

Uso: python tools/cronograma_semana3.py
"""
import json
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DATOS = RAIZ / 'eventos' / 'datos'

FECHAS = {'Lunes': '2026-11-02', 'Martes': '2026-11-03', 'Miércoles': '2026-11-04',
          'Jueves': '2026-11-05', 'Viernes': '2026-11-06', 'Sábado': '2026-11-07'}
DIAS = list(FECHAS)

# (turno, sede): seis celdas de lunes a sábado. Cada celda: lista de monitores y,
# si la imagen lo indica, el número de aulas entre corchetes.
TM, TN = 'Turno Mañana', 'Turno Noche'
CRONOGRAMA = {
    (TM, 'AQP'): [['Mayorga Salas Marisol Estrella'], ['Manrique Torreblanca Felipe Edgardo'], (['Diego Vasquez'], 12), [], ['Guzmán Akao Hugo Aníbal'], ['Mamani Roque Eduardo Luis']],
    (TM, 'NOR'): [[], [], ['Ybarra Maguiña Carlos Santiago'], ['Estrada Ponte Sandibell'], [], ['Borja Rojas Julio Miguel']],
    (TM, 'ATE'): [[], [], ['Condor Surichaqui Luis Enrique'], (['Jorge Duran'], 5), [], []],
    (TM, 'VES'): [[], [], [], [], [], ['Garcia Salazar Eduardo Antonio']],
    (TM, 'SUR'): [['Figueroa Ynca Fernando Fredy'], [], ['Garcia Salazar Eduardo Antonio'], [], [], ['Navarro Aragon Julio Martin']],
    (TM, 'SJL'): [['Ramirez Pineda Jose Cirilo'], (['José Kohagura'], 10), [], ['Sánchez Céspedes Mirko Napoleón'], ['Leon Roman Fernando Gonzalo'], []],
    (TM, 'VIR'): [[], ['Gastelo Miskulin Delfo Tomislav'], ['Chaname Baca Joanna Stephani'], [], [], ['Arbañil Chicoma Claudia']],
    (TN, 'NOR'): [[], ['Navarro Aragon Julio Martin'], [], ['Ybarra Maguiña Carlos Santiago'], [], ['Borja Rojas Julio Miguel']],
    (TN, 'ATE'): [[], ['Yaya Porras Erika Yesenia'], [], ['Figueroa Ynca Fernando Fredy'], ['Yaya Porras Erika Yesenia'], []],
    (TN, 'VES'): [[], [], [], ['Ramirez Pineda Jose Cirilo'], [], []],
    (TN, 'SUR'): [['Cornejo Mavila Stephania'], (['José Kohagura'], 10), ['Cornejo Mavila Stephania'], ['Moreno Barrera Luiggi Agustin'], ['Moreno Barrera Luiggi Agustin'], ['Moreno Barrera Luiggi Agustin']],
    (TN, 'SJL'): [(['Sánchez Céspedes Mirko Napoleón', 'Jorge Duran'], 13), ['Leon Roman Fernando Gonzalo'], ['Huaman Romero Miguel Angel'], [], [], ['Huaman Romero Miguel Angel']],
    (TN, 'VIR'): [['Gastelo Miskulin Delfo Tomislav'], ['Chaname Baca Joanna Stephani'], [], (['Diego Vasquez'], 69), [], ['Arbañil Chicoma Claudia']],
}
# Nombre corto de la imagen -> nombre del formulario
ALIAS = {'Diego Vasquez': 'VASQUEZ CHAVEZ DIEGO ARMANDO', 'Jorge Duran': 'DURAN DE LA FUENTE JORGE ALEJANDRO', 'José Kohagura': 'JOSÉ KOHAGURA'}
COORDINADORES = ['VASQUEZ CHAVEZ DIEGO ARMANDO', 'DURAN DE LA FUENTE JORGE ALEJANDRO', 'JOSÉ KOHAGURA']


def norm(s):
    return ' '.join(unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().upper().split())


def main():
    # nombres tal como aparecen en el formulario y en el cronograma de la semana 1
    conocidos = {}
    for f in ('monitoreo_semana1.json', 'monitoreo_semana3.json'):
        for r in json.loads((DATOS / f).read_text(encoding='utf-8')):
            conocidos.setdefault(norm(r['Monitor']), r['Monitor'])
    s1 = json.loads((DATOS / 'programacion_semana1.json').read_text(encoding='utf-8'))
    aulas_s1 = {(a['dia'], a['sede'], a['turno']): a.get('aulas') for a in s1['asignaciones']}

    asignaciones = []
    for (turno, sede), celdas in CRONOGRAMA.items():
        for dia, celda in zip(DIAS, celdas):
            nombres, aulas = (celda if isinstance(celda, tuple) else (celda, None))
            monitores = [ALIAS.get(n) or conocidos.get(norm(n)) or n.upper() for n in nombres]
            asignaciones.append({'fecha': FECHAS[dia], 'dia': dia, 'sede': sede, 'turno': turno,
                                 'aulas': aulas if aulas is not None else aulas_s1.get((dia, sede, turno)),
                                 'monitores': monitores, 'jefatura': []})
    salida = {
        'semana': 'Semana 3', 'periodo': '2 al 7 de noviembre de 2026',
        'fuente': 'Cronograma de monitoreo de la semana 3 por sede y turno (imagen compartida por el equipo COT-PLN). '
                  'Las aulas sin número en la imagen se toman del cronograma de la semana 1.',
        'nota_jefatura': 'Diego Vásquez, Jorge Durán y José Kohagura son coordinadores: si no registraron el formulario, '
                         'su turno se cuenta como conforme y sin observaciones.',
        'coordinadores': COORDINADORES,
        'asignaciones': asignaciones,
    }
    (DATOS / 'programacion_semana3.json').write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding='utf-8')
    total = sum(len(a['monitores']) for a in asignaciones)
    print(f'{len(asignaciones)} celdas, {total} turnos con monitor')
    for n in sorted({m for a in asignaciones for m in a['monitores']}):
        if norm(n) not in conocidos and n not in ALIAS.values():
            print('  nombre sin respuestas en el formulario:', n)


if __name__ == '__main__':
    main()
