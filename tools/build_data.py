#!/usr/bin/env python3
"""Build the CardScan price data pack (data/ygo.json).

Sources
  * Cardmarket product catalog + price guide (free downloads, EUR, one entry per product).
    They have no set codes, rarities or set names.
  * YGOJSON (https://github.com/iconmaster5326/YGOJSON): sets with per-language code prefixes,
    release dates and rarities.
  * optionally YGOPRODeck cardinfo.json + cardsets.json for sets newer than YGOJSON.

Matching
  1. Every card-database set is compared with every Cardmarket expansion by card-name overlap.
  2. Among the expansions that match well, the one whose products were added to Cardmarket
     closest to that printing's release date wins. This separates originals from reprints
     (LOB-G001 from 2003 vs LOB-DE001 from 2023).
  3. Several products for the same card in one expansion (different rarities or artworks)
     are all kept; the app then shows a price range.

Output keys are the exact printed set codes ("LOB-DE001", "LOB-G001", "LOB-001").
"""
import argparse, collections, json, os, re, sys, unicodedata
from datetime import date, datetime, timezone

LEGACY = date(2007, 1, 1)  # Cardmarket's catalog starts here; older products all carry this date


def norm(name):
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "", s)


def to_date(s):
    try:
        return date.fromisoformat(str(s)[:10])
    except (TypeError, ValueError):
        return None


RARITY = {"common": "Common", "rare": "Rare", "super": "Super Rare", "ultra": "Ultra Rare",
          "secret": "Secret Rare", "ultimate": "Ultimate Rare", "ghost": "Ghost Rare",
          "starlight": "Starlight Rare", "collectors": "Collector's Rare", "gold": "Gold Rare",
          "goldsecret": "Gold Secret Rare", "platinum": "Platinum Rare", "platinumsecret": "Platinum Secret Rare",
          "prismaticsecret": "Prismatic Secret Rare", "25thsecret": "Quarter Century Secret Rare",
          "quartercenturysecret": "Quarter Century Secret Rare", "shortprint": "Short Print",
          "parallel": "Parallel Rare", "ultraparallel": "Ultra Parallel Rare", "duelterminal": "Duel Terminal",
          "mosaic": "Mosaic Rare", "shatterfoil": "Shatterfoil Rare", "starfoil": "Starfoil Rare"}


# ---------- card database adapters ----------
# Each yields printings: (set_name, release_date, code, card_name, rarity)

def printings_from_ygojson(sets_path, cards_path):
    names = {}
    for c in json.load(open(cards_path, encoding="utf-8")):
        en = (c.get("text") or {}).get("en")
        if en and en.get("name"):
            names[c["id"]] = en["name"]
    for s in json.load(open(sets_path, encoding="utf-8")):
        set_name = (s.get("name") or {}).get("en")
        locales = s.get("locales") or {}
        if not set_name or not locales:
            continue
        known = [to_date(l.get("date")) for l in locales.values() if to_date(l.get("date"))]
        fallback = min(known) if known else None
        for content in s.get("contents") or []:
            for loc_key in content.get("locales") or []:
                loc = locales.get(loc_key) or {}
                prefix = loc.get("prefix")
                if not prefix or loc_key in ("jp", "sc", "tc"):  # OCG/Chinese not covered by Cardmarket singles yet
                    continue
                d = to_date(loc.get("date")) or fallback
                for c in content.get("cards") or []:
                    card = names.get(c.get("card"))
                    if card and c.get("suffix"):
                        yield set_name, d, prefix + c["suffix"], card, RARITY.get(c.get("rarity"), c.get("rarity") or "")


def printings_from_ygoprodeck(cardinfo_path, cardsets_path=None):
    dates = {}
    if cardsets_path:
        for s in json.load(open(cardsets_path, encoding="utf-8")):
            dates[s.get("set_name")] = to_date(s.get("tcg_date"))
    for card in json.load(open(cardinfo_path, encoding="utf-8"))["data"]:
        for s in card.get("card_sets") or []:
            yield s["set_name"], dates.get(s["set_name"]), s["set_code"], card["name"], s.get("set_rarity", "")


# ---------- matching ----------

