# Collection value chart (≈30 days from the averages), also after a reload with stored entries.
import sys; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
with sync_playwright() as p:
    b, page = open_app(p)
    for name in ['Blue-Eyes White Dragon', 'Dark Magician', 'Ash Blossom & Joyous Spring']:
        open_card(page, name)
        page.click('#card-body .versions button >> nth=1'); page.wait_for_timeout(200)
        page.click('#card-add'); page.wait_for_timeout(300); page.go_back(); page.wait_for_timeout(200)
    page.click('nav.tabs button[data-view=collection]'); page.wait_for_timeout(2000)
    print('chart:', page.inner_text('#coll-chart').replace('\n', ' | ') if page.locator('#coll-chart .vchart').count() else 'NONE')
    page.locator('#coll-chart').scroll_into_view_if_needed(); page.wait_for_timeout(300)
    page.screenshot(path='/home/claude/shots/t27_chart.png')
    page.reload(); page.wait_for_timeout(1500)
    page.click('nav.tabs button[data-view=collection]'); page.wait_for_timeout(2500)
    print('after reload:', page.locator('#coll-chart .vchart').count(), '| total', page.inner_text('#coll-total'))
    b.close()
