# Collection: rarity badges, foil frames, rarity filter chips.
import sys; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
with sync_playwright() as p:
    b, page = open_app(p)
    for name, pick in [('Snake-Eyes Diabellstar', 2), ('Blue-Eyes White Dragon', 0), ('Ash Blossom & Joyous Spring', 1), ('Dark Magician', 3)]:
        open_card(page, name)
        if pick is not None: page.click(f'#card-body .versions button >> nth={pick}'); page.wait_for_timeout(200)
        page.click('#card-add'); page.wait_for_timeout(400); page.go_back(); page.wait_for_timeout(200)
    open_card(page, 'Pot of Greed')  # no version picked -> "choose rarity"
    page.click('#card-add'); page.wait_for_timeout(400); page.go_back(); page.wait_for_timeout(200)
    page.click('nav.tabs button[data-view=collection]'); page.wait_for_timeout(800)
    print('chips:', page.inner_text('#coll-rchips').replace('\n', ' | '))
    print('badges:', page.locator('#coll-list .rbadge').all_inner_texts())
    page.locator('#coll-rchips').scroll_into_view_if_needed(); page.wait_for_timeout(500)
    page.screenshot(path='/home/claude/shots/t18_rarity.png')
    page.click('#coll-rchips .rchip >> nth=0'); page.wait_for_timeout(300)
    print('filtered rows:', page.locator('#coll-list li').count(), page.locator('#coll-list .rbadge').all_inner_texts())
    page.click('#coll-rchips [data-rar=""]'); page.wait_for_timeout(300)
    print('all rows:', page.locator('#coll-list li').count())
    b.close()
