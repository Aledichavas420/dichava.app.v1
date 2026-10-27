-- ══════════════════════════════════════════════════════════════
-- dichava.app — Quem está APARECENDO no diretório hoje, e por quê
-- Rode no SQL Editor do Supabase. Só leitura (não muda nada).
-- ══════════════════════════════════════════════════════════════
select
  p.nome,
  p.email,
  p.plano,
  p.acesso_ate::date                         as vence_em,      -- vazio = sem validade
  p.liberado_em::date                        as liberado_em,
  u.last_sign_in_at::date                    as ultimo_login,
  (now()::date - u.last_sign_in_at::date)    as dias_sem_entrar,
  p.obs_admin
from public.profissionais p
left join auth.users u on u.id = p.id
where p.status = 'aprovado'
  and p.ativo = true
  and coalesce(p.em_teste,false) = false
  and coalesce(p.oculto_diretorio,false) = false
order by u.last_sign_in_at nulls first;
