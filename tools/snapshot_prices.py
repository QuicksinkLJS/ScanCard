#!/usr/bin/env python3
"""Keep one small file per day with every product's Cardmarket prices, so price charts grow over time.
history/YYYY-MM-DD.json.gz = {"date": ..., "p": {idProduct: [trend, avg1, low]}}"""
import gzip, json, os, sys
src, out = sys.argv[1], sys.argv[2]
pg = json.load(open(src, encoding="utf-8"))
day = (pg.get("createdAt") or "")[:10]
os.makedirs(out, exist_ok=True)
data = {"date": pg.get("createdAt"), "p": {g["idProduct"]: [g.get("trend"), g.get("avg1"), g.get("low")] for g in pg["priceGuides"]}}
with gzip.open(os.path.join(out, f"{day}.json.gz"), "wt", encoding="utf-8") as f:
    json.dump(data, f, separators=(",", ":"))
print("saved", day, len(data["p"]), "products")
