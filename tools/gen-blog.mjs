// ══════════════════════════════════════════════════════════════
// dichava.app — gerador de páginas estáticas do blog (SEO)
//
// Lê os posts publicados do Supabase (chave anônima, que já é pública no
// blog/index.html) e gera uma página HTML rastreável por post em
// /blog/p/<slug>/index.html, com title, description, Open Graph, JSON-LD
// de Artigo e o texto já renderizado. Também regenera o sitemap.xml.
//
// Roda no GitHub Action (sem servidor). Node 18+ (usa fetch global).
//   node tools/gen-blog.mjs
// ══════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://dichava.app';
const OG_FALLBACK = ORIGIN + '/og-image.png';

// Lê SB_URL e SB_KEY direto do blog (fonte única, já são públicos)
const blogSrc = readFileSync(join(ROOT, 'blog', 'index.html'), 'utf8');
const SB_URL = (blogSrc.match(/const SB_URL='([^']+)'/) || [])[1];
const SB_KEY = (blogSrc.match(/const SB_KEY='([^']+)'/) || [])[1];
if (!SB_URL || !SB_KEY) { console.error('Não achei SB_URL/SB_KEY no blog/index.html'); process.exit(1); }

const TEMAS = { rd:'Redução de danos', clinica:'Clínica e cuidado', politica:'Política de drogas', saude:'Saúde mental', familia:'Família e vínculos', ciencia:'Ciência e evidências', historias:'Histórias e vivências' };
const TEMA_GRAD = { rd:'linear-gradient(135deg,#12894e,#2fd0a0)', clinica:'linear-gradient(135deg,#0e7490,#22b8cf)', politica:'linear-gradient(135deg,#6d28d9,#db2777)', saude:'linear-gradient(135deg,#2563eb,#4f46e5)', familia:'linear-gradient(135deg,#ea580c,#f43f5e)', ciencia:'linear-gradient(135deg,#0d9488,#22c55e)', historias:'linear-gradient(135deg,#db2777,#f59e0b)' };
const grad = t => TEMA_GRAD[t] || 'linear-gradient(135deg,#153726,#2f7d45)';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const ini = n => { if (!n) return '?'; return n.trim().split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2); };
const fmtData = d => { try { return new Date(d).toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' }); } catch (e) { return ''; } };
const isoDate = d => { try { return new Date(d).toISOString().slice(0, 10); } catch (e) { return ''; } };

function renderBlocos(blocos) {
  return (blocos || []).map(b => {
    if (b.t === 'h') return `<h2>${esc(b.x)}</h2>`;
    if (b.t === 'img') return `<figure><img src="${esc(b.url)}" alt="${esc(b.cap || '')}" loading="lazy">${b.cap ? `<figcaption>${esc(b.cap)}</figcaption>` : ''}</figure>`;
    if (b.t === 'quote') return `<blockquote>${esc(b.x)}${b.by ? `<span class="by">${esc(b.by)}</span>` : ''}</blockquote>`;
    return `<p>${esc(b.x).replace(/\n/g, '<br>')}</p>`;
  }).join('');
}
// texto puro pra description/JSON-LD (sem HTML)
function plain(blocos) {
  return (blocos || []).filter(b => !b.t || b.t === 'p' || b.t === 'h' || b.t === 'quote').map(b => b.x || '').join(' ').replace(/\s+/g, ' ').trim();
}

const COVER = p => p.capa
  ? `<div class="cover" style="background-image:url('${esc(p.capa)}')"><div class="cover-vg"></div></div>`
  : `<div class="cover cover--art" style="background:${grad(p.tema)}"><svg class="cover-mk" viewBox="0 0 24 24"><path d="M4 20c0-8 6-14 16-15C19 13 13 20 5 20"/><path d="M4 20c3-4 6-6 10-8"/></svg><div class="cover-vg"></div></div>`;

const CSS = `*{box-sizing:border-box}body{margin:0;background:#FAF6EC;color:#18241B;font-family:'DM Sans',system-ui,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}
.wrap{max-width:720px;margin:0 auto;padding:0 22px}
.topbar{border-bottom:1px solid #EBE5D6;background:#FAF6EC}
.topbar .wrap{max-width:1160px;display:flex;align-items:center;gap:11px;padding:12px 22px}
.logo{display:flex;align-items:center;gap:10px}
.logo .mk{width:34px;height:34px;border-radius:12px;background:radial-gradient(circle at 32% 28%,#4a7856,#2f5740 80%);display:flex;align-items:center;justify-content:center}
.logo .mk svg{width:20px;height:20px;fill:none;stroke:#f6f3ea;stroke-width:2.1;stroke-linecap:round;stroke-linejoin:round}
.logo .wm{font-family:'Bagel Fat One',system-ui;font-size:21px;color:#1B7A43}
.topbar .sub{margin-left:auto;font-size:12.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#5B6B5D}
.art{padding:22px 0 60px}
.back{display:inline-flex;align-items:center;gap:6px;color:#2FA35F;font-weight:700;font-size:14px;padding:8px 0}
.art-tema{font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#2FA35F}
.art h1{font-size:38px;font-weight:800;line-height:1.1;letter-spacing:-.02em;margin:12px 0 18px}
@media(max-width:560px){.art h1{font-size:29px}}
.byline{display:flex;align-items:center;gap:12px;padding:14px 0;border-top:1px solid #EBE5D6;border-bottom:1px solid #EBE5D6;margin-bottom:26px}
.by-av{width:44px;height:44px;border-radius:50%;background:#F3EFE3;display:flex;align-items:center;justify-content:center;font-weight:800;color:#2FA35F}
.by-n{font-weight:800;font-size:15px}.by-d{font-size:12.5px;color:#98A38F}
.art-cover{position:relative;height:220px;border-radius:20px;overflow:hidden;margin:6px 0 28px}
.cover{position:absolute;inset:0;background-size:cover;background-position:center;overflow:hidden}
.cover--art::before{content:"";position:absolute;inset:0;background:radial-gradient(90% 72% at 12% 6%,rgba(255,255,255,.30),transparent 52%),radial-gradient(85% 85% at 110% 116%,rgba(0,0,0,.36),transparent 60%)}
.cover--art::after{content:"";position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.6) .6px,transparent .8px);background-size:15px 15px;opacity:.10}
.cover-mk{position:absolute;right:-8%;bottom:-16%;width:62%;max-width:310px;fill:none;stroke:#fff;stroke-width:1.3;stroke-linecap:round;stroke-linejoin:round;opacity:.17;transform:rotate(-9deg)}
.cover-vg{position:absolute;inset:0;background:linear-gradient(to top,rgba(6,14,9,.26),transparent 42%)}
.blocos{font-size:18.5px;line-height:1.8;color:#243226}
.blocos p{margin:0 0 20px}.blocos h2{font-size:25px;font-weight:800;line-height:1.28;margin:38px 0 14px;letter-spacing:-.015em}
.blocos figure{margin:24px 0}.blocos img{width:100%;border-radius:16px}.blocos figcaption{font-size:12.5px;color:#98A38F;text-align:center;margin-top:8px}
.blocos blockquote{margin:28px 0;padding:6px 0 6px 20px;border-left:3px solid #2FA35F;font-size:22px;font-style:italic;line-height:1.5;color:#1B7A43}
.blocos blockquote .by{display:block;font-style:normal;font-size:13.5px;color:#98A38F;margin-top:10px}
.tags{display:flex;flex-wrap:wrap;gap:8px;margin:32px 0 0}.tag{font-size:12px;font-weight:700;color:#5B6B5D;background:#F3EFE3;border-radius:999px;padding:6px 13px}
.share{display:flex;gap:10px;flex-wrap:wrap;margin:30px 0 0;padding-top:24px;border-top:1px solid #EBE5D6}
.sbtn{display:inline-flex;align-items:center;gap:8px;border:1px solid #EBE5D6;background:#fff;color:#18241B;border-radius:12px;padding:11px 17px;font-size:14px;font-weight:700}
.sbtn.wa{background:#25D366;border-color:#25D366;color:#fff}
.foot{border-top:1px solid #EBE5D6;padding:28px 0;text-align:center;color:#98A38F;font-size:13px;background:#F3EFE3}
.foot a{color:#2FA35F;font-weight:700}`;

function pagina(p) {
  const canon = `${ORIGIN}/blog/p/${encodeURIComponent(p.slug)}/`;
  const desc = (p.resumo || plain(p.blocos)).slice(0, 160);
  const img = p.capa || OG_FALLBACK;
  const temaNome = p.tema ? (TEMAS[p.tema] || p.tema) : '';
  const pub = isoDate(p.publicado_em || p.criado_em);
  const upd = isoDate(p.atualizado_em || p.publicado_em || p.criado_em);
  const ld = {
    '@context':'https://schema.org','@type':'Article',
    headline: p.titulo, description: desc,
    image: img ? [img] : undefined,
    datePublished: pub || undefined, dateModified: upd || undefined,
    author: { '@type':'Person', name: p.autor_nome || 'Rede dichava' },
    publisher: { '@type':'Organization', name:'dichava', logo:{ '@type':'ImageObject', url: OG_FALLBACK } },
    mainEntityOfPage: canon,
    articleSection: temaNome || undefined
  };
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(p.titulo)} · Blog dichava</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canon}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(p.titulo)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canon}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:site_name" content="dichava">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.titulo)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bagel+Fat+One&family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>${CSS}</style>
</head>
<body>
<div class="topbar"><div class="wrap">
  <a class="logo" href="/"><span class="mk"><svg viewBox="0 0 24 24"><path d="M4 20c0-8 6-14 16-15C19 13 13 20 5 20"/><path d="M4 20c3-4 6-6 10-8"/></svg></span><span class="wm">dichava</span></a>
  <a class="sub" href="/blog/">Blog</a>
