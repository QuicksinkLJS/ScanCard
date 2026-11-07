import sys; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
photo = sys.argv[1]
with sync_playwright() as p:
    b, page = open_app(p, mobile=False)
    page.set_input_files('#gallery', photo)
    page.wait_for_selector('#found li', timeout=180000)
    page.wait_for_timeout(12000)
    print(page.inner_text('#found')[:800])
    with page.expect_download() as d:
        page.click('#share-pulls')
    d.value.save_as('/home/claude/shots/t4_pulls.png')
    b.close()
