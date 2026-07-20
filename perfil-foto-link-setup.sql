-- dichava.app — foto e link (Instagram/site) no perfil do profissional
-- Rode uma vez no SQL Editor do Supabase.

alter table public.profissionais add column if not exists foto text;  -- data URL da foto (redimensionada no cliente)
alter table public.profissionais add column if not exists link text;  -- @instagram ou URL do site
alter table public.profissionais add column if not exists capa text;  -- tema de cor da capa da ficha (verde/oceano/roxo/porsol/rosa/grafite)
alter table public.profissionais add column if not exists bio_links jsonb;  -- links do 'link na bio' (Linktree)
alter table public.profissionais add column if not exists bio_config jsonb;  -- personalizacao do link na bio (fundo/cor/fonte/textos)
