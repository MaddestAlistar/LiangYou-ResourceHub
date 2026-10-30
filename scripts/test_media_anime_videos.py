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

    def test_old_franchise_clips_and_gameplay_are_rejected(self):
        restart = {"id": "bangumi-418229", "title": "魔法少女育成计划 restart",
                   "original": "魔法少女育成計画 restart",
                   "aliases": ["魔法少女育成计划 restart", "魔法少女育成計画 restart", "まほいく"],
                   "year": 2026}
        self.assertTrue(safe_anime_video(restart, {"name": "TV动画《魔法少女育成计划 restart》PV"}))
        self.assertFalse(safe_anime_video(restart, {"name": "【2016年秋アニメ】『魔法少女育成計画』PV第3弾【まほいく】"}))
        self.assertFalse(safe_anime_video(restart, {"name": "【鉄道PV】国鉄高崎 ~まほいくのOPより~"}))
        suikoden = {"id": "bangumi-541538", "title": "幻想水浒传",
                    "original": "幻想水滸伝", "year": 2026,
                    "aliases": ["幻想水浒传", "幻想水滸伝", "Suikoden: The Anime"]}
        self.assertFalse(safe_anime_video(suikoden, {"name": "幻想水浒传1 剪辑版剧情解说 ep1"}))
        self.assertTrue(safe_anime_video(suikoden, {"name": "动画《幻想水浒传》正式PV"}))

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
