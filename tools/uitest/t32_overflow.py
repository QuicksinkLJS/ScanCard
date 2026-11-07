# No view may be wider than the screen (no sideways swiping): main tabs, card page, deck page with a 10-card hand.
import sys, base64, struct; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
b64 = lambda ids: base64.b64encode(struct.pack('<%dI' % len(ids), *ids)).decode()
url = f"ydke://{b64([14558127]*3 + [46986414]*3 + [89631139]*3 + [38033121]*3 + [44508094]*3 + [83764718]*3 + [5318639]*3 + [97268402]*3)}!!!"
WIDE = """() => { const out = []; const vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw + 1) out.push('document ' + document.documentElement.scrollWidth);
  document.querySelectorAll('.sheet:not([hidden])').forEach(s => { if (s.scrollWidth > s.clientWidth + 1) out.push(s.id + ' ' + s.scrollWidth); });
  return out.join(', ') || 'ok'; }"""
with sync_playwright() as p:
    b, page = open_app(p)
    for v in ['scan', 'collection', 'market', 'more']:
        page.click(f'nav.tabs button[data-view={v}]'); page.wait_for_timeout(400)
        print(v, page.evaluate(WIDE))
    open_card(page, 'Blue-Eyes White Dragon'); print('card page', page.evaluate(WIDE))
    page.click('#card-add'); page.wait_for_timeout(300); page.go_back(); page.wait_for_timeout(200)
    page.click('nav.tabs button[data-view=collection]'); page.wait_for_timeout(600); print('collection + fan', page.evaluate(WIDE))
    page.click('[data-ctab=decks]'); page.fill('#deck-input', url); page.click('#deck-import')
    page.wait_for_selector('#deck-body .dlist', timeout=30000); page.wait_for_timeout(1200)
    print('deck', page.evaluate(WIDE))
    page.click('#deck-draw'); page.wait_for_timeout(300)
    for _ in range(5): page.click('#hand-more'); page.wait_for_timeout(150)
    page.wait_for_timeout(900)
    print('hand', page.locator('.hand-fan .fan-card').count(), 'cards:', page.evaluate(WIDE))
    page.locator('#deck-hand').scroll_into_view_if_needed(); page.screenshot(path='/home/claude/shots/t32_hand.png')
    page.evaluate("document.getElementById('deck-page').scrollTop = 0"); page.wait_for_timeout(300)
    page.screenshot(path='/home/claude/shots/t32_deck.png')
    b.close()
