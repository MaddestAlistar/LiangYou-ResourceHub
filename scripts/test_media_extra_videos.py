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
