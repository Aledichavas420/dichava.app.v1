-- dichava.app — Autor do blog (mini bio no fim do texto)
-- Rode UMA vez no Supabase → SQL Editor. Idempotente.
--
-- No painel admin, ao escrever um texto, você escolhe o autor entre os
-- profissionais da rede (plano profissional/clínica). O nome, a foto, o
-- registro (CRP/CRM...), a profissão e a cidade ficam guardados no próprio
-- post, e a página do blog monta sozinha a mini bio do autor no fim do texto.
--
-- autor_nome e autor_prof_id já existem (blog-setup.sql). Aqui só entram os
-- campos que a página pública usa pra desenhar a assinatura sem precisar
-- consultar a tabela de profissionais.

alter table public.blog_posts add column if not exists autor_foto   text;  -- URL da foto (Storage)
alter table public.blog_posts add column if not exists autor_crp    text;  -- registro profissional (CRP/CRM...)
alter table public.blog_posts add column if not exists autor_tipo   text;  -- profissão (Psicóloga, Psiquiatra...)
alter table public.blog_posts add column if not exists autor_cidade text;  -- cidade
alter table public.blog_posts add column if not exists autor_bio    text;  -- mini bio curta (opcional)

notify pgrst, 'reload schema';
