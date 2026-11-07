import sys, json; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
with sync_playwright() as p:
    b, page = open_app(p)
    for name, pick in [('Blue-Eyes White Dragon', 2), ('Snake-Eyes Diabellstar', 2), ('Dark Magician', None), ('Ash Blossom & Joyous Spring', 0)]:
        open_card(page, name)
        if pick is not None:
            page.click(f'#card-body .versions button >> nth={pick}'); page.wait_for_timeout(200)
        page.click('#card-add'); page.wait_for_timeout(400)
        page.go_back(); page.wait_for_timeout(200)
    # pretend two cards were cheaper / dearer when added
    page.evaluate("""() => { const l = JSON.parse(localStorage.getItem('cardscan-collection-v1'));
      l[0].buy = {lo: l[0].price.lo * 0.5, hi: l[0].price.hi * 0.5}; l[2].buy = {lo: l[2].price.lo * 1.3, hi: l[2].price.hi * 1.3};
      localStorage.setItem('cardscan-collection-v1', JSON.stringify(l)); }""")
    page.click('nav.tabs button[data-view=collection]'); page.wait_for_timeout(1500)
    page.click('#coll-sets-wrap summary'); page.wait_for_timeout(200)
    print(page.inner_text('#view-collection')[:1500])
    page.screenshot(path='/home/claude/shots/t3_depot.png', full_page=True)
    print(json.dumps(page.evaluate("JSON.parse(localStorage.getItem('cardscan-collection-v1')).map(e => [e.name, e.price, e.buy])"))[:900])
    b.close()
