-- ══════════════════════════════════════════════════════════════
-- dichava.app — Desativar profissionais com acesso VENCIDO
-- Marca ativo = false em quem está com acesso_ate vencido (recorrente com
-- 5 dias de carência, mesma regra do painel/admin). Some do diretório
-- (site e app). NÃO apaga nada: perfil, pacientes e prontuários ficam
-- guardados, e se a pessoa renovar é só usar "Liberar acesso" no admin.
--
-- Rode no SQL Editor do Supabase, um passo de cada vez.
-- ══════════════════════════════════════════════════════════════

-- 1) CONFERIR: quem vai ser desativado
select nome, email, plano, acesso_ate::date as venceu_em, em_teste, obs_admin
from public.profissionais
where ativo = true
  and acesso_ate is not null
  and acesso_ate + case when coalesce(obs_admin,'') ~* '♻️|recorrente' then interval '5 days' else interval '0' end <= now()
order by acesso_ate;

-- 2) DESATIVAR (rode depois de conferir a lista acima)
update public.profissionais
set ativo = false,
    destaque = false,
    em_teste = false,
    obs_admin = trim(coalesce(obs_admin,'') || ' · desativado por vencimento em ' || to_char(now(),'DD/MM/YYYY'))
where ativo = true
  and acesso_ate is not null
  and acesso_ate + case when coalesce(obs_admin,'') ~* '♻️|recorrente' then interval '5 days' else interval '0' end <= now();
