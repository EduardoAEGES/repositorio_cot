-- Ediciones de docentes para el reporte (una fila por docente con cambios).
-- Ejecutar en Supabase: SQL Editor → New query → Run.

create table if not exists public.docentes_ediciones (
  id           text primary key,              -- id del docente, p. ej. C001 o P001
  cambios      jsonb not null default '{}'::jsonb,  -- linea, contrato, sede, horas_contrato, carga_asignada, eliminado
  actualizado  timestamptz not null default now()
);

alter table public.docentes_ediciones enable row level security;

-- Lectura y escritura abiertas con la clave anon (la página es pública en GitHub Pages).
-- Si quieres limitar quién escribe, cambia estas políticas (p. ej. exigir inicio de sesión).
create policy "lectura pública"  on public.docentes_ediciones for select to anon, authenticated using (true);
create policy "escritura pública" on public.docentes_ediciones for insert to anon, authenticated with check (true);
create policy "actualización pública" on public.docentes_ediciones for update to anon, authenticated using (true) with check (true);
