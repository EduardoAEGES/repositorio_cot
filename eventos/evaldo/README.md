# Desempeño docente · Contabilidad y Pensamiento Lógico

Reporte interactivo (estilo Power BI) del Evaldo 2023-II a 2026 de los docentes de Contabilidad y Pensamiento Lógico, con la base de docentes 2026-2.

## Estructura

```
index.html          Página del reporte
css/styles.css      Estilos (tema claro y oscuro automático)
js/app.js           Lógica: filtros, gráficos (d3 v7), tablas, ficha del docente y configuración de Supabase
supabase/schema.sql Tabla de ediciones para Supabase
data/docentes.js    Datos (window.DOCENTES): una fila por docente y línea
```

No necesita servidor ni instalación: se puede abrir `index.html` directamente. La única dependencia externa es d3 v7, que se carga desde cdnjs.

## Publicar en GitHub Pages

1. Crea un repositorio y sube estos archivos tal como están.
2. En el repositorio: Settings → Pages → Source: rama `main`, carpeta `/ (root)`.
3. La página queda en `https://<usuario>.github.io/<repositorio>/`.

Si el repositorio es público, cualquiera con el enlace verá los nombres y puntajes.

## Actualizar los datos

Reemplaza `data/docentes.js` manteniendo el formato `window.DOCENTES = [ ... ];`. Campos por docente:

| Campo | Descripción |
|---|---|
| id | Identificador único (C001…, P001…) |
| docente, linea, contrato, sede | Datos de la base 2026-2 |
| horas_contrato, carga_asignada | Horas según contrato y si tiene carga 2026-2 (Sí/No) |
| evaldo_2023 … evaldo_2026 | Nota ponderada de cada periodo (0 a 1) |
| categoria_2026 | Eficiente, Puede mejorar, Debe mejorar o No eficiente |
| encuesta_2026, asistencia_2026, notas_2026, reuniones_2026, capacitacion_2026 | Componentes del Evaldo 2026 (0 a 1) |

## Editar datos

En la ficha de cada docente hay un botón **Editar datos** para corregir línea, contrato, sede, horas de contrato y carga 2026-2.

- En GitHub Pages o abriendo `index.html` en tu computadora, los cambios se guardan solo en ese navegador. Usa **Descargar datos** y reemplaza `data/docentes.js` en el repositorio para que todos los vean.
- En la versión publicada en Claude, **Guardar cambios** crea una nueva versión de la página, visible para todos los que tengan el enlace. Solo pueden guardar quienes tienen permiso de edición.

## Guardar en Supabase

Si configuras Supabase, los cambios de todos los que usen el reporte se guardan en una base de datos y se ven para todos al recargar.

1. En Supabase, crea un proyecto y ejecuta `supabase/schema.sql` en el SQL Editor.
2. En `js/app.js`, completa `SUPABASE.url` (Project URL) y `SUPABASE.key` (clave `anon`, la pública).
3. Sube los cambios al repositorio.

Con Supabase configurado, **Guardar cambios** escribe en la tabla `docentes_ediciones`. Como la página es pública, la clave `anon` se ve en el código: la protección real son las políticas RLS de `schema.sql`.

## Eliminar y restaurar docentes

En la ficha de un docente, **Eliminar docente** lo quita del reporte (queda pendiente hasta **Guardar cambios**). El borrado es lógico: en la página de detalle, **Docentes eliminados** muestra la lista y permite **Restaurar**. Los datos no se pierden de la base.

## Páginas

- **Resumen**: indicadores, docentes por contrato y categoría, distribución por categoría, evolución 2023-2026, promedio por sede y matriz de componentes con formato condicional.
- **PTC · PTC IN · PTD**: cada contrato por separado, ranking y evolución individual.
- **Detalle docentes**: tabla con búsqueda y orden.

Al hacer clic en un docente se abre su ficha con el historial del Evaldo y sus componentes 2026 frente al promedio de su grupo. Los filtros de la izquierda y los clics en los gráficos filtran todo el reporte (Ctrl + clic suma varias opciones).
