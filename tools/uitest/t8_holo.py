import sys; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
with sync_playwright() as p:
    b, page = open_app(p)
    for name, pick in [('Snake-Eyes Diabellstar', 2), ('Blue-Eyes White Dragon', 0), ('Ash Blossom & Joyous Spring', 0)]:
        open_card(page, name)
        page.click(f'#card-body .versions button >> nth={pick}'); page.wait_for_timeout(200)
        page.click('#card-add'); page.wait_for_timeout(400); page.go_back(); page.wait_for_timeout(200)
    page.click('nav.tabs button[data-view=collection]'); page.wait_for_timeout(800)
    page.click('#showcase'); page.wait_for_timeout(800)
    page.mouse.move(300, 300); page.wait_for_timeout(300)
    print(page.inner_text('#holo-info'))
    page.screenshot(path='/home/claude/shots/t8_holo1.png')
    # swipe
    page.mouse.move(350, 400); page.mouse.down(); page.mouse.move(100, 400, steps=5); page.mouse.up(); page.wait_for_timeout(500)
    page.mouse.move(120, 600); page.wait_for_timeout(300)
    print(page.inner_text('#holo-info'))
    page.screenshot(path='/home/claude/shots/t8_holo2.png')
    page.go_back(); page.wait_for_timeout(300)
    print('holo hidden', page.is_hidden('#holo'))
    # from collection card page
    page.click('#coll-list button >> nth=0'); page.wait_for_selector('#card-holo')
    page.click('#card-holo'); page.wait_for_timeout(500)
    print(page.inner_text('#holo-info'))
    page.go_back(); page.wait_for_timeout(300)
    print('card page still open', page.is_visible('#card-page'))
    b.close()
