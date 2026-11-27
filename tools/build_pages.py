"""Write one static page per work (/N/index.html), the home page's head and text, and sitemap.xml.

The atlas is built by main.js, so search engines and link previews would otherwise see
an almost empty page. Each page here carries the work's title, author, text and images
in plain HTML; main.js removes that text when it starts and opens the same work's card.

Usage: python3 tools/build_pages.py   (run from the repo root, after build_data.py)
"""
import json, os, re, shutil, html, datetime

SITE = 'https://mnemotheca.org'
HOME_TITLE = 'Mnemotheca — an atlas of beautiful things'
HOME_DESC = ("Mnemotheca: the beautiful things that pass before my eyes, and that I don't want to forget. "
             "An atlas of architecture, art, cinema, photography and design.")
DISC = {'Architettura': 'architecture', 'Arte': 'art', 'Cinema': 'cinema', 'Fotografia': 'photography',
        'Design': 'design', 'Testo': 'text', 'Scienza': 'science', 'Filosofia': 'philosophy'}

works = json.load(open('data/opere.json'))
sizes = json.load(open('data/sizes.json')) if os.path.exists('data/sizes.json') else {}
tpl = open('index.html').read()
e = lambda s: html.escape(str(s or ''), quote=True)


def short(text, n=155):
    text = re.sub(r'\s+', ' ', text or '').strip()
    if len(text) <= n:
        return text
    cut = text[:n].rsplit(' ', 1)[0].rstrip(',;:.')
    return cut + '…'


def fill(page, meta, seo):
    page = re.sub(r'<!--meta:start-->.*?<!--meta:end-->', lambda m: f'<!--meta:start-->\n{meta}\n<!--meta:end-->', page, flags=re.S)
    return re.sub(r'<!--seo:start-->.*?<!--seo:end-->', lambda m: f'<!--seo:start-->\n{seo}\n<!--seo:end-->', page, flags=re.S)


def head(title, desc, url, image, w=None, h=None, ld=None):
    out = [
        f'<title>{e(title)}</title>',
        f'<meta name="description" content="{e(desc)}">',
        f'<link rel="canonical" href="{url}">',
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="Mnemotheca">',
        f'<meta property="og:url" content="{url}">',
        f'<meta property="og:title" content="{e(title)}">',
        f'<meta property="og:description" content="{e(desc)}">',
        f'<meta property="og:image" content="{image}">',
    ]
    if w and h:
        out += [f'<meta property="og:image:width" content="{w}">', f'<meta property="og:image:height" content="{h}">']
    out.append('<meta name="twitter:card" content="summary_large_image">')
    if ld:
        out.append('<script type="application/ld+json">\n' + json.dumps(ld, ensure_ascii=False, indent=2) + '\n</script>')
    return '\n'.join(out)


website = {'@type': 'WebSite', 'name': 'Mnemotheca', 'url': SITE + '/',
           'alternateName': ['mnemotheca.org', '@mnemotheca'],
           'sameAs': ['https://www.instagram.com/mnemotheca/']}

# ---- one page per work ----
for d in os.listdir('.'):
    if d.isdigit() and os.path.isdir(d):
        shutil.rmtree(d)

by_n = sorted(works, key=lambda w: w['n'])
for i, w in enumerate(by_n):
    n, url = w['n'], f"{SITE}/{w['n']}/"
    title = f"{w['titolo']} — {w['autore']}" + (f", {w['anno']}" if w.get('anno') else '') + ' · Mnemotheca'
    desc = short(w.get('testo')) or f"{w['titolo']} by {w['autore']}, in Mnemotheca, an atlas of beautiful things."
    first = w['img'][0]
    img = f"{SITE}/img/l/{first}.webp"
    wh = sizes.get(first) or [None, None]
    ld = {'@context': 'https://schema.org', '@type': 'CreativeWork', 'name': w['titolo'],
          'creator': {'@type': 'Person', 'name': w['autore']}, 'url': url,
          'image': [f"{SITE}/img/l/{x}.webp" for x in w['img']], 'isPartOf': website}
    if w.get('anno'):
        ld['dateCreated'] = str(w['anno'])
    if w.get('testo'):
        ld['description'] = w['testo']
    meta = head(title, desc, url, img, *wh[:2], ld)

    prev, nxt = by_n[i - 1], by_n[(i + 1) % len(by_n)]
    paras = '\n'.join(f'<p>{e(p)}</p>' for p in (w.get('testo') or '').split('\n') if p.strip())
    imgs = '\n'.join(
        f'<img src="/img/l/{x}.webp" alt="{e(w["titolo"])}, {e(w["autore"])}' + (f' ({k + 1}/{len(w["img"])})' if len(w['img']) > 1 else '') + '" loading="lazy">'
        for k, x in enumerate(w['img']))
    seo = f'''<article id="seo">
<p><a href="/">Mnemotheca</a> · plate {n}</p>
<h1>{e(w['titolo'])}</h1>
<p>{e(w['autore'])}{', ' + e(w['anno']) if w.get('anno') else ''}{' · ' + DISC.get(w.get('disciplina'), '') if DISC.get(w.get('disciplina')) else ''}</p>
{paras}
{imgs}
<p><a href="/{prev['n']}/">{e(prev['titolo'])}, {e(prev['autore'])}</a> · <a href="/{nxt['n']}/">{e(nxt['titolo'])}, {e(nxt['autore'])}</a></p>
</article>'''
    os.makedirs(str(n))
    open(f'{n}/index.html', 'w').write(fill(tpl, meta, seo))

# ---- home ----
home_ld = dict(website, **{'@context': 'https://schema.org', 'inLanguage': 'en',
               'description': 'An atlas of architecture, art, cinema, photography and design: the beautiful things that pass before my eyes, and that I don\'t want to forget.'})
meta = head(HOME_TITLE, HOME_DESC, SITE + '/', SITE + '/og.jpg', 1200, 630, home_ld)
items = '\n'.join(f'<li><a href="/{w["n"]}/">{e(w["titolo"])}</a>, {e(w["autore"])}{", " + e(w["anno"]) if w.get("anno") else ""}</li>'
                  for w in reversed(by_n))
seo = f'''<section id="seo">
<h1>Mnemotheca</h1>
<p>The beautiful things that pass before my eyes, and that I don't want to forget. An atlas of architecture, art, cinema, photography, design, texts and science, after Aby Warburg's Mnemosyne atlas. Also on <a href="https://www.instagram.com/mnemotheca/">Instagram @mnemotheca</a>.</p>
<ol>
{items}
</ol>
</section>'''
open('index.html', 'w').write(fill(tpl, meta, seo))

# ---- sitemap ----
today = datetime.date.today().isoformat()
urls = [f'  <url><loc>{SITE}/</loc><lastmod>{today}</lastmod></url>'] + \
       [f'  <url><loc>{SITE}/{w["n"]}/</loc></url>' for w in by_n]
open('sitemap.xml', 'w').write('<?xml version="1.0" encoding="UTF-8"?>\n'
                               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + '\n'.join(urls) + '\n</urlset>\n')
print(f'{len(by_n)} work pages, home and sitemap written')
