# Version certainty (8 Nov): how sure Curio is about the version, 2–3 versions to tap, quick pick
# (language, rarity, 1st Edition), unproven old picks need a confirmation, nothing is saved with a guess.
import sys, json; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
photo = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/photos/0bdf9c29-image.jpg'
def cards(page):
    return page.evaluate("window.cardscan.scanner.cards().map(c => ({n: c.n, name: c.name, code: c.code?.code || null, lang: c.language?.code || null, vkey: c.vkey, vby: c.vby || null, sure: c.price?.sure, picks: (c.price?.picks || []).length, exact: !!c.price?.exact}))")
ok = True
def check(cond, msg):
    global ok
    print(('ok   ' if cond else 'FAIL ') + msg)
    ok = ok and cond
with sync_playwright() as p:
    b, page = open_app(p)
    # 1. scan list: every card has a level; a card with a version is only "sure" with a set code / pack
    page.set_input_files('#gallery', photo)
    page.wait_for_selector('#found li', timeout=180000)
    page.wait_for_function("window.cardscan.scanner.cards().every(c => c.codeStatus === 'done' || c.codeStatus === 'none')", timeout=180000)
    page.wait_for_timeout(1500)
    cs = cards(page)
    for c in cs: print('  ', c)
    check(all(c['sure'] in ('sure', 'picked', 'check', 'few', 'open', 'none') for c in cs), 'every scanned card has a version level')
    check(all((c['vkey'] is None) or c['code'] for c in cs), 'a version is only picked by itself with a set code read (no language-only guess)')
    check(all(c['sure'] != 'sure' or c['code'] for c in cs), '"sure" only with a set code')
    tags = page.locator('#found .vs-tag').count()
    check(tags >= 1, f'version tags in the list ({tags})')
    page.screenshot(path='/home/claude/shots/t44_list.png', full_page=True)
    # 2. tiles in the list (2–3 open versions) -> tap = your pick
    if page.locator('#found .vs-c').count():
        n = int(page.locator('#found .vs-c >> nth=0').get_attribute('data-n'))
        key = page.locator('#found .vs-c >> nth=0').get_attribute('data-key')
        page.click('#found .vs-c >> nth=0'); page.wait_for_timeout(800)
        c = [x for x in cards(page) if x['n'] == n][0]
        check(c['vkey'] == key and c['vby'] == 'user' and c['sure'] == 'picked', f'tile in the list picks the version ({c})')
    else:
        print('     (no card with 2–3 open versions in this photo)')
    # 3. card page of an open card: quick pick language + rarity
    open_cards = [c for c in cards(page) if c['sure'] in ('open', 'few')]
    if open_cards:
        page.click(f'#found li > button[data-n="{open_cards[0]["n"]}"]'); page.wait_for_selector('#vsure')
        print('   box:', page.inner_text('#vsure').replace('\n', ' | ')[:300])
        check(page.locator('#vsure .vs-pick').count() >= 1, 'version tiles on the card page')
        page.locator('#vsure').screenshot(path='/home/claude/shots/t44_box.png')
        if page.locator('#vsure .vs-lang').count():
            l = page.locator('#vsure .vs-lang >> nth=-1').get_attribute('data-v')
            page.click(f'#vsure .vs-lang[data-v="{l}"]'); page.wait_for_timeout(600)
            check(page.evaluate("window.cardscan.scanner.cards().find(c => c.n === %d).lang" % open_cards[0]['n']) == l, f'language chip sets your copy\'s language ({l})')
            print('   after lang:', page.inner_text('#vsure').replace('\n', ' | ')[:300])
        if page.locator('#vsure .vs-rar').count():
            page.click('#vsure .vs-rar >> nth=-1'); page.wait_for_timeout(600)
            print('   after rarity:', page.inner_text('#vsure').replace('\n', ' | ')[:300])
            check(page.locator('#vsure.lv-picked').count() == 1 or page.locator('#vsure .vs-pick').count() >= 1, 'rarity chip narrows (or picks the only version)')
        if page.locator('#vsure .vs-pick').count():
            page.click('#vsure .vs-pick >> nth=0'); page.wait_for_timeout(800)
            check(page.locator('#vsure.lv-picked').count() == 1, 'tap a tile -> "your pick"')
        page.go_back(); page.wait_for_timeout(500)
    # 4. add all: open versions are saved without a version, the toast says so
    page.click('#add-all'); page.wait_for_timeout(1200)
    toast = page.evaluate("document.querySelector('.toast')?.innerText || ''")
    coll = page.evaluate("JSON.parse(localStorage.getItem('cardscan-collection-v1') || localStorage.getItem('cardscan-collection') || '[]')")
    if not coll:
        coll = page.evaluate("Object.keys(localStorage).filter(k => k.includes('coll')).map(k => [k, localStorage.getItem(k).slice(0, 80)])")
        print('   storage keys', coll)
    print('   toast:', toast)
    opened = [c for c in cards(page) if not c['exact']]
    check((' with the version still open' in toast) == bool(opened), 'toast tells how many versions are still open')
    b.close()

    # 5. an old entry with a version but no proof (picked by an older Curio) -> please confirm
    b, page = open_app(p)
    page.evaluate("""(() => { const rows = window.cardscan.api.cardDetail('Dark Magician Girl'); return rows; })()""")
    key = page.evaluate("window.cardscan.api.cardDetail('Dark Magician Girl').then(r => String(r.find(x => /Quarter Century Stampede/.test(x.set)).products[0].id))")
    store_key = 'cardscan-collection-v1'
    page.evaluate("""([k, key]) => localStorage.setItem(k, JSON.stringify([{id: 'old1', name: 'Dark Magician Girl', vkey: key, code: null, language: null, price: null, added: Date.now() - 86400000, confident: true}]))""", [store_key, key])
    page.reload(); page.wait_for_timeout(1000)
    page.click('nav.tabs button[data-view=collection]'); page.wait_for_timeout(800)
    page.click('#coll-list button >> nth=0'); page.wait_for_selector('#vsure')
    print('   old pick:', page.inner_text('#vsure').replace('\n', ' | ')[:200])
    check(page.locator('#vsure.lv-check').count() == 1, 'old unproven pick -> "please confirm"')
    page.click('#vs-yes'); page.wait_for_timeout(600)
    stored = page.evaluate("(k) => JSON.parse(localStorage.getItem(k))[0]", store_key)
    check(stored.get('vby') == 'user' and page.locator('#vsure.lv-picked').count() == 1, 'confirm -> stored as your pick')
    # 6. German
    page.evaluate("localStorage.setItem('cardscan-lang','de')"); page.reload(); page.wait_for_timeout(1200)
    page.click('nav.tabs button[data-view=collection]'); page.wait_for_timeout(600)
    page.click('#coll-list button >> nth=0'); page.wait_for_selector('#vsure'); page.wait_for_timeout(400)
    de = page.inner_text('#vsure')
    print('   DE:', de.replace('\n', ' | ')[:200])
    check('deine Wahl' in de, 'German texts')
    page.evaluate("localStorage.setItem('cardscan-lang','en')")
    b.close()
print('ALL OK' if ok else 'SOME FAILED')
