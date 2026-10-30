import unittest
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
