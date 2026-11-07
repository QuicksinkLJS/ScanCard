# Test material for t40_hologram: a made-up card picture (synth.jpg, normal layout) and a fake camera video
# (scene.y4m, 720x1280): one card lying on a brown table, taken from a test photo (photos/0bdf9c29-image.jpg).
# Needs Pillow and ffmpeg. Output: /home/claude/work/hg/
import os, random, subprocess
from PIL import Image, ImageDraw, ImageFilter
OUT = '/home/claude/work/hg'
os.makedirs(OUT, exist_ok=True)

W, H = 590, 860
im = Image.new('RGB', (W, H), (196, 120, 60)); d = ImageDraw.Draw(im)
d.rectangle([20, 20, W - 20, H - 20], outline=(90, 50, 20), width=6)
d.rectangle([38, 36, W - 38, 92], fill=(225, 200, 160), outline=(80, 50, 20), width=3)
d.text((52, 52), 'SYNTHETIC DRAGON', fill=(20, 20, 20))
x1, y1, x2, y2 = int(.116 * W), int(.179 * H), int(.884 * W), int(.708 * H)
art = Image.new('RGB', (x2 - x1, y2 - y1), (10, 10, 30)); a = ImageDraw.Draw(art)
for i in range(300):
    r = random.Random(i); cx, cy = r.randint(0, art.width), r.randint(0, art.height)
    a.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=(255, 255, 255))
w, h = art.size
for k in range(40):
    t = k / 40
    a.ellipse([w * .2 + t * 60, h * .25 + t * 40, w * .8 - t * 60, h * .85 - t * 30], outline=(int(60 + 190 * t), int(120 + 100 * t), 255), width=3)
a.polygon([(w * .5, h * .1), (w * .85, h * .6), (w * .5, h * .9), (w * .15, h * .6)], outline=(255, 230, 120), width=5)
a.ellipse([w * .42, h * .38, w * .58, h * .54], fill=(255, 90, 40))
im.paste(art.filter(ImageFilter.GaussianBlur(1)), (x1, y1))
d.rectangle([40, int(.73 * H), W - 40, H - 40], fill=(235, 220, 190))
im.save(f'{OUT}/synth.jpg', quality=92)

ph = Image.open('/home/claude/photos/0bdf9c29-image.jpg').convert('RGB').resize((960, 1280)).crop((120, 0, 840, 1280))
card = ph.crop((22, 160, 700, 1150)).resize((260, 380)).convert('RGBA').rotate(7, expand=True, resample=Image.BICUBIC)
bg = Image.effect_noise((720, 1280), 40).convert('RGB')
bg = Image.blend(Image.new('RGB', (720, 1280), (92, 64, 42)), bg, 0.18).filter(ImageFilter.GaussianBlur(2))
bg.paste(card, (220, 720), card)
bg.save(f'{OUT}/scene.png')
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-loop', '1', '-i', f'{OUT}/scene.png', '-t', '3', '-r', '10', '-pix_fmt', 'yuv420p', f'{OUT}/scene.y4m'], check=True)
print(OUT)
