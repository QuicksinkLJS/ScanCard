# Box tally in pack mode: count two photos, totals and result, a photo counts once, share picture, reset with undo.
import sys; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
with sync_playwright() as p:
    b, page = open_app(p)
    name = page.evaluate("""(async () => { const a = window.cardscan.api; const s = await a.sets();
      for (const x of s) { const bp = await a.boosterPrice(x.name).catch(() => null); if (bp?.booster && /Rarity Collection|Quarter Century|Legend/.test(x.name)) { window.cardscan.setPack({ prefix: x.prefix, name: x.name, year: x.year }); return x.name + ' booster ' + bp.booster; } }
      return null; })()""")
    print('pack:', name)
    for i, f in enumerate(['49e0e9fa', '414d4e04']):
        page.set_input_files('#gallery', f'/home/claude/photos/{f}-image.jpg')
        page.wait_for_selector('#found li', timeout=180000); page.wait_for_timeout(6000)
        for _ in range(10):
            if page.locator('.reveal .reveal-skip').count(): page.click('.reveal .reveal-skip'); page.wait_for_timeout(600); break
            page.wait_for_timeout(500)
        page.wait_for_selector('#box-add', timeout=20000)
        page.click('#box-add'); page.wait_for_timeout(500)
        print(f'photo {i+1}:', page.inner_text('#toast'), '|', page.inner_text('.box-tally p').replace('\n', ' '))
        page.click('#box-add', force=True) if page.is_enabled('#box-add') else None
        print('  button now:', page.inner_text('#box-add'), '| enabled:', page.is_enabled('#box-add'))
    page.locator('#pack-balance').scroll_into_view_if_needed(); page.screenshot(path='/home/claude/shots/t38_box.png')
    with page.expect_download() as d: page.click('#box-share')
    print('share picture:', d.value.suggested_filename)
    page.click('#box-reset'); page.wait_for_timeout(300)
    print('after reset:', page.inner_text('.box-tally').replace('\n', ' ')[:90]); page.click('.toast-act'); page.wait_for_timeout(500)
    print('after undo:', page.inner_text('.box-tally p').replace('\n', ' ')[:120])
    b.close()
