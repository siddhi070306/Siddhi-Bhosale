"""Durable storage in Upstash Redis for hosts whose disk is wiped on restart (Render's free plan).

The knowledge-base state (kbstate.py), the analysis library (library.py) and the watchlist (quotes.py) are saved to local files
as before; on such a host they are ALSO saved here and read back from here when the local file is missing (after a restart, a
redeploy or a spin-down). Values are gzip-compressed JSON, base64-encoded, under keys "<prefix>:<name>".

It is on only when the Upstash REST URL and token are set AND the process runs on Render (Render sets RENDER) or
ZENITH_DURABLE_STORE=1, so a laptop with the same .env never overwrites the live state. Every call is best effort: a failure
is reported by last_error() and never breaks an analysis.
"""
import base64
import gzip
import json
import os
from urllib.parse import quote

import requests

TIMEOUT = 4.0
_LAST_ERROR = [None]


def _cfg():
    url = os.environ.get("UPSTASH_REDIS_REST_URL", "").strip().rstrip("/")
    token = os.environ.get("UPSTASH_REDIS_REST_TOKEN", "").strip()
    return url, token


def enabled():
    url, token = _cfg()
    on_host = bool(os.environ.get("RENDER")) or os.environ.get("ZENITH_DURABLE_STORE", "").strip() in ("1", "true", "yes")
    return bool(url and token and on_host)


def last_error():
    return _LAST_ERROR[0]


def _key(name):
    return quote("%s:%s" % (os.environ.get("ZENITH_STORE_PREFIX", "zenith").strip() or "zenith", name), safe=":")


def _call(method, path, body=None):
    url, token = _cfg()
    try:
        r = requests.request(method, "%s/%s" % (url, path), headers={"Authorization": "Bearer " + token}, data=body,
                             timeout=TIMEOUT)
        if r.status_code != 200:
            _LAST_ERROR[0] = "Upstash returned HTTP %d" % r.status_code
            return None
        out = r.json()
        if isinstance(out, dict) and out.get("error"):
            _LAST_ERROR[0] = "Upstash: %s" % out["error"]
            return None
        _LAST_ERROR[0] = None
        return out
    except Exception as e:
        _LAST_ERROR[0] = "Upstash unreachable (%s)" % type(e).__name__
        return None


def set_json(name, obj):
    """Save obj under name. -> True on success."""
    if not enabled():
        return False
    raw = base64.b64encode(gzip.compress(json.dumps(obj, default=str).encode("utf-8"))).decode("ascii")
    return _call("POST", "set/" + _key(name), raw) is not None


def get_json(name):
    """The object saved under name, or None."""
    if not enabled():
        return None
    out = _call("GET", "get/" + _key(name))
    val = (out or {}).get("result")
    if not val:
        return None
    try:
        return json.loads(gzip.decompress(base64.b64decode(val)).decode("utf-8"))
    except Exception:
        _LAST_ERROR[0] = "a stored value could not be read"
        return None


def delete(name):
    if not enabled():
        return False
    return _call("POST", "del/" + _key(name)) is not None


def status():
    url, _ = _cfg()
    return {"enabled": enabled(), "host": url.split("//")[-1].split(".")[0] + ".upstash.io" if url else None,
            "last_error": last_error()}
