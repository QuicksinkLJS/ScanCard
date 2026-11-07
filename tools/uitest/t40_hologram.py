# Hologram (stage 1): with a fake camera showing a card on a table the card finder places the hologram
# above the card; "Without camera" shows the virtual table; back closes only the hologram.
# Needs /home/claude/work/hg/scene.y4m (card on a table, 720x1280) and synth.jpg (a made-up card picture).
import sys, re; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
VIDEO = '/home/claude/work/hg/scene.y4m'
SYNTH = '/home/claude/work/hg/synth.jpg'

def card_page(p, args=()):
    b, page = open_app(p, args=args)
    page.route(re.compile(r'https://(www\.)?cardtrader\.com/.*'), lambda r: r.fulfill(path=SYNTH, content_type='image/jpeg'))
    open_card(page, 'Blue-Eyes White Dragon')
    # a normal-layout version (the synthetic picture has the normal artwork window)
    page.locator('#card-body .versions button').filter(has_not_text='Original Artwork').first.click()
    page.wait_for_selector('#hg-open')
    return b, page

with sync_playwright() as p:
    # 1. camera: the card finder finds the card on the table
    b, page = card_page(p, ('--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-video-capture={VIDEO}'))
    page.click('#hg-open')
    page.wait_for_selector('#hg:not([hidden])')
    page.wait_for_selector('#hg.cam', timeout=10000)
    page.wait_for_selector('#hg.up', timeout=40000)
    page.wait_for_timeout(1700)
    lock = page.eval_on_selector('#hg-lock', 'e => e.getBoundingClientRect().toJSON()')
    art = page.eval_on_selector('#hg-art', 'e => e.getBoundingClientRect().toJSON()')
    print('lock', {k: round(lock[k]) for k in ('x', 'y', 'width', 'height')}, 'art', {k: round(art[k]) for k in ('x', 'y', 'width', 'height')})
    print('status:', page.inner_text('#hg-status'), '| name:', page.inner_text('#hg-name'), '|', page.inner_text('#hg-sub'))
    # the card in the fake video sits in the lower half, roughly in the middle (scene.png: x 220-500 of 720, y 720-1120 of 1280)
    assert 120 < lock['x'] + lock['width'] / 2 < 300, lock
    assert 450 < lock['y'] + lock['height'] / 2 < 800, lock
    assert art['y'] + art['height'] < lock['y'] + 10, 'artwork floats above the card'
    assert art['width'] > 140
    page.screenshot(path='/home/claude/shots/t40_cam.png')
    # turning the phone moves the scene (gyro)
    page.evaluate("""() => { const ev = (b, g) => { const e = new Event('deviceorientation'); e.beta = b; e.gamma = g; window.dispatchEvent(e); };
      ev(30, 0); for (let i = 0; i < 20; i++) ev(36, 4); }""")
    page.wait_for_timeout(200)
    wy = page.eval_on_selector('#hg', "e => e.style.getPropertyValue('--wy')")
    wx = page.eval_on_selector('#hg', "e => e.style.getPropertyValue('--wx')")
    print('after turn: wx', wx, 'wy', wy)
    assert float(wy[:-2]) > 0 and float(wx[:-2]) > 0, (wx, wy)
    # tap elsewhere = place there
    page.mouse.click(206, 640)
    page.wait_for_timeout(100)
    lock2 = page.eval_on_selector('#hg-lock', 'e => e.getBoundingClientRect().toJSON()')
    assert abs(lock2['x'] + lock2['width'] / 2 - 206) < 30, lock2
    # back closes only the hologram, camera off
    page.go_back(); page.wait_for_timeout(300)
    assert page.locator('#hg').is_hidden() and page.locator('#card-page').is_visible()
    assert page.evaluate("() => !document.getElementById('hg-video').srcObject")
    b.close()

    # 2. no camera allowed: virtual table
    b, page = card_page(p, ('--use-fake-ui-for-media-stream', '--deny-permission-prompts'))
    page.context.grant_permissions([])
    page.evaluate("() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error('denied')); }")
    page.click('#hg-open')
    page.wait_for_selector('#hg.room.up', timeout=8000)
    page.wait_for_timeout(1700)
    print('room status:', page.inner_text('#hg-status'))
    assert 'virtual' in page.inner_text('#hg-status')
    page.screenshot(path='/home/claude/shots/t40_room.png')
    # drag = look from the side
    page.mouse.move(380, 400); page.mouse.down(); page.mouse.move(400, 420); page.wait_for_timeout(120)
    hy = page.eval_on_selector('#hg', "e => e.style.getPropertyValue('--hy')")
    page.mouse.up()
    print('drag hy', hy)
    assert float(hy[:-3]) > 10
    page.click('#hg-close'); page.wait_for_timeout(300)
    assert page.locator('#hg').is_hidden() and page.locator('#card-page').is_visible()
    b.close()

    # 3. German
    b, page = open_app(p)
    page.evaluate("() => { localStorage.setItem('cardscan-lang', 'de'); }")
    page.reload(); page.wait_for_timeout(800)
    page.route(re.compile(r'https://(www\.)?cardtrader\.com/.*'), lambda r: r.fulfill(path=SYNTH, content_type='image/jpeg'))
    page.evaluate("() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error('denied')); }")
    page.click('nav.tabs button[data-view=more]')
    page.fill('#name-search', 'Blue-Eyes White Dragon')
    page.wait_for_selector('#name-results button')
    page.click('#name-results button[data-name="Blue-Eyes White Dragon"]')
    page.wait_for_selector('#card-body .versions')
    page.locator('#card-body .versions button').first.click()
    page.wait_for_selector('#hg-open')
    assert 'Hologramm' in page.inner_text('#hg-open'), page.inner_text('#hg-open')
    page.click('#hg-open')
    page.wait_for_selector('#hg.room.up', timeout=8000)
    page.wait_for_timeout(500)
    print('DE:', page.inner_text('#hg-status'), '|', page.inner_text('.hg-btns'))
    assert 'virtuellen Tisch' in page.inner_text('#hg-status') and 'Schließen' in page.inner_text('.hg-btns')
    b.close()
print('t40 ok')
