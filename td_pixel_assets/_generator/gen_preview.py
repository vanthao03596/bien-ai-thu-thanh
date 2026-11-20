import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, 'out', 'td_pixel_assets')
man = json.load(open(os.path.join(HERE, 'out', 'manifest.json')))
tiles = {}
for k in ('terrain_path', 'terrain_water'):
    j = json.load(open(f'{ROOT}/tiles/{k}.json'))
    tiles[k] = {'png': f'tiles/{k}.png', 'tiles': {n: {'x': v['x'], 'y': v['y']} for n, v in j['tiles'].items()}}
data = json.dumps({'manifest': man, 'tiles': tiles}, separators=(',', ':'))
html = open(os.path.join(HERE, 'preview_template.html')).read().replace('__DATA__', data)
open(f'{ROOT}/preview.html', 'w').write(html)
print(len(html))
