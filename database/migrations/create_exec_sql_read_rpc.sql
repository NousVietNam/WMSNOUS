
create or replace function public.exec_sql_read(sql_query text)
returns json
language plpgsql
security definer
as $$
declare
  result json;
begin
  execute 'select json_agg(t) from (' || sql_query || ') t' into result;
  return result;
end;
$$;

NOTIFY pgrst, 'reload schema';
