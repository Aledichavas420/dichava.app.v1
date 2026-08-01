-- ══════════════════════════════════════════════════════════════
-- dichava.app — Newsletter: contagem por ORIGEM (landing, breve…)
-- Mostra no admin de onde vieram os inscritos.
-- Rode no SQL Editor do Supabase (uma vez). Depende de is_dichava_admin().
-- ══════════════════════════════════════════════════════════════
create or replace function public.admin_newsletter_por_origem()
returns json language plpgsql security definer set search_path = public as $$
declare r json;
begin
  if not public.is_dichava_admin() then raise exception 'forbidden'; end if;
  select coalesce(json_agg(x order by x.n desc), '[]'::json) into r from (
    select coalesce(nullif(trim(origem),''),'—') as origem, count(*)::int as n
    from public.newsletter
    where ativo = true and consent = true
    group by 1
  ) x;
  return r;
end $$;

revoke all on function public.admin_newsletter_por_origem() from public, anon;
grant execute on function public.admin_newsletter_por_origem() to authenticated;

notify pgrst, 'reload schema';
