-- dichava.app — Vídeo (gravação) nos encontros da rede
-- Rode UMA vez no Supabase → SQL Editor. Idempotente.
--
-- Guarda o link do vídeo (YouTube) de uma roda de conversa gravada.
-- No painel do profissional, quando um encontro tem vídeo, aparece o
-- botão "Assistir" e um destaque "Assista a roda de conversa".

alter table public.rede_eventos add column if not exists video text;

notify pgrst, 'reload schema';
