"""Convierte las respuestas del formulario «Monitoreo de visitas a sede» (Excel
descargado de Google Forms) en eventos/datos/monitoreo_semanaN.json, el archivo
que lee el dashboard eventos/monitoreo_semanaN.html.

Uso:
    python tools/generar_monitoreo_semana.py "ruta/respuestas.xlsx" 3

Solo se toman las filas cuya columna «Número de semana…» sea «Semana N». Cada
fila queda con las mismas claves (encabezados del formulario) que usa
monitoreo_semana1.json.
"""
import datetime
import json
import sys
from pathlib import Path

import openpyxl

RAIZ = Path(__file__).resolve().parent.parent
COL_SEMANA = 5  # «Número de semana en la que se hace la visita»


def main(xlsx, semana):
    ws = openpyxl.load_workbook(xlsx, read_only=True, data_only=True).worksheets[0]
    filas = list(ws.iter_rows(values_only=True))
    encabezados = filas[0]
    salida = []
    for fila in filas[1:]:
        if str(fila[COL_SEMANA] or '').strip() != f'Semana {semana}':
            continue
        reg = {}
        for clave, valor in zip(encabezados, fila):
            if isinstance(valor, datetime.datetime):
                valor = valor.isoformat()
            reg[clave] = valor
        salida.append(reg)

    destino = RAIZ / 'eventos' / 'datos' / f'monitoreo_semana{semana}.json'
    destino.write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding='utf-8')
    fechas = sorted({r['Fecha'][:10] for r in salida if r.get('Fecha')})
    print(f'{len(salida)} respuestas de Semana {semana} -> {destino}')
    if fechas:
        print(f'Fechas: {fechas[0]} a {fechas[-1]}')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], int(sys.argv[2]))
