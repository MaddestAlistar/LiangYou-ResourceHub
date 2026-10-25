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

# Ask for a build even when collection partially fails: publish honest health status.
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
request(base, 'POST')
print('Requested GitHub Pages build for refreshed snapshots', flush=True)
for attempt in range(60):
    build = request(base + '/latest')
    if build.get('commit') == head:
        if build.get('status') == 'built':
            print('Pages build completed for ' + head, flush=True)
            break
        if build.get('status') == 'errored':
            # A replacement Pages build may still be running for the same SHA.
            # Treat the latest build's early 'errored' state as provisional:
            # the automated deployment workflow may supersede it shortly.
            print('Pages latest build temporarily errored; checking for replacement', flush=True)
    # A newer user commit can supersede this one while retaining the data.
    if build.get('status') == 'built' and build.get('commit') != head:
        subprocess.run(['git', 'fetch', 'origin', 'main'], check=True, capture_output=True)
        newer = build.get('commit', '')
        if len(newer) == 40 and subprocess.run(['git', 'merge-base', '--is-ancestor', head, newer], capture_output=True).returncode == 0:
            print('Pages published a newer commit including this refresh', flush=True)
            break
    time.sleep(10)
else:
    raise SystemExit('Pages build was requested but not confirmed within 10 minutes')
