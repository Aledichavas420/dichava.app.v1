-- ══════════════════════════════════════════════════════════════
-- dichava.app — Blog (posts da rede, publicados por você com assinatura do autor)
-- Você escreve/edita/publica pelo painel admin; o texto é do profissional e
-- aparece assinado por ele. A página pública dichava.app/blog lê os publicados.
--
-- Requer public.eh_admin() (do admin-setup.sql).
-- Rode no SQL Editor do Supabase. Idempotente.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.blog_posts (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null,
  slug         text unique,                 -- usado na URL (/blog/?p=slug)
  autor_nome   text,                         -- assinatura (nome do profissional autor)
  autor_prof_id uuid,                         -- opcional: liga ao profissional (foto/link)
  tema         text,                          -- categoria (ver TEMAS no app)
  tags         text[] default '{}',
  capa         text,                          -- URL da imagem de capa (Storage)
  resumo       text,                          -- chamada curta (aparece na lista)
  blocos       jsonb not null default '[]',   -- conteúdo em blocos [{t,x,url,cap,by}]
  status       text not null default 'rascunho',  -- 'rascunho' | 'publicado'
  publicado_em timestamptz,
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists blog_posts_status_idx on public.blog_posts (status, publicado_em desc);
create index if not exists blog_posts_tema_idx on public.blog_posts (tema);

alter table public.blog_posts enable row level security;

-- Leitura pública só dos publicados (o /blog usa a chave anônima).
drop policy if exists "blog_read_pub" on public.blog_posts;
create policy "blog_read_pub" on public.blog_posts
  for select to anon, authenticated using (status = 'publicado');

-- Admin (você) faz tudo, inclusive ver rascunhos.
drop policy if exists "blog_admin_all" on public.blog_posts;
create policy "blog_admin_all" on public.blog_posts
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

grant select on public.blog_posts to anon, authenticated;
grant insert, update, delete on public.blog_posts to authenticated;

-- ── Storage: bucket público 'blog' pras imagens do post (capa e imagens no texto) ──
insert into storage.buckets (id, name, public)
values ('blog','blog',true)
on conflict (id) do update set public = true;

-- Qualquer um lê as imagens do bucket; só o admin escreve.
drop policy if exists "blog_img_read" on storage.objects;
create policy "blog_img_read" on storage.objects
  for select using (bucket_id = 'blog');

drop policy if exists "blog_img_admin" on storage.objects;
create policy "blog_img_admin" on storage.objects
  for all to authenticated
  using (bucket_id = 'blog' and public.eh_admin())
  with check (bucket_id = 'blog' and public.eh_admin());

notify pgrst, 'reload schema';
