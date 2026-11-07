# Friends: my QR code (parts read back with the QR reader), the link, adding a friend, their page and trade matches.
# Two separate phones = two browser contexts (own storage each).
import sys, re, base64, struct; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
b64 = lambda ids: base64.b64encode(struct.pack('<%dI' % len(ids), *ids)).decode()
with sync_playwright() as p:
    # ---- phone A (Christian): cards, a wish, a set, a deck
    b, a = open_app(p)
    for name, nth in [('Blue-Eyes White Dragon', 1), ('Dark Magician', 1), ('Ash Blossom & Joyous Spring', 2)]:
        open_card(a, name); a.click(f'#card-body .versions button >> nth={nth}'); a.wait_for_timeout(200)
        a.click('#card-add'); a.wait_for_timeout(300); a.go_back(); a.wait_for_timeout(200)
    open_card(a, 'Stardust Dragon'); a.click('#card-wish'); a.wait_for_timeout(200); a.go_back(); a.wait_for_timeout(200)
    a.evaluate("window.cardscan.api.expansions().then(x => { const e = x.find(r => /Original Artwork/.test(r.name)); localStorage.setItem('cardscan-masters-v1', JSON.stringify([{exp: e.exp, name: e.name, target: 2}])); })")
    a.click('nav.tabs button[data-view=collection]'); a.click('[data-ctab=decks]')
    a.fill('#deck-input', f"ydke://{b64([14558127]*3 + [46986414]*2)}!!!"); a.click('#deck-import'); a.wait_for_selector('#deck-body .dlist', timeout=30000); a.go_back(); a.wait_for_timeout(300)
    a.click('[data-ctab=friends]'); a.wait_for_timeout(300)
    a.click('#fr-myqr'); a.fill('#qr-name', 'Christian'); a.press('#qr-name', 'Tab'); a.wait_for_timeout(2500)
    print('A code:', a.inner_text('#qr-sum'), '|', a.inner_text('#qr-count'), '| svg:', a.locator('#qr-box svg').count())
    a.screenshot(path='/home/claude/shots/t35_myqr.png')
    link = a.evaluate("document.getElementById('qr-page')._link")
    parts = a.evaluate("document.getElementById('qr-page')._parts")
    # read every generated QR back with jsQR (as a phone without BarcodeDetector would)
    decoded = a.evaluate("""async () => {
      if (!window.jsQR) await new Promise((ok) => { const s = document.createElement('script'); s.src = 'js/vendor/jsQR.js'; s.onload = ok; document.head.appendChild(s); });
      const out = [];
      for (const text of document.getElementById('qr-page')._parts) {
        const qr = window.qrcode(0, 'L'); qr.addData(text, 'Byte'); qr.make();
        const img = new Image(); img.src = qr.createDataURL(4, 12); await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const r = window.jsQR(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
        out.push(r ? r.data === text : false);
      }
      return out; }""")
    print('QR parts read back:', decoded)
    path = link.split('#')[1]
    # ---- phone B (a friend): own cards + wishes Ash Blossom (A has it); has Stardust (A wishes it)
    ctx2 = b.new_context(viewport={'width': 412, 'height': 900}, device_scale_factor=2, is_mobile=True, has_touch=True)
    f = ctx2.new_page(); f.on('pageerror', lambda e: print('PAGEERROR B', e))
    f.route(re.compile(r'https://cdn\.jsdelivr\.net/.*'), route_cdn)
    f.route(re.compile(r'https://(www\.)?cardtrader\.com/.*'), lambda r: r.fulfill(path='/home/claude/photos/card.jpg', content_type='image/jpeg'))
    f.goto(URL); f.wait_for_timeout(800)
    open_card(f, 'Stardust Dragon'); f.click('#card-body .versions button >> nth=1'); f.wait_for_timeout(200); f.click('#card-add'); f.wait_for_timeout(300); f.go_back(); f.wait_for_timeout(200)
    open_card(f, 'Ash Blossom & Joyous Spring'); f.click('#card-wish'); f.wait_for_timeout(200); f.go_back(); f.wait_for_timeout(200)
    f.goto(URL + '#' + path); f.wait_for_timeout(4000)
    print('B toast:', f.inner_text('#toast') if f.is_visible('#toast') else '-', '| friend page open:', f.is_visible('#friend-page'))
    print('B title:', f.inner_text('#friend-title'), '| total:', f.inner_text('#fr-total'), '| tabs:', f.locator('.fr-tabs button').all_inner_texts())
    print('B trade:', f.inner_text('#fr-tab').replace('\n', ' | ')[:400])
    f.screenshot(path='/home/claude/shots/t35_friend.png', full_page=True)
    for tab in ['cards', 'binders', 'wish', 'decks']:
        f.click(f'[data-ft={tab}]'); f.wait_for_timeout(1500)
        print(f'B {tab}:', f.inner_text('#fr-tab').replace('\n', ' | ')[:200])
    f.click('[data-ft=binders]'); f.wait_for_timeout(1500)
    f.click('.fr-set summary'); f.wait_for_timeout(800)
    print('B binder pockets:', f.locator('.fr-set .pocket[data-key]').count(), 'have:', f.locator('.fr-set .pocket.have').count())
    f.screenshot(path='/home/claude/shots/t35_binder.png')
    f.evaluate("() => { navigator.share = (d) => { window.__shared = d.text; return Promise.resolve(); }; }")
    f.click('[data-ft=trade]'); f.wait_for_timeout(1200); f.click('[data-ask] >> nth=0'); f.wait_for_timeout(500)
    print('B message:', f.evaluate('window.__shared'))
    f.go_back(); f.wait_for_timeout(500)
    print('B friends list:', f.inner_text('#friends-list').replace('\n', ' | ') if f.is_visible('#friends-list') else f.evaluate("JSON.parse(localStorage.getItem('cardscan-friends-v1')).map(x => x.name)"))
    a.evaluate("""(() => { const l = JSON.parse(localStorage.getItem('cardscan-collection-v1')); const out = [];
      for (let i = 0; i < 600; i++) out.push({ ...l[i % l.length], id: 'x' + i, vkey: String(900000 + i * 2) });
      localStorage.setItem('cardscan-collection-v1', JSON.stringify(out)); })()""")
    a.go_back(); a.wait_for_timeout(300); a.click('#fr-myqr'); a.wait_for_timeout(3000)
    print('A big:', a.inner_text('#qr-sum'), '|', a.inner_text('#qr-count'))
    a.wait_for_timeout(700); print('A big next:', a.inner_text('#qr-count'))
    b.close()
