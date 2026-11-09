"""Assemble actual browser capture frames into the README scrolling GIF."""
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
paths=sorted((ROOT/'.cache/readme-demo').glob('frame-*.png'))
if not paths:raise SystemExit('Run npm run docs:gif first.')
frames=[]
size=(1296,810)
for path in paths:
 with Image.open(path) as image:
  frames.append(image.convert('RGB').resize(size,Image.Resampling.LANCZOS))
# A shared palette prevents colors flashing between successive frames.
sample=Image.new('RGB',(size[0],size[1]*4))
for row,index in enumerate([0,len(frames)//3,2*len(frames)//3,len(frames)-1]):sample.paste(frames[index],(0,row*size[1]))
palette=sample.quantize(colors=256)
frames=[f.quantize(palette=palette,dither=Image.Dither.NONE) for f in frames]
durations=[100]*len(frames);durations[0]=1600;durations[-1]=1200
output=ROOT/'docs/assets/explorer.gif';output.parent.mkdir(parents=True,exist_ok=True)
frames[0].save(output,save_all=True,append_images=frames[1:],duration=durations,loop=0,optimize=True,disposal=1)
print(f'GIF: {len(frames)} frames, {output.stat().st_size/1024/1024:.2f} MiB — {output}')
