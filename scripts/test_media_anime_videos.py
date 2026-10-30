#!/usr/bin/env python3
"""No-network safeguards for anime title and edition matching."""
import unittest
from refresh_media_anime_videos import name_aliases, exact_title, year_match, safe_anime_video, season_marker, canonical_cached_clip, recheck_published

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

    def test_sequel_title_without_space(self):
        sequel = {"id":"bangumi-513878", "title":"赛博朋克：边缘行者 2",
                  "original":"Cyberpunk: Edgerunners 2", "year":2026,
                  "aliases":["赛博朋克：边缘行者 2","Cyberpunk: Edgerunners 2"]}
        self.assertTrue(safe_anime_video(sequel, {"name":"《赛博朋克：边缘行者2》官方预告片"}))
        self.assertTrue(safe_anime_video(sequel, {"name":"Cyberpunk: Edgerunners 2 Official Trailer"}))
        self.assertFalse(safe_anime_video(sequel, {"name":"《赛博朋克：边缘行者》第一季预告"}))

    def test_2026_remake_does_not_use_1994_or_2016_pv(self):
        remake = {"id":"bangumi-502123", "title":"魔法骑士雷阿斯 (2026)",
                  "original":"魔法騎士レイアース", "year":2026,
                  "aliases":["魔法骑士雷阿斯 (2026)", "魔法騎士レイアース"]}
        self.assertFalse(safe_anime_video(remake, {"name":"【1994年】魔法騎士レイアース PV"}))
        self.assertTrue(safe_anime_video(remake, {"name":"【2026年10月】魔法騎士レイアース TVアニメPV"}))

    def test_all_cached_video_rows_are_pruned_without_rescanning(self):
        w = {"id":"bangumi-541538","title":"幻想水浒传","original":"幻想水滸伝",
             "aliases":["幻想水浒传","幻想水滸伝"],"year":2026}
        def row(video_id,name):
            return {"kind":"anime","workId":w["id"],"year":2026,
                    "verifiedByCatalogTitle":True,"platform":"acfun",
                    "videoId":video_id,"verifiedSource":"https://www.acfun.cn/v/ac"+video_id,
                    "name":name}
        good=row("48317190","【10月/ 游戏改】动画《幻想水浒传》第一弹PV")
        bad=row("4781203","幻想水浒传1 剪辑版剧情解说 ep1")
        self.assertTrue(canonical_cached_clip(w,good))
        self.assertFalse(canonical_cached_clip(w,bad))
        assert_w = {**w, "aliases":w["aliases"]}
        items={w["id"]:{"videos":[good,bad], "youtubeTrailers":[]}}
        self.assertEqual(recheck_published(items,{w["id"]:assert_w}),1)
        self.assertEqual(items[w["id"]]["videos"],[good])

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