</div></div>
<main class="wrap"><article class="art">
  <a class="back" href="/blog/">‹ Todos os textos</a>
  ${temaNome ? `<div class="art-tema">${esc(temaNome)}</div>` : ''}
  <h1>${esc(p.titulo)}</h1>
  <div class="byline">
    <div class="by-av">${esc(ini(p.autor_nome))}</div>
    <div><div class="by-n">${esc(p.autor_nome || 'Rede dichava')}</div><div class="by-d">${esc(fmtData(p.publicado_em || p.criado_em))}</div></div>
  </div>
  ${p.capa ? `<img class="art-cap" src="${esc(p.capa)}" alt="" style="width:100%;border-radius:20px;margin:6px 0 28px;display:block">` : `<div class="art-cover">${COVER(p)}</div>`}
  <div class="blocos">${renderBlocos(p.blocos)}</div>
  ${(p.tags && p.tags.length) ? `<div class="tags">${p.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
  <div class="share">
    <a class="sbtn wa" href="https://wa.me/?text=${encodeURIComponent(p.titulo + ' — ' + canon)}" target="_blank" rel="noopener">WhatsApp</a>
    <a class="sbtn" href="/blog/">Ver todos os textos</a>
    <a class="sbtn" href="/">Ir pro app</a>
  </div>
</article></main>
<div class="foot"><div class="wrap">Blog da rede dichava · <a href="/">ir pro app</a></div></div>
</body>
</html>`;
}

