# -*- coding: utf-8 -*-
"""Nucleo del Seguimiento VIRTUAL (Campus Digital = Moodle + BigBlueButton).

Por cada sesion VIRTUAL (bloque "VIR hh:mm-hh:mm" de la hoja CARGA_HORARIA) de un dia:
  1. Hora en que el docente entro a la sala (Registros de Moodle, evento "unirse a la
     reunion") frente a la hora programada -> PUNTUAL / TARDE / SIN INGRESO.
  2. Si hay grabacion de ese dia: minuto en que aparece la camara en webcams.webm
     (heuristica con ffmpeg). Pasado --camara-min (20) -> CAMARA TARDIA / SIN CAMARA.

Lo usa virtual_agente.py (la pagina virtual.html lo maneja). Tambien funciona solo:
    python tools/auditar_virtuales.py --fecha 2026-10-05 --docente GUZMAN --ver

Requisitos: pip install playwright cryptography ; playwright install chromium ;
ffmpeg en el PATH (solo para la camara).
Credenciales: nunca en el codigo. Se inicia sesion a mano en la ventana que se abre,
o con las variables de entorno CAMPUS_USER / CAMPUS_PASS.
"""
import argparse, csv, io, os, re, shutil, subprocess, sys, time, unicodedata
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse, parse_qs, quote, quote_plus

BASE = 'https://campusdigital.certus.edu.pe'
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARGA_CSV = os.path.join(RAIZ, 'CARGA_HORARIA_CONVERTIDA.csv')
# Misma hoja que usa EVALDO (evaldo-core.js): CARGA_HORARIA en vivo.
HOJA_CARGA = ('https://docs.google.com/spreadsheets/d/1kNqEDwXe5Iqj9m54E--_WEe2wKxjTschDLgYnXeBS7w'
              '/export?format=csv&gid=1470879596')
# Docentes 2026: DNI -> area (COT/PLN). Misma hoja y mismas reglas que EVALDO (evaldo-core.js).
HOJA_DOCENTES = ('https://docs.google.com/spreadsheets/d/1kNqEDwXe5Iqj9m54E--_WEe2wKxjTschDLgYnXeBS7w'
                 '/export?format=csv&gid=204310163')
LIMA = timezone(timedelta(hours=-5))
DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO']
MESES = {m: i + 1 for i, m in enumerate(
    'enero febrero marzo abril mayo junio julio agosto setiembre octubre noviembre diciembre'.split())}
MESES['septiembre'] = 9


class SinSesion(Exception):
    """La sesion de Campus Digital se vencio y no hay credenciales para renovarla."""


