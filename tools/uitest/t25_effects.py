# Big moment switch, vibration once per photo (bulk), top 5 as holo cards with official pictures, jackpot overlay.
import sys; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
photo = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/photos/26105fc4-image.jpg'
with sync_playwright() as p:
    b, page = open_app(p)
    page.evaluate("window.__vib = []; navigator.vibrate = (x) => { window.__vib.push(JSON.stringify(x)); return true; }")
    # switch in More
    page.click('nav.tabs button[data-view=more]')
    print('big moment on by default:', page.get_attribute('#bigmoment-seg [data-v=on]', 'class'))
    page.click('#bigmoment-seg [data-v=off]'); print('stored:', page.evaluate("localStorage.getItem('cardscan-bigmoment')"))
    page.click('#bigmoment-seg [data-v=on]'); print('stored:', page.evaluate("localStorage.getItem('cardscan-bigmoment')"))
    # bulk photo: hits buzz once
    page.click('nav.tabs button[data-view=scan]')
    page.set_input_files('#gallery', photo)
    page.wait_for_selector('#found li', timeout=180000); page.wait_for_timeout(12000)
    print('cards', page.locator('#found li').count(), '| hits', page.locator('#found button.hit-glow').count(), '| prices', page.locator('#found .eur').all_inner_texts()[:9])
    print('vibrations:', page.evaluate('window.__vib'))
    print('jackpot shown:', page.evaluate("!!document.querySelector('#jackpot.show')"), page.evaluate("document.querySelector('#jackpot')?.innerText || ''").replace('\n', ' | '))
    page.screenshot(path='/home/claude/shots/t25_jackpot.png')
    page.wait_for_timeout(4000)
    print('jackpot gone:', not page.evaluate("!!document.querySelector('#jackpot.show')"))
    # add all, collection top 5
    if page.is_visible('#add-all'): page.click('#add-all'); page.wait_for_timeout(1000)
    page.click('nav.tabs button[data-view=collection]'); page.wait_for_timeout(1500)
    print('top holo cards:', page.locator('#coll-top .topholo .holo-card').count(), '| list pics:', page.locator('#coll-list img.thumb').count())
    print('pictures official:', page.evaluate("[...document.querySelectorAll('#coll-list img.thumb')].map(i => i.src.includes('cardtrader') ? 'official' : 'photo')"))
    page.screenshot(path='/home/claude/shots/t25_collection.png')
    b.close()
