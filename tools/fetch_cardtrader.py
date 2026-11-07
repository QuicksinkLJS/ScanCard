#!/usr/bin/env python3
"""Download all Yu-Gi-Oh blueprints from the CardTrader API (needs CARDTRADER_TOKEN).

Writes a gzipped JSON: {"date", "expansions": [{id, code, name}], "blueprints": [...]}
Each blueprint keeps only what the app needs:
  {id, n: name, v: version, c: category_id, e: expansion_id, cm: [cardmarket ids], img, fp: fixed_properties}
Rate limit: 200 requests / 10 s for the whole API, we stay well below.
"""
import gzip, json, os, sys, time, urllib.request, urllib.error
from datetime import datetime, timezone

API = "https://api.cardtrader.com/api/v2"


def get(path, token, tries=5):
    for i in range(tries):
        req = urllib.request.Request(API + path, headers={"Authorization": f"Bearer {token}", "User-Agent": "CardScan-build"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                time.sleep(3 * (i + 1))
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            time.sleep(3 * (i + 1))
    raise RuntimeError(f"giving up on {path}")


def main():
    token = os.environ.get("CARDTRADER_TOKEN")
    out = sys.argv[1] if len(sys.argv) > 1 else "cardtrader_ygo.json.gz"
    if not token:
        print("CARDTRADER_TOKEN not set", file=sys.stderr)
        return 1
    games = get("/games", token)
    games = games.get("array", games) if isinstance(games, dict) else games
    ygo = next(g for g in games if "yu" in (g.get("name", "") + g.get("display_name", "")).lower())
    print("game", ygo)
    exps = [e for e in get("/expansions", token) if e.get("game_id") == ygo["id"]]
    print("expansions", len(exps))
    cats = {}
    try:
        for c in get(f"/categories?game_id={ygo['id']}", token):
            cats[c["id"]] = c.get("name")
    except Exception as e:  # optional
        print("categories failed", e)
    bps, sample = [], None
    t0 = time.time()
    for i, e in enumerate(exps):
        try:
            rows = get(f"/blueprints/export?expansion_id={e['id']}", token)
        except Exception as err:
            print("expansion failed", e["id"], err)
            continue
        for b in rows:
            if sample is None and b.get("card_market_ids"):
                sample = b
            cm = b.get("card_market_ids") or ([b["card_market_id"]] if b.get("card_market_id") else [])
            bps.append({"id": b["id"], "n": b.get("name"), "v": b.get("version"), "c": b.get("category_id"),
                        "e": b.get("expansion_id"), "cm": cm, "img": b.get("image_url") or (b.get("image") or {}).get("url"),
                        "fp": b.get("fixed_properties") or {}})
        if i % 100 == 0:
            print(f"{i}/{len(exps)} expansions, {len(bps)} blueprints, {time.time() - t0:.0f}s", flush=True)
        time.sleep(0.07)
    data = {"date": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "game": ygo, "categories": cats,
            "expansions": [{"id": e["id"], "code": e.get("code"), "name": e.get("name")} for e in exps],
            "blueprints": bps, "sample": sample}
    with gzip.open(out, "wt", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print("blueprints", len(bps), "with cardmarket ids", sum(1 for b in bps if b["cm"]))
    print("sample", json.dumps(sample, ensure_ascii=False)[:3000])
    return 0


if __name__ == "__main__":
    sys.exit(main())
