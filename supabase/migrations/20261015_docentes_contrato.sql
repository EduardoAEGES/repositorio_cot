-- Ajustes manuales del contrato de cada docente (docentes.html). Vacío = se usa el Excel / Horarios.
create table if not exists public.docentes_contrato (
  dni text primary key,
  tipo text,
  horas_contrato numeric,
  horas_logradas numeric,
  nota text,
  editado_por text,
  editado_en timestamptz not null default now()
);
alter table public.docentes_contrato enable row level security;
create policy "docentes_contrato_select" on public.docentes_contrato for select to anon, authenticated using (true);
create policy "docentes_contrato_insert" on public.docentes_contrato for insert to anon, authenticated with check (true);
create policy "docentes_contrato_update" on public.docentes_contrato for update to anon, authenticated using (true) with check (true);
