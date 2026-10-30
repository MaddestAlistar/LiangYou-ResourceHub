#!/usr/bin/env python3
"""Real Chromium iframe playback diagnostics; zero SandBase API calls.

Only checks public provider embed URLs from a GitHub Pages origin; logs no
cookies, private video URLs or credentials. Headless Chromium outside China
cannot fully prove compatibility with mainland iPhone Safari.
"""
import json, shutil, time
from playwright.sync_api import sync_playwright

PAGE = "https://maddestalistar.github.io/LiangYou-ResourceHub/labs/xigua-embed-probe.html"
EXAMPLES = [
    ("docs", "6803260807372079623"),
    ("ign-cyberpunk", "7127120516426662408"),
    ("detective", "7123957398770811429"),
]
MODES = {
    "iframe": "https://www.ixigua.com/iframe/{video}?autoplay=0&startTime=0",
    "embed-mobile": "https://www.ixigua.com/embed/?autoplay=0&group_id={video}",
}

def inspect(frame):
    try:
        return frame.evaluate("""() => {
          const v=document.querySelector('video');
          return {
            url: location.origin + location.pathname,
            title: document.title.slice(0,110),
            text: (document.body?.innerText||'').replace(/\\s+/g,' ').slice(0,210),
            videos: document.querySelectorAll('video').length,
            video: v ? {readyState:v.readyState,networkState:v.networkState,
              paused:v.paused,error:v.error?.code||0,currentTime:v.currentTime,
              duration:Number.isFinite(v.duration)?v.duration:null} : null,
            loadedImages: [...document.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth>0).length
          }
        }""")
    except Exception as e:
        return {"error":type(e).__name__}

def run(page,kind,name,video,mode):
    url=MODES[mode].format(video=video)
    # Xigua requires a non-empty referrer. Official documentation embed snippet
    # specifically uses 'unsafe-url'. This probe supplies a real Pages origin.
    page.evaluate("""url => {
        const stage=document.getElementById('stage');
        const f=document.createElement('iframe');
        f.src=url; f.title='Xigua official iframe diagnostic';
        f.referrerPolicy='unsafe-url';
        f.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';
        f.allowFullscreen=true; stage.replaceChildren(f);
    }""",url)
    page.wait_for_timeout(8500)
    frames=[f for f in page.frames if "ixigua.com" in f.url]
    state=[inspect(f) for f in frames]
    # One attempted user-like click. No source extraction or DRM bypass.
    for frame in frames:
        if frame.locator('video').count():
            try:
                frame.locator('video').first.click(timeout=2000, force=True)
                page.wait_for_timeout(2200)
            except Exception:
                pass
            break
    after=[inspect(f) for f in frames]
    print("XIGUA_BROWSER_TEST",json.dumps({
        "view":kind,"sample":name,"mode":mode,"frames":len(frames),
        "before":state[:2],"after":after[:2]
    },ensure_ascii=False),flush=True)

def main():
    with sync_playwright() as p:
        executable=next((shutil.which(n) for n in ("google-chrome","chromium","chromium-browser")
                         if shutil.which(n)),None)
        browser=p.chromium.launch(headless=True,executable_path=executable,
                                  args=['--no-sandbox','--disable-dev-shm-usage'])
        for kind,viewport in (("desktop",{"width":1250,"height":780}),
                              ("phone",{"width":390,"height":844})):
            context=browser.new_context(
                viewport=viewport,
                user_agent=("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                            "AppleWebKit/605.1.15 (KHTML, like Gecko) "
                            "Version/17.0 Mobile/15E148 Safari/604.1")
                            if kind=="phone" else None,
            )
            page=context.new_page()
            try:
                page.goto(PAGE,wait_until="domcontentloaded",timeout=25000)
                print("XIGUA_BROWSER_ORIGIN",kind,page.url)
                for name,video in EXAMPLES:
                    for mode in MODES:
                        try:
                            run(page,kind,name,video,mode)
                        except Exception as exc:
                            print("XIGUA_BROWSER_ERROR",kind,name,mode,type(exc).__name__)
            except Exception as exc:
                print("XIGUA_BROWSER_FATAL",kind,type(exc).__name__,str(exc)[:160])
            finally:
                context.close()
        browser.close()

if __name__=="__main__":
    main()
