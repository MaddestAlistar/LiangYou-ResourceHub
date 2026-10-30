import unittest
import os
from unittest.mock import patch
from refresh_media_xigua_videos import parse_result, approved_embed, accept, row_for, trusted_cover, search, official_api_ready, discover

class XiguaVideoTest(unittest.TestCase):
    def setUp(self):
        self.movie = {"kind": "movie", "id": "movie:123", "title": "海洋奇缘", "original": "Moana",
                      "aliases": ["海洋奇缘", "Moana"], "tmdb_id": 123, "year": 2016}

    def test_nested_sandbase_metadata_is_defensive(self):
        r = {"id": "search-row", "data": {"group_id": "7444746393916277283",
             "title": "《海洋奇缘》电影正式预告", "large_image_url": "https://p26-xg-cover-sign.bdxiguaimg.com/test"}}
        item = parse_result(r)
        self.assertEqual(item["videoId"], "7444746393916277283")
        self.assertEqual(item["name"], "《海洋奇缘》电影正式预告")
        self.assertIsNone(parse_result({"data": {"id": "javascript:evil", "title": "《海洋奇缘》电影预告"}}))

    def test_thumbnail_allowlist(self):
        self.assertIsNone(trusted_cover("https://bdxiguaimg.com.attacker.test/abc.jpg"))
        self.assertIsNotNone(trusted_cover("https://p26-xg-cover-sign.bdxiguaimg.com/abc.jpg"))

    def test_official_gate_cannot_be_bypassed(self):
        with patch("refresh_media_xigua_videos.json_request", return_value={
            "code": 0, "data": {"iframe_code": '<iframe src="https://www.ixigua.com/iframe/7444746393916277283?autoplay=0"></iframe>'}
        }):
            self.assertEqual(approved_embed("7444746393916277283"), "7444746393916277283")
        with patch("refresh_media_xigua_videos.json_request", return_value={
            "code": 0, "data": {"iframe_code": '<iframe src="https://evil.example/iframe/7444746393916277283"></iframe>'}
        }):
            self.assertIsNone(approved_embed("7444746393916277283"))
        self.assertIsNone(approved_embed("javascript:alert(1)"))

    def test_cross_title_and_franchise_rejected(self):
        self.assertTrue(accept(self.movie, {"name": "《海洋奇缘》中国大陆预告片"}))
        self.assertFalse(accept(self.movie, {"name": "《海洋奇缘2》预告片"}))
        self.assertFalse(accept(self.movie, {"name": "《海洋奇缘》游戏实况预告"}))

    def test_official_preflight_prevents_paid_search_on_html(self):
        with patch("refresh_media_xigua_videos.json_request", side_effect=ValueError("HTML instead of JSON")):
            self.assertFalse(official_api_ready())
        with patch("refresh_media_xigua_videos.json_request", return_value={"code": 123, "message": "sample video unavailable"}):
            self.assertTrue(official_api_ready())
        with patch("refresh_media_xigua_videos.json_request", return_value="<html>not json</html>"):
            self.assertFalse(official_api_ready())

    def test_metadata_only_search_never_claims_public_embed(self):
        mock_search=[{"data":{"group_id":"7444746393916277283",
              "title":"《海洋奇缘》正式预告片"}}]
        with (
            patch("refresh_media_xigua_videos.search",return_value=mock_search),
            patch("refresh_media_xigua_videos.approved_embed") as iframe,
            patch("refresh_media_xigua_videos.time.sleep",return_value=None),
        ):
            videos,count=discover(self.movie,"dummy",verify_embed=False)
        self.assertEqual((videos,count),([],1))
        iframe.assert_not_called()

    def test_paused_quota_safety_prevents_provider_calls(self):
        from refresh_media_xigua_videos import main
        with patch.dict(os.environ, {"XIGUA_AUTO_SEARCH_ENABLED":"false", "SANDBASE_API_KEY":"test-only"}), \
             patch("refresh_media_xigua_videos.json_request") as provider_request:
            main()
        provider_request.assert_not_called()

    def test_one_search_cap_preserves_first_metadata_result(self):
        class Budget:
            run_cap = 1
            this_run = 0
        budget = Budget()
        def once(query, key, b):
            self.assertIs(b, budget)
            budget.this_run += 1
            self.assertEqual(budget.this_run, 1)
            return [{"data": {"group_id":"7444746393916277283",
                              "title":"《海洋奇缘》正式预告片"}}]
        with patch("refresh_media_xigua_videos.search", side_effect=once) as api:
            videos, count = discover(self.movie, "dummy", budget, verify_embed=False)
        self.assertEqual(api.call_count, 1)
        self.assertEqual(count, 1)
        self.assertEqual(videos, [])

    def test_single_keyword_rotates_across_followup_passes(self):
        work = self.movie
        observed = []
        rows = [{"data": {"group_id": "7444746393916277283",
                          "title": "《海洋奇缘》正式预告片"}}]
        def fake_search(query, key, budget):
            observed.append(query)
            return rows
        first_candidates=[]
        second_candidates=[]
        with patch("refresh_media_xigua_videos.search",side_effect=fake_search):
            first, first_count=discover(
                work, "dummy", verify_embed=False,
                query_variant=0, queries_per_work=1,
                candidate_cache=first_candidates
            )
            second, second_count=discover(
                work, "dummy", verify_embed=False,
                query_variant=1, queries_per_work=1,
                candidate_cache=second_candidates
            )
        self.assertEqual(len(observed),2)
        self.assertNotEqual(observed[0],observed[1])
        self.assertEqual((first,second),([],[]))
        self.assertEqual((first_count,second_count),(1,1))
        self.assertEqual(first_candidates[0]["videoId"],"7444746393916277283")
        self.assertEqual(second_candidates[0]["videoId"],"7444746393916277283")

    def test_no_result_is_not_successfully_embeddable(self):
        with patch("refresh_media_xigua_videos.json_request", return_value={
            "status": "completed", "outputs": [{"data": {"err_code": 0, "results": []}}]
        }):
            self.assertEqual(search("海洋奇缘 预告", "test-only"), [])
        row = row_for(self.movie, {"videoId":"7444746393916277283", "name":"《海洋奇缘》正式预告",
                     "publisher":"西瓜视频", "thumbnail":None}, "7444746393916277283")
        self.assertTrue(row["embedVerified"])
        self.assertEqual(row["tmdbId"], 123)

if __name__ == "__main__":
    unittest.main()
