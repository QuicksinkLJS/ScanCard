import sys; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
with sync_playwright() as p:
    b, page = open_app(p)
    page.set_input_files('#gallery', '/home/claude/photos/414d4e04-image.jpg')
    page.wait_for_selector('#found li', timeout=180000); page.wait_for_timeout(1000)
    page.click('#sort-piles'); page.wait_for_timeout(300)
    print(page.inner_text('#pile-sum')); print(page.inner_text('#found')[:400])
    page.locator('#scan-result').screenshot(path='/home/claude/shots/t10.png')
    b.close()
