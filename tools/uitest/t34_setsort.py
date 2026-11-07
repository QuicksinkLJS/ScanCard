# Set view: sort by set number, value, name, rarity, missing first – list and binder, kept per set.
import sys; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
with sync_playwright() as p:
    b, page = open_app(p)
    page.evaluate("window.cardscan.api.expansions().then(x => { const e = x.find(r => /Original Artwork/.test(r.name)); localStorage.setItem('cardscan-masters-v1', JSON.stringify([{exp: e.exp, name: e.name, target: 1}])); })")
    page.reload(); page.wait_for_timeout(1200)
    page.click('nav.tabs button[data-view=collection]'); page.click('[data-ctab=masters]'); page.wait_for_timeout(1500)
    page.click('#masters-list button >> nth=0'); page.wait_for_selector('#set-sort', timeout=20000)
    page.click('[data-f=all]'); page.wait_for_timeout(300)
    for k in ['number', 'value', 'value-asc', 'name', 'rarity', 'missing']:
        page.select_option('#set-sort', k); page.wait_for_timeout(400)
        rows = page.locator('#set-body .mlist li').all_inner_texts()[:3]
        print(f'{k:10}', ' || '.join(r.replace('\n', ' ')[:55] for r in rows))
    page.select_option('#set-sort', 'value'); page.wait_for_timeout(300)
    page.click('[data-v=binder]'); page.wait_for_timeout(800)
    print('binder first pockets:', page.evaluate("[...document.querySelectorAll('#binder .bpage:first-child .pocket[data-key]')].slice(0,3).map(p => p.title)"))
    page.screenshot(path='/home/claude/shots/t34_binder.png')
    page.go_back(); page.wait_for_timeout(300); page.click('#masters-list button >> nth=0'); page.wait_for_selector('#set-sort')
    print('kept:', page.eval_on_selector('#set-sort', 'e => e.value'))
    page.click('[data-v=list]'); page.wait_for_timeout(300)
    page.locator('#set-sort').scroll_into_view_if_needed(); page.screenshot(path='/home/claude/shots/t34_list.png')
    b.close()
