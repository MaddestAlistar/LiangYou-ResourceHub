import json
import unittest
from unittest.mock import patch

import refresh_media_douyin_videos as d

class DouyinDiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.tv = {"kind":"tv","id":"tv:105248","tmdb_id":105248,
                   "title":"赛博朋克：边缘行者","original":"Cyberpunk Edgerunners",
                   "aliases":["赛博朋克：边缘行者","Cyberpunk Edgerunners"],
                   "year":2022}
        self.movie={"kind":"movie","id":"movie:999",
                    "tmdb_id":999,"title":"海洋奇缘","original":"Moana",
                    "aliases":["海洋奇缘","Moana"],"year":2016}

    def test_public_index_extracts_only_real_douyin_page_ids(self):
        markup = (
          '<a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fjingxuan.douyin.com%2Fm%2Fvideo%2F'
          '7140302841666686239">real</a>'
          '<a href="https://jingxuan.douyin.com/m/video/7140302841666686239">duplicate</a>'
          '<a href="https://irrelevant.example/video/7107073545662005771">junk</a>'
          '<a href="https://www.douyin.com/video/7696680395005250856">also real</a>'
        )
        with patch.object(d,"request",return_value=markup):
            self.assertEqual(d.indexed_ids("keyword"),
                             ["7140302841666686239","7696680395005250856"])

    def test_official_iframe_rejects_foreign_id_and_rejected_videos(self):
        body={"err_no":0,"data":{"video_title":"《赛博朋克：边缘行者》正式预告",
               "iframe_code":"<iframe src=\"https://open.douyin.com/player/video?vid=7140302841666686239&amp;autoplay=0\"></iframe>"}}
        with patch.object(d,"request",return_value=json.dumps(body)):
            item=d.verify_official("7140302841666686239")
            self.assertEqual(item["videoId"],"7140302841666686239")
            self.assertTrue(d.match_work(self.tv,item))
            self.assertFalse(d.match_work(self.movie,item))
        with patch.object(d,"request",return_value=json.dumps({
            **body,"data":{**body["data"],"iframe_code":body["data"]["iframe_code"].replace(
                "7140302841666686239","7140302841666686240")}})):
            self.assertIsNone(d.verify_official("7140302841666686239"))
        with patch.object(d,"request",return_value=json.dumps({"err_no":28003004})):
            self.assertIsNone(d.verify_official("7140302841666686239"))

    def test_douyin_row_is_official_and_catalog_scoped(self):
        row=d.create_row(self.tv,{
            "name":"《赛博朋克：边缘行者》最新预告",
            "videoId":"7140302841666686239","publisher":"抖音精选"})
        self.assertEqual(row["platform"],"douyin")
        self.assertTrue(row["embedVerified"])
        self.assertEqual(row["tmdbId"],105248)
        self.assertEqual(row["verifiedSource"],
                         "https://jingxuan.douyin.com/m/video/7140302841666686239")
        self.assertNotIn("workId",row)

    def test_search_rotates_titles_without_mixing_seasons(self):
        work=dict(self.tv)
        terms=[d.search_terms(work,n) for n in range(4)]
        self.assertEqual(terms[0],terms[3])
        self.assertNotEqual(terms[0],terms[1])
        self.assertFalse(d.match_work(self.movie,{"name":"《海洋奇缘2》官方预告"}))
        self.assertFalse(d.match_work(self.movie,{"name":"《海洋奇缘》2026年全新预告"}))

    def test_round_robin_prioritizes_least_recent_per_kind(self):
        works={"anime-a":{"kind":"anime"},"tv-a":{"kind":"tv"},
               "tv-b":{"kind":"tv"},"movie-a":{"kind":"movie"}}
        items={"tv-a":{"checkedAt":"2026-10-30"}}
        self.assertEqual(d.choose(works,items,0)[0],"anime-a")
        self.assertEqual(d.choose(works,items,1)[0],"tv-b")
        self.assertEqual(d.choose(works,items,2)[0],"movie-a")

    def test_rate_limit_does_not_fake_empty_search(self):
        from urllib.error import HTTPError
        with patch.object(d,"request",side_effect=HTTPError("url",202,"throttled",{},None)):
            self.assertIsNone(d.indexed_ids("query"))

    def test_public_index_audit_uses_distinct_verified_shape_ids(self):
        ids = [video_id for candidates in d.PUBLIC_SEARCH_CANDIDATES.values()
               for video_id in candidates]
        self.assertLessEqual(len(ids), 8)
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(all(d.VIDEO_ID.fullmatch(video_id) for video_id in ids))

if __name__=="__main__":
    unittest.main()