def load_cardmarket(products_path, prices_path):
    products = json.load(open(products_path, encoding="utf-8"))["products"]
    pg = json.load(open(prices_path, encoding="utf-8"))
    prices = {g["idProduct"]: g for g in pg["priceGuides"]}
    exp_names = collections.defaultdict(set)
    exp_products = collections.defaultdict(lambda: collections.defaultdict(list))
    exp_dates = collections.defaultdict(list)
    for p in products:
        n = norm(p["name"])
        e = p["idExpansion"]
        exp_names[e].add(n)
        exp_products[e][n].append(p["idProduct"])
        d = to_date(p.get("dateAdded"))
        if d:
            exp_dates[e].append(d)
    # an expansion's date = when most of its products were added
    exp_date = {e: sorted(ds)[len(ds) // 2] for e, ds in exp_dates.items()}
    return exp_names, exp_products, exp_date, prices, pg.get("createdAt")


def choose_expansion(cands, exp_date, release):
    """cands: [(score, exp)] already filtered. Pick the one added closest to the release date."""
    if release is None or len(cands) == 1:
        return cands[0][1]
    target = max(release, LEGACY)

    def key(c):
        score, e = c
        d = exp_date.get(e, LEGACY)
        # products are usually listed shortly before release; penalise listings long after it
        gap = (d - target).days
        return (abs(gap) if gap > -60 else abs(gap) + 30, -score)
    return min(cands, key=key)[1]


def build(printings, cm, min_score=0.5, keep=0.85):
    exp_names, exp_products, exp_date, prices, _ = cm
    name_exps = collections.defaultdict(set)
    for e, names in exp_names.items():
        for n in names:
            name_exps[n].add(e)

    sets = collections.defaultdict(lambda: {"names": set(), "groups": collections.defaultdict(dict)})
    for set_name, d, code, card, rarity in printings:
        s = sets[set_name]
        s["names"].add(norm(card))
        entry = s["groups"][d].setdefault(code, {"n": card, "r": []})
        if rarity and rarity not in entry["r"]:
            entry["r"].append(rarity)

    out = collections.defaultdict(list)
    stats = collections.Counter()
    for set_name, s in sets.items():
        S = s["names"]
        overlap = collections.Counter(e for n in S for e in name_exps.get(n, ()))
        scored = sorted(((2 * k / (len(S) + len(exp_names[e])), e) for e, k in overlap.items()), reverse=True)
        if not scored or scored[0][0] < min_score:
            stats["sets_unmatched"] += 1
            continue
        cands = [c for c in scored if c[0] >= max(min_score, scored[0][0] * keep)]
        stats["sets_matched"] += 1
        for d, codes in s["groups"].items():
            exp = choose_expansion(cands, exp_date, d)
            for code, c in codes.items():
                pids = exp_products[exp].get(norm(c["n"]), [])
                if not pids:  # card missing from that expansion: try the other candidates
                    for _, e in cands:
                        pids = exp_products[e].get(norm(c["n"]), [])
                        if pids:
                            exp = e
                            break
                if not pids:
                    stats["codes_no_product"] += 1
                    continue
                if any(v["e"] == exp for v in out[code]):
                    continue
                out[code].append({
                    "s": set_name, "y": d.year if d else None, "r": c["r"], "e": exp, "n": c["n"],
                    "p": [[pid] + [prices.get(pid, {}).get(k) for k in ("trend", "avg30", "low", "avg1", "avg7")]
                          for pid in pids],
                })
    for code, versions in out.items():
        n_products = sum(len(v["p"]) for v in versions)
        stats["codes_exact" if n_products == 1 else "codes_range"] += 1
    return out, stats


def compact(data, prices_date):
    """Small pack: strings, versions and prices are stored once and referenced by index.

    names[i], sets[i], rarities[i]           strings
    products[pid] = [trend, avg30, low, avg1, avg7]   EUR
    versions[i]  = [setIdx, year, [rarityIdx...], expansionId, [pid...]]
    cards[code]  = [nameIdx, [versionIdx...]]
    """
    def interner():
        table, index = [], {}
        def get(s):
            if s not in index:
                index[s] = len(table)
                table.append(s)
            return index[s]
        return table, get
    names, name_i = interner()
    sets, set_i = interner()
    rars, rar_i = interner()
    versions, ver_index = [], {}
    products, cards = {}, {}
    for code in sorted(data):
        vs = data[code]
        vidx = []
        for v in vs:
            pids = [p[0] for p in v["p"]]
            for p in v["p"]:
                products[str(p[0])] = p[1:]
            key = (v["s"], v["y"], tuple(v["r"]), v["e"], tuple(pids))
            if key not in ver_index:
                ver_index[key] = len(versions)
                versions.append([set_i(v["s"]), v["y"], [rar_i(r) for r in v["r"]], v["e"], pids])
            vidx.append(ver_index[key])
        cards[code] = [name_i(vs[0]["n"]), vidx]
    return {"version": 2, "game": "yugioh",
            "built": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "prices": prices_date,
            "names": names, "sets": sets, "rarities": rars, "products": products,
            "versions": versions, "cards": cards}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--products", required=True)
    ap.add_argument("--prices", required=True)
    ap.add_argument("--ygojson-sets")
    ap.add_argument("--ygojson-cards")
    ap.add_argument("--ygoprodeck-cards")
    ap.add_argument("--ygoprodeck-sets")
    ap.add_argument("--out", default="data/ygo")
    a = ap.parse_args()

    cm = load_cardmarket(a.products, a.prices)
    printings = []
    seen = set()
    if a.ygojson_sets:
        for row in printings_from_ygojson(a.ygojson_sets, a.ygojson_cards):
            printings.append(row)
            seen.add(row[2])
    if a.ygoprodeck_cards:  # only adds codes YGOJSON doesn't know (newer sets)
        for row in printings_from_ygoprodeck(a.ygoprodeck_cards, a.ygoprodeck_sets):
            if row[2] not in seen:
                printings.append(row)

    data, stats = build(printings, cm)

    banlist = {}
    if a.ygoprodeck_cards:
        for card in json.load(open(a.ygoprodeck_cards, encoding="utf-8"))["data"]:
            b = card.get("banlist_info") or {}
            if b.get("ban_tcg") or b.get("ban_ocg"):
                banlist[norm(card["name"])] = [b.get("ban_tcg"), b.get("ban_ocg")]

    # One small file per set prefix (LOB.json, RA01.json ...): the app only loads what it scans.
    out_dir = a.out
    os.makedirs(out_dir, exist_ok=True)
    for old in os.listdir(out_dir):
        if old.endswith(".json"):
            os.remove(os.path.join(out_dir, old))
    groups = collections.defaultdict(dict)
    for code, versions in data.items():
        prefix = code.split("-")[0]
        if re.fullmatch(r"[A-Z0-9]{1,8}", prefix):
            groups[prefix][code] = versions
    for prefix, codes in groups.items():
        with open(os.path.join(out_dir, f"{prefix}.json"), "w", encoding="utf-8") as f:
            json.dump(compact(codes, cm[4]), f, ensure_ascii=False, separators=(",", ":"))
    # Price summary per card name: the artwork recogniser finds the name, not the printed code.
    by_name = collections.defaultdict(dict)  # norm(name) -> {(set, year): [min, max]}
    bases = collections.defaultdict(set)      # norm(name) -> {"KICO-042", ...}: printed codes without language
    display = {}
    for code, versions in data.items():
        m = re.fullmatch(r"([A-Z0-9]+)-[A-Z]{0,2}(\d{3})", code)
        if m:
            for v in versions:
                bases[norm(v["n"])].add(f"{m.group(1)}-{m.group(2)}")
        for v in versions:
            trends = [p[1] for p in v["p"] if p[1] is not None]
            if not trends:
                continue
            k = norm(v["n"])
            display.setdefault(k, v["n"])
            key = (v["s"], v["y"])
            lo, hi = by_name[k].get(key, [min(trends), max(trends)])
            by_name[k][key] = [min(lo, min(trends)), max(hi, max(trends))]
    names_out = {}
    for k, sets in by_name.items():
        rows = sorted(([s, y, round(lo, 2), round(hi, 2)] for (s, y), (lo, hi) in sets.items()), key=lambda r: -r[3])
        names_out[k] = [display[k], round(min(r[2] for r in rows), 2), round(max(r[3] for r in rows), 2), rows,
                        sorted(bases.get(k, ())), banlist.get(k)]
    with open(os.path.join(out_dir, "names.json"), "w", encoding="utf-8") as f:
        json.dump(names_out, f, ensure_ascii=False, separators=(",", ":"))
    # Tops and flops for cards worth at least 2 EUR, in two flavours:
    #   short:  yesterday's average sale against the 7-day average (fast, shows odd sales too)
    #   stable: smoothed trend price against the 30-day average
    seen, rows = set(), []
    for code, versions in data.items():
        for v in versions:
            for pid, trend, avg30, low, avg1, avg7 in v["p"]:
                if pid in seen or not trend or trend < 2:
                    continue
                seen.add(pid)
                rows.append({"name": v["n"], "set": v["s"], "year": v["y"], "id": pid, "trend": trend,
                             "avg1": avg1, "avg7": avg7, "avg30": avg30})
    def top(key, a, b):
        ok = [dict(r, change=round((r[a] - r[b]) / r[b] * 100, 1)) for r in rows if r.get(a) and r.get(b) and r[b] >= 1]
        ok.sort(key=lambda r: r["change"])
        return {"up": ok[::-1][:30], "down": ok[:30]}
    with open(os.path.join(out_dir, "movers.json"), "w", encoding="utf-8") as f:
        json.dump({"date": cm[4], "short": top("short", "avg1", "avg7"), "stable": top("stable", "trend", "avg30")},
                  f, ensure_ascii=False, separators=(",", ":"))
    index = {"version": 2, "game": "yugioh", "built": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
             "prices": cm[4], "sets": sorted(groups)}
    with open(os.path.join(out_dir, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, separators=(",", ":"))
    for k, v in sorted(stats.items()):
        print(f"{k}: {v}")
    print(f"codes in pack: {len(data)} in {len(groups)} set files")


if __name__ == "__main__":
    sys.exit(main())