function sitemap(posts) {
  const hoje = new Date().toISOString().slice(0, 10);
  const fixas = [
    { loc: ORIGIN + '/', freq: 'weekly', pri: '1.0', mod: hoje },
    { loc: ORIGIN + '/landing/', freq: 'monthly', pri: '0.9', mod: hoje },
    { loc: ORIGIN + '/blog/', freq: 'weekly', pri: '0.8', mod: hoje }
  ];
  const urls = fixas.map(u => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.mod}</lastmod>\n    <changefreq>${u.freq}</changefreq>\n    <priority>${u.pri}</priority>\n  </url>`);
  posts.forEach(p => {
    const mod = isoDate(p.atualizado_em || p.publicado_em || p.criado_em) || hoje;
    urls.push(`  <url>\n    <loc>${ORIGIN}/blog/p/${encodeURIComponent(p.slug)}/</loc>\n    <lastmod>${mod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`);
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

async function main() {
  const endpoint = `${SB_URL}/rest/v1/blog_posts?status=eq.publicado&select=*&order=publicado_em.desc`;
  const res = await fetch(endpoint, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
  if (!res.ok) { console.error('Falha ao ler posts:', res.status, await res.text()); process.exit(1); }
  const posts = (await res.json()).filter(p => p && p.slug);

  const outDir = join(ROOT, 'blog', 'p');
  // limpa páginas de posts que não existem mais (despublicados/excluídos)
  const slugs = new Set(posts.map(p => String(p.slug)));
  if (existsSync(outDir)) {
    for (const d of readdirSync(outDir, { withFileTypes: true })) {
      if (d.isDirectory() && !slugs.has(d.name)) rmSync(join(outDir, d.name), { recursive: true, force: true });
    }
  }
  mkdirSync(outDir, { recursive: true });
  for (const p of posts) {
    const dir = join(outDir, String(p.slug));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), pagina(p));
  }
  writeFileSync(join(ROOT, 'sitemap.xml'), sitemap(posts));
  console.log(`Gerado: ${posts.length} post(s) em /blog/p/ e sitemap.xml atualizado.`);
}
main().catch(e => { console.error(e); process.exit(1); });
