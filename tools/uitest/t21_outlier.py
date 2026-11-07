# Outlier trend: marked ⚠ in the version list and left out of the range.
import sys; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
with sync_playwright() as p:
    b, page = open_app(p)
    open_card(page, 'Crush Card Virus')
    print('range box:', page.inner_text('#card-body .pricebox').replace('\n', ' | ')[:160])
    page.fill('#ver-filter', '')
    page.click('#show-all') if page.locator('#show-all').count() else None
    page.wait_for_timeout(200)
    rows = [t.replace('\n', ' ') for t in page.locator('#card-body .versions li').all_inner_texts() if '⚠' in t]
    print('marked:', rows[:2])
    page.locator('#card-body .versions li', has_text='⚠').first.locator('button').click(); page.wait_for_timeout(300)
    print('chosen:', page.inner_text('#card-body .pricebox').replace('\n', ' | ')[:300])
    b.close()
