-- Correcciones manuales de una clase de «Monitoreo sección» (horario.html): cambia
-- curso, aula, docente o sede de una clase que sale de CARGA_HORARIA, todas las
-- semanas. clave = NRC|sección|día|hora de inicio de la clase original.
create table if not exists public.secciones_ajustes (
  clave text primary key,
  nrc text not null default '',
  seccion text not null default '',
  dia text not null default '',
  ini text not null default '',
  curso text,
  aula text,
  sede text,
  docente text,
  editado_por text,
  editado_en timestamptz not null default now()
);
alter table public.secciones_ajustes enable row level security;
create policy "secciones_ajustes_select" on public.secciones_ajustes for select to anon, authenticated using (true);
create policy "secciones_ajustes_insert" on public.secciones_ajustes for insert to anon, authenticated with check (true);
create policy "secciones_ajustes_update" on public.secciones_ajustes for update to anon, authenticated using (true) with check (true);
