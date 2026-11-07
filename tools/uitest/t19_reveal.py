# Pack opening reveal: face down, tap turns, most valuable last, hit glow, masterset news, summary.
import sys; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
photo = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/photos/49e0e9fa-image.jpg'
with sync_playwright() as p:
    b, page = open_app(p)
    page.evaluate("navigator.vibrate = (p) => { (window.__buzz = window.__buzz || []).push(JSON.stringify(p)); return true; }")
    page.evaluate("window.cardscan.setPack({ auto: true })")
    page.set_input_files('#gallery', photo)
    page.wait_for_selector('.reveal', timeout=180000)
    page.wait_for_timeout(600)
    print('scrollWidth', page.evaluate('document.documentElement.scrollWidth'))
    print('count', page.inner_text('.reveal-count'), '| hint', page.inner_text('.reveal-hint'))
    page.screenshot(path='/home/claude/shots/t19_back.png')
    prices = []
    n = int(page.inner_text('.reveal-count').split('/')[1])
    for k in range(n):
        page.click('.reveal-stage'); page.wait_for_timeout(1300)
        prices.append(page.inner_text('.reveal-info').split('\n')[:2])
        if k == n - 1: page.screenshot(path='/home/claude/shots/t19_last.png')
        page.click('.reveal-stage'); page.wait_for_timeout(500)
    print('order (cheapest first):', prices)
    print('hits shown:', page.evaluate("window.__buzz"))
    print('summary:', page.inner_text('.reveal-stage').replace('\n', ' | '))
    page.click('.reveal'); page.wait_for_timeout(300)
    print('closed', page.locator('.reveal').count() == 0, '| reveal button', page.is_visible('#reveal-btn'))
    b.close()