def norm(s):
    s = ''.join(c for c in unicodedata.normalize('NFD', str(s or '')) if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', s).upper().strip()


# ---------------------------------------------------------------- hoja de carga
def texto_carga():
    """CSV de CARGA_HORARIA: la hoja en vivo; si no se puede, la copia del repo."""
    try:
        with urllib.request.urlopen(HOJA_CARGA, timeout=30) as r:
            return r.read().decode('utf-8-sig'), 'hoja en vivo'
    except Exception:
        with open(CARGA_CSV, encoding='utf-8-sig') as f:
            return f.read(), 'copia del repo (CARGA_HORARIA_CONVERTIDA.csv)'


def area(texto):
    """'PLN' / 'COT' a partir de un texto (igual que area() de evaldo-core.js)."""
    a = norm(texto)
    return 'PLN' if 'PLN' in a else ('COT' if ('COT' in a or 'CONTA' in a) else '')


def solo_dni(s):
    return re.sub(r'\D', '', str(s or '')).lstrip('0')


def areas_docentes():
    """Hoja Docentes 2026 -> ({dni: area}, {nombre: area}). Vacios si no se pudo leer."""
    try:
        with urllib.request.urlopen(HOJA_DOCENTES, timeout=30) as r:
            filas = list(csv.reader(io.StringIO(r.read().decode('utf-8-sig'))))
    except Exception:
        return {}, {}
    cab = next((i for i, r in enumerate(filas) if any(norm(c) == 'DNI' for c in r)
                and any('APELLIDO' in norm(c) or 'NOMBRE' in norm(c) for c in r)), None)
    if cab is None:
        return {}, {}
    h = [norm(c) for c in filas[cab]]
    iDni = h.index('DNI')
    iNom = next(i for i, c in enumerate(h) if 'APELLIDO' in c or 'NOMBRE' in c)
    iArea = next((i for i, c in enumerate(h) if 'AREA' in c), None)
    por_dni, por_nombre = {}, {}
    if iArea is None:
        return por_dni, por_nombre
    for r in filas[cab + 1:]:
        a = area(r[iArea]) if iArea < len(r) else ''
        if not a:
            continue
        d = solo_dni(r[iDni]) if iDni < len(r) else ''
        n = norm(r[iNom]).replace(',', ' ') if iNom < len(r) else ''
        n = re.sub(r'\s+', ' ', n).strip()
        if d:
            por_dni.setdefault(d, a)
        if n and 'APELLIDO' not in n:
            por_nombre.setdefault(n, a)
    return por_dni, por_nombre


def leer_carga(texto, areas=None):
    """Secciones con al menos una sesion VIR. horario = {weekday: ('19:00', '22:45')}."""
    filas = list(csv.reader(io.StringIO(texto)))
    if not filas:
        return []
    cab = [norm(c) for c in filas[0]]

    def col(pred):
        for i, c in enumerate(cab):
            if pred(c):
                return i
        return None
    i = dict(carga=col(lambda c: c == 'CARGA'), nrc=col(lambda c: c == 'NRC'), dni=col(lambda c: c == 'DNI'),
             docente=col(lambda c: 'NOMBRE' in c or 'APELLIDO' in c), curso=col(lambda c: c == 'CURSO'),
             seccion=col(lambda c: c.startswith('SECCI')), modulo=col(lambda c: 'DULO' in c),
             periodo=col(lambda c: c == 'PERIODO'), turno=col(lambda c: c == 'TURNO'),
             sede=col(lambda c: c == 'SEDE'), ciclo=col(lambda c: c == 'CICLO'),
             modalidad=col(lambda c: c == 'MODALIDAD'), tipo=col(lambda c: c == 'TIPO'),
             dias=col(lambda c: c.startswith('HORARIO') and '(DIA' in c),
             horas=col(lambda c: c.startswith('HORARIO') and '(HORA' in c))
    tx = lambda r, k: r[i[k]].strip() if i[k] is not None and i[k] < len(r) else ''
    out = {}
    for r in filas[1:]:
        nrc = re.sub(r'\.0$', '', tx(r, 'nrc'))
        if not nrc:
            continue
        dias = [norm(d) for d in re.findall(r'\(([^)]+)\)', tx(r, 'dias'))]
        bloques = re.findall(r'\(\s*([A-Z]*)\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*\)', norm(tx(r, 'horas')))
        horario = {}
        for j, d in enumerate(dias):
            if d not in DIAS or not bloques:
                continue
            tipo, a, b = bloques[min(j, len(bloques) - 1)]
            # VIR = sesion virtual. Sin prefijo se usa la modalidad de la fila.
            if tipo == 'VIR' or (not tipo and norm(tx(r, 'modalidad')) == 'VIRTUAL'):
                horario[DIAS.index(d)] = (a.zfill(5), b.zfill(5))
        if not horario:
            continue
        k = (tx(r, 'carga'), nrc)
        if k in out:
            out[k]['horario'].update(horario)
            continue
        por_dni, por_nombre = areas or ({}, {})
        programa = (por_dni.get(solo_dni(tx(r, 'dni'))) or por_nombre.get(norm(tx(r, 'docente')))
                    or area(tx(r, 'tipo')))
        out[k] = dict(carga=k[0], nrc=nrc, docente=tx(r, 'docente'), dni=tx(r, 'dni'), curso=tx(r, 'curso'),
                      area=programa,
                      seccion=tx(r, 'seccion'), modulo=tx(r, 'modulo'), periodo=norm(tx(r, 'periodo')),
                      turno=norm(tx(r, 'turno')), sede=norm(tx(r, 'sede')), ciclo=norm(tx(r, 'ciclo')),
                      horario=horario)
    return list(out.values())


def del_dia(secciones, dia):
    return [s for s in secciones if dia.weekday() in s['horario']]


def mismo_docente(nombre_log, docente):
    """'WILLY CESAR GUZMAN ESPINOZA' (Moodle) vs 'GUZMAN ESPINOZA WILLY CESAR' (carga)."""
    a, b = set(norm(nombre_log).split()), set(norm(docente).split())
    if not a or not b:
        return False
    m = min(len(a), len(b))
    return len(a & b) >= (m - 1 if m > 3 else m)


# ---------------------------------------------------------------- navegador
class Campus:
    def __init__(self, ctx, user=None, pw=None):
        self.ctx = ctx
        self.page = ctx.pages[0] if ctx.pages else ctx.new_page()
        self.user, self.pw = user, pw

    def login_auto(self):
        if not (self.user and self.pw):
            raise SinSesion()
        p = self.page
        p.goto(f'{BASE}/login/index.php', wait_until='domcontentloaded')
        p.fill('#username', self.user)
        p.fill('#password', self.pw)
        p.click('#loginbtn')
        p.wait_for_load_state('domcontentloaded')
        if '/login/' in p.url:
            raise SinSesion()

    def sesion_ok(self):
        r = self.ctx.request.get(f'{BASE}/my/', max_redirects=5)
        return r.ok and '/login/' not in r.url

    def goto(self, url):
        self.page.goto(url, wait_until='domcontentloaded')
        if '/login/index.php' in self.page.url:
            self.login_auto()
            self.page.goto(url, wait_until='domcontentloaded')

    def buscar_curso(self, sec):
        """-> (course_id, nombre). Entra directo por el shortname 'SECCION|NRC CARGA'
        (como horario.js); si no, usa el buscador de cursos."""
        corto = f'{sec["seccion"]}|{sec["nrc"]} {sec["carga"]}'.strip()
        self.goto(f'{BASE}/course/view.php?name={quote(corto)}')
        m = re.search(r'/course/view\.php\?id=(\d+)', self.page.url)
        cid = m.group(1) if m else self.page.evaluate(
            "() => (document.body.className.match(/course-(\\d+)/) || [])[1] || null")
        if cid and cid != '1':
            return cid, (self.page.title() or '')
        q = quote_plus(f'"{sec["carga"]} || {sec["nrc"]} ||"')
        self.goto(f'{BASE}/course/search.php?search={q}&perpage=50')
        pat = re.compile(rf'^\s*{re.escape(sec["carga"])}\s*\|\|\s*{re.escape(sec["nrc"])}\s*\|\|')
        for a in self.page.query_selector_all('a[href*="/course/view.php?id="]'):
            t = (a.inner_text() or '').strip()
            if pat.match(t):
                return parse_qs(urlparse(a.get_attribute('href')).query)['id'][0], t
        return None

    def cm_bbb(self, cid):
        self.goto(f'{BASE}/course/view.php?id={cid}')
        ids = []
        for a in self.page.query_selector_all('a[href*="/mod/bigbluebuttonbn/view.php?id="]'):
            i = parse_qs(urlparse(a.get_attribute('href')).query)['id'][0]
            if i not in ids:
                ids.append(i)
        return ids

    def diagnostico(self, nombre):
        """Captura de la pagina actual en virtual_local/diagnostico/ (para ver que leyo el script)."""
        try:
            carpeta = os.path.join(RAIZ, 'virtual_local', 'diagnostico')
            os.makedirs(carpeta, exist_ok=True)
            self.page.screenshot(path=os.path.join(carpeta, nombre + '.png'), full_page=True)
            return f'virtual_local/diagnostico/{nombre}.png'
        except Exception:
            return ''

    def cargar_grabaciones(self, cm, dia, intentos=4):
        """Abre la pagina de grabaciones y espera la tabla. El campus a veces responde
        'No hay datos que mostrar' porque el servidor de grabaciones tardo; al recargar si salen.
        Por eso se sale y se vuelve a entrar hasta `intentos` veces antes de aceptar que no hay grabaciones."""
        espera = """() => {
            const filas = [...document.querySelectorAll('table tbody tr')].map(tr => tr.innerText);
            if (filas.some(t => /\\d{1,2} de \\S+ de \\d{4}/.test(t))) return 'fechas';
            if (filas.some(t => /no hay (datos|grabaci)|no recordings|nothing to display/i.test(t))) return 'vacio';
            return '';
        }"""
        estado = ''
        for n in range(intentos):
            self.goto(f'{BASE}/mod/bigbluebuttonbn/view.php?id={cm}')
            try:
                estado = self.page.wait_for_function(espera, timeout=25000).json_value()
            except Exception:
                estado = ''
            if estado == 'fechas':
                return True
            # "Salir y volver a entrar": se pasa por otra pagina y se espera cada vez un poco mas,
            # para darle tiempo al servidor de grabaciones (5 s, 10 s, 15 s).
            try:
                self.page.goto(f'{BASE}/my/', wait_until='domcontentloaded')
            except Exception:
                pass
            time.sleep(5 * (n + 1))
        self.diagnostico(f'grabaciones_{cm}_{dia}')
        return False

    def logs_bbb(self, cid, dia, cms=None, por_pagina=1000, max_paginas=15):
        """Registros de Moodle de ese dia, solo BigBlueButton -> (filas, diagnostico).
        Se piden por actividad BigBlueButton (modid) y pagina por pagina: un aula puede tener
        miles de registros al dia y Moodle los lista del mas nuevo al mas viejo, asi que con una
        sola pagina se perdian los ingresos de primera hora. Ademas se descarta toda fila cuya
        fecha no sea `dia` (por si Moodle no aplica el filtro de fecha).
        Si no sale ninguna fila de BigBlueButton guarda una captura en virtual_local/diagnostico/."""
        ts = int(datetime(dia.year, dia.month, dia.day, tzinfo=LIMA).timestamp())
        filas, total, otro_dia, paginas, eventos = [], 0, 0, 0, {}
        for modid in (cms or ['']):
            for pagina in range(max_paginas):
                self.goto(f'{BASE}/report/log/index.php?id={cid}&chooselog=1&logreader=logstore_standard'
                          f'&date={ts}&edulevel=-1&user=0&modid={modid}&modaction=&perpage={por_pagina}&page={pagina}')
                paginas += 1
                tabla = self.page.query_selector('table.generaltable')
                if not tabla:
                    break
                heads = [norm(h.inner_text()) for h in tabla.query_selector_all('thead th')]

                def col(pred):
                    for i, h in enumerate(heads):
                        if pred(h):
                            return i
                    return None
                # Moodle en espanol: "Hora", "Nombre completo del usuario", "Componente", "Nombre evento"
                # ("Contexto del evento" tambien dice EVENTO: por eso se exige NOMBRE).
                iH = col(lambda h: h.startswith('HORA') or h.startswith('TIME') or h.startswith('FECHA'))
                iU = col(lambda h: 'NOMBRE COMPLETO' in h or 'FULL NAME' in h)
                iC = col(lambda h: 'COMPONENT' in h)
                iE = col(lambda h: ('NOMBRE' in h and 'EVENTO' in h) or 'EVENT NAME' in h)
                en_pagina = 0
                for tr in tabla.query_selector_all('tbody tr'):
                    td = [c.inner_text().strip() for c in tr.query_selector_all('td')]
                    if iH is None or len(td) <= max(x for x in (iH, iU, iC, iE) if x is not None):
                        continue
                    en_pagina += 1
                    total += 1
                    f = fecha_es(td[iH])
                    if f and f != dia:
                        otro_dia += 1
                        continue
                    ev = td[iE] if iE is not None else ''
                    comp = td[iC] if iC is not None else ''
                    if 'BIGBLUE' not in norm(comp) and 'BIGBLUE' not in norm(ev):
                        continue
                    eventos[ev] = eventos.get(ev, 0) + 1
                    filas.append(dict(hora=td[iH], usuario=td[iU] if iU is not None else '', evento=ev))
                if en_pagina < por_pagina:
                    break
        diag = (f'registros: {total} filas en {paginas} pagina(s)'
                + (f', {otro_dia} de otros dias descartadas' if otro_dia else '')
                + f', {len(filas)} de BigBlueButton'
                + (' (' + '; '.join(f'{k} x{v}' for k, v in eventos.items()) + ')' if eventos else ''))
        if not filas:
            ruta = self.diagnostico(f'registros_{cid}_{dia}')
            if ruta:
                diag += f' · captura en {ruta}'
        return filas, diag

    def grabaciones(self, cm_ids, dia):
        """Grabaciones con fecha == dia -> [{'href', 'minutos'}] (minutos = columna Duracion).
        La misma grabacion sale en las dos actividades BigBlueButton del aula: se cuenta una vez."""
        res, vistos = [], set()
        for cm in cm_ids:
            if not self.cargar_grabaciones(cm, dia):
                continue
            for tabla in self.page.query_selector_all('table'):
                heads = [norm(h.inner_text()) for h in tabla.query_selector_all('thead th')]
                iDur = next((i for i, h in enumerate(heads) if 'DURACI' in h or 'DURATION' in h), None)
                for tr in tabla.query_selector_all('tbody tr'):
                    m = re.search(r'(\d{1,2}) de (\w+) de (\d{4})', tr.inner_text().lower())
                    if not m or MESES.get(m.group(2)) is None:
                        continue
                    if datetime(int(m.group(3)), MESES[m.group(2)], int(m.group(1))).date() != dia:
                        continue
                    el = (tr.query_selector('[data-action="play"], a[href*="action=play"], a[href*="bbb_view"], a[href*="/playback/"]')
                          or tr.query_selector('a:has-text("grabaci")'))
                    href = el and (el.get_attribute('data-href') or el.get_attribute('href'))
                    if href and not href.startswith(('http', '/')):     # '#' o javascript: buscar la URL en onclick
                        m2 = re.search(r"https?://[^'\"\s)]+", el.get_attribute('onclick') or '')
                        href = m2.group(0) if m2 else None
                    if href:
                        href = BASE + href if href.startswith('/') else href
                    tds = [c.inner_text().strip() for c in tr.query_selector_all('td')]
                    minutos = None
                    if iDur is not None and iDur < len(tds):
                        md = re.search(r'\d+', tds[iDur])
                        minutos = int(md.group(0)) if md else None
                    rid = re.search(r'([0-9a-f]{40}-\d{13})', href or '')
                    clave = rid.group(1) if rid else (tds[iDur] if iDur is not None and iDur < len(tds) else '') + '|' + ' '.join(tds)[-80:]
                    if clave in vistos:
                        continue
                    vistos.add(clave)
                    res.append(dict(href=href, minutos=minutos))
        return res

    def resolver_grabacion(self, href):
        """Sigue el link de reproduccion -> (host_bbb, record_id) o None."""
        self.page.goto(href, wait_until='domcontentloaded')
        try:
            self.page.wait_for_url(re.compile(r'/playback/|meetingId=|/presentation/'), timeout=10000)
        except Exception:
            pass
        m = re.search(r'([0-9a-f]{40}-\d{13})', self.page.url)
        if not m or 'certus.edu.pe/mod/' in self.page.url:
            return None
        u = urlparse(self.page.url)
        return f'{u.scheme}://{u.netloc}', m.group(1)

    def metadata(self, host, rid):
        r = self.ctx.request.get(f'{host}/presentation/{rid}/metadata.xml')
        if not r.ok:
            return None
        try:
            ini = ET.fromstring(r.text()).findtext('.//start_time')
        except ET.ParseError:
            return None
        return datetime.fromtimestamp(int(ini) / 1000, LIMA) if ini else None

    def camara(self, host, rid, max_min):
        """Heuristica: primer tramo no-negro de webcams.webm en los primeros max_min+10 min.
        -> (minuto desde inicio de la grabacion | None, nota)."""
        url = None
        for ext in ('webm', 'mp4'):
            u = f'{host}/presentation/{rid}/video/webcams.{ext}'
            if self.ctx.request.head(u).ok:
                url = u
                break
        if not url:
            return None, 'sin video de camaras'
        if not shutil.which('ffmpeg'):
            return None, 'falta ffmpeg'
        p = subprocess.run(['ffmpeg', '-hide_banner', '-t', str((max_min + 10) * 60), '-i', url, '-an',
                            '-vf', 'blackdetect=d=3:pix_th=0.10', '-f', 'null', '-'],
                           capture_output=True, text=True, timeout=900)
        err = p.stderr
        t = re.findall(r'time=(\d+):(\d+):([\d.]+)', err)
        visto = int(t[-1][0]) * 3600 + int(t[-1][1]) * 60 + float(t[-1][2]) if t else 0
        negros = [(float(a), float(b)) for a, b in re.findall(r'black_start:([\d.]+) black_end:([\d.]+)', err)]
        if negros and negros[0][0] <= 2:
            if negros[0][1] >= visto - 2:
                return None, f'camara apagada los primeros {visto / 60:.0f} min'
            return negros[0][1] / 60, ''
        return 0.0, ''


# ---------------------------------------------------------------- auditoria
def fecha_es(txt):
    """'sabado, 10 de octubre de 2026, 06:54' -> date(2026, 10, 10) (None si no se entiende)."""
    m = re.search(r'(\d{1,2}) de (\w+) de (\d{4})', (txt or '').lower())
    if m and MESES.get(m.group(2)):
        try:
            return datetime(int(m.group(3)), MESES[m.group(2)], int(m.group(1))).date()
        except ValueError:
            return None
    m = re.search(r'(\d{1,2})/(\d{1,2})/(\d{2,4})', txt or '')
    if m:
        a = int(m.group(3))
        try:
            return datetime(a + 2000 if a < 100 else a, int(m.group(2)), int(m.group(1))).date()
        except ValueError:
            return None
    return None


def hora_log(txt, dia):
    m = re.search(r'(\d{1,2}):(\d{2})(?!.*\d{1,2}:\d{2})', txt)
    return datetime(dia.year, dia.month, dia.day, int(m.group(1)), int(m.group(2)), tzinfo=LIMA) if m else None


def es_ingreso(ev):
    e = norm(ev)
    return any(k in e for k in ('UNID', 'UNIO', 'JOINED', 'INGRES')) and not any(k in e for k in ('SALI', 'LEFT'))


def auditar_clase(campus, sec, dia, tolerancia=5, camara_min=20, con_camara=True, avisar=print):
    a, b = sec['horario'][dia.weekday()]
    ini = datetime.strptime(f'{dia} {a}', '%Y-%m-%d %H:%M').replace(tzinfo=LIMA)
    fila = dict(fecha=dia.isoformat(), carga=sec['carga'], nrc=sec['nrc'], seccion=sec['seccion'], area=sec.get('area', ''),
                docente=sec['docente'], curso=sec['curso'], sede=sec['sede'], turno=sec['turno'],
                periodo=sec['periodo'], modulo=sec['modulo'], ciclo=sec['ciclo'], horario=f'{a}-{b}',
                ingreso='', retraso=None, estIngreso='', grabacion='', horas=None, esperado=None, grabado=None,
                faltan=None, estPermanencia='', camara=None, estCamara='',
                nota='', aula='', auditado=datetime.now(LIMA).isoformat(timespec='minutes'))
    hallado = campus.buscar_curso(sec)
    if not hallado:
        fila.update(estIngreso='AULA NO ENCONTRADA', estCamara='—')
        return fila
    cid, _ = hallado
    fila['aula'] = f'{BASE}/course/view.php?id={cid}'
    cms = campus.cm_bbb(cid)

    filas_log, diag = campus.logs_bbb(cid, dia, cms)
    avisar(f'   {diag}')
    logs = [f for f in filas_log if es_ingreso(f['evento'])]
    entradas = sorted(t for f in logs if mismo_docente(f['usuario'], sec['docente'])
                      for t in [hora_log(f['hora'], dia)] if t)
    # Entradas de horas antes no cuentan (otra sesion del mismo dia en la misma aula).
    entradas = [t for t in entradas if t >= ini - timedelta(minutes=60)]

    # Grabacion de ese dia (siempre se busca: tambien prueba que hubo clase).
    host = rid = inicio = None
    notas = []
    grabs = campus.grabaciones(cms, dia)
    for g in grabs:
        if not g['href']:
            continue
        info = campus.resolver_grabacion(g['href'])
        if not info:
            notas.append('no se pudo abrir la grabacion')
            continue
        h, r = info
        ini_g = campus.metadata(h, r)
        if ini_g and abs((ini_g - ini).total_seconds()) > 3 * 3600:
            continue                                    # grabacion de otra sesion del dia
        host, rid, inicio = h, r, ini_g
        break
    grabado = sum(g['minutos'] or 0 for g in grabs)
    avisar(f'   actividades BigBlueButton: {len(cms)} · grabaciones del dia: {len(grabs)} ({grabado} min)' + (f', la primera empezo {inicio:%H:%M}' if inicio else ''))
    fin = datetime.strptime(f'{dia} {b}', '%Y-%m-%d %H:%M').replace(tzinfo=LIMA)
    # Minutos esperados = horas de la sesion x 45 (07:00-08:30 = 2 h = 90 min; 07:00-10:45 = 5 h = 225 min).
    horas = round((fin - ini).total_seconds() / 60 / 45)
    esperado = horas * 45
    fila.update(horas=horas, esperado=esperado, grabado=grabado if grabs else 0)
    if datetime.now(LIMA) < fin:
        fila['estPermanencia'] = 'PENDIENTE'
    elif not grabs:
        fila.update(estPermanencia='ALARMA', faltan=esperado)
    elif all(g['minutos'] is None for g in grabs):
        fila['estPermanencia'] = 'NO EVALUADO'           # la tabla no trajo la duracion
    elif grabado >= esperado:
        fila.update(estPermanencia='OK', faltan=0)
    else:
        fila.update(estPermanencia='ALARMA', faltan=esperado - grabado)
    if inicio:
        fila['grabacion'] = inicio.strftime('%H:%M')

    def marcar(hora, fuente):
        d = round((hora - ini).total_seconds() / 60)
        fila.update(ingreso=hora.strftime('%H:%M'), retraso=d,
                    estIngreso='PUNTUAL' if d <= tolerancia else 'TARDE')
        if fuente:
            notas.append(fuente)

    if entradas:
        marcar(entradas[0], '')
    elif inicio:
        # Sin registro del docente pero hay grabacion: la sala la abre el docente (moderador),
        # asi que el inicio de la grabacion es una buena estimacion de su ingreso.
        marcar(inicio, 'ingreso estimado por el inicio de la grabacion')
    elif grabs:
        fila['estIngreso'] = 'SIN INGRESO'
        notas.append('hay grabacion, pero no se encontro el ingreso del docente')
    elif not logs and not grabs:
        # Nadie entro y no hay grabacion: lo mas probable es que ese dia no hubo clase
        # (modulo terminado o aun no empieza, feriado). Se separa para no culpar al docente.
        fila.update(estIngreso='SIN ACTIVIDAD', estCamara='—', estPermanencia='SIN ACTIVIDAD', faltan=None,
                    nota='nadie entro a la sala y no hay grabacion ese dia')
        return fila
    else:
        fila['estIngreso'] = 'SIN INGRESO'
        notas.append(f'entraron {len(logs)} participante(s), el docente no')

    if not grabs:
        fila['estCamara'] = 'SIN GRABACION'
    elif not rid:
        fila['estCamara'] = 'NO EVALUADO'
        notas.append('no se pudo abrir el video de la grabacion')
    elif not con_camara:
        fila['estCamara'] = 'NO EVALUADO'
    else:
        minuto, nota = campus.camara(host, rid, camara_min)
        if nota:
            notas.append(nota)
        if minuto is None:
            fila['estCamara'] = 'NO EVALUADO' if nota == 'falta ffmpeg' else 'SIN CAMARA'
        else:
            # minuto desde la hora programada (no desde que empezo a grabar)
            desde = minuto + ((inicio - ini).total_seconds() / 60 if inicio else 0)
            fila['camara'] = max(0, round(desde))
            fila['estCamara'] = 'CAMARA OK' if desde <= camara_min else 'CAMARA TARDIA'
    fila['nota'] = '; '.join(notas)
    return fila


# ---------------------------------------------------------------- uso directo (sin la pagina)
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--fecha', default=datetime.now(LIMA).date().isoformat(), help='AAAA-MM-DD')
    ap.add_argument('--docente')
    ap.add_argument('--nrc')
    ap.add_argument('--tolerancia', type=int, default=5)
    ap.add_argument('--camara-min', type=int, default=20)
    ap.add_argument('--sin-camara', action='store_true')
    ap.add_argument('--ver', action='store_true', help='mostrar el navegador')
    args = ap.parse_args()
    dia = datetime.strptime(args.fecha, '%Y-%m-%d').date()
    texto, origen = texto_carga()
    secs = del_dia(leer_carga(texto), dia)
    if args.docente:
        secs = [s for s in secs if norm(args.docente) in norm(s['docente'])]
    if args.nrc:
        secs = [s for s in secs if s['nrc'] == args.nrc]
    if not secs:
        sys.exit('Ninguna sesion virtual coincide ese dia.')
    print(f'{len(secs)} sesiones virtuales el {dia} (carga: {origen})')
    user = os.environ.get('CAMPUS_USER') or input('Usuario campus: ')
    import getpass
    pw = os.environ.get('CAMPUS_PASS') or getpass.getpass('Contrasena campus: ')

    from playwright.sync_api import sync_playwright
    filas = []
    with sync_playwright() as p:
        br = p.chromium.launch(headless=not args.ver)
        campus = Campus(br.new_context(locale='es-PE', timezone_id='America/Lima'), user, pw)
        campus.login_auto()
        for n, s in enumerate(secs, 1):
            try:
                f = auditar_clase(campus, s, dia, args.tolerancia, args.camara_min, not args.sin_camara)
            except Exception as e:
                f = dict(fecha=str(dia), docente=s['docente'], nrc=s['nrc'], nota=f'ERROR: {e}')
            filas.append(f)
            print(f'[{n}/{len(secs)}] {s["docente"][:32]:32} {s["nrc"]:>5} {f.get("estIngreso", "")} {f.get("estCamara", "")}')
            time.sleep(1)
        br.close()
    out = os.path.join(RAIZ, f'reporte_virtuales_{dia}.csv')
    with open(out, 'w', encoding='utf-8-sig', newline='') as fh:
        w = csv.DictWriter(fh, list(filas[0].keys()), extrasaction='ignore')
        w.writeheader()
        w.writerows(filas)
    print('Listo:', out)


if __name__ == '__main__':
    main()
