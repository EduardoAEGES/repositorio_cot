# -*- coding: utf-8 -*-
"""Audita las clases VIRTUALES del Campus Digital (Moodle + BigBlueButton).

Por cada seccion virtual de CARGA_HORARIA_CONVERTIDA.csv responde:
  1. A que hora entro el docente a la sala (registros de Moodle: "unirse a la reunion")
     frente a la hora programada -> PUNTUAL / TARDE / SIN INGRESO.
  2. Si hay grabacion de ese dia: cuando aparece su camara en la grabacion
     (webcams.webm). Si la camara no aparece antes del minuto --camara-min (20)
     se marca CAMARA TARDIA / SIN CAMARA.

Requisitos (en tu PC, no en el repo):
    pip install playwright
    playwright install chromium
    ffmpeg en el PATH (solo para el paso de camara; sin ffmpeg se omite)

Credenciales: NUNCA van en el codigo. Se leen de las variables de entorno
CAMPUS_USER / CAMPUS_PASS o se piden por consola.

Ejemplos:
    python tools/auditar_virtuales.py --fecha 2026-10-05
    python tools/auditar_virtuales.py --fecha 2026-10-05 --docente GUZMAN
    python tools/auditar_virtuales.py --fecha 2026-10-05 --nrc 80 --sin-camara
    python tools/auditar_virtuales.py --fecha 2026-10-05 --ver     # muestra el navegador

Salida: reporte_virtuales_<fecha>.csv (+ registros_bbb_<fecha>.csv con el crudo
de Moodle, util para afinar). Ambos contienen nombres de docentes: estan en
.gitignore, no los subas al repo publico.
"""
import argparse, csv, getpass, os, re, shutil, subprocess, sys, time, unicodedata
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse, parse_qs, quote_plus

BASE = 'https://campusdigital.certus.edu.pe'
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARGA_CSV = os.path.join(RAIZ, 'CARGA_HORARIA_CONVERTIDA.csv')
LIMA = timezone(timedelta(hours=-5))
DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO']
DIA2 = {'LU': 0, 'MA': 1, 'MI': 2, 'JU': 3, 'VI': 4, 'SA': 5, 'DO': 6}
MESES = {m: i + 1 for i, m in enumerate(
    'enero febrero marzo abril mayo junio julio agosto setiembre octubre noviembre diciembre'.split())}
MESES['septiembre'] = 9


