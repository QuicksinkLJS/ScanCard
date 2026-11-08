# Summon (8 Nov): button on the card page for your own photo; the monster is cut out of the artwork, rises out of
# the card and stands above it; dragging walks around it; back closes; German.
# Optional: a card picture as argument (default: Dark Magician full card).
import sys, base64, os; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
CARD = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/work/depth/full/46986414.jpg'
ok = True
def check(cond, msg):
    global ok
    print(('ok   ' if cond else 'FAIL ') + msg)
    ok = ok and cond
SNAP = """() => { const c = document.getElementById('sm-canvas'); const x = document.createElement('canvas'); x.width = 60; x.height = 100;
  x.getContext('2d').drawImage(c, 0, 0, 60, 100); return Array.from(x.getContext('2d').getImageData(0, 0, 60, 100).data); }"""
def diff(a, b, rows):
    s = n = 0
    for y in range(*rows):
        for x in range(60):
            i = (y * 60 + x) * 4
            s += sum(abs(a[i + k] - b[i + k]) for k in range(3)); n += 3
    return s / n
def bright(a, rows):
    s = n = 0
    for y in range(*rows):
        for x in range(60):
            i = (y * 60 + x) * 4; s += a[i] + a[i + 1] + a[i + 2]; n += 3
    return s / n
with sync_playwright() as p:
    b, page = open_app(p)
    page.set_input_files('#gallery', '/home/claude/photos/0bdf9c29-image.jpg')
    page.wait_for_selector('#found li', timeout=180000); page.wait_for_timeout(2500)
    page.click('#found li > button >> nth=0'); page.wait_for_selector('#card-body')
    page.wait_for_timeout(800)
    check(page.locator('#sm-open').count() == 1, 'button "Summon" for a scanned card')
    page.go_back(); page.wait_for_timeout(400)
    data = 'data:image/jpeg;base64,' + base64.b64encode(open(CARD, 'rb').read()).decode()
    page.evaluate("(src) => import('./js/summon.js').then(m => m.openSummon({ src, name: 'Test card' }))", data)
    page.wait_for_function("['ready','error','nofigure'].includes(document.getElementById('summon').dataset.state)", timeout=180000)
    state = page.evaluate("document.getElementById('summon').dataset.state")
    print('   state', state, page.evaluate("document.getElementById('summon')._info"))
    check(state == 'ready', 'monster cut out, drawing')
    page.wait_for_timeout(250); early = page.evaluate(SNAP); page.screenshot(path='/home/claude/shots/t48_early.png')
    page.wait_for_timeout(3000); late = page.evaluate(SNAP); page.screenshot(path='/home/claude/shots/t48_front.png')
    print(f'   upper half brightness: early {bright(early, (5, 45)):.1f}, after the summoning {bright(late, (5, 45)):.1f}')
    check(bright(late, (5, 45)) > bright(early, (5, 45)) + 3 or diff(early, late, (5, 45)) > 6, 'the monster stands above the card')
    st = page.locator('#sm-stage').bounding_box()
    page.mouse.move(st['x'] + st['width'] * 0.5, st['y'] + st['height'] * 0.5); page.mouse.down()
    page.mouse.move(st['x'] + st['width'] * 0.1, st['y'] + st['height'] * 0.5, steps=8); page.mouse.up()
    page.wait_for_timeout(1500); side = page.evaluate(SNAP); page.screenshot(path='/home/claude/shots/t48_side.png')
    print(f'   change after dragging {diff(late, side, (5, 95)):.1f}')
    check(diff(late, side, (5, 95)) > 4, 'dragging walks around it')
    errs = page.evaluate("(() => { const c = document.getElementById('sm-canvas').getContext('webgl'); return c ? c.getError() : -1; })()")
    check(errs == 0, f'no WebGL error ({errs})')
    page.go_back(); page.wait_for_timeout(500)
    check(page.locator('#summon[hidden]').count() == 1, 'back closes it')
    page.evaluate("localStorage.setItem('cardscan-lang','de')"); page.reload(); page.wait_for_timeout(1500)
    page.evaluate("(src) => import('./js/summon.js').then(m => m.openSummon({ src, name: 'Test' }))", data)
    page.wait_for_function("document.getElementById('summon').dataset.state === 'ready'", timeout=180000)
    de = page.inner_text('#summon')
    check('Nochmal beschwören' in de and 'umrunden' in de, 'German')
    page.evaluate("localStorage.setItem('cardscan-lang','en')")
    b.close()
print('ALL OK' if ok else 'SOME FAILED')
