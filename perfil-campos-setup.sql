-- ══════════════════════════════════════════════════════════════
-- dichava.app — Campos extras do perfil do profissional
-- Adiciona as colunas novas (formação, atendimento e redes) usadas pelo
-- editor de perfil. Todas opcionais (nullable). Seguro rodar de novo.
-- Rode no SQL Editor do Supabase.
-- ══════════════════════════════════════════════════════════════

alter table public.profissionais add column if not exists estado         text;
alter table public.profissionais add column if not exists instituicao    text;
alter table public.profissionais add column if not exists ano_formacao   text;
alter table public.profissionais add column if not exists especializacao text;
alter table public.profissionais add column if not exists publicos       text;
alter table public.profissionais add column if not exists idiomas        text;
alter table public.profissionais add column if not exists instagram      text;
alter table public.profissionais add column if not exists site           text;
alter table public.profissionais add column if not exists linkedin       text;
