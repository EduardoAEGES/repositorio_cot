# -*- coding: utf-8 -*-
"""Agente local del Seguimiento VIRTUAL (lo maneja virtual.html, como el agente de EVALDO).

Abre un Chromium propio (perfil guardado en ~/.virtual_agente) donde inicias sesion
en Campus Digital UNA vez; la sesion queda guardada. La pagina le pide auditar un dia
y el agente recorre las aulas virtuales: hora de ingreso del docente y camara.

    Doble clic en tools/Virtual_Agente.bat   (o: python tools/virtual_agente.py)

Resultados locales: virtual_local/resultados.json (fuera de git).
"Publicar para el equipo" los cifra (AES-GCM + PBKDF2, igual que evaldo.bin) en
datos/virtual.bin y hace git commit + push desde este clon del repo.
"""
import gzip, json, os, queue, secrets, struct, subprocess, sys, threading, time, traceback
from datetime import datetime
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import auditar_virtuales as AV   # noqa: E402

PUERTO = 8766
LOCAL = os.path.join(AV.RAIZ, 'virtual_local')
RESULTADOS = os.path.join(LOCAL, 'resultados.json')
PUBLICADO = os.path.join(AV.RAIZ, 'datos', 'virtual.bin')
PERFIL = os.path.join(os.path.expanduser('~'), '.virtual_agente')
ITERACIONES = 250000
# Estados que se vuelven a auditar solos (pueden haber sido un fallo del script, no del docente).
REINTENTAR = ('', None, 'ERROR', 'SIN ACTIVIDAD', 'AULA NO ENCONTRADA')

trabajos = queue.Queue()
candado = threading.Lock()
E = dict(sesion=False, navegador=False, corriendo=False, detener=False, total=0, hechos=0, actual='',
         error='', log=[], publicacion=dict(corriendo=False, ok=False, mensaje=''))


def log(msg):
    with candado:
        E['log'].append(f'{datetime.now():%H:%M:%S} {msg}')
    print(msg, flush=True)


