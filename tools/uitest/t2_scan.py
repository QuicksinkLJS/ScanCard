import sys, json; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
photo = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/photos/0bdf9c29-image.jpg'
packset = sys.argv[2] if len(sys.argv) > 2 else None
with sync_playwright() as p:
    b, page = open_app(p)
    if packset:
        page.evaluate("(n) => window.cardscan.api.sets().then(s => { const x = s.find(r => r.name === n); window.cardscan.setPack({prefix: x.prefix, name: x.name, year: x.year}); })", packset)
    page.set_input_files('#gallery', photo)
    page.wait_for_selector('#found li', timeout=180000)
    page.wait_for_timeout(15000)  # let OCR finish
    print(page.inner_text('#scan-result')[:1500])
    page.screenshot(path='/home/claude/shots/t2_scan.png', full_page=True)
    b.close()
