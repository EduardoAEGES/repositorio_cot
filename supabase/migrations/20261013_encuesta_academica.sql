-- Formulario COMPLETO de eventos (actividades académicas): encuesta.html?e=<id>&f=c
-- La respuesta base sigue en asistencia_encuesta (reportes sin cambios); aquí va lo adicional.
-- El dashboard eventos/metricas.html lee con ev_metricas (sin documento ni celular).
create table if not exists public.encuesta_academica (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  evento_id integer references public.eventos(id) on delete cascade,
  encuesta_id uuid,                     -- asistencia_encuesta.id
  modulo_sesion text,
  rol text,
  tipo_documento text,
  documento text,
  celular text,
  sede text,
  carrera text,
  ciclo text,
  turno text,
  calificacion smallint check (calificacion between 1 and 5),
  nps smallint check (nps between 0 and 10),
  utilidad text,
  dominio_ponente smallint check (dominio_ponente between 1 and 5),
  organizacion smallint check (organizacion between 1 and 5),
  aprendizaje text,
  temas_futuros text,
  confirma_datos boolean not null default false,
  autoriza_comunicaciones boolean not null default false
);
create index if not exists encuesta_academica_evento on public.encuesta_academica(evento_id);
alter table public.encuesta_academica enable row level security;
-- Cualquiera puede responder; nadie lee la tabla directo (tiene documento y celular).
create policy "encuesta_academica_insert" on public.encuesta_academica for insert to anon, authenticated with check (true);

create or replace function public.ev_metricas(p_eventos integer[] default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'fecha', a.created_at, 'evento_id', a.evento_id, 'sesion', a.modulo_sesion, 'rol', a.rol,
    'sede', a.sede, 'carrera', a.carrera, 'ciclo', a.ciclo, 'turno', a.turno, 'calificacion', a.calificacion,
    'nps', a.nps, 'utilidad', a.utilidad, 'ponente', a.dominio_ponente, 'organizacion', a.organizacion,
    'aprendizaje', a.aprendizaje, 'temas', a.temas_futuros, 'autoriza', a.autoriza_comunicaciones,
    'tipo_documento', a.tipo_documento) order by a.created_at), '[]'::jsonb)
  from encuesta_academica a
  where p_eventos is null or a.evento_id = any(p_eventos);
$$;
grant execute on function public.ev_metricas(integer[]) to anon, authenticated;
