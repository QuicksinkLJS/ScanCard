# Card passport: record a passport of a collection card with a fake camera (synthetic card, mk_pass_video.mjs),
# then check it against the same copy (other photo) and against a twin cut differently. Same browser profile
# across three launches (one fake video each). Also: export file, German.
import sys, re, json, shutil; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
VID = '/home/claude/work/pass/%s.y4m'
PROFILE = '/home/claude/work/pass/profile'
SYNTH = '/home/claude/work/hg/synth.jpg'
# the fake camera must deliver the file's size (otherwise Chrome stretches it)
INIT = """(() => { const md = navigator.mediaDevices; if (!md) return; const orig = md.getUserMedia.bind(md);
  md.getUserMedia = (c) => orig({ ...c, video: c && c.video ? { width: { exact: 1080 }, height: { exact: 1920 } } : c.video }); })();"""

def launch(p, video):
    ctx = p.chromium.launch_persistent_context(PROFILE, executable_path='/usr/bin/google-chrome', headless=True,
        args=['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-video-capture={VID % video}'],
        viewport={'width': 412, 'height': 900}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
    ctx.add_init_script(INIT + "\ntry { localStorage.setItem('cardscan-lab', '1'); } catch (e) {}")
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.on('console', lambda m: m.type in ('error',) and print('console', m.type, m.text[:300]))
    page.on('pageerror', lambda e: print('PAGEERROR', e))
    page.route(re.compile(r'https://cdn\.jsdelivr\.net/.*'), route_cdn)
    page.route(re.compile(r'https://(www\.)?cardtrader\.com/.*'), lambda r: r.fulfill(path=SYNTH, content_type='image/jpeg'))
    page.goto(URL); page.wait_for_timeout(900)
    return ctx, page

def open_coll_card(page):
    page.click('nav.tabs button[data-view=collection]'); page.wait_for_timeout(700)
    page.click('#coll-list button >> nth=0'); page.wait_for_selector('#pass-box')
    page.wait_for_timeout(400)

def capture(page):
    # no button: the picture is taken by itself once the card is found and still
    page.wait_for_selector('#pass-view .pass-card, #pass-view .pass-verdict, #pass-status b', timeout=40000)
    st = page.inner_text('#pass-status')
    assert 'not found' not in st, st

shutil.rmtree(PROFILE, ignore_errors=True)
with sync_playwright() as p:
    # 1. record the passport (a1), check with the same video
    ctx, page = launch(p, 'a1')
    open_card(page, 'Blue-Eyes White Dragon')
    page.click("#card-body .versions button:has-text('RA05-EN')"); page.wait_for_timeout(300)
    page.click('#card-add'); page.wait_for_timeout(500); page.go_back(); page.wait_for_timeout(300)
    open_coll_card(page)
    print('box:', page.inner_text('#pass-box').replace('\n', ' | '))
    page.click('#pass-new')
    page.fill('#pass-label', 'copy A')
    capture(page)
    info = page.inner_text('#pass-view .pass-info')
    print('passport:', info.replace('\n', ' | '))
    assert re.search(r'CP-[0-9A-F]{4}-[0-9A-F]{4}', info) and 'L/R' in info
    page.screenshot(path='/home/claude/shots/t43_pass.png')
    page.click('#pass-check'); capture(page)
    v1 = page.inner_text('#pass-view .pass-verdict'); nums = page.inner_text('#pass-view .pass-nums')
    print('check a1 vs a1:', v1.replace('\n', ' '), '|', nums.replace('\n', ' '))
    assert 'Same card' in v1, v1
    page.click('[data-truth=same]'); page.wait_for_timeout(200)
    page.go_back(); page.wait_for_timeout(400)
    assert page.locator('#pass-page').is_hidden() and page.locator('#card-page').is_visible()
    rows = page.locator('#pass-list li').count()
    story = page.evaluate("JSON.parse(localStorage.getItem('cardscan-collection-v1'))[0].life.map(x => x.k)")
    print('passports listed:', rows, '| life:', story)
    assert rows == 1 and 'pass' in story
    ctx.close()

    # 2. same copy, other photo (a2)
    ctx, page = launch(p, 'a2')
    open_coll_card(page)
    page.click('#pass-list button >> nth=0'); page.wait_for_selector('#pass-check')
    page.click('#pass-check'); capture(page)
    v2 = page.inner_text('#pass-view .pass-verdict'); nums = page.inner_text('#pass-view .pass-nums')
    print('check a2 vs pass:', v2.replace('\n', ' '), '|', nums.replace('\n', ' '))
    page.screenshot(path='/home/claude/shots/t43_same.png')
    assert 'Same card' in v2, v2
    ctx.close()

    # 3. the twin, cut differently
    ctx, page = launch(p, 'twin')
    open_coll_card(page)
    page.click('#pass-list button >> nth=0'); page.wait_for_selector('#pass-check')
    page.click('#pass-check'); capture(page)
    v3 = page.inner_text('#pass-view .pass-verdict'); nums = page.inner_text('#pass-view .pass-nums')
    print('check twin vs pass:', v3.replace('\n', ' '), '|', nums.replace('\n', ' '))
    page.screenshot(path='/home/claude/shots/t43_twin.png')
    assert 'Another copy' in v3, v3
    page.click('[data-truth=other]'); page.wait_for_timeout(200)
    page.go_back(); page.wait_for_timeout(300); page.go_back(); page.wait_for_timeout(300)
    # export
    page.click('nav.tabs button[data-view=more]'); page.wait_for_timeout(300)
    with page.expect_download() as dl:
        page.click('#bk-pass')
    path = '/home/claude/work/pass/export.json'
    dl.value.save_as(path)
    data = json.load(open(path))
    print('export:', len(data['records']), 'records', [(r['kind'], r.get('truth'), r.get('result', {}).get('verdict')) for r in data['records']])
    assert len(data['records']) == 4 and data['records'][0]['img'].startswith('data:image/jpeg')
    # German
    page.evaluate("localStorage.setItem('cardscan-lang','de')"); page.reload(); page.wait_for_timeout(1000)
    open_coll_card(page)
    de = page.inner_text('#pass-box')
    print('DE box:', de.replace('\n', ' | '))
    assert 'Kartenpass' in de
    page.click('#pass-list button >> nth=0'); page.wait_for_selector('#pass-check')
    de = page.inner_text('#pass-view')
    print('DE pass:', de.replace('\n', ' | ')[:300])
    assert 'Zentrierung' in de and 'Karte mit diesem Pass prüfen' in de
    page.evaluate("localStorage.setItem('cardscan-lang','en')")
    ctx.close()
print('t43 ok')
