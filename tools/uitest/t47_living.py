# Living artwork (8 Nov): button on the card page for your own photo, depth model loads + runs on the "phone",
# the picture moves with the tilt only inside the artwork window, "Hold: without depth", back closes, German.
# Optional: a card picture as argument (default: Dark Magician full card from the PC).
import sys, base64, os; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
CARD = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/work/depth/full/46986414.jpg'
ok = True
def check(cond, msg):
    global ok
    print(('ok   ' if cond else 'FAIL ') + msg)
    ok = ok and cond
SNAP = """() => { const c = document.getElementById('live-canvas'); const x = document.createElement('canvas'); x.width = 60; x.height = 88;
  x.getContext('2d').drawImage(c, 0, 0, 60, 88); return Array.from(x.getContext('2d').getImageData(0, 0, 60, 88).data); }"""
def diff(a, b, rows):   # mean abs difference in a band of rows (y from, y to) of the 60x88 snapshot
    s = n = 0
    for y in range(*rows):
        for x in range(60):
            i = (y * 60 + x) * 4
            s += sum(abs(a[i + k] - b[i + k]) for k in range(3)); n += 3
    return s / n
with sync_playwright() as p:
    b, page = open_app(p)
    # 1. the button: a scanned card (own photo)
    page.set_input_files('#gallery', '/home/claude/photos/0bdf9c29-image.jpg')
    page.wait_for_selector('#found li', timeout=180000); page.wait_for_timeout(2500)
    page.click('#found li > button >> nth=0'); page.wait_for_selector('#card-body')
    page.wait_for_timeout(800)
    check(page.locator('#live-open').count() == 1, 'button "Living artwork" for a scanned card')
    page.go_back(); page.wait_for_timeout(400)
    # 2. open with a full card picture (data URL = your photo)
    data = 'data:image/jpeg;base64,' + base64.b64encode(open(CARD, 'rb').read()).decode()
    page.evaluate("(src) => import('./js/living.js').then(m => m.openLiving({ src, name: 'Test card' }))", data)
    page.wait_for_function("document.getElementById('live').dataset.state === 'ready' || document.getElementById('live').dataset.state === 'error'", timeout=180000)
    state = page.evaluate("document.getElementById('live').dataset.state")
    info = page.evaluate("document.getElementById('live')._info")
    print('   state', state, info)
    check(state == 'ready', 'depth computed, drawing')
    page.wait_for_timeout(3200)    # intro over
    stage = page.locator('#live-stage').bounding_box()
    def tilt(fx, fy):
        page.mouse.move(stage['x'] + stage['width'] * fx, stage['y'] + stage['height'] * fy)
        page.wait_for_timeout(700)
        return page.evaluate(SNAP)
    left = tilt(0.05, 0.5); page.screenshot(path='/home/claude/shots/t47_left.png')
    right = tilt(0.95, 0.5); page.screenshot(path='/home/claude/shots/t47_right.png')
    art = diff(left, right, (22, 58)); frame = diff(left, right, (2, 10)) + diff(left, right, (66, 86))
    print(f'   change in the artwork {art:.1f}, in name bar + text box {frame:.1f}')
    check(art > 3 and frame < art / 4, 'the artwork moves with the tilt, the frame stays')
    # hold: without depth
    page.mouse.move(stage['x'] + stage['width'] * 0.95, stage['y'] + stage['height'] * 0.5)
    flat_btn = page.locator('#live-flat').bounding_box()
    page.mouse.move(flat_btn['x'] + 10, flat_btn['y'] + 10); page.mouse.down(); page.wait_for_timeout(900)
    flat = page.evaluate(SNAP)
    page.mouse.up(); page.wait_for_timeout(900)
    check(diff(flat, right, (22, 58)) > 2, '"Hold: without depth" flattens it')
    page.go_back(); page.wait_for_timeout(500)
    check(page.locator('#live[hidden]').count() == 1, 'back closes it')
    # 3. second time: no download, cached depth -> fast
    page.evaluate("(src) => import('./js/living.js').then(m => m.openLiving({ src, name: 'Test card' }))", data)
    page.wait_for_function("document.getElementById('live').dataset.state === 'ready'", timeout=20000)
    check(True, 'second open: ready from the cache')
    page.go_back(); page.wait_for_timeout(400)
    # 4. German
    page.evaluate("localStorage.setItem('cardscan-lang','de')"); page.reload(); page.wait_for_timeout(1500)
    page.evaluate("(src) => import('./js/living.js').then(m => m.openLiving({ src, name: 'Test' }))", data)
    page.wait_for_function("document.getElementById('live').dataset.state === 'ready'", timeout=180000)
    de = page.inner_text('#live')
    check('Halten: ohne Tiefe' in de and 'Kipp dein Handy' in de, 'German')
    page.evaluate("localStorage.setItem('cardscan-lang','en')")
    b.close()
print('ALL OK' if ok else 'SOME FAILED')
