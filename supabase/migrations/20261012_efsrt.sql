-- EFSRT Produce MPE NAF: docentes/secciones y seguimientos editables (efsrt.html).
-- Las tablas no tienen políticas: anon no puede leerlas directamente. Todo pasa por
-- funciones security definer que exigen la clave del equipo (guardada como hash).
--   tipo 'seccion' -> hoja TODOS DOCENTES EFSRT (+ LISTA SECCIONES EFSRT CONTA)
--   tipo 'mpe'     -> hoja PROGRAMACIÓN MPE
--   tipo 'equipo'  -> hoja EQUIPO ACADÉMICO (jefe / monitor)
-- datos = lo que viene del Excel (se reemplaza al reimportar)
-- seg   = campos editables del seguimiento (se conservan al reimportar)
-- Cambiar la clave:  update efsrt_config set clave_hash = extensions.crypt('NUEVA', extensions.gen_salt('bf')) where id = 1;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.efsrt_filas (
  tipo text not null,
  id text not null,
  orden int not null default 0,
  datos jsonb not null default '{}',
  seg jsonb not null default '{}',
  editado_por text,
  editado_en timestamptz,
  importado_en timestamptz not null default now(),
  primary key (tipo, id)
);
alter table public.efsrt_filas enable row level security;

create table if not exists public.efsrt_config (
  id int primary key default 1 check (id = 1),
  clave_hash text not null
);
alter table public.efsrt_config enable row level security;
insert into public.efsrt_config (id, clave_hash)
values (1, extensions.crypt('CONTA', extensions.gen_salt('bf')))
on conflict (id) do nothing;

create or replace function public.efsrt_check(clave text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from efsrt_config where id = 1 and clave_hash = crypt(coalesce(clave, ''), clave_hash)) then
    raise exception 'Clave incorrecta' using errcode = '28P01';
  end if;
end $$;
revoke all on function public.efsrt_check(text) from public, anon, authenticated;

create or replace function public.efsrt_listar(clave text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  perform efsrt_check(clave);
  return coalesce((
    select jsonb_object_agg(tipo, filas) from (
      select tipo, jsonb_agg(jsonb_build_object('id', id, 'd', datos, 's', seg,
               'por', editado_por, 'en', editado_en) order by orden) filas
      from efsrt_filas group by tipo) t), '{}'::jsonb)
    || jsonb_build_object('importado', (select max(importado_en) from efsrt_filas));
end $$;

-- Guarda campos del seguimiento (se fusionan con los existentes). Devuelve la fila.
create or replace function public.efsrt_guardar(clave text, p_tipo text, p_id text, p_seg jsonb, p_autor text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r efsrt_filas;
begin
  perform efsrt_check(clave);
  update efsrt_filas set seg = seg || coalesce(p_seg, '{}'), editado_por = nullif(trim(p_autor), ''), editado_en = now()
   where tipo = p_tipo and id = p_id returning * into r;
  if not found then raise exception 'Fila no encontrada'; end if;
  return jsonb_build_object('id', r.id, 'd', r.datos, 's', r.seg, 'por', r.editado_por, 'en', r.editado_en);
end $$;

-- filas = [{id, d:{...}, s:{...}}]. Reemplaza datos; seg del Excel solo rellena claves vacías.
-- reemplazar = true borra las filas de ese tipo que ya no vienen en el archivo.
create or replace function public.efsrt_importar(clave text, p_tipo text, filas jsonb, reemplazar boolean default true)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare n int; b int := 0;
begin
  perform efsrt_check(clave);
  insert into efsrt_filas as f (tipo, id, orden, datos, seg, importado_en)
  select p_tipo, x->>'id', o::int, coalesce(x->'d', '{}'), coalesce(x->'s', '{}'), now()
    from jsonb_array_elements(filas) with ordinality t(x, o)
   where coalesce(x->>'id', '') <> ''
  on conflict (tipo, id) do update
    set orden = excluded.orden, datos = excluded.datos, importado_en = now(),
        seg = f.seg || (select coalesce(jsonb_object_agg(k, v), '{}') from jsonb_each(excluded.seg) e(k, v)
                         where coalesce(f.seg->>k, '') = '');
  get diagnostics n = row_count;
  if reemplazar then
    delete from efsrt_filas where tipo = p_tipo
       and id not in (select x->>'id' from jsonb_array_elements(filas) x where x->>'id' is not null);
    get diagnostics b = row_count;
  end if;
  return jsonb_build_object('guardadas', n, 'borradas', b);
end $$;

-- Valida la clave sin traer datos (para el formulario de acceso).
create or replace function public.efsrt_entrar(clave text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
begin perform efsrt_check(clave); return true; end $$;

grant execute on function public.efsrt_listar(text), public.efsrt_guardar(text, text, text, jsonb, text),
  public.efsrt_importar(text, text, jsonb, boolean), public.efsrt_entrar(text) to anon, authenticated;

-- ===== Edición manual (efsrt_manual) =====
-- Los cambios manuales a los datos van en seg.d (se aplican encima de datos), y eliminar = seg.borrado.
-- Como seg se conserva al reimportar, los cambios manuales sobreviven a una nueva importación.
create or replace function public.efsrt_agregar(clave text, p_tipo text, p_datos jsonb, p_seg jsonb, p_autor text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r efsrt_filas;
begin
  perform efsrt_check(clave);
  insert into efsrt_filas (tipo, id, orden, datos, seg, editado_por, editado_en)
  values (p_tipo, 'manual|' || gen_random_uuid(), (select coalesce(max(orden), 0) + 1 from efsrt_filas where tipo = p_tipo),
          coalesce(p_datos, '{}'), coalesce(p_seg, '{}') || '{"manual":true}', nullif(trim(p_autor), ''), now())
  returning * into r;
  return jsonb_build_object('id', r.id, 'd', r.datos, 's', r.seg, 'por', r.editado_por, 'en', r.editado_en);
end $$;
grant execute on function public.efsrt_agregar(text, text, jsonb, jsonb, text) to anon, authenticated;
-- efsrt_importar se redefinió para no borrar filas manuales, editadas o eliminadas a mano:
--   delete ... where tipo = p_tipo and id not like 'manual|%' and not (seg ? 'd')
--     and not coalesce((seg->>'borrado')::boolean, false) and id not in (...)
-- efsrt_guardar: un valor null en p_seg quita esa clave (jsonb_strip_nulls(seg || p_seg)).
