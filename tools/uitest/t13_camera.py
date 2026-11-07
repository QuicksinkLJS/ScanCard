# Camera: the shot must show the picture (with scan animation) at once, no black wait.
import sys, time; sys.path.insert(0, __import__('os').path.dirname(__file__))
from harness import *
with sync_playwright() as p:
    b, page = open_app(p, args=['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'])
    page.context.grant_permissions(['camera'])
    page.click('#scan')
    page.wait_for_function("document.getElementById('cam-video').videoWidth > 0", timeout=15000)
    print('video', page.evaluate("[document.getElementById('cam-video').videoWidth, document.getElementById('cam-video').videoHeight]"))
    page.wait_for_timeout(6000)  # models warm up while aiming
    page.evaluate("window.__seen = 0; document.getElementById('cam-shot').addEventListener('click', () => { window.__t0 = performance.now(); }, true); new MutationObserver(() => { const w = document.querySelector('#scan-result .photo-wrap'); if (!document.getElementById('scan-result').hidden && w.classList.contains('scanning') && !window.__seen) window.__seen = performance.now(); }).observe(document.body, {subtree: true, attributes: true})")
    t = time.time()
    page.click('#cam-shot')
    page.wait_for_function("!document.getElementById('scan-result').hidden", timeout=10000)
    print('picture shown after %.2fs' % (time.time() - t))
    print('in page: picture + scan animation after %d ms' % page.evaluate('window.__seen - window.__t0')); print('cam hidden', page.evaluate("document.getElementById('cam').hidden"))
    page.wait_for_timeout(4000)
    print('photo canvas', page.evaluate("[document.getElementById('photo').width, document.getElementById('photo').height]"))
    page.screenshot(path='/home/claude/shots/t13_camera.png')
    b.close()
