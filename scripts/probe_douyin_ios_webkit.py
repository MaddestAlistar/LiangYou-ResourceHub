#!/usr/bin/env python3
"""Check iPhone WebKit Douyin iframe sizing and playback without secrets."""
import json,shutil
from playwright.sync_api import sync_playwright
SITE="https://maddestalistar.github.io/LiangYou-ResourceHub/labs/xigua-embed-probe.html"
VIDEO="7140302841666686239"

def inspect(f):
    try:
        return f.evaluate("""() => {
          const v=document.querySelector('video');
          const rect=el=>{const x=el?.getBoundingClientRect();return x&&{
            x:Math.round(x.x),y:Math.round(x.y),width:Math.round(x.width),
            height:Math.round(x.height)}};
          const body=document.body;
          return {
            href:location.href.split('?')[0],vw:innerWidth,vh:innerHeight,
            documentScrollWidth:document.documentElement.scrollWidth,
            bodyWidth:rect(body),
            title:document.title.slice(0,70),
            text:(body?.innerText||'').replace(/\\s+/g,' ').slice(0,130),
            videoCount:document.querySelectorAll('video').length,
            video:v?{rect:rect(v),readyState:v.readyState,paused:v.paused,
              time:v.currentTime,error:v.error?.code||0}:null,
            elements:[...document.querySelectorAll('button')].slice(0,5).map(e=>({
              text:(e.textContent||'').slice(0,30),rect:rect(e)}))
          }
        }""")
    except Exception as e:return {"exception":type(e).__name__}

with sync_playwright() as pw:
    pw.webkit
    browser=pw.webkit.launch(headless=True)
    context=browser.new_context(viewport={"width":390,"height":844},device_scale_factor=3,
      is_mobile=True,has_touch=True,
      user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1")
    p=context.new_page()
    try:
        p.goto(SITE,wait_until="domcontentloaded",timeout=30000)
        print("DOUYIN_WEBKIT_ORIGIN",p.url,flush=True)
        for mode,height in [("landscape",219),("portrait",650),("medium",470),("wide-desktop-scaled",181)]:
            p.evaluate("""({vid,height,wide})=>{
              let stage=document.getElementById('stage');
              stage.style.cssText='width:100%;height:'+height+'px;aspect-ratio:auto;background:#000';
              const f=document.createElement('iframe');
              f.src='https://open.douyin.com/player/video?vid='+vid+'&autoplay=0';
              f.setAttribute('referrerpolicy','unsafe-url');
              f.allow='autoplay; encrypted-media; fullscreen; picture-in-picture';
              f.allowFullscreen=true;
              if(wide){
                const factor=stage.clientWidth/760;
                f.style.cssText='width:760px;height:428px;border:0;transform-origin:0 0;transform:scale('+factor+');';
              }else f.style.cssText='width:100%;height:100%;border:0';
              stage.replaceChildren(f);
            }""",{"vid":VIDEO,"height":height,"wide":mode=="wide-desktop-scaled"})
            p.wait_for_timeout(7000)
            frames=[f for f in p.frames if "open.douyin.com/player/video" in f.url]
            before=[inspect(f) for f in frames]
            for f in frames:
                if f.locator('video').count():
                    try:
                        f.evaluate("""async()=>{
                          const v=document.querySelector('video'); v.muted=true;
                          try{await v.play()}catch(e){}
                        }""")
                        p.wait_for_timeout(2000)
                    except Exception: pass
                    break
            after=[inspect(f) for f in frames]
            print("DOUYIN_WEBKIT_IFRAME",json.dumps({
                "mode":mode,"parentStage":p.evaluate("""()=>{const r=document.getElementById('stage').getBoundingClientRect();return{width:r.width,height:r.height}}"""),
                "frames":len(frames),"before":before[:2],"after":after[:2],
            },ensure_ascii=False),flush=True)
        # Check the actual published modal markup/CSS, not just test-lab
        # dimensions. This catches the precise 16:9 viewport clipping the
        # user reported on iPhone.
        page=context.new_page()
        page.goto("https://maddestalistar.github.io/LiangYou-ResourceHub/#media",
                  wait_until="domcontentloaded",timeout=30000)
        page.wait_for_timeout(5000)
        page.evaluate("""vid=>{
          const dlg=document.querySelector('#media-trailer-dialog');
          if(!dlg.open)dlg.showModal();
          const stage=document.querySelector('#media-trailer-stage');
          stage.classList.add('mi-douyin-stage');
          const frame=document.createElement('iframe');
          frame.className='mi-douyin-mobile';
          frame.width='324';frame.height='624';
          frame.src='https://open.douyin.com/player/video?vid='+vid+'&autoplay=0';
          frame.referrerPolicy='unsafe-url';
          frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';
          frame.allowFullscreen=true;
          stage.replaceChildren(frame);
        }""",VIDEO)
        page.wait_for_timeout(7000)
        metrics=page.evaluate("""()=>{
          const stage=document.querySelector('#media-trailer-stage');
          const iframe=stage?.querySelector('iframe');
          const rect=x=>{const r=x?.getBoundingClientRect();return r?{width:r.width,height:r.height}:null};
          return{stage:rect(stage),iframe:rect(iframe),cssLoaded:[...document.styleSheets]
             .some(x=>(x.href||'').includes('media-intel.css')),
             windowWidth:innerWidth}
        }""")
        frames=[x for x in page.frames if 'open.douyin.com/player/video' in x.url]
        print("DOUYIN_WEBKIT_SITE_MODAL",json.dumps({
            "metrics":metrics,"frames":[inspect(x) for x in frames][:1]
        },ensure_ascii=False),flush=True)
        if metrics["windowWidth"]<761 and (not metrics["stage"] or
            metrics["stage"]["height"]<610 or not metrics["iframe"] or
            metrics["iframe"]["height"]<610):
            raise RuntimeError("published_iOS_dialog_still_clips_Douyin_controls")
    finally:
        context.close()
        browser.close()
