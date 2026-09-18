-- dichava.app — Banners rotativos do blog
-- Rode UMA vez no Supabase → SQL Editor. Idempotente.
--
-- O blog lê os banners ativos (chave pública/anon). O admin gerencia tudo
-- pela seção "Banners do blog" no painel (aba Blog). Sem nenhum banner
-- ativo, o blog cai nos slides padrão embutidos no próprio blog.

create table if not exists public.blog_banners (
  id        uuid primary key default gen_random_uuid(),
  titulo    text not null,
  texto     text,
  cta       text,
  url       text not null,
  cor       text default 'app',   -- app | cuidado | pro
  ordem     int  default 0,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

alter table public.blog_banners enable row level security;

-- Leitura: qualquer visitante vê os ATIVOS (é o que o blog usa).
grant select on public.blog_banners to anon, authenticated;
drop policy if exists "banners ativos publicos" on public.blog_banners;
create policy "banners ativos publicos" on public.blog_banners
  for select using (ativo = true);

-- Admin: vê todos (inclusive inativos) e gerencia (inserir/editar/excluir).
grant insert, update, delete on public.blog_banners to authenticated;
drop policy if exists "admin gerencia banners" on public.blog_banners;
create policy "admin gerencia banners" on public.blog_banners
  for all using (public.eh_admin()) with check (public.eh_admin());

notify pgrst, 'reload schema';

-- Opcional: cadastrar os 3 banners padrão já no banco (descomente pra rodar).
-- insert into public.blog_banners (titulo, texto, cta, url, cor, ordem) values
--  ('Baixe o dichava, é grátis','Registre seu uso, entenda seus padrões e cuide-se no seu ritmo. Sem julgamento.','Abrir o app','/','app',1),
--  ('Encontre quem cuida sem julgar','Profissionais de redução de danos da Rede dichava, prontos pra caminhar com você.','Ver a rede','/landing/rede.html','cuidado',2),
--  ('Faça parte da Rede dichava','Diretório, painel de atendimento e encontros de intervisão. Cuidar em rede.','Quero entrar','/landing/profissionais.html','pro',3);
