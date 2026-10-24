-- Registro de ingreso de cada clase (panel «Cursos y secciones» de horario.html).
-- Una fila por fecha + NRC + hora de inicio. Una vez confirmado, cambiar el estado
-- exige un sustento nuevo; cada cambio queda en historial.
create table if not exists public.asistencia_secciones (
  id bigint generated always as identity primary key,
  fecha date not null,
  nrc text not null,
  ini text not null default '',
  fin text, dia text, sede text, aula text, curso text, seccion text, docente text, dni_docente text,
  estado text check (estado in ('PUNTUAL', 'TARDANZA', 'INASISTENCIA')),
  comentario text,
  confirmado boolean not null default false,
  confirmado_por text,
  confirmado_en timestamptz,
  sustento text,
  historial jsonb not null default '[]'::jsonb,
  editado_por text,
  editado_en timestamptz not null default now(),
  unique (fecha, nrc, ini)
);
create index if not exists asistencia_secciones_fecha_idx on public.asistencia_secciones (fecha);

create or replace function public.asistencia_secciones_cambio() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.confirmado then
    new.confirmado := true;   -- una decision confirmada no se puede des-confirmar
    new.confirmado_por := old.confirmado_por;
    new.confirmado_en := old.confirmado_en;
    if new.estado is distinct from old.estado then
      if coalesce(btrim(new.sustento), '') = '' or new.sustento is not distinct from old.sustento then
        raise exception 'Para cambiar una decisión confirmada se necesita un sustento.';
      end if;
      new.historial := old.historial || jsonb_build_object(
        'de', old.estado, 'a', new.estado, 'sustento', new.sustento,
        'por', new.editado_por, 'en', now());
    end if;
  elsif new.confirmado then
    new.confirmado_en := now();
    new.confirmado_por := coalesce(new.confirmado_por, new.editado_por);
  end if;
  new.editado_en := now();
  return new;
end $$;

drop trigger if exists asistencia_secciones_cambio on public.asistencia_secciones;
create trigger asistencia_secciones_cambio before insert or update on public.asistencia_secciones
  for each row execute function public.asistencia_secciones_cambio();

alter table public.asistencia_secciones enable row level security;
create policy "asistencia_secciones_select" on public.asistencia_secciones for select to anon, authenticated using (true);
create policy "asistencia_secciones_insert" on public.asistencia_secciones for insert to anon, authenticated with check (true);
create policy "asistencia_secciones_update" on public.asistencia_secciones for update to anon, authenticated using (true) with check (true);
