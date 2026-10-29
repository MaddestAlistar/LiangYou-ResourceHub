import unittest
from refresh_media_title_coverage import clean_videos, clean_articles


class CoverageTests(unittest.TestCase):
    def test_multiple_platforms_and_invalid_links(self):
        rows = [
            ("bilibili", "BV1234567890", "https://www.bilibili.com/video/BV1234567890/"),
            ("tencent", "c3278hj65i6", "https://v.qq.com/x/page/c3278hj65i6.html"),
            ("1905", "811133", "https://www.1905.com/video/play/811133.shtml"),
            ("youku", "XNDQ12345678", "https://v.youku.com/v_show/id_XNDQ12345678.html"),
            ("iqiyi", "abcd12345", "https://www.iqiyi.com/v_abcd12345.html"),
        ]
        videos = [dict(kind="movie", tmdbId=550, year=1999, verifiedByTitleId=True,
                       platform=p, videoId=i, verifiedSource=u) for p, i, u in rows]
        doc = dict(ok=True, kind="movie", tmdbId=550, year=1999, videos=videos)
        self.assertEqual(len(clean_videos(doc, "movie", 550)), 5)
        self.assertIsNone(clean_videos(doc, "movie", 551))
        for change in ({"tmdbId": 551}, {"year": 2026}, {"verifiedByTitleId": False},
                       {"verifiedSource": "https://www.1905.com/mdb/film/2119928/"}):
            altered = {**doc, "videos": [{**videos[0], **change}]}
            self.assertEqual(clean_videos(altered, "movie", 550), [])

    def test_news_confidence_survives_cache(self):
        doc = dict(ok=True, kind="movie", tmdbId=550, year=1999, articles=[
            dict(title="Fight Club director interview", url="https://example.com/film",
                 date="2026-10-29", titleMatchVerified=True, relevance=140, language="en")])
        self.assertEqual(clean_articles(doc, "movie", 550)[0]["relevance"], 140)


if __name__ == "__main__":
    unittest.main()
