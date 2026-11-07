# Version filter by rarity and its short forms (QCSR, QCR, UR, ScR …): that rarity first.
import sys; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
with sync_playwright() as p:
    b, page = open_app(p)
    open_card(page, 'Blue-Eyes White Dragon')
    for q in ['QCSR', 'qcr', 'quarter century', 'UR', 'ScR', 'starlight', 'psr', 'LOB']:
        page.fill('#ver-filter', q); page.wait_for_timeout(250)
        rows = page.locator('#card-body .versions li').all_inner_texts()
        print(f'{q:16} {len(rows):3} |', ' || '.join(r.replace('\n', ' ')[:70] for r in rows[:3]))
    page.fill('#ver-filter', 'QCSR'); page.wait_for_timeout(250)
    page.locator('#ver-filter').scroll_into_view_if_needed(); page.screenshot(path='/home/claude/shots/t31_qcsr.png')
    b.close()
