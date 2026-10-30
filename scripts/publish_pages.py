#!/usr/bin/env python3
"""Explicitly publish bot commits to the existing branch-based Pages site.
GITHUB_TOKEN pushes alone do not trigger Pages builds. This requires pages:write.
"""
import json
import os
import subprocess
import time
from urllib.request import Request, urlopen

repo = os.environ['GITHUB_REPOSITORY']
token = os.environ['GH_TOKEN']
base = f'https://api.github.com/repos/{repo}/pages/builds'

def request(url, method='GET'):
    req = Request(url, method=method, headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'})
    with urlopen(req, timeout=30) as response:
        return json.load(response)

# A GitHub Pages POST only acknowledges an asynchronous build request.
# Do not hold the data-refresh lock for 10 minutes waiting for GitHub's
# separate deploy queue. The native "pages build and deployment" Actions
# workflow reports the actual publication success or failure.
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()


def published(build):
    if not isinstance(build, dict) or build.get('status') != 'built':
        return False
    committed = build.get('commit', '')
    if committed == head:
        print('PAGES_ALREADY_PUBLISHED', head, flush=True)
        return True
    if isinstance(committed, str) and len(committed) == 40:
        # The latest published commit may supersede this runner's checkout.
        try:
            subprocess.run(['git', 'fetch', 'origin', 'main'],
                           check=True, capture_output=True, timeout=20)
            if subprocess.run(['git', 'merge-base', '--is-ancestor', head, committed],
                              capture_output=True, timeout=10).returncode == 0:
                print('PAGES_PUBLISHED_NEWER_COMMIT', committed, flush=True)
                return True
        except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
            pass
    return False


try:
    if published(request(base + '/latest')):
        raise SystemExit(0)
except (OSError, ValueError):
    # A transient status read must not block an otherwise valid build request.
    pass

# Retry transient GitHub API failures, not every kind of authorization error.
from urllib.error import HTTPError, URLError
for attempt in range(3):
    try:
        request(base, 'POST')
        break
    except HTTPError as error:
        if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
            raise
    except URLError:
        if attempt == 2:
            raise
    time.sleep(3 * (attempt + 1))
print('PAGES_BUILD_REQUEST_ACCEPTED', head, flush=True)

# A brief best-effort check; completion is asynchronous and monitored by
# GitHub's separate Pages deployment workflow, not this collector.
for attempt in range(4):
    time.sleep(5)
    try:
        if published(request(base + '/latest')):
            break
    except (OSError, ValueError):
        continue
else:
    print('::notice::Pages build accepted but not yet confirmed; '
          'check the separate Pages deployment workflow for completion',
          flush=True)
