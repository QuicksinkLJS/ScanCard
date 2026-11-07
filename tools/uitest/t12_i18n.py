import sys, base64, struct; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
JS = """() => { const out = new Set(); const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; while ((n = w.nextNode())) { const el = n.parentElement; if (!el || el.closest('[hidden]') || el.closest('script,style,svg')) continue;
    const t = n.nodeValue.trim(); if (/\\b(the|card|cards|your|version|price|set|to|of|on|and|missing|with|tap|add|scan|more|no|not)\\b/i.test(t)) out.add(t); }
  document.querySelectorAll('[placeholder]').forEach(e => { if (!e.closest('[hidden]')) out.add('PH:' + e.placeholder); });
  return [...out]; }"""
seen = set()
def dump(page, where):
    for t in page.evaluate(JS):
        if t not in seen: seen.add(t); print(f'[{where}]', t[:140])
b64 = lambda ids: base64.b64encode(struct.pack('<%dI' % len(ids), *ids)).decode()
with sync_playwright() as p:
    b, page = open_app(p)
    page.evaluate("localStorage.setItem('cardscan-lang','de')"); page.reload(); page.wait_for_timeout(1500)
    dump(page, 'scan')
    page.set_input_files('#gallery', '/home/claude/photos/414d4e04-image.jpg')
    page.wait_for_selector('#found li', timeout=180000); page.wait_for_timeout(2000)
    page.click('#sort-piles'); page.wait_for_timeout(300)
    dump(page, 'result')
    page.click('#found button >> nth=0'); page.wait_for_timeout(800); dump(page, 'cardpage')
    page.click('#card-body .versions button >> nth=0'); page.wait_for_timeout(400); dump(page, 'cardpage2')
    page.click('#card-add'); page.wait_for_timeout(400)
    page.click('#card-wish'); page.wait_for_timeout(200); dump(page, 'wish')
    page.go_back(); page.wait_for_timeout(300)
    page.click('#pack-chip'); page.wait_for_timeout(600); dump(page, 'pack'); page.go_back(); page.wait_for_timeout(300)
    page.click('nav.tabs button[data-view=collection]'); page.wait_for_timeout(1200); dump(page, 'coll')
    page.click('[data-ctab=masters]'); page.wait_for_timeout(300); dump(page, 'masters')
    page.fill('#masters-search', 'legacy of destruction'); page.wait_for_selector('#masters-results button'); dump(page, 'masters-search')
    page.click('#masters-results button >> nth=0'); page.wait_for_selector('#set-body .mlist'); page.wait_for_timeout(300); dump(page, 'set')
    page.go_back(); page.wait_for_timeout(300); dump(page, 'masters-list')
    page.click('[data-ctab=decks]'); page.wait_for_timeout(300); dump(page, 'decks')
    page.fill('#deck-input', f"ydke://{b64([14558127]*3 + [46986414])}!{b64([44508094])}!{b64([])}!")
    page.click('#deck-import'); page.wait_for_selector('#deck-body .dlist', timeout=20000); page.wait_for_timeout(300); dump(page, 'deck')
    page.context.grant_permissions(['clipboard-read', 'clipboard-write'])
    page.click('#deck-wants'); page.wait_for_timeout(300); dump(page, 'deck-wants')
    page.go_back(); page.wait_for_timeout(300); dump(page, 'deck-list')
    page.click('[data-ctab=wish]'); page.wait_for_timeout(800); dump(page, 'wishlist')
    page.click('nav.tabs button[data-view=market]'); page.wait_for_timeout(800); dump(page, 'market')
    page.click('[data-mtab=watch]'); page.wait_for_timeout(500); dump(page, 'watch')
    page.click('nav.tabs button[data-view=more]'); page.wait_for_timeout(800); dump(page, 'more')
    page.screenshot(path='/home/claude/shots/t12_more.png')
    page.click('nav.tabs button[data-view=collection]'); page.click('[data-ctab=cards]'); page.wait_for_timeout(500)
    page.screenshot(path='/home/claude/shots/t12_coll.png')
    b.close()
