#!/usr/bin/env python3
"""Real-browser check of officially approved Douyin iframe for Xigua-related titles."""
import json,shutil
from playwright.sync_api import sync_playwright

SITE="https://maddestalistar.github.io/LiangYou-ResourceHub/labs/xigua-embed-probe.html"
VIDEO_IDS={"edgerunners-2022":"7140302841666686239",
           "edgerunners-2026":"7696680395005250856"}

def snapshot(f):
    try:
        return f.evaluate("""() => {
            const x=document.querySelector('video');
            return {host:location.hostname,title:document.title.slice(0,130),
              text:(document.body?.innerText||'').replace(/\\s+/g,' ').slice(0,170),
              videos:document.querySelectorAll('video').length,
              state:x?{readyState:x.readyState,networkState:x.networkState,
                paused:x.paused,currentTime:x.currentTime,error:x.error?.code||0}:null}
        }""")
    except Exception as e:return {"error":type(e).__name__}

with sync_playwright() as p:
    executable=next((shutil.which(n) for n in ('google-chrome','chromium','chromium-browser')
                     if shutil.which(n)),None)
    browser=p.chromium.launch(headless=True,executable_path=executable,args=['--no-sandbox'])
    for form,view in (("desktop",{"width":1280,"height":750}),
                      ("mobile",{"width":390,"height":844})):
        context=browser.new_context(viewport=view)
        page=context.new_page()
        try:
            page.goto(SITE,wait_until="domcontentloaded",timeout=25000)
            for label,vid in VIDEO_IDS.items():
                page.evaluate("""vid => {
                  const stage=document.querySelector('#stage');
                  const frame=document.createElement('iframe');
                  frame.src='https://open.douyin.com/player/video?vid='+vid+'&autoplay=0';
                  frame.referrerPolicy='unsafe-url';
                  frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';
                  frame.allowFullscreen=true;
                  stage.replaceChildren(frame);
                }""",vid)
                page.wait_for_timeout(8500)
                frames=[f for f in page.frames if 'douyin' in f.url]
                states=[snapshot(f) for f in frames]
                for f in frames:
                    if f.locator('video').count():
                        try:
                            f.evaluate("""() => {
                              const v=document.querySelector('video');
                              v.muted=true;
                              return v.play().then(()=>true).catch(()=>false)
                            }""")
                            page.wait_for_timeout(2800)
                        except Exception:pass
                        break
                after=[snapshot(f) for f in frames]
                print('XIGUA_DOUYIN_BROWSER',json.dumps({
                    'view':form,'sample':label,'iframes':len(frames),
                    'before':states[:2],'after':after[:2]
                },ensure_ascii=False),flush=True)
        except Exception as e:
            print("XIGUA_DOUYIN_BROWSER_FAILURE",form,type(e).__name__,str(e)[:150],flush=True)
        finally:context.close()
    browser.close()
