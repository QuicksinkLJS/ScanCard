import sys; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
with sync_playwright() as p:
    b, page = open_app(p)
    open_card(page, 'Blue-Eyes White Dragon')
    page.screenshot(path='/home/claude/shots/t1_bewd.png', full_page=False)
    print(page.inner_text('#card-body .versions')[:1200])
    # pick first version and check link
    page.click('#card-body .versions button >> nth=0')
    page.wait_for_timeout(200)
    print('LINK', page.get_attribute('#card-body .actions a', 'href'), page.inner_text('#card-body .actions a'))
    print(page.inner_text('#card-body .pricebox'))
    page.screenshot(path='/home/claude/shots/t1_bewd_chosen.png')
    page.go_back(); page.wait_for_timeout(200)
    open_card(page, 'Snake-Eyes Diabellstar')
    print(page.inner_text('#card-body .versions')[:900])
    b.close()
