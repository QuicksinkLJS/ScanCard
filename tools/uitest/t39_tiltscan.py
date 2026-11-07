# Tilt scan (prototype) with a fake camera: a synthetic tilted Ultra Rare / Common is played as the
# camera video; the guess must come out right and order the versions on the card page.
import sys; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
VIDEO = '/home/claude/work/tilt/%s.y4m'
with sync_playwright() as p:
    for kind, expect in [('ultra', 'Ultra Rare'), ('common', 'Common')]:
        b, page = open_app(p, args=('--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-video-capture={VIDEO % kind}'))
        open_card(page, 'Blue-Eyes White Dragon')
        page.click('#tilt-btn')
        page.wait_for_selector('#tilt-page:not([hidden])')
        # back closes only the tilt sheet
        page.go_back(); page.wait_for_timeout(300)
        assert page.locator('#tilt-page').is_hidden() and page.locator('#card-page').is_visible(), 'back closed the card page'
        page.click('#tilt-btn')
        page.wait_for_selector('#tilt-go:not([disabled])', timeout=10000)
        print(kind, 'status:', page.inner_text('#tilt-status'))
        page.click('#tilt-go')
        page.wait_for_selector('#tilt-result .tilt-guess', timeout=20000)
        guess = page.inner_text('#tilt-result .tilt-guess'); why = page.inner_text('#tilt-result > .small')
        print(kind, '→', guess, '|', why)
        page.screenshot(path=f'/home/claude/shots/t39_{kind}_result.png', full_page=False)
        assert expect in guess, f'{kind}: {guess}'
        page.click('#tilt-use')
        page.wait_for_selector('#tilt-page', state='hidden')
        assert page.locator('#card-page').is_visible()
        page.wait_for_timeout(500)
        note = [n for n in page.locator('#card-body .note').all_inner_texts() if 'Tilt' in n]
        rows = page.locator('#card-body .versions li').all_inner_texts()
        print('  note:', note[0].replace('\n', ' ') if note else None)
        print('  first versions:', ' || '.join(r.replace('\n', ' ')[:60] for r in rows[:3]))
        assert note, 'no tilt note'
        assert 'FOIL' in rows[0] and expect.split()[0] in rows[0], rows[0]
        page.locator('#tilt-btn').scroll_into_view_if_needed()
        page.screenshot(path=f'/home/claude/shots/t39_{kind}_card.png')
        b.close()
print('t39 ok')
