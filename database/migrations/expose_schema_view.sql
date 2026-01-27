
create or replace view public.debug_views_exposed as 
select table_name, view_definition 
from information_schema.views 
where table_schema = 'public';

grant select on public.debug_views_exposed to anon, authenticated, service_role;
