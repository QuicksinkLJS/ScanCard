# Card page: filter the versions by set code / set name.
import sys; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
with sync_playwright() as p:
    b, page = open_app(p)
    open_card(page, 'Dark Magician')
    print('versions shown', page.locator('#card-body .versions li').count())
    for q in ['MP19', 'lob', 'starlight', 'zzzz']:
        page.fill('#ver-filter', q); page.wait_for_timeout(200)
        print(q, '->', page.locator('#card-body .versions li').count(), page.locator('#card-body .versions li').first.inner_text().replace('\n', ' ')[:80])
    page.fill('#ver-filter', 'lob'); page.wait_for_timeout(200)
    page.click('#card-body .versions button >> nth=0'); page.wait_for_timeout(300)
    print('picked, filter kept:', page.input_value('#ver-filter'), '| on:', page.locator('#card-body .versions li.on').count())
    b.close()
