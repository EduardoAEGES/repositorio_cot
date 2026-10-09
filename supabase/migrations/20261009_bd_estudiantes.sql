-- =====================================================================
-- Base de datos de estudiantes (copia SQL de la pestaña BBDD)
-- Proyecto Supabase: klmjmlhwuzhymrplemgw
-- Las partes 1 y 2 ya están aplicadas. La PARTE 3 está en
-- supabase/PEGAR_EN_SQL_EDITOR.sql (incluye un DELETE, por eso se ejecuta a mano).
-- =====================================================================

-- ---------- PARTE 1 (aplicada): tabla, índices y consultas ----------
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create table if not exists public.bd_estudiantes (
  id bigint generated always as identity primary key,
  alumno text not null default '', dni text not null default '', correo text not null default '',
  telefono text not null default '', ciclo text not null default '', programa_cod text not null default '',
  programa text not null default '', seccion text not null default '', nrc text not null default '',
  curso text not null default '', modulo text not null default '', turno text not null default '',
  dias text not null default '', hr_ini text not null default '', hr_fin text not null default '',
  sede text not null default '', modalidad text not null default '', docente text not null default '',
  dni_docente text not null default '', coordinador text not null default '', buscable text not null default ''
);
create index if not exists bd_est_dni_idx on public.bd_estudiantes (dni);
create index if not exists bd_est_nrc_idx on public.bd_estudiantes (nrc);
create index if not exists bd_est_ciclo_idx on public.bd_estudiantes (ciclo);
create index if not exists bd_est_curso_idx on public.bd_estudiantes (curso);
create index if not exists bd_est_seccion_idx on public.bd_estudiantes (seccion);
create index if not exists bd_est_docente_idx on public.bd_estudiantes (docente);
create index if not exists bd_est_programa_idx on public.bd_estudiantes (programa);
create index if not exists bd_est_buscable_trgm on public.bd_estudiantes using gin (buscable extensions.gin_trgm_ops);
alter table public.bd_estudiantes enable row level security;
-- (política: anon/authenticated solo SELECT)

create table if not exists public.bd_estudiantes_sync (
  id int primary key default 1 check (id = 1), ultima timestamptz, filas int, estado text, detalle text,
  solicitado timestamptz, req_bbdd bigint, req_prog bigint, req_tel bigint
);
-- Funciones de consulta (todas reciben los filtros como jsonb):
--   bd_est_where(f, excluir)   arma el WHERE con columnas en lista blanca
--   bd_est_opciones(f)         valores y conteos de cada filtro (un solo jsonb)
--   bd_est_resumen(f)          KPIs
--   bd_est_matriculas(f, lim, off, orden, dir)   una fila por curso
--   bd_est_alumnos(f, lim, off)                  una fila por DNI
--   bd_est_correos(f, por_seccion)               lista única de correos
--   bd_est_csv(linea), bd_est_norm(texto)        utilidades de parseo

-- ---------- PARTE 2 (aplicada): bd_est_sync_solicitar() ----------
-- Lanza con pg_net las descargas de la hoja BBDD, el catálogo de programas
-- y telefonos.json; guarda los ids de las peticiones en bd_estudiantes_sync.

-- ---------- PARTE 3: ver supabase/PEGAR_EN_SQL_EDITOR.sql ----------
