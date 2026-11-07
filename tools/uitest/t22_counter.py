# Totals count up to their value.
import sys; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
with sync_playwright() as p:
    b, page = open_app(p)
    for name in ['Snake-Eyes Diabellstar', 'Dark Magician']:
        open_card(page, name)
        page.click('#card-body .versions button >> nth=0'); page.wait_for_timeout(200)
        page.click('#card-add'); page.wait_for_timeout(300); page.go_back(); page.wait_for_timeout(200)
    page.reload(); page.wait_for_timeout(500)
    page.evaluate("window.__seen = []; const el = document.getElementById('coll-total'); const t0 = performance.now(); (function f() { window.__seen.push(Math.round(performance.now() - t0) + 'ms ' + el.textContent); if (performance.now() - t0 < 1200) requestAnimationFrame(f); })()")
    page.click('nav.tabs button[data-view=collection]')
    page.wait_for_timeout(1500)
    seen = page.evaluate("window.__seen.filter((x, i, a) => i % 8 === 0)")
    print('collection total over time:', seen)
    b.close()
