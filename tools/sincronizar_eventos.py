"""Copia el gestor de eventos (proyecto Automatizar_certificados) a la carpeta eventos/
de este repositorio, que se publica en GitHub Pages:
https://eduardoaeges.github.io/repositorio_cot/eventos/gestor.html

El portal de constancias NO se copia: sigue publicado en Netlify.

Uso (desde la carpeta Repositorio_COT):
    python tools/sincronizar_eventos.py
Luego revisar, hacer commit y push de la carpeta eventos/.
"""
import shutil
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ.parent / 'Automatizar_certificados'
DESTINO = RAIZ / 'eventos'

# Páginas, scripts e imágenes que usan el gestor, el reporte y la encuesta.
ARCHIVOS = [
    'gestor.html', 'gestor.js', 'reporte.html', 'encuesta.html', 'evidencias.js',
    'LOGO_CERTUS.png', 'Logo_RS.png',
    'REPORTE_INICIO.png', 'REPORTE_FONDO.png', 'REPORTE_FINAL.png',
    'cert_fondo.png', 'cert_logo.png', 'cert_firma1.png', 'cert_firma2.jpg', 'constancia_base.png',
    'portada_default.png', 'produce_docente.png', 'produce_mype.png',
    'pegatinas/personaje 1.png', 'pegatinas/personaje 4.png',
    'pegatinas/personaje 7.png', 'pegatinas/personaje 8.png',
]


def main():
    if not ORIGEN.is_dir():
        sys.exit(f'No se encontró el proyecto de eventos en {ORIGEN}')
    faltan = [a for a in ARCHIVOS if not (ORIGEN / a).is_file()]
    if faltan:
        sys.exit('Faltan archivos en el origen: ' + ', '.join(faltan))
    for a in ARCHIVOS:
        destino = DESTINO / a
        destino.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ORIGEN / a, destino)
    print(f'{len(ARCHIVOS)} archivo(s) copiados a {DESTINO}')


if __name__ == '__main__':
    main()
