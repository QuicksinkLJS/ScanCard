# Binder assistant: a scanned card that is missing in a tracked set shows binder page + pocket; a tap opens the
# binder there. A card a deck needs shows the deck.
import sys, base64, struct, json; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
photo = '/home/claude/photos/0bdf9c29-image.jpg'
with sync_playwright() as p:
    b, page = open_app(p)
    page.set_input_files('#gallery', photo)
    page.wait_for_selector('#found li', timeout=180000)
    for _ in range(40):
        page.wait_for_timeout(1500)
        if page.evaluate("window.cardscan.scanner.cards().every(c => ['done','none'].includes(c.codeStatus))"): break
    c = page.evaluate("(() => { const c = window.cardscan.scanner.cards()[0]; return { name: c.name, vkey: c.vkey, code: c.code?.code }; })()")
    print('scanned:', c)
    # track the set of that version
    exp = page.evaluate(f"""(async () => {{ const P = await import('./js/prices.js'); const rows = await window.cardscan.api.cardDetail({json.dumps(c['name'])});
      const o = P.versionOptions(rows).find(o => o.codes.includes({json.dumps(c['code'])})); const x = await window.cardscan.api.expansions();
      const e = x.find(e => e.name === o.set) || x.find(e => o.set.startsWith(e.name)); localStorage.setItem('cardscan-masters-v1', JSON.stringify([{{exp: e.exp, name: e.name, target: 1}}])); return e.name; }})()""")
    print('tracking:', exp)
    page.click('#sort-piles'); page.wait_for_timeout(2500)
    print('row:', page.inner_text('#found li >> nth=0').replace('\n', ' | ')[:160])
    print('sum:', page.inner_text('#pile-sum'))
    page.screenshot(path='/home/claude/shots/t37_scan.png')
    # pick the version on the card page -> the tag shows page and pocket
    page.click('#found li button >> nth=0'); page.wait_for_timeout(800)
    page.click("#card-body .versions button:has-text('SRL') >> nth=0"); page.wait_for_timeout(500)
    page.go_back(); page.wait_for_timeout(1500)
    vk = page.evaluate("window.cardscan.scanner.cards()[0].vkey")
    page.evaluate(f"""(async () => {{ const P = await import('./js/prices.js'); const o = P.versionOptions(await window.cardscan.api.cardDetail('Blue-Eyes Toon Dragon')).find(o => String(o.key) === '{vk}');
      const e = (await window.cardscan.api.expansions()).find(e => e.exp === o.expansion);
      localStorage.setItem('cardscan-masters-v1', JSON.stringify([{{exp: e.exp, name: e.name, target: 1}}])); }})()""")
    page.click('#sort-piles'); page.wait_for_timeout(300); page.click('#sort-piles'); page.wait_for_timeout(2500)
    print('row with version:', vk, page.inner_text('#found li >> nth=0').replace('\n', ' | ')[:160])
    page.click('#found [data-spot] >> nth=0'); page.wait_for_timeout(1500)
    print('set page:', page.is_visible('#set-page'), '| binder view:', page.locator('#binder').count(), '| highlighted:', page.locator('.pocket.spot').count())
    page.screenshot(path='/home/claude/shots/t37_binder.png')
    b.close()
