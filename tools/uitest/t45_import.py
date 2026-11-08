# Data safety + import (8 Nov): import a Dragon Shield / Collectr CSV (preview, versions only when proven,
# undo), automatic copies (daily + before import) with "go back", backup reminder, German.
# CSV files: tools/uitest/fixtures/{ds,collectr}.csv (made up; Collectr's real column set is not public)
import sys, json; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
FX = __import__('os').path.join(__import__('os').path.dirname(__file__), 'fixtures')
DS = __import__('os').path.join(FX, 'ds.csv')
CT = __import__('os').path.join(FX, 'collectr.csv')
ok = True
def check(cond, msg):
    global ok
    print(('ok   ' if cond else 'FAIL ') + msg)
    ok = ok and cond
coll = lambda page: page.evaluate("JSON.parse(localStorage.getItem('cardscan-collection-v1') || '[]')")
with sync_playwright() as p:
    b, page = open_app(p)
    page.evaluate("localStorage.setItem('cardscan-collection-v1', JSON.stringify([{id: 'mine1', name: 'Pot of Greed', vkey: null, added: Date.now(), confident: true}]))")
    page.reload(); page.wait_for_timeout(3500)   # the daily copy is taken 2.5 s after the start
    page.click('nav.tabs button[data-view=more]'); page.wait_for_timeout(800)
    print('   safety:', page.inner_text('#safe-box').replace('\n', ' | ')[:240])
    check('Automatic copies on' in page.inner_text('#safe-status'), 'safety status shown')
    # 1. Dragon Shield import: preview
    page.set_input_files('#imp-file', DS)
    page.wait_for_selector('#imp-go', timeout=60000)
    print('   preview:', page.inner_text('#imp-body').replace('\n', ' | ')[:700])
    tiles = page.inner_text('.imp-tiles').replace('\n', ' ')
    check('8' in tiles.split()[0], f'8 copies found ({tiles})')
    check('Not found (1)' in page.inner_text('#imp-body'), 'unknown card reported')
    page.screenshot(path='/home/claude/shots/t45_preview.png', full_page=True)
    page.click('#imp-go'); page.wait_for_timeout(1500)
    c = coll(page)
    imp = [e for e in c if e.get('src') == 'import']
    check(len(c) == 9 and len(imp) == 8, f'8 cards imported next to the 1 there was ({len(c)})')
    ash = [e for e in imp if e['name'] == 'Ash Blossom & Joyous Spring']
    check(len(ash) == 3 and all(e['vkey'] and e['vby'] == 'import' and e['cond'] == 'LP' and e['first'] is True for e in ash), 'Ash Blossom ×3 with proven version, LP, 1st')
    dmg_jp = [e for e in imp if e['name'] == 'Dark Magician Girl' and e.get('lang') == 'JP']
    check(len(dmg_jp) == 1 and not dmg_jp[0]['vkey'], 'Japanese DMG: version stays open')
    toast = page.evaluate("document.querySelector('.toast')?.innerText || ''")
    print('   toast:', toast.replace('\n', ' '))
    check('imported' in toast and 'still open' in toast and 'no safety copy' not in toast, 'toast says how many are open (safety copy there)')
    # life story of an imported card
    page.click('nav.tabs button[data-view=collection]'); page.wait_for_timeout(800)
    page.evaluate("window.cardscan.showView('collection')"); page.wait_for_timeout(500)
    page.locator('#coll-list button:has-text("Ash Blossom")').first.click(); page.wait_for_selector('#story')
    page.click('#story summary'); page.wait_for_timeout(200)
    story = page.inner_text('#story')
    print('   story:', story.replace('\n', ' | ')[:200])
    check('Imported from Dragon Shield · Trade' in story and 'you paid €10.00' in story, 'story: imported from Dragon Shield, price paid')
    check(page.locator('#vsure.lv-picked').count() == 1, 'version box: decided (from the import)')
    page.go_back(); page.wait_for_timeout(400)
    # 2. same file again -> warning; cancel
    page.click('nav.tabs button[data-view=more]'); page.wait_for_timeout(500)
    page.set_input_files('#imp-file', DS)
    page.wait_for_selector('#imp-go', timeout=60000)
    check('You imported this file on' in page.inner_text('#imp-body'), 'same file twice -> warning')
    page.click('#imp-cancel'); page.wait_for_timeout(400)
    check(len(coll(page)) == 9, 'cancel adds nothing')
    # 3. Collectr: other game + watchlist left out, name/code conflict reported
    page.set_input_files('#imp-file', CT)
    page.wait_for_selector('#imp-go', timeout=60000)
    body = page.inner_text('#imp-body')
    print('   collectr:', body.replace('\n', ' | ')[:400])
    check('Left out: 1 other games · 1 watchlist entries' in body, 'Collectr: other game + watchlist left out')
    page.click('#imp-go'); page.wait_for_timeout(1200)
    check(len(coll(page)) == 11, 'Collectr: 2 cards imported')
    page.click('.toast button'); page.wait_for_timeout(600)
    check(len(coll(page)) == 9, 'undo removes the Collectr import')
    # 4. copies: daily + before import, go back to the state before the first import
    page.click('nav.tabs button[data-view=more]'); page.wait_for_timeout(800)
    page.click('#safe-copies summary'); page.wait_for_timeout(300)
    lst = page.inner_text('#safe-list')
    print('   copies:', lst.replace('\n', ' | ')[:300])
    check('Before an import' in lst and 'Daily copy' in lst, 'copies: daily + before import')
    # the state before the first import: 1 card
    page.locator('#safe-list li:has-text("· 1 card") >> text=Go back').first.click(); page.wait_for_timeout(300)
    page.click('.choose .btn.danger'); page.wait_for_timeout(2500)
    check(len(coll(page)) == 1, f'go back -> 1 card again ({len(coll(page))})')
    # 5. backup reminder with 25 cards, never backed up; "Later" hides it
    page.evaluate("localStorage.setItem('cardscan-collection-v1', JSON.stringify(Array.from({length: 25}, (_, i) => ({id: 'x' + i, name: 'Pot of Greed', vkey: null, added: Date.now(), confident: true}))))")
    page.evaluate("localStorage.removeItem('cardscan-lastbackup'); localStorage.removeItem('cardscan-backup-snooze')")
    page.reload(); page.wait_for_timeout(1000)
    page.click('nav.tabs button[data-view=collection]'); page.wait_for_timeout(600)
    rem = page.inner_text('#bk-remind') if page.locator('#bk-remind:not([hidden])').count() else ''
    print('   reminder:', rem.replace('\n', ' | '))
    check('Your 25 cards are only on this phone' in rem, 'backup reminder shown')
    page.locator('#bk-remind').screenshot(path='/home/claude/shots/t45_remind.png')
    page.click('#rm-later'); page.wait_for_timeout(300)
    check(page.locator('#bk-remind[hidden]').count() == 1, '"Later" hides it')
    # 6. German
    page.evaluate("localStorage.setItem('cardscan-lang','de')"); page.reload(); page.wait_for_timeout(1200)
    page.click('nav.tabs button[data-view=more]'); page.wait_for_timeout(800)
    de = page.inner_text('#view-more')
    check('Deine Daten' in de and 'Aus einer anderen App importieren' in de and 'Automatische Kopien an' in de, 'German texts')
    page.set_input_files('#imp-file', DS)
    page.wait_for_selector('#imp-go', timeout=60000); page.wait_for_timeout(300)
    print('   DE preview:', page.inner_text('#imp-body').replace('\n', ' | ')[:300])
    check('Karten gefunden' in page.inner_text('#imp-body'), 'German import preview')
    page.evaluate("localStorage.setItem('cardscan-lang','en')")
    b.close()
print('ALL OK' if ok else 'SOME FAILED')
