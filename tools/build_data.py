"""Join the Instagram export (order, carousel media) with Notion rows (metadata).
Usage: python3 tools/build_data.py <posts_1.json> notion.tsv > site/data/opere.json
"""
import json, sys, csv, re, unicodedata, datetime

posts = json.load(open(sys.argv[1]))
rows = list(csv.DictReader(open(sys.argv[2]), delimiter='\t'))
extra = json.load(open('src/extra.json')) if len(sys.argv) < 4 else json.load(open(sys.argv[3]))
desc = json.load(open('src/descriptions.json')) if __import__('os').path.exists('src/descriptions.json') else {}

def n(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]', '', s)

def fix(t):
    try: return t.encode('latin1').decode('utf8')
    except Exception: return t

MANUAL = {  # untitled posts / renamed works, by date or title fragment
    '2017-01-16': 'Uomo con pilastro',
    '2017-01-19': 'I AM A MONUMENT',
    'thecolorofpomegranates': 'Sayat Nova',
}

used, works = set(), []
for p in sorted(posts, key=lambda p: p['media'][0]['creation_timestamp']):
    ts = p['media'][0]['creation_timestamp']
    date = datetime.datetime.utcfromtimestamp(ts).date().isoformat()
    t = fix(p.get('title') or p['media'][0].get('title') or '')
    nt = n(t)
    key = MANUAL.get(date) if not t.strip() else next((v for k, v in MANUAL.items() if k in nt), None)
    idx = None
    for i, r in enumerate(rows):
        if i in used: continue
        if key and n(r['opera']).startswith(n(key)): idx = i; break
        if not key and n(r['opera'])[:14] and n(r['opera'])[:14] in nt: idx = i; break
    r = rows[idx]; used.add(idx)
    works.append({
        'id': r['id'], 'titolo': r['opera'], 'autore': r['autore'], 'anno': r['anno'],
        'disciplina': r['disciplina'], 'data': date,
        'img': [m['uri'].split('/')[-1].rsplit('.', 1)[0] for m in p['media']],
    })

SKIP = {'41b020c80f5281a58af3e0f748edbb75'}  # uomo con pilastro: author unknown, dropped by Arko
works = [w for w in works if w['id'] not in SKIP]

for e in extra:  # posts newer than the export (e.g. Parthenope)
    works.append(e)

SMALL = set('of the and a an in on at to for by with from de del della dei degli di da e la le il lo les des du et der die das und von zu im am'.split())
KEEP = {'NASA','ISS','OMA','US','TV','II','III','IV','VII','I','N.','SESC','DOGMA'}
def tcase(s):
    if not s or any(c.islower() for c in s): return s
    out = []
    for k, word in enumerate(s.split(' ')):
        core = word.strip('“”"(),:')
        if core in KEEP: out.append(word); continue
        low = word.lower()
        if k and low.strip('“”"(),:') in SMALL: out.append(low); continue
        # capitalise the first letter, also after a hyphen or opening quote
        res, up, run = '', True, 0
        for ch in low:
            res += ch.upper() if up and ch.isalpha() else ch
            if ch.isalpha() or ch.isdigit(): up = False; run += 1
            if ch in '-“"(/': up = True; run = 0
            if ch in "'’" and run == 1: up = True   # D'Italia, L'Architecture
        out.append(res)
    return ' '.join(out)

for i, w in enumerate(works, 1):
    w['titolo'] = tcase(w['titolo']); w['autore'] = tcase(w['autore'])
    w['n'] = i
    raw = desc.get(w['id'], '')
    # keep only the body: drop the header ('AUTHOR / TITLE / YEAR' or the older
    # 'TITLE — Author, year.') and the hashtag line
    paras = [p.strip() for p in raw.split('\n\n') if p.strip()]
    if paras:
        first = paras[0].split('\n')[0]
        if ' — ' in first or first.count(' / ') >= 2: paras = paras[1:]
    w['testo'] = '\n'.join(p for p in paras if not p.startswith('#'))
json.dump(works, sys.stdout, ensure_ascii=False, indent=0)
