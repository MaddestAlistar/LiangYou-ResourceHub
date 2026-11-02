#!/usr/bin/env python3
"""Offline fixture tests for DJHUB's documented native API response."""
import unittest
from refresh_short_drama import items_from, normalize, public_url, infer_kind

SAMPLE = {
    "id": "mc-a8a2faa1715c96aa4f6a",
    "title": "被抢功后，我怒撕无良上司",
    "poster": "https://themdjhub.org/assets/32/example.jpg",
    "overview": "职场逆袭短剧",
    "episodes": 38,
    "publishedEpisodes": 38,
    "contentType": "live_action",
    "contentTypeLabel": "真人剧",
    "popularity": 94770000,
    "score": 7.5,
    "scoreSource": "ai_initial",
    "ratingCount": 0,
    "genres": ["都市", "逆袭"],
    "platform": "河马短剧",
    "releaseDate": "2026-07-14",
}

class ShortDramaTests(unittest.TestCase):
    def test_native_envelope(self):
        self.assertEqual(items_from({"data": [SAMPLE], "meta": {"page": 1}}), [SAMPLE])

    def test_tmdb_envelope(self):
        self.assertEqual(items_from({"page": 1, "results": [SAMPLE]}), [SAMPLE])

    def test_real_drama(self):
        item = normalize(SAMPLE, group="popular", rank=1)
        self.assertEqual(item["kind"], "real")
        self.assertEqual(item["rank"], 1)
        self.assertEqual(item["episodes"], 38)
        self.assertEqual(item["heat"], 94770000)
        self.assertEqual(item["platform"], "河马短剧")
        self.assertEqual(item["tags"], ["都市", "逆袭"])
        self.assertEqual(item["poster"], SAMPLE["poster"])
        self.assertTrue(item["url"].endswith("/drama/mc-a8a2faa1715c96aa4f6a"))

    def test_unverified_ai_score_not_presented(self):
        self.assertIsNone(normalize(SAMPLE, group="popular", rank=1)["rating"])

    def test_ai_and_comics_use_source_classification(self):
        self.assertEqual(infer_kind({"contentType": "ai_drama"}), "ai")
        self.assertEqual(infer_kind({"contentType": "motion_comic"}), "comic")
        self.assertEqual(infer_kind({"contentType": "comic"}), "comic")

    def test_keep_secret_bearing_urls_private(self):
        self.assertEqual(public_url("https://example.com/img.jpg?api_key=secret", poster=True), "")
        self.assertEqual(public_url("http://example.com/img.jpg", poster=True), "")
        self.assertEqual(public_url("https://example.com/img.jpg?size=400", poster=True),
                         "https://example.com/img.jpg?size=400")

    def test_unknown_record_is_not_published(self):
        self.assertIsNone(normalize({"title": "无 ID"}, group="popular", rank=1))

if __name__ == "__main__":
    unittest.main()
