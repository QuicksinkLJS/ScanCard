# Reading the card's name (and effect text) after the picture: which cards it confirms or corrects.
import sys, json; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
photo = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/photos/49e0e9fa-image.jpg'
with sync_playwright() as p:
    b, page = open_app(p)
    page.set_input_files('#gallery', photo)
    page.wait_for_selector('#found li', timeout=180000)
    # wait until every card was read (or 150 s)
    for _ in range(75):
        page.wait_for_timeout(2000)
        st = page.evaluate("window.cardscan.scanner.cards().map(c => [c.codeStatus, !!c.readBy, c.nameText != null])")
        if all(s[0] in ('done', 'none') for s in st) and all(s[2] or s[1] for s in st): break
    rows = page.evaluate("""window.cardscan.scanner.cards().map(c => ({name: c.name, top: (c.top||[]).slice(0,4).map(t => t.name).join(" / "), from: c.readFrom || '', by: c.readBy || '', sure: c.confident,
        lang: c.language?.code || '', code: c.code?.code || '', text: (c.nameText || '').replace(/\\n/g, ' / ').slice(0, 60)}))""")
    for r in rows: print(json.dumps(r, ensure_ascii=False))
    page.screenshot(path='/home/claude/shots/t33.png', full_page=True)
    b.close()
