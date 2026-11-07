# Collector quartet: my collection vs a friend's (friend stored as from a QR code). Pick all categories,
# values flip, score adds up, verdict, play again, back closes only the quartet; German.
import sys, json, time; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
FRIEND = {'id': 'f-max', 'name': 'Max', 'nick': False, 'at': 0, 'snap': {
    'v': 1, 'g': 'ygo', 'id': 'f-max', 'n': 'Max', 't': int(time.time() * 1000),
    'c': [['Dark Magician', 0, 3, '', 'DE'], ['Kuriboh', 0, 5, '', 'EN'], ['Exodia the Forbidden One', 0, 1, '', 'JP']],
    'w': [], 'm': [], 'o': {}, 'd': []}}

def setup(page):
    page.evaluate("f => localStorage.setItem('cardscan-friends-v1', JSON.stringify([f]))", FRIEND)

with sync_playwright() as p:
    b, page = open_app(p)
    # my collection: one Blue-Eyes (exact version)
    open_card(page, 'Blue-Eyes White Dragon')
    page.click("#card-body .versions button:has-text('RA05-EN')"); page.wait_for_timeout(300)
    page.click('#card-add'); page.wait_for_timeout(500); page.go_back(); page.wait_for_timeout(300)
    setup(page); page.reload(); page.wait_for_timeout(900)
    page.click('nav.tabs button[data-view=collection]'); page.wait_for_timeout(400)
    page.click('[data-ctab=friends]'); page.wait_for_timeout(800)
    page.click('#friends-list button[data-id=f-max]'); page.wait_for_selector('#fr-quartet')
    page.click('#fr-quartet')
    page.wait_for_selector('#qt-table .qt-card.me button.qt-row', timeout=30000)
    print('score:', page.inner_text('#qt-score'), '| hint:', page.inner_text('#qt-hint'))
    them = page.locator('.qt-card.them .qt-v').all_inner_texts()
    assert all(v == '?' for v in them), them
    mine = page.locator('.qt-card.me .qt-row').all_inner_texts()
    print('my card:', [m.replace('\n', ' ') for m in mine])
    assert 'Cards' in mine[2] and '1' in mine[2]
    page.click('.qt-card.me button.qt-row[data-k=cards]'); page.wait_for_timeout(200)
    row = page.locator('.qt-card.them .qt-row').nth(2)
    print('their cards:', row.inner_text().replace('\n', ' '), '| class', row.get_attribute('class'))
    assert '9' in row.inner_text() and 'win' in row.get_attribute('class')
    assert 'lose' in page.locator('.qt-card.me .qt-row').nth(2).get_attribute('class')
    for k in ['value', 'top', 'shiny', 'oldest', 'langs', 'master']:
        page.click(f'.qt-card.me button.qt-row[data-k={k}]'); page.wait_for_timeout(120)
    page.wait_for_timeout(500)
    verdict = page.inner_text('#qt-verdict')
    print('final:', page.inner_text('#qt-score').replace('\n', ' '), '|', verdict)
    print('their card:', [m.replace('\n', ' ') for m in page.locator('.qt-card.them .qt-row').all_inner_texts()])
    assert verdict and page.locator('#qt-again').is_visible()
    assert page.locator('.qt-card.me button.qt-row:not([disabled])').count() == 0
    page.screenshot(path='/home/claude/shots/t42_quartet.png')
    page.click('#qt-again'); page.wait_for_timeout(200)
    assert page.locator('.qt-card.them .qt-v').all_inner_texts().count('?') == 7
    page.go_back(); page.wait_for_timeout(300)
    assert page.locator('#quartet-page').is_hidden() and page.locator('#friend-page').is_visible(), 'back closed more than the quartet'
    # German
    page.evaluate("localStorage.setItem('cardscan-lang','de')"); page.reload(); page.wait_for_timeout(1200)
    page.click('nav.tabs button[data-view=collection]'); page.wait_for_timeout(400)
    page.click('[data-ctab=friends]'); page.wait_for_timeout(800)
    page.click('#friends-list button[data-id=f-max]'); page.wait_for_selector('#fr-quartet')
    print('DE button:', page.inner_text('#fr-quartet'))
    assert 'Sammler-Quartett gegen Max' in page.inner_text('#fr-quartet')
    page.click('#fr-quartet'); page.wait_for_selector('#qt-table .qt-card.me button.qt-row', timeout=30000)
    de = page.inner_text('#quartet-page')
    print('DE:', de.replace('\n', ' | ')[:300])
    assert 'Sammlungswert' in de and 'Wähle eine Kategorie' in de
    page.evaluate("localStorage.setItem('cardscan-lang','en')")
    b.close()
print('t42 ok')
