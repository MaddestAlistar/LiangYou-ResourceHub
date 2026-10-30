#!/usr/bin/env python3
"""Offline correctness checks: title identity, sequel, year and public API payloads."""
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parent))
import update_media_extra_videos as m

class MovieVideoTests(unittest.TestCase):
    def test_exact_chinese_film(self):
        self.assertTrue(m.precise_title("【旧资讯】《海洋奇缘》中国大陆独家版预告片一则",["海洋奇缘","Moana"],2016))
    def test_sequel_not_same_film(self):
        self.assertFalse(m.precise_title("大型冒险动画片《海洋奇缘2》预告片",["海洋奇缘","Moana"],2016))
        self.assertFalse(m.precise_title("Moana 2 official trailer",["海洋奇缘","Moana"],2016))
    def test_unrelated_title(self):
        self.assertFalse(m.precise_title("迪士尼《寻龙传说》新预告",["海洋奇缘","Moana"],2016))
        self.assertFalse(m.precise_title("冰雪奇缘预告片",["海洋奇缘","Moana"],2016))
    def test_wrong_movie_year(self):
        self.assertFalse(m.precise_title("Moana Live Action Official Trailer 2026",["海洋奇缘","Moana"],2016))
    def test_japanese_precise_pv(self):
        self.assertTrue(m.precise_title("TVアニメ『薬屋のひとりごと』第2クールPV",["药屋少女的呢喃","薬屋のひとりごと"],2023,"tv"))
    def test_no_unrelated_popular_music(self):
        self.assertFalse(m.precise_title("Lemon 歌ってみた PV",["モアナと伝説の海"],2016))
    def test_no_pirate_full_episodes(self):
        self.assertFalse(m.precise_title("药屋少女的呢喃全集免费观看",["药屋少女的呢喃"],2023,"tv"))
    def test_canonical_acfun(self):
        w={"kind":"movie","title":"海洋奇缘","original_title":"Moana","date":"2016-11-23"}
        r=m.make_video("acfun",277834,w,30636253,"《海洋奇缘》中国大陆独家版预告")
        self.assertEqual(r["verifiedSource"],"https://www.acfun.cn/v/ac30636253")
        self.assertEqual(r["tmdbId"],277834)
        self.assertTrue(r["titleMatchVerified"])
        self.assertNotIn("verifiedByTitleId",r)
    def test_canonical_niconico(self):
        w={"kind":"tv","title":"药屋少女的呢喃","original_title":"薬屋のひとりごと","date":"2023-10-22"}
        r=m.make_video("niconico",220542,w,"sm43190555","TVアニメ『薬屋のひとりごと』第2クールPV",16424)
        self.assertEqual(r["verifiedSource"],"https://www.nicovideo.jp/watch/sm43190555")
        self.assertEqual(r["views"],16424)
    def test_canonical_dailymotion(self):
        w={"kind":"tv","title":"药屋少女的呢喃","original_title":"The Apothecary Diaries","date":"2023-10-22"}
        r=m.make_video("dailymotion",220542,w,"x8mcq94","The Apothecary Diaries - Official Trailer")
        self.assertEqual(r["verifiedSource"],"https://www.dailymotion.com/video/x8mcq94")
    def test_invalid_video_identifiers(self):
        w={"kind":"movie","title":"海洋奇缘","original_title":"Moana","date":"2016-11-23"}
        for platform,vid in [("acfun","javascript:alert(1)"),("niconico","smabc"),("dailymotion","../../a")]:
            self.assertIsNone(m.make_video(platform,277834,w,vid,"Moana Trailer"))
    def test_kino_exact_tmdb_id(self):
        w={"kind":"movie","title":"海洋奇缘","original_title":"Moana","date":"2016-11-23"}
        old=m.request_json
        try:
            m.request_json=lambda _:{ "tmdb_id":277834,"trailer":{"youtube_video_id":"F0zP0L_sUDA","categories":["Trailer"],"title":"Moana Trailer"},"videos":[
               {"youtube_video_id":"PsMXiStOcl8","categories":["Special"],"title":"MOANA Live-Action Movie Announcement (2023)"},
               {"youtube_video_id":"pwwspMlv9dA","categories":["Clip"],"title":"MOANA Scene (2016)"}]}
            result=m.kino(w,277834)
            self.assertEqual({x["videoId"] for x in result},{"F0zP0L_sUDA","pwwspMlv9dA"})
            self.assertTrue(all(x["verifiedByTitleId"] for x in result))
            m.request_json=lambda _:{"tmdb_id":999,"videos":[{"youtube_video_id":"F0zP0L_sUDA","categories":["Trailer"]}]}
            self.assertEqual(m.kino(w,277834),[])
        finally:m.request_json=old

if __name__=="__main__":unittest.main()
