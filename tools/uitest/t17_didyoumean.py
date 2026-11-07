# Unsure cards show "Did you mean…?" with 3 pictures; a tap fixes the card and the fingerprint is learned.
import sys; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
photo = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/photos/73764790-image.jpg'
with sync_playwright() as p:
    b, page = open_app(p)
    page.set_input_files('#gallery', photo)
    page.wait_for_selector('#found li', timeout=180000)
    page.wait_for_timeout(3000)
    n = page.locator('#found .dym').count()
    print('unsure cards with suggestions:', n)
    if n:
        print(page.inner_text('#found .dym >> nth=0').replace('\n', ' | '))
        page.locator('#found .dym').first.scroll_into_view_if_needed()
        page.wait_for_timeout(1500)
        page.screenshot(path='/home/claude/shots/t17_dym.png')
        name = page.get_attribute('#found .dym >> nth=0 >> .dym-c >> nth=1', 'data-name')
        page.click('#found .dym >> nth=0 >> .dym-c >> nth=1'); page.wait_for_timeout(1500)
        print('picked', name, '| suggestions left', page.locator('#found .dym').count(), '| in list', name in page.inner_text('#found'))
        print('learned prints', page.evaluate("new Promise(r => { const q = indexedDB.open('cardscan-learn'); q.onsuccess = () => { const g = q.result.transaction('prints').objectStore('prints').getAll(); g.onsuccess = () => r(g.result.map(x => [x.name, x.emb.length])); }; })"))
        # scan the same photo again: the learned print should now win for that card
        page.click('#scan-again') if False else None
        page.evaluate("window.cardscan.scanner.clear()")
        page.set_input_files('#gallery', photo)
        page.wait_for_selector('#found li', timeout=180000); page.wait_for_timeout(3000)
        print('rescan:', page.inner_text('#found').replace('\n', ' | ')[:400])
    b.close()
