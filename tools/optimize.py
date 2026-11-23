"""Make web images: site/img/t/<id>.webp (thumb, 640px long side) and site/img/l/<id>.webp (2000px).
Also writes site/data/sizes.json {id: [w, h]} so the layout knows aspect ratios before load.
Usage: python3 tools/optimize.py raw_dir
"""
import sys, os, json
from PIL import Image, ImageOps

src = sys.argv[1]
out = 'site/img'
os.makedirs(f'{out}/t', exist_ok=True); os.makedirs(f'{out}/l', exist_ok=True)
sp = 'site/data/sizes.json'
sizes = json.load(open(sp)) if os.path.exists(sp) else {}
for f in sorted(os.listdir(src)):
    stem, ext = os.path.splitext(f)
    if ext.lower() not in ('.jpg', '.jpeg', '.png', '.webp', '.heic'): continue
    if stem in sizes and os.path.exists(f'{out}/l/{stem}.webp'): continue
    im = ImageOps.exif_transpose(Image.open(os.path.join(src, f))).convert('RGB')
    sizes[stem] = list(im.size)
    for d, edge, q in (('t', 640, 78), ('l', 2000, 84)):
        c = im.copy(); c.thumbnail((edge, edge), Image.LANCZOS)
        c.save(f'{out}/{d}/{stem}.webp', 'WEBP', quality=q, method=6)
json.dump(sizes, open(sp, 'w'))
print(len(sizes), 'images')
