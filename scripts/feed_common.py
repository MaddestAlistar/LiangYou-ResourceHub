"""Small shared helpers for public, read-only feed collection."""
from __future__ import annotations
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

UTC = timezone.utc
ROOT = Path(__file__).resolve().parents[1]
UA = 'Mozilla/5.0 (compatible; LiangYouResourceHub/2.0; +https://github.com/MaddestAlistar/LiangYou-ResourceHub)'

def now():
    return datetime.now(UTC).replace(microsecond=0)

def iso(value=None):
    return (value or now()).isoformat().replace('+00:00', 'Z')

def date(value):
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)
    except (ValueError, TypeError):
        return None

def get(url, limit=5_000_000, timeout=20, attempts=2):
    for attempt in range(attempts):
        try:
            req = Request(url, headers={'User-Agent': UA, 'Accept': 'application/json,text/html,application/atom+xml,*/*', 'Accept-Language': 'en-US,en;q=0.9'})
            with urlopen(req, timeout=timeout) as resp:
                raw = resp.read(limit + 1)
            if len(raw) > limit:
                raise ValueError('Response exceeds size limit')
            return raw
        except Exception:
            if attempt + 1 == attempts:
                raise
            time.sleep(1 + attempt)

def read_json(path, default=None):
    try:
        return json.loads(Path(path).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {} if default is None else default

def write_json(path, obj, *, compact=False):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    # Large public film snapshots should not carry hundreds of KB of whitespace.
    # Keep all fields, values, IDs, aliases and snapshot timestamps unchanged.
    text = json.dumps(obj, ensure_ascii=False, separators=(',', ':')) if compact else json.dumps(obj, ensure_ascii=False, indent=2)
    tmp.write_text(text + '\n', encoding='utf-8')
    tmp.replace(path)
