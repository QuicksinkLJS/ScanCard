# Recognition benchmark: labelled photos (testdaten/erkennung + labels.json) and unlabelled photos (testdaten/fotos).
# Usage: python3 t14_recog_eval.py <erkennung dir> [fotos dir] [recogniser options as JSON]
import sys, json, os, base64; sys.path.insert(0, os.path.dirname(__file__))
from harness import *
lab_dir = sys.argv[1]
foto_dir = sys.argv[2] if len(sys.argv) > 2 else None
opts = sys.argv[3] if len(sys.argv) > 3 else '{}'
labels = json.load(open(os.path.join(lab_dir, 'labels.json')))
JS = """async ([b64, opts]) => {
  const { createRecognizer } = await import('/js/recognize.js');
  const { createDetector, cutCard } = await import('/js/detect.js');
  const { cardsFromPhoto } = await import('/js/camera.js');
  window.__r = window.__r || {};
  const key = JSON.stringify(opts);
  window.__r[key] = window.__r[key] || createRecognizer(opts);
  window.__d = window.__d || createDetector();
  const rec = window.__r[key], det = window.__d;
  const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
  let found = [];
  try { found = (await det.find(img)).map((b) => ({ canvas: cutCard(img, b), box: b, src: img })); } catch (e) {}
  let res;
  if (found.length) {
    res = await rec.identifyMany(found.map((f) => f.canvas));
    // the app's closer look at unsure cards
    for (const shrink of [0.9, 0.8]) {
      const idx = res.map((r, i) => i).filter((i) => !res[i].confident);
      if (!idx.length) break;
      const tries = idx.map((i) => cutCard(img, { ...found[i].box, w: found[i].box.w * shrink, h: found[i].box.h * shrink }));
      const more = await rec.identifyMany(tries);
      idx.forEach((i, k) => { if (more[k].top[0].score > res[i].top[0].score + 0.02) res[i] = more[k]; });
    }
  } else {
    const c = cardsFromPhoto(img);
    const r = await rec.identifyMany(c.map((x) => x.canvas));
    res = [r[0].top[0].score >= r[1].top[0].score ? r[0] : r[1]];
  }
  return { n: found.length, cards: res.map((r) => ({ confident: r.confident, top: r.top.slice(0, 5).map((t) => [t.name, Math.round(t.score * 1000) / 1000]) })) };
}"""
def run(page, path):
    return page.evaluate(JS, [base64.b64encode(open(path, 'rb').read()).decode(), json.loads(opts)])
with sync_playwright() as p:
    b, page = open_app(p)
    hit1 = hit3 = conf_right = conf_wrong = 0
    for l in labels:
        r = run(page, os.path.join(lab_dir, l['file']))
        # the card that is the expected one (multi-card photos: any card)
        best = None
        for c in r['cards']:
            names = [t[0] for t in c['top']]
            if l['expected'] in names:
                rank = names.index(l['expected'])
                if best is None or rank < best[0]: best = (rank, c)
        if best is None: best = (99, r['cards'][0])
        rank, c = best
        hit1 += rank == 0; hit3 += rank < 3
        if c['confident']: conf_right += rank == 0; conf_wrong += rank != 0
        mark = 'OK ' if rank == 0 else ('top%d' % (rank + 1) if rank < 99 else 'MISS')
        print(f"{l['file']} {mark:5} conf={str(c['confident'])[0]} found={r['n']} {l['expected'][:28]:28} -> {c['top'][0][0][:28]} {c['top'][0][1]} | 2nd {c['top'][1][1]}")
    print(f"LABELLED top1 {hit1}/{len(labels)} top3 {hit3}/{len(labels)} confident-right {conf_right} confident-WRONG {conf_wrong}")
    if foto_dir:
        tot = conf = 0
        for f in sorted(os.listdir(foto_dir)):
            r = run(page, os.path.join(foto_dir, f))
            tot += len(r['cards']); conf += sum(c['confident'] for c in r['cards'])
            print(f, r['n'], ' | '.join(f"{c['top'][0][0][:22]} {c['top'][0][1]}{'' if c['confident'] else '?'}" for c in r['cards']))
        print(f"FOTOS cards {tot} confident {conf}")
    b.close()
