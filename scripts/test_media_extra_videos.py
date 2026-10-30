import unittest
from unittest.mock import patch
from refresh_media_extra_videos import matches_title, parse_acfun, parse_niconico, parse_dailymotion, parse_kinocheck

class VideoSources(unittest.TestCase):
    def setUp(self):
        self.moana={"title":"海洋奇缘","original":"Moana","aliases":["海洋奇缘","Moana"],
                    "year":2016,"kind":"movie","tmdb_id":277834}
        self.apoth={"title":"药屋少女的呢喃","original":"薬屋のひとりごと",
                    "aliases":["药屋少女的呢喃","薬屋のひとりごと"],
                    "year":2023,"kind":"tv","tmdb_id":220542}
    def test_sequels_and_cross_movie_credits(self):
        self.assertTrue(matches_title("【旧资讯】《海洋奇缘》中国大陆独家版预告片",self.moana["aliases"],2016))
        self.assertFalse(matches_title("大型冒险动画片《海洋奇缘2》预告片",self.moana["aliases"],2016))
        self.assertFalse(matches_title("《寻龙传说》由《海洋奇缘》团队打造",self.moana["aliases"],2016))
        self.assertFalse(matches_title("MOANA 2 trailer",self.moana["aliases"],2016))
        self.assertFalse(matches_title("Obsession movie trailer",self.moana["aliases"],2016))
        self.assertFalse(matches_title("Moana (2026) live action trailer",self.moana["aliases"],2016))
    def test_acfun_only_related_original(self):
        doc={"videoList":[
            {"title":"【旧资讯】《海洋奇缘》中国大陆独家版预告片一则","dougaId":30636253},
            {"title":"《海洋奇缘2》预告片","dougaId":47951240},
            {"title":"《寻龙传说》由《海洋奇缘》团队打造 预告片","dougaId":12345678},
            {"title":"莫阿娜（2026）预告片","dougaId":11111111}]}
        with patch("refresh_media_extra_videos.get_json",return_value=doc):
            rows=parse_acfun(self.moana)
        self.assertEqual([r["videoId"] for r in rows],["30636253"])
        self.assertEqual(rows[0]["verifiedSource"],"https://www.acfun.cn/v/ac30636253")
    def test_acfun_related_fallback_only_after_empty_trailer_search(self):
        calls=[]
        def response(url):
            calls.append(url)
            if len(calls)==1:
                return {"videoList":[{"title":"不相关影片的预告","dougaId":12345678}]}
            return {"videoList":[
                {"title":"《药屋少女的呢喃》第一季完结简评","dougaId":43386834},
                {"title":"《药屋少女的呢喃》搞笑场面【01】","dougaId":43989846},
                {"title":"《药屋少女的呢喃》全集免费观看","dougaId":49000000}
            ]}
        with patch("refresh_media_extra_videos.get_json",side_effect=response), \
             patch("refresh_media_extra_videos.time.sleep",return_value=None):
            rows=parse_acfun(self.apoth)
        self.assertEqual(len(calls),2)
        self.assertEqual([r["videoId"] for r in rows],["43386834","43989846"])
        self.assertTrue(all(r["type"]=="Related" for r in rows))
    def test_niconico_pv_matching(self):
        doc={"data":[{"title":"TVアニメ『薬屋のひとりごと』第2クールPV","contentId":"sm43190555","viewCounter":16424},
                     {"title":" unrelated PV","contentId":"sm45678999"}]}
        with patch("refresh_media_extra_videos.get_json",return_value=doc):
            rows=parse_niconico(self.apoth)
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]["videoId"],"sm43190555")
    def test_dailymotion_search(self):
        doc={"list":[{"id":"x8mcq94","title":"The Apothecary Diaries - Official Trailer"},
                     {"id":"xabcdef","title":"A different film trailer"}]}
        w={**self.apoth,"aliases":[*self.apoth["aliases"],"The Apothecary Diaries"]}
        with patch("refresh_media_extra_videos.get_json",return_value=doc):
            rows=parse_dailymotion(w)
        self.assertEqual([r["videoId"] for r in rows],["x8mcq94"])
    def test_dailymotion_rejects_ambiguous_one_word_movie_titles_without_year(self):
        runner={"title":"护肝人","original":"Runner","aliases":["护肝人","Runner"],
                "year":2026,"kind":"movie","tmdb_id":1377237}
        found={"list":[
            {"id":"x11dhgw","title":"Runner, Runner - Trailer"},
            {"id":"x117m9p","title":"Runner Runner Trailer"},
            {"id":"xabcdef","title":"Runner (2026) Official Trailer"},
            {"id":"xabcde1","title":"Runner 2024 trailer"}
        ]}
        with patch("refresh_media_extra_videos.get_json",return_value=found):
            results=parse_dailymotion(runner)
        self.assertEqual([x["videoId"] for x in results],["xabcdef"])
        obsession={"title":"痴迷","original":"Obsession","aliases":["痴迷","Obsession"],
                  "year":2026,"kind":"movie","tmdb_id":1339713}
        with patch("refresh_media_extra_videos.get_json",
                   return_value={"list":[{"id":"x8joimv","title":"Obsession Trailer"}]}):
            self.assertEqual(parse_dailymotion(obsession),[])
    def test_franchise_sequels_and_old_unverified_trailers_are_rejected(self):
        evil={"title":"生化危机：爆发夜","original":"Resident Evil",
              "aliases":["生化危机：爆发夜","Resident Evil"],
              "year":2026,"kind":"movie","tmdb_id":1423191}
        data={"list":[{"id":"x54cy6t","title":"Resident Evil 7 Biohazard - Trailer"},
                      {"id":"x3mm55d","title":"Resident Evil - Trailer"},
                      {"id":"xabc123","title":"Resident Evil (2026) - Official Trailer"},
                      {"id":"xabc124","title":"Resident Evil 2 (2026) Trailer"}]}
        with patch("refresh_media_extra_videos.get_json",return_value=data):
            rows=parse_dailymotion(evil)
        self.assertEqual([r["videoId"] for r in rows],["xabc123"])
    def test_kinocheck_tmdb_mismatch_rejected(self):
        doc={"tmdb_id":277835,"trailer":{"youtube_video_id":"F0zP0L_sUDA"}}
        with patch("refresh_media_extra_videos.get_json",return_value=doc):
            self.assertEqual(parse_kinocheck(self.moana),[])
        doc={"tmdb_id":277834,"trailer":{"youtube_video_id":"F0zP0L_sUDA","title":"Moana 2016 Trailer"},
             "videos":[{"youtube_video_id":"abc12345678","title":"MOANA Live-Action Movie Announcement (2023)"}]}
        with patch("refresh_media_extra_videos.get_json",return_value=doc):
            rows=parse_kinocheck(self.moana)
        self.assertEqual([x["id"] for x in rows],["F0zP0L_sUDA"])
        self.assertTrue(rows[0]["verifiedByTitleId"])

if __name__=="__main__":unittest.main()
