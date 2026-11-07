#!/usr/bin/env python3
"""Extra artwork fingerprints from CardTrader pictures.

YGOPRODeck has no pictures of some artworks – above all the manga-style artworks of
Original Artwork Collection (YAC1, OCG) – so the app cannot recognise those cards by their picture.
CardTrader has a picture of every printing. This takes the pictures of the chosen expansions,
cuts the artwork out exactly like the app does with a photo (ART_BOX in js/recognize.js, light evened
out like evenLight()), and computes the fingerprints with the app's own model (models/ygo/model.onnx).

Out (next to the app's fingerprints, same int8 scale):
  extra.i8    int8 matrix, one row per artwork
  extra.json  {count, dim, names: [...], ids: [CardTrader blueprint ids], codes: [...], date}

Usage: python tools/build_extra_fingerprints.py --cardtrader work/cardtrader_ygo.json.gz --codes yac1
"""
import argparse, gzip, json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import numpy as np
from PIL import Image

SIZE = 224
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
ART_BOX = (0.115, 0.18, 0.885, 0.705)  # x0, y0, x1, y1 – keep in step with js/recognize.js


def even_light(a):
    """Port of evenLight() in js/recognize.js (a: HxWx3 uint8)."""
    a = a.astype(np.float32)
    r, g, b = a[..., 0].sum(), a[..., 1].sum(), a[..., 2].sum()
    grey = (r + g + b) / 3
    k = [1 + 0.5 * (grey / max(1.0, v) - 1) for v in (r, g, b)]
    lum = ((a[..., 0] * 77 + a[..., 1] * 150 + a[..., 2] * 29) / 256).astype(np.int32)
    hist = np.bincount(lum.ravel(), minlength=256)
    n = lum.size
    cum = np.cumsum(hist)
    lo = int(np.searchsorted(cum, n * 0.01))
    cum_hi = np.cumsum(hist[::-1])
    hi = 255 - int(np.searchsorted(cum_hi, n * 0.01))
    span = max(hi - lo, 128)
    mid = (hi + lo) / 2
    out = np.empty_like(a)
    for ch in range(3):
        out[..., ch] = (np.floor(a[..., ch]) * k[ch] - mid) * (255 / span) + 127.5
    return np.clip(np.round(out), 0, 255).astype(np.uint8)


def artwork(path):
    img = Image.open(path).convert("RGB")
    W, H = img.size
    x0, y0, x1, y1 = ART_BOX
    crop = img.crop((round(x0 * W), round(y0 * H), round(x1 * W), round(y1 * H))).resize((SIZE, SIZE), Image.BILINEAR)
    a = even_light(np.asarray(crop))
    x = (a.astype(np.float32) / 255.0 - MEAN) / STD
    return x.transpose(2, 0, 1)


def download(jobs, rate=4):
    def fetch(job):
        url, path = job
        if os.path.exists(path) and os.path.getsize(path) > 1000:
            return True
        for attempt in range(3):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "CardScan fingerprint builder"})
                with urllib.request.urlopen(req, timeout=30) as r, open(path, "wb") as f:
                    f.write(r.read())
                return True
            except Exception as e:
                last = e
                time.sleep(2 * (attempt + 1))
        print("  failed", url, last, flush=True)
        return False
    ok = 0
    with ThreadPoolExecutor(max_workers=rate) as pool:
        for i in range(0, len(jobs), rate):
            t = time.time()
            ok += sum(pool.map(fetch, jobs[i:i + rate]))
            time.sleep(max(0, 1.0 - (time.time() - t)))
    print(f"pictures: {ok}/{len(jobs)}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cardtrader", required=True, help="tools/fetch_cardtrader.py output")
    ap.add_argument("--codes", default="yac1", help="CardTrader expansion codes, comma separated")
    ap.add_argument("--model", default="models/ygo/model.onnx")
    ap.add_argument("--meta", default="models/ygo/cards.json")
    ap.add_argument("--images", default="work/ct")
    ap.add_argument("--out", default="models/ygo")
    ap.add_argument("--local", help="testing: use the pictures in this folder instead of downloading")
    a = ap.parse_args()

    ct = json.load(gzip.open(a.cardtrader))
    codes = [c.strip().lower() for c in a.codes.split(",") if c.strip()]
    exps = {e["id"]: e for e in ct["expansions"] if str(e.get("code", "")).lower() in codes}
    print("expansions:", ", ".join(f"{e['code']} {e['name']}" for e in exps.values()), flush=True)
    # one picture per artwork: same name + collector number = same artwork (only the foil differs)
    seen, items = set(), []
    for b in ct["blueprints"]:
        if b.get("e") not in exps or b.get("c") != 44 or not b.get("img"):
            continue
        key = (b["n"], (b.get("fp") or {}).get("collector_number"), exps[b["e"]]["code"])
        if key in seen:
            continue
        seen.add(key)
        url = b["img"].replace("/preview_", "/show_")
        items.append({"id": b["id"], "name": b["n"], "url": url, "path": os.path.join(a.images, f"{b['id']}{os.path.splitext(url)[1] or '.jpg'}")})
    print(f"{len(items)} artworks", flush=True)
    os.makedirs(a.images, exist_ok=True)
    if a.local:
        pics = sorted(os.listdir(a.local))
        for i, it in enumerate(items):
            it["path"] = os.path.join(a.local, pics[i % len(pics)])
    else:
        download([(it["url"], it["path"]) for it in items])
    items = [it for it in items if os.path.exists(it["path"])]

    import onnxruntime as ort
    sess = ort.InferenceSession(a.model, providers=["CPUExecutionProvider"])
    meta = json.load(open(a.meta, encoding="utf-8"))
    scale = meta["scale"]
    rows, keep = [], []
    for i in range(0, len(items), 16):
        part = items[i:i + 16]
        xs = []
        for it in part:
            try:
                xs.append(artwork(it["path"]))
                keep.append(it)
            except Exception as e:
                print("  bad picture", it["path"], e, flush=True)
        if xs:
            rows.append(sess.run(["embedding"], {"pixel_values": np.stack(xs)})[0])
        print(f"  {min(i + 16, len(items))}/{len(items)}", flush=True)
    E = np.concatenate(rows).astype(np.float32) if rows else np.zeros((0, meta["dim"]), np.float32)
    Q = np.clip(np.round(E / scale), -127, 127).astype(np.int8)
    os.makedirs(a.out, exist_ok=True)
    Q.tofile(os.path.join(a.out, "extra.i8"))
    json.dump({"count": len(keep), "dim": int(meta["dim"]), "names": [it["name"] for it in keep], "ids": [it["id"] for it in keep],
               "codes": codes, "date": datetime.now(timezone.utc).strftime("%Y-%m-%d")},
              open(os.path.join(a.out, "extra.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    # self-check: each extra row is closest to itself
    if len(Q) > 1:
        q = Q.astype(np.float32) * scale
        print(f"self-match {(np.argmax(q @ E.T, 1) == np.arange(len(E))).mean():.0%}", flush=True)
    print(f"done: {len(keep)} extra fingerprints", flush=True)


if __name__ == "__main__":
    sys.exit(main())
