import json,struct,urllib.request,urllib.error,time
base="https://nicovideo.cdn.nimg.jp/thumbnails/43190555/43190555.5693593"
for suffix in ("",".M",".L"):
    u=base+suffix
    record={"suffix":suffix or "original"}
    try:
        request=urllib.request.Request(u,headers={"User-Agent":"Mozilla/5.0","Accept":"image/*"})
        with urllib.request.urlopen(request,timeout=15) as resp:
            buf=resp.read(650000)
            record.update({"status":resp.status,"type":resp.headers.get("Content-Type"),
                "bytes":len(buf),"jpeg_soi":buf[:2]==b"\xff\xd8"})
            if buf[:8]==b"\x89PNG\r\n\x1a\n":record["png_size"]=struct.unpack(">II",buf[16:24])
    except Exception as e:record["error"]=str(e)[:170]
    print("NICO_COVER_SIZE",json.dumps(record),flush=True)
    time.sleep(4)
