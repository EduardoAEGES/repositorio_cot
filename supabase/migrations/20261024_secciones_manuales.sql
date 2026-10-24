-- Secciones agregadas a mano en «Monitoreo sección» (horario.html): se muestran
-- cada semana en su día, junto a las que salen de CARGA_HORARIA.
-- Quitar una = activo false (queda el registro de quién la agregó / quitó).
create table if not exists public.secciones_manuales (
  id bigint generated always as identity primary key,
  dia text not null check (dia in ('LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO','DOMINGO')),
  ini text not null,
  fin text not null,
  sede text not null default '',
  aula text not null default '',
  seccion text not null default '',
  curso text not null default '',
  docente text not null default '',
  dni_docente text not null default '',
  nrc text not null default '',
  modalidad text not null default 'PRESENCIAL',
  activo boolean not null default true,
  creado_por text,
  creado_en timestamptz not null default now(),
  editado_por text,
  editado_en timestamptz not null default now()
);
create index if not exists secciones_manuales_dia_idx on public.secciones_manuales (dia) where activo;

alter table public.secciones_manuales enable row level security;
create policy "secciones_manuales_select" on public.secciones_manuales for select to anon, authenticated using (true);
create policy "secciones_manuales_insert" on public.secciones_manuales for insert to anon, authenticated with check (true);
create policy "secciones_manuales_update" on public.secciones_manuales for update to anon, authenticated using (true) with check (true);
