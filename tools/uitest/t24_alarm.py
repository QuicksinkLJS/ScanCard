# Scan result: cards on the wishlist / missing in a tracked masterset are marked; offline band.
import sys; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
with sync_playwright() as p:
    b, page = open_app(p)
    page.evaluate("localStorage.setItem('cardscan-wish-v1', JSON.stringify([{id:'w1', name:'Number 39: Utopia', vkey:null, target: 100, at: 1, date: Date.now()}]))")
    page.evaluate("window.cardscan.api.expansions().then(x => { const e = x.find(r => /Original Artwork/.test(r.name)); localStorage.setItem('cardscan-masters-v1', JSON.stringify([{exp: e.exp, name: e.name, target: 1}])); })")
    page.wait_for_timeout(500)
    page.set_input_files('#gallery', '/home/claude/photos/49e0e9fa-image.jpg')
    page.wait_for_selector('#found li', timeout=180000); page.wait_for_timeout(2500)
    print([t for t in page.locator('#found .alarm').all_inner_texts()])
    page.locator('#found .alarm').first.scroll_into_view_if_needed(); page.screenshot(path='/home/claude/shots/t24_alarm.png')
    print('band hidden online:', page.is_hidden('.offline-band'))
    page.context.set_offline(True); page.wait_for_timeout(300)
    print('band visible offline:', page.is_visible('.offline-band'), page.inner_text('.offline-band'))
    page.context.set_offline(False); page.wait_for_timeout(300)
    print('band hidden again:', page.is_hidden('.offline-band'), '| toast', page.inner_text('#toast'))
    b.close()
