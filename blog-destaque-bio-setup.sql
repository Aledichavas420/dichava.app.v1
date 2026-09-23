-- dichava.app — Marcar posts do blog pra aparecerem na bio (dichavando)
-- Rode UMA vez no Supabase → SQL Editor. Idempotente.
--
-- A bio (dichava.app/dichavando) mostra em "Últimas publicações" os posts
-- publicados que estiverem marcados como destaque_bio = true. Você marca e
-- desmarca no painel admin, aba Blog, na lista de textos.

alter table public.blog_posts add column if not exists destaque_bio boolean not null default false;

notify pgrst, 'reload schema';
