#!/usr/bin/env python3
"""Artwork fingerprints for card recognition.

For every card artwork (including alternate arts) this computes a fingerprint: a list of
384 numbers from the DINOv2-small image model that describes what the picture looks like.
Similar pictures get similar numbers, so the app can find a card by comparing the artwork
in a photo with all fingerprints.

Outputs (in --out):
  model.onnx          image model for the app (8-bit, ~25 MB)
  fingerprints.bin    float16 matrix, one row per artwork
  cards.json          which artwork row belongs to which card (name, YGOPRODeck id)
"""
import argparse, json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image

MODEL_ID = "facebook/dinov2-small"
SIZE = 224
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def preprocess(img):
    img = img.convert("RGB").resize((SIZE, SIZE), Image.BICUBIC)
    x = (np.asarray(img, dtype=np.float32) / 255.0 - MEAN) / STD
    return x.transpose(2, 0, 1)


def download_images(cardinfo, img_dir, rate=15):
    os.makedirs(img_dir, exist_ok=True)
    jobs = []
    for card in cardinfo["data"]:
        for im in card.get("card_images") or []:
            path = os.path.join(img_dir, f"{im['id']}.jpg")
            if not os.path.exists(path):
                jobs.append((im["image_url_cropped"], path))
    print(f"{len(jobs)} artworks to download (others cached)", flush=True)

    def fetch(job):
        url, path = job
        for attempt in range(3):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "CardScan fingerprint builder"})
                with urllib.request.urlopen(req, timeout=30) as r, open(path, "wb") as f:
                    f.write(r.read())
                return True
            except Exception:
                time.sleep(2 * (attempt + 1))
        return False

    ok = 0
    # stay well under YGOPRODeck's 20 requests/second limit
    with ThreadPoolExecutor(max_workers=4) as pool:
        for i in range(0, len(jobs), rate):
            t = time.time()
            ok += sum(pool.map(fetch, jobs[i:i + rate]))
            time.sleep(max(0, 1.05 - (time.time() - t)))
            if i % 1500 == 0:
                print(f"  {i}/{len(jobs)}", flush=True)
    print(f"downloaded {ok}/{len(jobs)}", flush=True)


def export_model(out_dir):
    import torch
    from transformers import AutoModel
    from onnxruntime.quantization import quantize_dynamic, QuantType

    model = AutoModel.from_pretrained(MODEL_ID).eval()

    class Wrap(torch.nn.Module):
        def __init__(self, m):
            super().__init__()
            self.m = m

        def forward(self, pixel_values):
            out = self.m(pixel_values=pixel_values).last_hidden_state
            # CLS token + mean of patch tokens, then L2-normalised
            emb = torch.cat([out[:, 0], out[:, 1:].mean(1)], dim=1)
            return emb / emb.norm(dim=1, keepdim=True)

    wrap = Wrap(model).eval()
    fp32 = os.path.join(out_dir, "model_fp32.onnx")
    torch.onnx.export(wrap, torch.zeros(1, 3, SIZE, SIZE), fp32, input_names=["pixel_values"],
                      output_names=["embedding"], dynamic_axes={"pixel_values": {0: "batch"}, "embedding": {0: "batch"}},
                      opset_version=17)
    quantize_dynamic(fp32, os.path.join(out_dir, "model.onnx"), weight_type=QuantType.QUInt8)
    os.remove(fp32)
    return wrap


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cardinfo", required=True)
    ap.add_argument("--images", default="work/art")
    ap.add_argument("--out", default="assets")
    ap.add_argument("--batch", type=int, default=64)
    a = ap.parse_args()

    import torch
    cardinfo = json.load(open(a.cardinfo, encoding="utf-8"))
    download_images(cardinfo, a.images)
    os.makedirs(a.out, exist_ok=True)
    model = export_model(a.out)

    rows, meta = [], []
    for card in cardinfo["data"]:
        for im in card.get("card_images") or []:
            path = os.path.join(a.images, f"{im['id']}.jpg")
            if os.path.exists(path):
                rows.append(path)
                meta.append({"id": im["id"], "card": card["id"], "name": card["name"]})
    print(f"computing {len(rows)} fingerprints", flush=True)

    embs = []
    with torch.no_grad():
        for i in range(0, len(rows), a.batch):
            batch = []
            for p in rows[i:i + a.batch]:
                try:
                    batch.append(preprocess(Image.open(p)))
                except Exception:
                    batch.append(np.zeros((3, SIZE, SIZE), dtype=np.float32))
            embs.append(model(torch.from_numpy(np.stack(batch))).numpy())
            if i % 1280 == 0:
                print(f"  {i}/{len(rows)}", flush=True)
    E = np.concatenate(embs).astype(np.float16)
    E.tofile(os.path.join(a.out, "fingerprints.bin"))
    json.dump({"model": MODEL_ID, "size": SIZE, "dim": int(E.shape[1]), "count": int(E.shape[0]),
               "artworks": meta}, open(os.path.join(a.out, "cards.json"), "w"), separators=(",", ":"))
    print(f"done: {E.shape}", flush=True)


if __name__ == "__main__":
    sys.exit(main())
