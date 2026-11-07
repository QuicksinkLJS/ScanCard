# Shared Playwright helpers for CardScan UI tests.
import re, os, mimetypes
from playwright.sync_api import sync_playwright

LIBS = '/home/claude/libs/node_modules'
URL = 'http://localhost:8765/'

def route_cdn(route):
    u = route.request.url
    m = re.match(r'https://cdn\.jsdelivr\.net/npm/((?:@[^/]+/)?[^@/]+)(?:@[^/]+)?/(.*)', u)
    if m:
        path = os.path.join(LIBS, m.group(1), m.group(2).split('?')[0])
        if os.path.isfile(path):
            ct = mimetypes.guess_type(path)[0] or 'application/octet-stream'
            if path.endswith('.mjs') or path.endswith('.js'): ct = 'application/javascript'
            if path.endswith('.wasm'): ct = 'application/wasm'
            return route.fulfill(path=path, content_type=ct, headers={'Access-Control-Allow-Origin': '*'})
        print('missing lib', path)
    return route.abort()

def open_app(p, args=(), mobile=True):
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--no-sandbox', *args])
    ctx = b.new_context(viewport={'width': 412, 'height': 900}, device_scale_factor=2, is_mobile=mobile, has_touch=mobile)
    page = ctx.new_page()
    page.on('console', lambda m: m.type in ('error', 'warning') and print('console', m.type, m.text[:300]))
    page.on('pageerror', lambda e: print('PAGEERROR', e))
    page.route(re.compile(r'https://cdn\.jsdelivr\.net/.*'), route_cdn)
    page.route(re.compile(r'https://(www\.)?cardtrader\.com/.*'), lambda r: r.fulfill(path='/home/claude/photos/card.jpg', content_type='image/jpeg'))
    page.goto(URL)
    page.wait_for_timeout(800)
    return b, page

def open_card(page, name):
    page.click('nav.tabs button[data-view=more]')
    page.fill('#name-search', name)
    page.wait_for_selector('#name-results button')
    page.click(f'#name-results button[data-name="{name}"]')
    page.wait_for_selector('#card-body .versions, #card-body .pricebox')
    page.wait_for_timeout(300)