def norm(s):
    s = ''.join(c for c in unicodedata.normalize('NFD', s or '') if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', s).upper().strip()


# ---------------------------------------------------------------- carga horaria
def leer_carga(ruta):
    """Secciones virtuales unicas: una fila por (carga, NRC) con docente y horario."""
    with open(ruta, encoding='utf-8-sig', newline='') as f:
        filas = list(csv.DictReader(f))
    out = {}
    for r in filas:
        if norm(r.get('MODALIDAD', '')) != 'VIRTUAL':
            continue
        dias = [norm(d) for d in re.findall(r'\(([^)]+)\)', r.get('HORARIO (DÍAS)', ''))]
        horas = re.findall(r'(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})', r.get('HORARIO (HORAS)', ''))
        horario = {}
        for i, d in enumerate(dias):
            if d in DIAS and horas:
                horario[DIAS.index(d)] = horas[min(i, len(horas) - 1)]
        k = (r['Carga'].strip(), r['NRC'].strip())
        out[k] = dict(carga=k[0], nrc=k[1], docente=r['Nombres y Apellidos'].strip(),
                      curso=r['Curso'].strip(), seccion=r['Sección'].strip(), horario=horario)
    return list(out.values())


def hora_programada(sec, fecha, nombre_curso=''):
    """datetime de inicio programado para `fecha`; usa el horario de la carga y,
    si falta, el sufijo del nombre del curso en Moodle ('LU 07:00-10:45')."""
    h = sec['horario'].get(fecha.weekday())
    if not h:
        for dd, a, b in re.findall(r'\b([A-Z]{2})\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})', nombre_curso):
            if DIA2.get(dd) == fecha.weekday():
                h = (a, b)
    if not h:
        return None, None
    ini = datetime.strptime(f'{fecha:%Y-%m-%d} {h[0]}', '%Y-%m-%d %H:%M').replace(tzinfo=LIMA)
    fin = datetime.strptime(f'{fecha:%Y-%m-%d} {h[1]}', '%Y-%m-%d %H:%M').replace(tzinfo=LIMA)
    return ini, fin


def mismo_docente(nombre_log, docente):
    """Compara 'WILLY CESAR GUZMAN ESPINOZA' (Moodle) con 'GUZMAN ESPINOZA WILLY CESAR' (carga)."""
    a, b = set(norm(nombre_log).split()), set(norm(docente).split())
    return bool(a and b) and len(a & b) >= min(len(a), len(b)) - (1 if min(len(a), len(b)) > 3 else 0)


# ---------------------------------------------------------------- navegador
class Campus:
    def __init__(self, page, ctx, user, pw):
        self.page, self.ctx, self.user, self.pw = page, ctx, user, pw

    def login(self):
        p = self.page
        p.goto(f'{BASE}/login/index.php', wait_until='domcontentloaded')
        p.fill('#username', self.user)
        p.fill('#password', self.pw)
        p.click('#loginbtn')
        p.wait_for_load_state('domcontentloaded')
        if '/login/' in p.url:
            sys.exit('Login rechazado: revisa usuario/contrasena (o hay captcha/MFA).')

    def goto(self, url):
        """goto que se vuelve a loguear si la sesion expiro."""
        self.page.goto(url, wait_until='domcontentloaded')
        if '/login/index.php' in self.page.url:
            self.login()
            self.page.goto(url, wait_until='domcontentloaded')

    def buscar_curso(self, sec):
        """-> (course_id, nombre) del aula 'CARGA || NRC || ...' o None."""
        q = quote_plus(f'"{sec["carga"]} || {sec["nrc"]} ||"')
        self.goto(f'{BASE}/course/search.php?search={q}&perpage=50')
        pat = re.compile(rf'^\s*{re.escape(sec["carga"])}\s*\|\|\s*{re.escape(sec["nrc"])}\s*\|\|')
        for a in self.page.query_selector_all('a[href*="/course/view.php?id="]'):
            t = (a.inner_text() or '').strip()
            if pat.match(t):
                cid = parse_qs(urlparse(a.get_attribute('href')).query)['id'][0]
                return cid, t
        return None

    def cm_bbb(self, cid):
        self.goto(f'{BASE}/course/view.php?id={cid}')
        ids = []
        for a in self.page.query_selector_all('a[href*="/mod/bigbluebuttonbn/view.php?id="]'):
            i = parse_qs(urlparse(a.get_attribute('href')).query)['id'][0]
            if i not in ids:
                ids.append(i)
        return ids

    def logs_bbb(self, cid, dia):
        """Filas del Registro de Moodle de ese dia, solo componente BigBlueButton."""
        ts = int(datetime(dia.year, dia.month, dia.day, tzinfo=LIMA).timestamp())
        filas, pagina = [], 0
        while True:
            self.goto(f'{BASE}/report/log/index.php?id={cid}&chooselog=1&logreader=logstore_standard'
                      f'&date={ts}&edulevel=-1&user=0&modid=&modaction=&perpage=500&page={pagina}')
            tabla = self.page.query_selector('table.generaltable')
            if not tabla:
                break
            heads = [norm(h.inner_text()) for h in tabla.query_selector_all('thead th')]

            def col(*claves):
                for i, h in enumerate(heads):
                    if any(c in h for c in claves):
                        return i
                return None
            iH, iU, iC, iE, iD = (col('HORA', 'TIME'), col('NOMBRE COMPLETO', 'FULL NAME'),
                                  col('COMPONENTE', 'COMPONENT'), col('NOMBRE DEL EVENTO', 'EVENT NAME'),
                                  col('DESCRIP'))
            n = 0
            for tr in tabla.query_selector_all('tbody tr'):
                td = [c.inner_text().strip() for c in tr.query_selector_all('td')]
                if len(td) < 4 or iH is None:
                    continue
                n += 1
                comp = td[iC] if iC is not None else ''
                if 'BIGBLUE' not in norm(comp):
                    continue
                filas.append(dict(hora=td[iH], usuario=td[iU] if iU is not None else '',
                                  evento=td[iE] if iE is not None else '',
                                  descripcion=td[iD] if iD is not None else ''))
            sig = self.page.query_selector('.paging a.next, li.page-item.next a, a[rel="next"]')
            if not n or not sig or pagina > 20:
                break
            pagina += 1
        return filas

    def grabaciones(self, cm_ids, dia):
        """Links de reproduccion de grabaciones cuya fecha == dia."""
        res = []
        for cm in cm_ids:
            self.goto(f'{BASE}/mod/bigbluebuttonbn/view.php?id={cm}')
            try:
                self.page.wait_for_selector('table tbody tr', timeout=8000)
            except Exception:
                continue
            for tr in self.page.query_selector_all('table tbody tr'):
                m = re.search(r'(\d{1,2}) de (\w+) de (\d{4})', tr.inner_text().lower())
                if not m or MESES.get(m.group(2)) is None:
                    continue
                if datetime(int(m.group(3)), MESES[m.group(2)], int(m.group(1))).date() != dia:
                    continue
                el = tr.query_selector('[data-action="play"], a[href*="action=play"], a[href*="bbb_view"]')
                if not el:
                    continue
                href = el.get_attribute('data-href') or el.get_attribute('href')
                if href and href.startswith('/'):
                    href = BASE + href
                res.append(href)
        return res


def resolver_grabacion(campus, href):
    """Sigue el link de reproduccion y devuelve (host_bbb, record_id)."""
    destino = None
    if href and href.startswith('http'):
        campus.page.goto(href, wait_until='domcontentloaded')
        time.sleep(2)
        destino = campus.page.url
        if '/mod/bigbluebuttonbn/' in destino:      # redirige por JS: esperar el cambio
            try:
                campus.page.wait_for_url(re.compile(r'/playback/|meetingId='), timeout=8000)
            except Exception:
                pass
            destino = campus.page.url
    m = re.search(r'([0-9a-f]{40}-\d{13})', destino or '')
    if not m:
        return None
    u = urlparse(destino)
    return f'{u.scheme}://{u.netloc}', m.group(1)


def metadata(campus, host, rid):
    r = campus.ctx.request.get(f'{host}/presentation/{rid}/metadata.xml')
    if not r.ok:
        return None
    raiz = ET.fromstring(r.text())
    ini, fin = raiz.findtext('.//start_time'), raiz.findtext('.//end_time')
    if not ini:
        return None
    return dict(inicio=datetime.fromtimestamp(int(ini) / 1000, LIMA),
                fin=datetime.fromtimestamp(int(fin) / 1000, LIMA) if fin else None)


def camara(campus, host, rid, max_min):
    """Heuristica: busca el primer tramo no-negro de webcams.webm (primeros max_min+10 min).
    Devuelve (minuto_primera_camara | None, nota). Requiere ffmpeg."""
    if not shutil.which('ffmpeg'):
        return None, 'sin ffmpeg'
    url = None
    for ext in ('webm', 'mp4'):
        u = f'{host}/presentation/{rid}/video/webcams.{ext}'
        if campus.ctx.request.head(u).ok:
            url = u
            break
    if not url:
        return None, 'sin webcams (nadie compartio camara)'
    limite = (max_min + 10) * 60
    p = subprocess.run(['ffmpeg', '-hide_banner', '-t', str(limite), '-i', url, '-an',
                        '-vf', 'blackdetect=d=3:pix_th=0.10', '-f', 'null', '-'],
                       capture_output=True, text=True, timeout=900)
    err = p.stderr
    tiempos = re.findall(r'time=(\d+):(\d+):([\d.]+)', err)
    visto = (lambda h, m, s: int(h) * 3600 + int(m) * 60 + float(s))(*tiempos[-1]) if tiempos else 0
    negros = [(float(a), float(b)) for a, b in
              re.findall(r'black_start:([\d.]+) black_end:([\d.]+)', err)]
    if negros and negros[0][0] <= 2:
        if negros[0][1] >= visto - 2:
            return None, f'camara apagada en los primeros {visto/60:.0f} min'
        return negros[0][1] / 60, 'ok'
    return 0.0, 'ok'


# ---------------------------------------------------------------- auditoria
def parse_hora_log(txt, dia):
    m = re.search(r'(\d{1,2}):(\d{2})(?::(\d{2}))?', txt)
    if not m:
        return None
    return datetime(dia.year, dia.month, dia.day, int(m.group(1)), int(m.group(2)), tzinfo=LIMA)


def es_ingreso(ev):
    e = norm(ev)
    return any(k in e for k in ('UNID', 'UNIO', 'JOINED', 'INGRES')) and 'SALI' not in e and 'LEFT' not in e


def auditar(campus, sec, dia, args, volcado):
    ini, fin = hora_programada(sec, dia)
    base = dict(fecha=dia.isoformat(), docente=sec['docente'], curso=sec['curso'], seccion=sec['seccion'],
                nrc=sec['nrc'], carga=sec['carga'], programado=ini.strftime('%H:%M') if ini else '',
                primer_ingreso='', retraso_min='', estado_ingreso='', grabacion_inicio='',
                camara_min='', estado_camara='', nota='', aula='')
    if not ini:
        base['nota'] = 'no tiene clase ese dia segun la carga'
        return None
    hallado = campus.buscar_curso(sec)
    if not hallado:
        base.update(estado_ingreso='AULA NO ENCONTRADA')
        return base
    cid, nombre = hallado
    base['aula'] = f'{BASE}/course/view.php?id={cid}'
    if not ini:
        ini, fin = hora_programada(sec, dia, nombre)
    cms = campus.cm_bbb(cid)

    logs = campus.logs_bbb(cid, dia)
    for f in logs:
        volcado.append({**f, 'nrc': sec['nrc'], 'docente': sec['docente'], 'fecha': dia.isoformat()})
    entradas = sorted(t for f in logs if es_ingreso(f['evento']) and mismo_docente(f['usuario'], sec['docente'])
                      for t in [parse_hora_log(f['hora'], dia)] if t)
    if entradas:
        d = round((entradas[0] - ini).total_seconds() / 60)
        base.update(primer_ingreso=entradas[0].strftime('%H:%M'), retraso_min=d,
                    estado_ingreso='PUNTUAL' if d <= args.tolerancia else f'TARDE (+{d} min)')
    else:
        base['estado_ingreso'] = 'SIN INGRESO REGISTRADO'

    if args.sin_camara:
        return base
    for href in campus.grabaciones(cms, dia)[:1]:
        info = resolver_grabacion(campus, href)
        if not info:
            base['nota'] = 'no pude resolver la grabacion'
            continue
        host, rid = info
        meta = metadata(campus, host, rid)
        if meta:
            base['grabacion_inicio'] = meta['inicio'].strftime('%H:%M')
        minuto, nota = camara(campus, host, rid, args.camara_min)
        base['nota'] = nota
        if minuto is None:
            base['estado_camara'] = 'SIN CAMARA' if 'sin webcams' in nota or 'apagada' in nota else 'NO EVALUADO'
        else:
            # la camara se mide desde el inicio de la grabacion; se suma al desfase vs. hora programada
            desde_prog = minuto + ((meta['inicio'] - ini).total_seconds() / 60 if meta else 0)
            base['camara_min'] = round(desde_prog)
            base['estado_camara'] = ('CAMARA OK' if desde_prog <= args.camara_min
                                     else f'CAMARA TARDIA (min {round(desde_prog)})')
    if not base['estado_camara']:
        base['estado_camara'] = 'SIN GRABACION'
    return base


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--fecha', default=datetime.now(LIMA).date().isoformat(), help='AAAA-MM-DD (default hoy)')
    ap.add_argument('--docente', help='filtro por texto en el nombre del docente')
    ap.add_argument('--nrc', help='solo este NRC')
    ap.add_argument('--tolerancia', type=int, default=5, help='minutos de gracia para PUNTUAL (5)')
    ap.add_argument('--camara-min', type=int, default=20, help='limite para encender camara (20)')
    ap.add_argument('--sin-camara', action='store_true', help='omite grabaciones/ffmpeg (solo hora de ingreso)')
    ap.add_argument('--csv', default=CARGA_CSV)
    ap.add_argument('--ver', action='store_true', help='mostrar el navegador')
    args = ap.parse_args()
    dia = datetime.strptime(args.fecha, '%Y-%m-%d').date()

    secs = leer_carga(args.csv)
    if args.docente:
        secs = [s for s in secs if norm(args.docente) in norm(s['docente'])]
    if args.nrc:
        secs = [s for s in secs if s['nrc'] == args.nrc]
    secs = [s for s in secs if dia.weekday() in s['horario']]
    if not secs:
        sys.exit('Ninguna seccion virtual coincide con esos filtros y ese dia de la semana.')

    user = os.environ.get('CAMPUS_USER') or input('Usuario campus: ')
    pw = os.environ.get('CAMPUS_PASS') or getpass.getpass('Contrasena campus: ')

    from playwright.sync_api import sync_playwright
    reporte, volcado = [], []
    with sync_playwright() as pw_:
        br = pw_.chromium.launch(headless=not args.ver)
        ctx = br.new_context(locale='es-PE', timezone_id='America/Lima')
        campus = Campus(ctx.new_page(), ctx, user, pw)
        campus.login()
        print(f'{len(secs)} secciones virtuales el {dia} ...')
        for i, s in enumerate(secs, 1):
            try:
                fila = auditar(campus, s, dia, args, volcado)
            except Exception as e:                      # una seccion rota no tumba el lote
                fila = dict(fecha=dia.isoformat(), docente=s['docente'], curso=s['curso'],
                            seccion=s['seccion'], nrc=s['nrc'], nota=f'ERROR: {e}')
            if fila:
                reporte.append(fila)
                print(f'[{i}/{len(secs)}] {s["docente"][:32]:32} NRC {s["nrc"]:>5}  '
                      f'{fila.get("estado_ingreso", "")}  {fila.get("estado_camara", "")}')
            time.sleep(1)                               # no cargar el campus
        br.close()

    campos = ['fecha', 'docente', 'curso', 'seccion', 'nrc', 'carga', 'programado', 'primer_ingreso',
              'retraso_min', 'estado_ingreso', 'grabacion_inicio', 'camara_min', 'estado_camara',
              'nota', 'aula']
    out = os.path.join(RAIZ, f'reporte_virtuales_{dia}.csv')
    with open(out, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, campos, extrasaction='ignore')
        w.writeheader()
        w.writerows(reporte)
    if volcado:
        with open(os.path.join(RAIZ, f'registros_bbb_{dia}.csv'), 'w', encoding='utf-8-sig', newline='') as f:
            w = csv.DictWriter(f, list(volcado[0].keys()))
            w.writeheader()
            w.writerows(volcado)
    print(f'\nListo: {out}')


if __name__ == '__main__':
    main()
