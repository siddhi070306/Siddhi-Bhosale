"""Copy this machine's saved state into Upstash, so the deployed backend starts from it instead of the curated baseline.

    python scripts/seed_store.py            # reads data/ and the Upstash keys from .env or the environment

Copies data/kb_state.json (the learned knowledge graph and its history), the analysis library (data/analyses) and the
watchlist. Run it once, before the first deploy or whenever the live state should be replaced by this machine's. It never
prints the keys.
"""
import gzip
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
os.environ["ZENITH_DURABLE_STORE"] = "1"         # this script is the one place a laptop writes the live state

from impactgraph import store  # noqa: E402  (loads .env)

DATA = os.path.join(ROOT, "data")


def main():
    if not store.enabled():
        sys.exit("Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (in .env or the environment) first.")
    done = []
    p = os.path.join(DATA, "kb_state.json")
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            data = json.load(f)
        if store.set_json("kb_state", data):
            done.append("knowledge base v%s (%d entities)" % (data.get("version"), len(data["graph"]["nodes"])))
    idx = os.path.join(DATA, "analyses", "index.json")
    if os.path.exists(idx):
        with open(idx, encoding="utf-8") as f:
            index = json.load(f)
        n = 0
        for r in index.get("records", []):
            fp = os.path.join(DATA, "analyses", r["id"] + ".json.gz")
            if os.path.exists(fp):
                with gzip.open(fp, "rt", encoding="utf-8") as f:
                    n += bool(store.set_json("lib:" + r["id"], json.load(f)))
        if store.set_json("lib:index", index):
            done.append("analysis library (%d analyses, %d full results)" % (len(index.get("records", [])), n))
    w = os.path.join(DATA, "watchlist.json")
    if os.path.exists(w):
        with open(w, encoding="utf-8") as f:
            if store.set_json("watchlist", json.load(f)):
                done.append("watchlist")
    if store.last_error():
        sys.exit("Stopped: %s. Copied so far: %s" % (store.last_error(), ", ".join(done) or "nothing"))
    print("Copied to Upstash (%s): %s" % (store.status()["host"], ", ".join(done) or "nothing found in data/"))
    print("Check after deploying: <render url>/api/status shows the same knowledge-base version.")


if __name__ == "__main__":
    main()
