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

    def test_ai_seed_score_is_labeled_not_claimed_as_user_rating(self):
        item = normalize(SAMPLE, group="popular", rank=1)
        self.assertEqual(item["rating"], 7.5)
        self.assertEqual(item["rating_type"], "ai")
        self.assertEqual(item["rating_votes"], 0)

    def test_real_user_score_takes_priority_over_ai_seed(self):
        sample = {**SAMPLE, "ratingCount": 11, "communityScore": 9.1}
        item = normalize(sample, group="popular", rank=1)
        self.assertEqual(item["rating"], 9.1)
        self.assertEqual(item["rating_type"], "user")
        self.assertEqual(item["rating_votes"], 11)

    def test_platform_rating_retains_explicit_source(self):
        sample = {**SAMPLE, "sourceRating": 8.2,
                  "sourceRatingSource": "example_provider"}
        item = normalize(sample, group="popular", rank=1)
        self.assertEqual(item["rating"], 8.2)
        self.assertEqual(item["rating_type"], "source")

    def test_unclassified_score_is_not_called_audience_rating(self):
        sample = {**SAMPLE, "score": 6.6, "scoreSource": "",
                  "aiScore": None}
        item = normalize(sample, group="popular", rank=1)
        self.assertEqual(item["rating"], 6.6)
        self.assertEqual(item["rating_type"], "reference")

    def test_no_score_stays_unavailable(self):
        sample = {**SAMPLE, "score": None, "aiScore": None}
        item = normalize(sample, group="popular", rank=1)
        self.assertIsNone(item["rating"])
        self.assertIsNone(item["rating_type"])

    def test_invalid_nan_and_infinite_scores_not_published(self):
        sample = {**SAMPLE, "score": float("nan"), "aiScore": float("inf")}
        item = normalize(sample, group="popular", rank=1)
        self.assertIsNone(item["rating"])

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
