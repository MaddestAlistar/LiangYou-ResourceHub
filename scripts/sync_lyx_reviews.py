#!/usr/bin/env python3
"""Mirror only published LYX reviews from the admin queue to GitHub Pages.

The Cloudflare Worker keeps the authenticated complete store in Icon-Review-Queue.
This generated public snapshot deliberately omits drafts and uses no GitHub token.
"""
import json
import pathlib
import sys
import urllib.error
import urllib.request

SOURCE = "https://raw.githubusercontent.com/MaddestAlistar/Icon-Review-Queue/main/lyx/reviews.json"
DEST = pathlib.Path(__file__).resolve().parents[1] / "data" / "lyx-reviews.json"
FIELDS = {"id", "name", "category", "subtitle", "version", "platform", "icon", "summary",
          "tagline", "tags", "scores", "review", "status", "order", "updatedAt"}


def main():
    request = urllib.request.Request(SOURCE, headers={"User-Agent": "LiangYou-LYX-Mirror/1.0",
                                                        "Cache-Control": "no-cache"})
    try:
        with urllib.request.urlopen(request, timeout=22) as response:
            raw = response.read(1_000_001)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            print("No CMS source published yet; leaving initial page snapshot unchanged.")
            return 0
        raise
    if len(raw) > 1_000_000:
        raise ValueError("LYX source JSON is larger than expected")
    store = json.loads(raw.decode("utf-8"))
    if store.get("schemaVersion") != 1 or not isinstance(store.get("reviews"), list):
        raise ValueError("Invalid LYX CMS schema")
    if len(store["reviews"]) > 120:
        raise ValueError("Too many reviews")
    published = []
    seen = set()
    for item in store["reviews"]:
        if not isinstance(item, dict):
            raise ValueError("Invalid review entry")
        id_ = item.get("id")
        if not isinstance(id_, str) or not id_.replace("-", "").isalnum() or id_ in seen:
            raise ValueError("Invalid or duplicate review ID")
        seen.add(id_)
        if item.get("status") != "published":
            continue
        sc = item.get("scores")
        if not isinstance(sc, list) or len(sc) != 6 or any(
            not isinstance(s, (int, float)) or not (0 <= s <= 100) for s in sc
        ):
            raise ValueError("Invalid review score")
        published.append({k: item[k] for k in FIELDS if k in item})
    output = {"schemaVersion": 1, "updatedAt": store.get("updatedAt"),
              "reviews": sorted(published, key=lambda x: (int(x.get("order", 999)), x["id"]))}
    content = json.dumps(output, indent=2, ensure_ascii=False) + "\n"
    if DEST.exists() and DEST.read_text(encoding="utf-8") == content:
        print("LYX review snapshot already current")
        return 0
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(content, encoding="utf-8")
    print(f"Mirrored {len(published)} public LYX reviews")
    return 0


if __name__ == "__main__":
    sys.exit(main())
