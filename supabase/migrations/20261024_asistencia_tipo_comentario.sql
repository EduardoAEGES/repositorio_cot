-- Tipo de comentario del registro de ingreso: libre (null) o un momento del monitoreo.
alter table public.asistencia_secciones add column if not exists tipo_comentario text
  check (tipo_comentario in ('PANTALLA', 'INICIO', 'BREAK', 'CIERRE'));