def leer_resultados():
    try:
        with open(RESULTADOS, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def guardar_fila(fila):
    with candado:
        datos = leer_resultados()
        datos[f'{fila["fecha"]}|{fila["carga"]}|{fila["nrc"]}'] = fila
        os.makedirs(LOCAL, exist_ok=True)
        tmp = RESULTADOS + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(datos, f, ensure_ascii=False)
        os.replace(tmp, RESULTADOS)


# ---------------------------------------------------------------- publicar (cifrado)
def cifrar(datos, clave):
    """'VIR1' + iteraciones(4) + sal(16) + iv(12) + AES-GCM(gzip(json)) -> lo descifra virtual.js."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    import hashlib
    sal, iv = secrets.token_bytes(16), secrets.token_bytes(12)
    llave = hashlib.pbkdf2_hmac('sha256', clave.encode('utf-8'), sal, ITERACIONES, 32)
    plano = gzip.compress(json.dumps(datos, ensure_ascii=False).encode('utf-8'))
    return b'VIR1' + struct.pack('>I', ITERACIONES) + sal + iv + AESGCM(llave).encrypt(iv, plano, None)


def git(*args):
    p = subprocess.run(['git', *args], cwd=AV.RAIZ, capture_output=True, text=True)
    if p.returncode:
        raise RuntimeError((p.stderr or p.stdout).strip().splitlines()[-1] if (p.stderr or p.stdout) else 'git falló')
    return p.stdout


def publicar(clave):
    pub = E['publicacion']
    try:
        filas = list(leer_resultados().values())
        if not filas:
            raise RuntimeError('No hay clases auditadas para publicar.')
        datos = dict(generado=datetime.now(AV.LIMA).isoformat(timespec='minutes'), filas=filas)
        os.makedirs(os.path.dirname(PUBLICADO), exist_ok=True)
        with open(PUBLICADO, 'wb') as f:
            f.write(cifrar(datos, clave))
        git('add', 'datos/virtual.bin')
        if subprocess.run(['git', 'diff', '--cached', '--quiet'], cwd=AV.RAIZ).returncode == 0:
            pub.update(ok=True, mensaje='Ya estaba publicado: no hay cambios.')
            return
        git('commit', '-m', f'VIRTUAL: datos cifrados actualizados ({datetime.now():%d/%m/%Y %H:%M})',
            '--', 'datos/virtual.bin')
        try:
            git('push')
        except RuntimeError:
            git('pull', '--rebase')
            git('push')
        pub.update(ok=True, mensaje=f'Publicado: {len(filas)} clases. GitHub Pages tarda ~1 minuto en mostrarlo.')
    except Exception as e:
        pub.update(ok=False, mensaje=f'No se pudo publicar: {e}')
    finally:
        pub['corriendo'] = False


# ---------------------------------------------------------------- hilo del navegador
def trabajador():
    """Playwright (API sincrona) vive entero en este hilo; el servidor solo encola trabajos."""
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        ctx = None
        campus = None
        ultimo = 0
        while True:
            try:
                tarea = trabajos.get(timeout=5)
            except queue.Empty:
                tarea = None
            try:
                if ctx is not None:
                    try:
                        ctx.pages  # noqa: B018  (falla si el usuario cerró la ventana)
                        if not ctx.pages:
                            raise RuntimeError
                    except Exception:
                        ctx, campus, E['navegador'], E['sesion'] = None, None, False, False
                if tarea and tarea[0] == 'abrir':
                    if ctx is None:
                        ctx = p.chromium.launch_persistent_context(
                            PERFIL, headless=False, locale='es-PE', timezone_id='America/Lima',
                            viewport=None, args=['--start-maximized'])
                        campus = AV.Campus(ctx, os.environ.get('CAMPUS_USER'), os.environ.get('CAMPUS_PASS'))
                        E['navegador'] = True
                    campus.page.goto(AV.BASE + '/my/', wait_until='domcontentloaded')
                    campus.page.bring_to_front()
                    log('Navegador abierto: inicia sesión en Campus Digital si te la pide.')
                elif tarea and tarea[0] == 'auditar':
                    auditar_lote(campus, tarea[1])
                if campus and time.time() - ultimo > 10:
                    E['sesion'] = campus.sesion_ok()
                    ultimo = time.time()
            except Exception as e:
                E.update(corriendo=False, error=str(e))
                log(f'❌ {e}')
                traceback.print_exc()


def auditar_lote(campus, pedido):
    if campus is None:
        E.update(corriendo=False, error='sin_sesion')
        return
    dia = datetime.strptime(pedido['fecha'], '%Y-%m-%d').date()
    texto, origen = AV.texto_carga()
    secs = AV.del_dia(AV.leer_carga(texto), dia)
    f = pedido.get('filtros') or {}
    if f.get('docente'):
        secs = [s for s in secs if AV.norm(f['docente']) in AV.norm(s['docente'])]
    if f.get('periodo'):   # "OCTUBRE" o "AGOSTO 2" (periodo + módulo)
        p = AV.norm(f['periodo']).split()
        secs = [s for s in secs if s['periodo'].startswith(p[0]) and (len(p) < 2 or s['modulo'] == p[1])]
    if f.get('turno'):
        secs = [s for s in secs if s['turno'] in f['turno']]
    hechos = leer_resultados()
    if not pedido.get('rehacer'):
        secs = [s for s in secs if f'{dia}|{s["carga"]}|{s["nrc"]}' not in hechos
                or hechos[f'{dia}|{s["carga"]}|{s["nrc"]}'].get('estIngreso') in REINTENTAR]
    E.update(total=len(secs), hechos=0, error='', actual='')
    log(f'{len(secs)} sesiones virtuales por auditar el {dia} (carga: {origen}).')
    for s in secs:
        if E['detener']:
            log('Detenido.')
            break
        E['actual'] = f'{s["docente"]} · NRC {s["nrc"]}'
        try:
            fila = AV.auditar_clase(campus, s, dia, int(pedido.get('tolerancia', 5)),
                                    int(pedido.get('camaraMin', 20)), bool(pedido.get('camara', True)), avisar=log)
        except AV.SinSesion:
            E['error'] = 'sin_sesion'
            log('🔑 Se venció la sesión de Campus Digital. Vuelve a iniciarla y pulsa Auditar: sigue con las que faltan.')
            break
        except Exception as e:
            fila = dict(fecha=str(dia), carga=s['carga'], nrc=s['nrc'], seccion=s['seccion'], docente=s['docente'],
                        curso=s['curso'], sede=s['sede'], turno=s['turno'], periodo=s['periodo'],
                        horario='-'.join(s['horario'][dia.weekday()]), estIngreso='ERROR', estCamara='—',
                        nota=str(e)[:200])
        guardar_fila(fila)
        E['hechos'] += 1
        log(f'{"✓" if fila["estIngreso"] == "PUNTUAL" else "⚠"} {s["docente"][:34]} · NRC {s["nrc"]} · '
            f'{fila["estIngreso"]}{" +%s min" % fila["retraso"] if fila.get("retraso") else ""} · {fila["estCamara"]}')
        time.sleep(0.5)
    E.update(corriendo=False, detener=False, actual='')
    log(f'✓ Listo: {E["hechos"]} de {E["total"]} sesiones auditadas.')


# ---------------------------------------------------------------- servidor HTTP
class Manejador(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=AV.RAIZ, **k)

    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def json(self, obj, code=200):
        cuerpo = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == '/estado':
            desde = int((parse_qs(u.query).get('desde') or ['0'])[0])
            with candado:
                return self.json({**{k: v for k, v in E.items() if k != 'log'},
                                  'log': E['log'][desde:], 'nlog': len(E['log'])})
        if u.path == '/resultados':
            return self.json(dict(filas=list(leer_resultados().values())))
        if u.path.startswith('/virtual_local') or u.path.startswith('/.git'):
            return self.json(dict(error='no'), 404)
        return super().do_GET()

    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        cuerpo = json.loads(self.rfile.read(n) or b'{}') if n else {}
        ruta = urlparse(self.path).path
        if ruta == '/abrir-navegador':
            trabajos.put(('abrir',))
            return self.json(dict(ok=True))
        if ruta == '/auditar':
            if E['corriendo']:
                return self.json(dict(ok=False, error='Ya hay una auditoría en curso.'))
            if not E['sesion']:
                return self.json(dict(ok=False, error='sin_sesion'))
            E.update(corriendo=True, detener=False, error='')
            trabajos.put(('auditar', cuerpo))
            return self.json(dict(ok=True))
        if ruta == '/detener':
            E['detener'] = True
            return self.json(dict(ok=True))
        if ruta == '/publicar':
            clave = (cuerpo.get('clave') or '').strip()
            if not clave:
                return self.json(dict(ok=False, error='Falta la contraseña del equipo.'))
            if E['corriendo'] or E['publicacion']['corriendo']:
                return self.json(dict(ok=False, error='ocupado'))
            E['publicacion'] = dict(corriendo=True, ok=False, mensaje='')
            threading.Thread(target=publicar, args=(clave,), daemon=True).start()
            return self.json(dict(ok=True))
        return self.json(dict(error='ruta desconocida'), 404)


def main():
    threading.Thread(target=trabajador, daemon=True).start()
    srv = ThreadingHTTPServer(('127.0.0.1', PUERTO), Manejador)
    print(f'Agente VIRTUAL escuchando en http://127.0.0.1:{PUERTO}  (Ctrl+C para cerrar)')
    print(f'Página: https://eduardoaeges.github.io/repositorio_cot/virtual.html  o  http://127.0.0.1:{PUERTO}/virtual.html')
    trabajos.put(('abrir',))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
