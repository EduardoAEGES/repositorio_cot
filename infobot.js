/* ===== Robot "INFORMACION" =====
   Panel flotante que indica que archivo hay que revisar para actualizar la pagina,
   con boton directo a cada fuente.
   Configuracion por pagina en window.INFO_BOT antes de cargar este script:
   { intro: 'texto', fuentes:[{nombre, hoja, detalle, url}], nota:'texto' }  */
(function(){
  const cfg = window.INFO_BOT || {};
  const fuentes = cfg.fuentes || [];
  const esc = s => String(s == null ? '' : s)
    .replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const fab = document.createElement('button');
  fab.className = 'ib-fab';
  fab.type = 'button';
  fab.setAttribute('aria-label', 'Informacion sobre las fuentes de datos');
  fab.setAttribute('aria-expanded', 'false');
  fab.innerHTML = '<i class="fas fa-robot"></i><span class="ib-dot">i</span>';

  const panel = document.createElement('div');
  panel.className = 'ib-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Informacion');
  panel.innerHTML =
    '<div class="ib-head"><i class="fas fa-robot"></i><span class="ib-t">INFORMACIÓN</span>' +
    '<button class="ib-close" type="button" aria-label="Cerrar"><i class="fas fa-xmark"></i></button></div>' +
    '<div class="ib-body">' +
      '<div class="ib-bubble">' + (cfg.intro ||
        '¿Ves datos desactualizados? Esta página <b>no guarda información propia</b>: ' +
        'lee en vivo los archivos de abajo. Para actualizarla, edita el archivo y recarga.') + '</div>' +
      (fuentes.length ? '<p class="ib-sec">Archivos a revisar</p>' : '') +
      fuentes.map(f =>
        '<div class="ib-src">' +
          '<div class="ib-n"><i class="fas fa-file-excel"></i>' + esc(f.nombre) +
            (f.hoja ? '<span class="ib-tag">' + esc(f.hoja) + '</span>' : '') + '</div>' +
          (f.detalle ? '<div class="ib-d">' + esc(f.detalle) + '</div>' : '') +
          '<a class="ib-go" href="' + esc(f.url) + '" target="_blank" rel="noopener">' +
            '<i class="fas fa-up-right-from-square"></i> Abrir archivo</a>' +
        '</div>').join('') +
    '</div>' +
    '<div class="ib-foot"><i class="fas fa-lightbulb"></i> ' +
      (cfg.nota || 'Tras editar en Google Sheets, vuelve aquí y recarga la página.') + '</div>';

  function open(){
    panel.classList.add('ib-show');
    fab.classList.add('ib-open', 'ib-seen');
    fab.setAttribute('aria-expanded', 'true');
    try{ localStorage.setItem('ib-seen', '1'); }catch(e){}
  }
  function close(){
    panel.classList.remove('ib-show');
    fab.classList.remove('ib-open');
    fab.setAttribute('aria-expanded', 'false');
  }
  const isOpen = () => panel.classList.contains('ib-show');

  fab.addEventListener('click', e => { e.stopPropagation(); isOpen() ? close() : open(); });
  panel.querySelector('.ib-close').addEventListener('click', close);
  panel.addEventListener('click', e => e.stopPropagation());
  document.addEventListener('click', () => { if(isOpen()) close(); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && isOpen()) close(); });

  function mount(){
    document.body.appendChild(fab);
    document.body.appendChild(panel);
    try{ if(localStorage.getItem('ib-seen')) fab.classList.add('ib-seen'); }catch(e){}
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
