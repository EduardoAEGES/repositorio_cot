-- Pegar TODO este archivo en Supabase › SQL Editor (proyecto klmjmlhwuzhymrplemgw) y pulsar Run.
-- Crea el paso que carga la hoja BBDD en public.bd_estudiantes, programa la
-- sincronización automática y lanza la primera carga (tarda ~30 s en verse).
-- Reemplazada por bd_est_opciones (devolvía filas y la API corta en 1000)
drop function if exists public.bd_est_facetas(jsonb);

create or replace function public.bd_est_sync_procesar()
returns text
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  s public.bd_estudiantes_sync;
  r_bbdd record; v_prog text; v_tel jsonb;
  h text[]; n int;
  i_alu int; i_dni int; i_mail int; i_cic int; i_prog int; i_sec int; i_nrc int; i_cur int; i_mod int;
  i_tur int; i_dia int; i_hi int; i_hf int; i_sede int; i_mdl int; i_doc int; i_ddoc int; i_coord int;
begin
  if not pg_try_advisory_xact_lock(hashtext('bd_est_sync')) then return 'ocupado'; end if;
  select * into s from bd_estudiantes_sync where id = 1;
  if s.estado is distinct from 'descargando' then return 'nada'; end if;

  select status_code, content, error_msg into r_bbdd from net._http_response where id = s.req_bbdd;
  if not found then
    if s.solicitado < now() - interval '3 minutes' then
      update bd_estudiantes_sync set estado = 'error', detalle = 'la hoja BBDD no respondió a tiempo' where id = 1;
      return 'error';
    end if;
    return 'esperando';
  end if;
  if r_bbdd.status_code is distinct from 200 or coalesce(r_bbdd.content, '') = '' then
    update bd_estudiantes_sync set estado = 'error',
      detalle = 'no se pudo leer la hoja BBDD: ' || coalesce(r_bbdd.status_code::text, r_bbdd.error_msg, '?') where id = 1;
    return 'error';
  end if;
  -- programas y teléfonos son opcionales; si aún no llegan se espera hasta 1 minuto
  if (not exists (select 1 from net._http_response where id = s.req_prog)
      or not exists (select 1 from net._http_response where id = s.req_tel))
     and s.solicitado > now() - interval '1 minute' then
    return 'esperando';
  end if;
  select content into v_prog from net._http_response where id = s.req_prog and status_code = 200;
  begin
    select content::jsonb into v_tel from net._http_response where id = s.req_tel and status_code = 200;
  exception when others then v_tel := null;
  end;

  select array_agg(bd_est_norm(x) order by o) into h
    from unnest(bd_est_csv(rtrim(split_part(r_bbdd.content, E'\n', 1), E'\r'))) with ordinality t(x, o);
  i_alu := array_position(h, 'ALUMNO');           i_dni := array_position(h, 'DNI');
  i_mail := array_position(h, 'CORREO CERTUS');   i_cic := array_position(h, 'CICLO LECTIVO');
  i_prog := array_position(h, 'PROGRAMA');        i_sec := array_position(h, 'SECCION');
  i_nrc := array_position(h, 'NRC');              i_cur := array_position(h, 'CURSO');
  i_mod := array_position(h, 'MODULO');           i_tur := array_position(h, 'TURNO');
  i_dia := array_position(h, 'DIAS');             i_hi := array_position(h, 'HR INI');
  i_hf := array_position(h, 'HR FIN');            i_sede := array_position(h, 'SEDE');
  i_mdl := array_position(h, 'MODALIDAD');        i_doc := array_position(h, 'DOCENTE');
  i_ddoc := array_position(h, 'DNI DOCENTE');     i_coord := array_position(h, 'COORDINADOR DOCENTE');
  if i_alu is null and i_dni is null then
    update bd_estudiantes_sync set estado = 'error', detalle = 'no se encontraron las columnas ALUMNO/DNI en la hoja BBDD' where id = 1;
    return 'error';
  end if;

  delete from bd_estudiantes;
  with lineas as (
    select bd_est_csv(l) c
      from regexp_split_to_table(r_bbdd.content, E'\r?\n') with ordinality t(l, k)
     where k > 1 and btrim(l, E' ,\r') <> ''
  ), progs as (
    select distinct on (upper(btrim(c[1]))) upper(btrim(c[1])) cod, nullif(btrim(c[2]), '') nom
      from (select bd_est_csv(l) c from regexp_split_to_table(coalesce(v_prog, ''), E'\r?\n') with ordinality t(l, k) where k > 1) p
     where btrim(coalesce(c[1], '')) <> ''
  ), f as (
    select upper(regexp_replace(btrim(coalesce(c[i_alu], '')), '\s+', ' ', 'g')) alumno,
           btrim(coalesce(c[i_dni], '')) dni,
           lower(btrim(coalesce(c[i_mail], ''))) correo,
           btrim(coalesce(c[i_cic], '')) ciclo,
           btrim(coalesce(c[i_prog], '')) programa_cod,
           upper(btrim(coalesce(c[i_sec], ''))) seccion,
           btrim(coalesce(c[i_nrc], '')) nrc,
           upper(regexp_replace(btrim(coalesce(c[i_cur], '')), '\s+', ' ', 'g')) curso,
           bd_est_norm(c[i_mod]) modulo, bd_est_norm(c[i_tur]) turno,
           btrim(coalesce(c[i_dia], '')) dias, btrim(coalesce(c[i_hi], '')) hr_ini, btrim(coalesce(c[i_hf], '')) hr_fin,
           bd_est_norm(c[i_sede]) sede, bd_est_norm(c[i_mdl]) modalidad,
           upper(regexp_replace(btrim(coalesce(c[i_doc], '')), '\s+', ' ', 'g')) docente,
           btrim(coalesce(c[i_ddoc], '')) dni_docente,
           upper(regexp_replace(btrim(coalesce(c[i_coord], '')), '\s+', ' ', 'g')) coordinador
      from lineas
  )
  insert into bd_estudiantes (alumno, dni, correo, telefono, ciclo, programa_cod, programa, seccion, nrc, curso,
                              modulo, turno, dias, hr_ini, hr_fin, sede, modalidad, docente, dni_docente, coordinador, buscable)
  select f.alumno, f.dni, f.correo, coalesce(v_tel ->> f.dni, ''), f.ciclo, f.programa_cod,
         coalesce(p.nom, f.programa_cod), f.seccion, f.nrc, f.curso, f.modulo, f.turno, f.dias, f.hr_ini, f.hr_fin,
         f.sede, f.modalidad, f.docente, f.dni_docente, f.coordinador,
         bd_est_norm(concat_ws(' ', f.alumno, f.dni, f.correo, f.nrc, f.seccion, f.docente, coalesce(p.nom, f.programa_cod), f.curso))
    from f left join progs p on p.cod = upper(f.programa_cod)
   where f.alumno <> '' or f.dni <> '';
  get diagnostics n = row_count;

  update bd_estudiantes_sync set estado = 'ok', ultima = now(), filas = n, detalle = null where id = 1;
  return 'ok ' || n;
end $$;
revoke all on function public.bd_est_sync_procesar() from public, anon, authenticated;

-- Procesa las descargas pendientes cada 20 s y pide una descarga diaria (06:50 Lima = 11:50 UTC)
select cron.schedule('bd-estudiantes-procesar', '20 seconds', 'select public.bd_est_sync_procesar()');
select cron.schedule('bd-estudiantes-diario', '50 11 * * *', 'select public.bd_est_sync_solicitar()');

-- Primera carga
select public.bd_est_sync_solicitar();
