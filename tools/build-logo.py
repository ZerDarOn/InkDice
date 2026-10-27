"""Original InkDice dice-and-nib vector mark and Windows icon family."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
assets, web = root / 'desktop/assets', root / 'prototype/assets'
assets.mkdir(parents=True, exist_ok=True)
web.mkdir(parents=True, exist_ok=True)
ink, gold, facet = '#171C24', '#E2BC72', '#826F4D'
outline = [(128,27),(216,78),(216,178),(128,229),(40,178),(40,78),(128,27)]
nib = [(128,64),(162,119),(150,164),(128,189),(106,164),(94,119)]
facets = [[(40,78),(83,111),(40,178)],[(216,78),(173,111),(216,178)],[(40,178),(96,181),(128,229),(160,181),(216,178)]]
points = lambda pts: ' '.join(f'{x},{y}' for x,y in pts)
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" role="img" aria-label="墨骰工坊：骰面与笔尖">
<rect x="4" y="4" width="248" height="248" rx="48" fill="{ink}"/>
<g fill="none" stroke="{facet}" stroke-width="5" stroke-linejoin="round">{''.join(f'<polyline points="{points(line)}"/>' for line in facets)}</g>
<polygon points="{points(outline[:-1])}" fill="none" stroke="{gold}" stroke-width="9" stroke-linejoin="round"/>
<polygon points="{points(nib)}" fill="{gold}"/>
<path d="M128 65V121" stroke="{ink}" stroke-width="6"/>
<circle cx="128" cy="128" r="10" fill="{ink}"/>
</svg>'''
(web / 'inkdice-logo.svg').write_text(svg,encoding='utf-8')
scale = 4
image = Image.new('RGBA',(1024,1024))
draw = ImageDraw.Draw(image)
xy = lambda pts: [(x*scale,y*scale) for x,y in pts]
draw.rounded_rectangle((16,16,1008,1008),radius=192,fill=ink)
for line in facets: draw.line(xy(line),fill=facet,width=20,joint='curve')
draw.line(xy(outline),fill=gold,width=36,joint='curve')
draw.ellipse((494,90,530,126),fill=gold)
draw.polygon(xy(nib),fill=gold)
draw.line(xy([(128,65),(128,121)]),fill=ink,width=24)
draw.ellipse((472,472,552,552),fill=ink)
image.save(assets / 'inkdice-logo.png')
image.resize((256,256),Image.Resampling.LANCZOS).save(assets / 'icon.ico',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
print('Built SVG, 1024px PNG and seven-size ICO.')
