#!/usr/bin/env python3
"""No-network safeguards for anime title and edition matching."""
import unittest
from refresh_media_anime_videos import name_aliases, exact_title, year_match, safe_anime_video, season_marker

class AnimeVideoMatching(unittest.TestCase):
    def test_one_piece_names_are_one_catalog_work(self):
        w = {"id": "bangumi-975", "title": "航海王", "original_title": "ONE PIECE", "english_title": ""}
        names = name_aliases(w)
        for title in ("航海王", "海贼王", "ONE PIECE", "ワンピース"):
            self.assertIn(title, names)
        work = {"id": "bangumi-975", "title": "航海王", "original": "ONE PIECE", "aliases": names, "year": 1999}
        ani = {"title": {"romaji": "ONE PIECE", "native": "ONE PIECE"}, "synonyms": [], "startDate": {"year": 1999}}
        self.assertTrue(year_match(work, ani))
        self.assertTrue(exact_title(work, ani))
        self.assertFalse(year_match(work, {"startDate": {"year": 2026}}))
        self.assertTrue(safe_anime_video(work, {"name": "《海贼王》TV动画纪念PV发布"}))
        self.assertFalse(safe_anime_video(work, {"name": "《海贼王》真人版官方预告"}))
        self.assertFalse(safe_anime_video(work, {"name": "THE ONE PIECE 重制版最新特报"}))

    def test_seasons_are_not_merged(self):
        w = {"id": "bangumi-568244", "title": "药屋少女的呢喃 第三季",
             "original": "薬屋のひとりごと 第3期", "aliases": ["药屋少女的呢喃 第三季", "薬屋のひとりごと 第3期"],
             "year": 2026}
        self.assertEqual(season_marker(w["original"]), "3")
        self.assertTrue(safe_anime_video(w, {"name": "《药屋少女的呢喃 第三季》最新 PV"}))
        self.assertFalse(safe_anime_video(w, {"name": "《药屋少女的呢喃》第一季 PV"}))
        self.assertFalse(safe_anime_video(w, {"name": "《药屋少女的呢喃》PV"}))

if __name__ == "__main__":
    unittest.main()
