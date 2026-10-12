/**
 * Evidencias fotográficas por evento (capturas de pantalla / fotos).
 *
 * Se guardan en el bucket público "evidencias" de Supabase Storage, en la
 * carpeta evento_<id>/. El bucket permite subir y leer pero no borrar, así que
 * "quitar" una foto intenta borrarla y además deja una marca <foto>.borrado.png
 * que hace que deje de listarse.
 *
 * Lo usan gestor.html (subir/quitar) y reporte.html (mostrar en el reporte).
 */
(function () {
    const BUCKET = 'evidencias';
    const SUFIJO_BORRADO = '.borrado.png';
    // PNG de 1x1 px usado como marca de borrado.
    const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    const carpeta = (eventoId) => `evento_${eventoId}`;
    const esImagen = (n) => /\.(jpe?g|png|webp)$/i.test(n) && !n.endsWith(SUFIJO_BORRADO);

    /** Devuelve [{ nombre, ruta, url }] de las fotos vigentes del evento, en orden de subida. */
    async function listar(sb, eventoId) {
        const { data, error } = await sb.storage.from(BUCKET)
            .list(carpeta(eventoId), { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
        if (error) throw error;
        const nombres = (data || []).map((o) => o.name);
        const borrados = new Set(nombres.filter((n) => n.endsWith(SUFIJO_BORRADO))
            .map((n) => n.slice(0, -SUFIJO_BORRADO.length)));
        return nombres
            .filter((n) => esImagen(n) && !borrados.has(n))
            .map((n) => {
                const ruta = `${carpeta(eventoId)}/${n}`;
                return { nombre: n, ruta, url: sb.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl };
            });
    }

    /** Reduce la imagen (máx. 1600 px de lado) y la devuelve como Blob JPEG. */
    function comprimir(file, maxLado = 1600) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                let w = img.naturalWidth, h = img.naturalHeight;
                const k = Math.min(1, maxLado / Math.max(w, h));
                w = Math.round(w * k); h = Math.round(h * k);
                const c = document.createElement('canvas');
                c.width = w; c.height = h;
                const ctx = c.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                URL.revokeObjectURL(url);
                c.toBlob((b) => b ? resolve(b) : reject(new Error('no se pudo procesar la imagen')), 'image/jpeg', 0.85);
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`«${file.name}» no es una imagen válida`)); };
            img.src = url;
        });
    }

    /** Sube una foto al evento. */
    async function subir(sb, eventoId, file) {
        const blob = await comprimir(file);
        const nombre = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`;
        const { error } = await sb.storage.from(BUCKET)
            .upload(`${carpeta(eventoId)}/${nombre}`, blob, { contentType: 'image/jpeg' });
        if (error) throw error;
    }

    /** Quita una foto del evento (borrado real si se puede + marca de borrado). */
    async function quitar(sb, eventoId, nombre) {
        await sb.storage.from(BUCKET).remove([`${carpeta(eventoId)}/${nombre}`]);
        const bytes = Uint8Array.from(atob(PNG_1PX), (ch) => ch.charCodeAt(0));
        const { error } = await sb.storage.from(BUCKET).upload(
            `${carpeta(eventoId)}/${nombre}${SUFIJO_BORRADO}`,
            new Blob([bytes], { type: 'image/png' }), { contentType: 'image/png' });
        if (error && !/exists|duplicate/i.test(error.message)) throw error;
    }

    window.Evidencias = { listar, subir, quitar };
})();
