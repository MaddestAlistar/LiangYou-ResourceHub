#!/usr/bin/env python3
"""Obtain a short-lived Dailymotion API v2 token and provision a site-owned Player.

Never prints credentials, bearer tokens, request headers or raw API responses.
Only the public Player ID is written to the Pages configuration.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "data" / "media-video-player-config.json"
TOKEN_URL = "https://oauth2.dailymotion.com/v2/token"
API = "https://api.dailymotion.com/v2"
PLAYER_NAME = "LiangYou ResourceHub Film Player"
ID = re.compile(r"^x[A-Za-z0-9]{3,15}$")
PROFILE = re.compile(r"^[A-Za-z0-9_-]{2,80}$")


class DailymotionError(Exception):
    pass


def read_json(req):
    try:
        with urllib.request.urlopen(req, timeout=22) as response:
            if not 200 <= response.status < 300:
                raise DailymotionError("Unexpected API status " + str(response.status))
            data = response.read(400_001)
            if len(data) > 400_000:
                raise DailymotionError("API response exceeds limit")
            return response.status, json.loads(data)
    except urllib.error.HTTPError as exc:
        # Do not print raw remote error messages: they can contain request data.
        raise DailymotionError("Dailymotion HTTP " + str(exc.code)) from None
    except (urllib.error.URLError, TimeoutError) as exc:
        raise DailymotionError("Dailymotion connection unavailable (" + type(exc).__name__ + ")") from None
    except (json.JSONDecodeError, UnicodeError):
        raise DailymotionError("Unexpected non-JSON API response") from None


def api(path, token, method="GET", body=None):
    if not path.startswith("/") or "//" in path:
        raise DailymotionError("Invalid API route")
    headers = {"Accept": "application/json", "Authorization": "Bearer " + token}
    encoded = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        encoded = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(API + path, data=encoded, headers=headers, method=method)
    return read_json(req)


def extract_items(payload):
    data = payload.get("data", payload)
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("items", "list", "players"):
            if isinstance(data.get(key), list):
                return data[key]
    return []


def access_token():
    key = os.getenv("DAILYMOTION_PRIVATE_API_KEY", "").strip()
    secret = os.getenv("DAILYMOTION_PRIVATE_API_SECRET", "").strip()
    if not key or not secret:
        raise DailymotionError(
            "Missing repository Actions secrets DAILYMOTION_PRIVATE_API_KEY / DAILYMOTION_PRIVATE_API_SECRET"
        )
    # Request only the three API v2 scopes used by this workflow.
    form = urllib.parse.urlencode({
        "grant_type": "client_credentials",
        "client_id": key,
        "client_secret": secret,
        "scope": "account.read player.read player.manage",
    }).encode("utf-8")
    req = urllib.request.Request(TOKEN_URL, data=form, method="POST", headers={
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
    })
    _, data = read_json(req)
    token = data.get("access_token")
    if not isinstance(token, str) or len(token) < 20:
        raise DailymotionError("Token response lacks access_token")
    print("DAILYMOTION_AUTH_OK (short-lived token held only in runner memory)")
    return token


def select_profile(token):
    _, me = api("/me?fields=profiles", token)
    profiles = me.get("profiles")
    if not isinstance(profiles, list):
        profiles = (me.get("data") or {}).get("profiles", [])
    profiles = [x for x in profiles if isinstance(x, dict) and PROFILE.fullmatch(str(x.get("profile_id", "")))]
    choice = os.getenv("DAILYMOTION_PROFILE_ID", "").strip()
    if choice:
        matches = [p for p in profiles if p["profile_id"] == choice]
        if not matches:
            raise DailymotionError("DAILYMOTION_PROFILE_ID is not authorized for these API credentials")
        return matches[0]
    if len(profiles) != 1:
        raise DailymotionError(
            "Expected one authorized Dailymotion profile, found "
            + str(len(profiles)) + ". If several, set Actions variable DAILYMOTION_PROFILE_ID."
        )
    return profiles[0]


def current_player_id():
    if not CONFIG.exists():
        return ""
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    ident = str(config.get("dailymotionPlayerId", ""))
    return ident if ID.fullmatch(ident) else ""


def provision(token, profile_id):
    existing_id = current_player_id()
    # First confirm the site's current configured Player belongs to this profile.
    found = []
    for page in range(1, 4):
        _, payload = api(
            "/profiles/" + profile_id + "/players?fields=player_id,name&page_size=100&page=" + str(page),
            token,
        )
        rows = extract_items(payload)
        found.extend([p for p in rows if isinstance(p, dict) and ID.fullmatch(str(p.get("player_id", "")))])
        if len(rows) < 100:
            break
    if existing_id:
        match = next((p for p in found if p["player_id"] == existing_id), None)
        if match:
            print("DAILYMOTION_PLAYER_REUSED_SITE_CONFIGURATION")
            return existing_id
    # Prefer this integration's own named Player. Avoid modifying existing,
    # unrelated Player configurations or creating duplicates on reruns.
    match = next((p for p in found if str(p.get("name", "")).casefold() == PLAYER_NAME.casefold()), None)
    if match:
        print("DAILYMOTION_PLAYER_REUSED_NAMED_CONFIGURATION")
        return match["player_id"]
    _, result = api("/profiles/" + profile_id + "/players", token, method="POST", body={"name": PLAYER_NAME})
    created = result.get("data", result)
    ident = created.get("player_id") if isinstance(created, dict) else None
    if not isinstance(ident, str) or not ID.fullmatch(ident):
        raise DailymotionError("Player creation did not return a valid Player ID")
    print("DAILYMOTION_PLAYER_CREATED")
    return ident


def main():
    token = access_token()
    profile = select_profile(token)
    ident = provision(token, profile["profile_id"])
    # Verify the Player API can read the newly created or reused configuration.
    _, response = api("/players/" + ident + "?fields=player_id,name", token)
    details = response.get("data", response)
    if not isinstance(details, dict) or details.get("player_id") != ident:
        raise DailymotionError("Created Player could not be verified")
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    if config.get("schema") != 1:
        raise DailymotionError("Unexpected website video config schema")
    config["dailymotionPlayerId"] = ident
    config["note"] = "Site-owned Dailymotion Player ID obtained through private GitHub Actions authentication. No tokens or API secrets are published."
    new = json.dumps(config, ensure_ascii=False, indent=2) + "\n"
    if CONFIG.read_text(encoding="utf-8") != new:
        CONFIG.write_text(new, encoding="utf-8")
    print("DAILYMOTION_PLAYER_READY", ident)
    print("DAILYMOTION_EMBED_URL", "https://geo.dailymotion.com/player/" + ident + ".html?video={video_id}")


if __name__ == "__main__":
    try:
        main()
    except (DailymotionError, ValueError, KeyError, OSError) as exc:
        print("DAILYMOTION_SETUP_FAILED:", str(exc), file=sys.stderr)
        sys.exit(1)
