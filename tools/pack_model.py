#!/usr/bin/env python3
"""Pack a trained recogniser for the app (models/ygo/).

In:  model.onnx, fingerprints.bin (float16, one row per artwork), cards.json  (from training)
Out: model.onnx, fingerprints.i8 (int8, ~half the size), cards.json (compact name lists)
"""
import argparse, json, os, shutil
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("--src", required=True)
ap.add_argument("--out", default="models/ygo")
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)

meta = json.load(open(os.path.join(a.src, "cards.json"), encoding="utf-8"))
E = np.fromfile(os.path.join(a.src, "fingerprints.bin"), dtype=np.float16).astype(np.float32)
E = E.reshape(meta["count"], meta["dim"])
# drop placeholder artworks (cards without a real picture yet)
keep = [i for i, art in enumerate(meta["artworks"]) if art["name"].strip("? ")]
E = E[keep]
meta["artworks"] = [meta["artworks"][i] for i in keep]
meta["count"] = len(keep)
m = float(np.abs(E).max())
Q = np.clip(np.round(E / m * 127), -127, 127).astype(np.int8)
Q.tofile(os.path.join(a.out, "fingerprints.i8"))

names, name_idx, index = [], [], {}
for art in meta["artworks"]:
    n = art["name"]
    if n not in index:
        index[n] = len(names)
        names.append(n)
    name_idx.append(index[n])
json.dump({"model": meta.get("model"), "dim": meta["dim"], "count": meta["count"], "scale": m / 127,
           "ids": [art["id"] for art in meta["artworks"]], "names": names, "nameIdx": name_idx},
          open(os.path.join(a.out, "cards.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
shutil.copy(os.path.join(a.src, "model.onnx"), os.path.join(a.out, "model.onnx"))

# quick self-check: quantised fingerprints rank like the originals
q = Q[:200].astype(np.float32) * (m / 127)
agree = (np.argmax(q @ E[:200].T, 1) == np.arange(200)).mean()
print(f"packed {meta['count']} artworks, dim {meta['dim']}, self-match {agree:.0%}")
for f in os.listdir(a.out):
    print(f"  {f}: {os.path.getsize(os.path.join(a.out, f)) / 1e6:.1f} MB")
