# Life story of a card: added → version → your copy → own moments (tag + text), remove with undo,
# old entries without a story, German.
import sys, json; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
with sync_playwright() as p:
    b, page = open_app(p)
    open_card(page, 'Blue-Eyes White Dragon')
    page.click("#card-body .versions button:has-text('RA05-EN')"); page.wait_for_timeout(300)
    page.click('#card-add'); page.wait_for_timeout(500); page.go_back(); page.wait_for_timeout(300)
    page.click('nav.tabs button[data-view=collection]'); page.wait_for_timeout(800)
    page.click('#coll-list button >> nth=0'); page.wait_for_timeout(900)
    assert page.locator('#story').count() == 1, 'no story box'
    page.click('#story summary'); page.wait_for_timeout(150)
    lines = page.locator('#story .story li').all_inner_texts()
    print('start:', [l.replace('\n', ' / ') for l in lines])
    assert 'Came into your collection' in lines[0] and 'Version:' in lines[1] and 'Today: worth' in lines[-1], lines
    # your copy → a moment
    page.click('#copy-own summary'); page.select_option('#own-cond', 'NM'); page.wait_for_timeout(250)
    # own moment: tag + text
    page.click('.st-tag[data-tag=pulled]')
    page.fill('#story-text', 'Pulled at the Regional with Max')
    page.click('#story-form button[type=submit]'); page.wait_for_timeout(300)
    assert page.evaluate("document.getElementById('story').open"), 'story box closed after adding'
    lines = page.locator('#story .story li').all_inner_texts()
    print('after:', [l.replace('\n', ' / ') for l in lines])
    assert any('Your copy: NM' in l for l in lines)
    assert any('Pulled at the Regional with Max' in l and 'Pulled it myself' in l for l in lines)
    e = json.loads(page.evaluate("localStorage.getItem('cardscan-collection-v1')"))[0]
    print('stored life:', e['life'])
    assert [x['k'] for x in e['life']] == ['add', 'ver', 'copy', 'note']
    page.locator('#story').scroll_into_view_if_needed(); page.screenshot(path='/home/claude/shots/t41_story.png')
    # remove + undo
    page.click('#story .st-del'); page.wait_for_timeout(250)
    assert not any('Regional' in l for l in page.locator('#story .story li').all_inner_texts())
    page.click('#toast button'); page.wait_for_timeout(300)
    assert any('Regional' in l for l in page.locator('#story .story li').all_inner_texts()), 'undo did not bring it back'
    # an old entry without a story (as the live app saved it before)
    page.evaluate("""() => { const l = JSON.parse(localStorage.getItem('cardscan-collection-v1'));
      const old = { ...l[0], id: 'old1', added: Date.now() - 400 * 864e5, life: undefined }; delete old.life; l.push(old);
      localStorage.setItem('cardscan-collection-v1', JSON.stringify(l)); }""")
    page.go_back(); page.wait_for_timeout(300)
    page.reload(); page.wait_for_timeout(900)
    page.click('nav.tabs button[data-view=collection]'); page.wait_for_timeout(800)
    rows = page.locator('#coll-list li').count()
    page.locator('#coll-list button').nth(rows - 1).click(); page.wait_for_timeout(900)
    page.click('#story summary'); page.wait_for_timeout(150)
    lines = page.locator('#story .story li').all_inner_texts()
    print('old entry:', [l.replace('\n', ' / ') for l in lines])
    assert 'Came into your collection' in lines[0] and 'with you for 1 year' in lines[-1], lines
    # German
    page.evaluate("localStorage.setItem('cardscan-lang','de')"); page.reload(); page.wait_for_timeout(1200)
    page.click('nav.tabs button[data-view=collection]'); page.wait_for_timeout(600)
    page.click('#coll-list button >> nth=0'); page.wait_for_timeout(900); page.click('#story summary'); page.wait_for_timeout(200)
    de = page.inner_text('#story')
    print('DE:', de.replace('\n', ' | ')[:400])
    assert 'Lebenslauf dieser Karte' in de and 'In deine Sammlung gekommen' in de and 'Selbst gezogen' in de
    page.evaluate("localStorage.setItem('cardscan-lang','en')")
    b.close()
print('t41 ok')
