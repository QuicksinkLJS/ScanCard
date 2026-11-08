# Rarity teacher (8 Nov): "About this rarity" with standing + foil demo + mix-up compare; "How to tell them apart"
# when the version is open, "Mine is this one" picks it; rarity guide (More); German.
import sys, json; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
ok = True
def check(cond, msg):
    global ok
    print(('ok   ' if cond else 'FAIL ') + msg)
    ok = ok and cond
with sync_playwright() as p:
    b, page = open_app(p)
    # 1. a version with a known rarity (search page): about this rarity
    open_card(page, 'Dark Magician Girl')
    page.fill('#ver-filter', 'RA05'); page.wait_for_timeout(300)
    page.click("#card-body .versions button:has-text('Starlight')"); page.wait_for_selector('#rar-box')
    summ = page.inner_text('#rar-box summary')
    print('   about:', summ.replace('\n', ' | '))
    check('Starlight Rare' in summ and 'for this card' in summ and '× the price of the Ultra Rare' in summ, 'about this rarity + standing')
    page.click('#rar-box summary'); page.wait_for_timeout(500)
    check(page.locator('#rar-box .rar-demo .holo-card').count() == 1, 'foil demo')
    check('Quick check' in page.inner_text('#rar-box'), 'facts shown')
    page.click('#rar-box .rar-cmp >> nth=0'); page.wait_for_timeout(500)
    check(page.locator('#rar-cmp-box .rar-table').count() == 1 and page.locator('#rar-cmp-box .holo-card').count() == 2, 'compare with a mix-up: table + 2 demos')
    page.locator('#rar-box').screenshot(path='/home/claude/shots/t46_about.png')
    page.go_back(); page.wait_for_timeout(400)
    # 2. own card, set code read with two rarities -> how to tell apart -> mine is this one
    page.evaluate("""localStorage.setItem('cardscan-collection-v1', JSON.stringify([{id: 'c1', name: 'Dark Magician Girl', vkey: null, added: Date.now(), confident: true,
      code: {code: 'RA05-EN084', base: 'RA05-084', lang: 'EN', language: {code: 'EN', name: 'English', supported: true}}}]))""")
    page.reload(); page.wait_for_timeout(1000)
    page.click('nav.tabs button[data-view=collection]'); page.wait_for_timeout(800)
    page.click('#coll-list button >> nth=0'); page.wait_for_selector('#rar-box')
    tell = page.inner_text('#rar-box')
    print('   tell:', tell.replace('\n', ' | ')[:300])
    check('How to tell' in tell and page.locator('#rar-box[open]').count() == 1, '"How to tell them apart" open')
    check(page.locator('#rar-box .rar-demo .holo-card').count() == 2, 'two foil demos side by side')
    page.locator('#rar-box').screenshot(path='/home/claude/shots/t46_tell.png')
    page.click("#rar-box .rar-mine[data-name='Starlight Rare']"); page.wait_for_timeout(1200)
    e = page.evaluate("JSON.parse(localStorage.getItem('cardscan-collection-v1'))[0]")
    print('   entry:', {k: e.get(k) for k in ('vkey', 'vby')})
    check(e.get('vkey') and e.get('vby') == 'user' and page.locator('#vsure.lv-picked').count() == 1, '"Mine is this one" picks the only Starlight version')
    check('About this rarity' in page.inner_text('#rar-box summary'), 'then: about this rarity')
    page.go_back(); page.wait_for_timeout(400)
    # 3. rarity guide
    page.click('nav.tabs button[data-view=more]'); page.wait_for_timeout(500)
    page.click('#rg-open'); page.wait_for_selector('#rarity-page:not([hidden])')
    n = page.locator('.rg-item').count()
    check(n >= 25, f'guide lists {n} rarities')
    page.click(".rg-item[data-k='qcsr'] summary"); page.wait_for_timeout(500)
    check(page.locator(".rg-item[data-k='qcsr'] .holo-card").count() == 1 and 'watermark' in page.inner_text(".rg-item[data-k='qcsr']"), 'QCSR: facts + demo')
    page.screenshot(path='/home/claude/shots/t46_guide.png')
    page.go_back(); page.wait_for_timeout(400)
    check(page.locator('#rarity-page[hidden]').count() == 1, 'back closes the guide')
    # 4. German
    page.evaluate("localStorage.setItem('cardscan-lang','de')"); page.reload(); page.wait_for_timeout(1200)
    page.click('nav.tabs button[data-view=more]'); page.wait_for_timeout(500)
    page.click('#rg-open'); page.wait_for_selector('#rarity-page:not([hidden])')
    page.click(".rg-item[data-k='secret'] summary"); page.wait_for_timeout(300)
    de = page.inner_text('#rarity-page')
    print('   DE:', page.inner_text(".rg-item[data-k='secret']").replace('\n', ' | ')[:300])
    check('Seltenheiten-Guide' in de and 'diagonalen Linien' in de and 'Schnell-Check' in de, 'German guide')
    page.evaluate("localStorage.setItem('cardscan-lang','en')")
    b.close()
print('ALL OK' if ok else 'SOME FAILED')
