"""Offline regression checks for edition-scoped anime headlines."""
import unittest

from scripts.media_catalog import apply_verified_anime_video_links

from scripts.refresh_media_anime_news import (
    catalog, merge, search_names, season, verified_headline,
)


class AnimeNewsMatchingTests(unittest.TestCase):
    def test_season_spellings(self):
        for name in ("第二季", "第2期", "Season２", "Season 2", "2nd Season"):
            self.assertEqual(season(name), 2, name)
        self.assertEqual(season("第三季"), 3)
        self.assertEqual(season("第一季"), 1)

    def test_second_season_accepts_its_news_and_rejects_other_editions(self):
        aliases = ["青之箱 第二季", "アオのハコ Season２",
                   "Blue Box Season 2", "蓝箱 第二季"]
        self.assertTrue(verified_headline("《蓝箱》第二季正式PV公布", aliases, 2))
        self.assertTrue(verified_headline("TVアニメ『アオのハコ』Season2 PV公開", aliases, 2))
        self.assertTrue(verified_headline("Blue Box Season 2 new trailer revealed", aliases, 2))
        self.assertFalse(verified_headline("《蓝箱》第一季预告公开", aliases, 2))
        self.assertFalse(verified_headline("《蓝箱》第三季预告公开", aliases, 2))
        self.assertFalse(verified_headline("《蓝箱》角色相关话题合集", aliases, 2))

    def test_conan_anniversary_news(self):
        aliases = ["名侦探柯南", "名探偵コナン", "Detective Conan"]
        self.assertTrue(verified_headline("名侦探柯南动画30周年特别篇情报公开", aliases, 0))
        self.assertTrue(verified_headline("名探偵コナン TVアニメ30周年 OP決定", aliases, 0))
        self.assertFalse(verified_headline("日本动画产业30周年一般新闻", aliases, 0))

    def test_catalog_id_bridge_and_short_chinese_names(self):
        works = catalog()
        blue = works["bangumi-548156"]
        self.assertEqual(blue["season"], 2)
        self.assertIn("蓝箱 第二季", blue["aliases"])
        self.assertIn("Blue Box Season 2", blue["aliases"])
        self.assertIn("蓝箱", search_names(blue, "zh"))
        # The latest catalog may merge the MAL edition into the Bangumi
        # canonical record. Its ID must remain a valid alias, not a
        # fabricated standalone news-search work.
        from scripts.refresh_media_anime_news import read, CATALOG
        source = read(CATALOG)
        self.assertEqual(source["aliases"].get("mal-61323"), "bangumi-548156")
        if "mal-61323" in works:
            self.assertEqual(works["mal-61323"]["season"], 2)
            self.assertIn("蓝箱 第二季", works["mal-61323"]["aliases"])

    def test_verified_video_ids_bridge_only_the_same_anime_edition(self):
        works = {
            "bangumi-11": {"kind": "anime", "date": "2026-10-04",
                           "title": "蓝箱 第二季", "aliases": ["bangumi-11"]},
            "bangumi-12": {"kind": "anime", "date": "2025-10-04",
                           "title": "蓝箱 第一季", "aliases": ["bangumi-12"]},
        }
        aliases = {"bangumi-11": "bangumi-11", "bangumi-12": "bangumi-12"}
        videos = {
            "bangumi-11": {"workId": "bangumi-11", "kind": "anime",
                           "title": "蓝箱 第二季", "year": 2026,
                           "malId": 61323, "anilistId": 189123},
            "bangumi-12": {"workId": "bangumi-12", "kind": "anime",
                           "title": "蓝箱 第一季", "year": 2025,
                           "malId": 61323, "anilistId": 189123},
        }
        apply_verified_anime_video_links(works, aliases, videos)
        self.assertEqual(aliases["mal-61323"], "bangumi-11")
        self.assertEqual(aliases["anilist-189123"], "bangumi-11")
        self.assertIn("mal-61323", works["bangumi-11"]["aliases"])
        self.assertNotIn("mal-61323", works["bangumi-12"]["aliases"])
        self.assertEqual(works["bangumi-11"]["mal_id"], 61323)
        # Titles and years from stale cache rows are not sufficient to
        # change an existing provider ID into a different series.
        videos["bangumi-11"]["title"] = "蓝箱 第一季"
        videos["bangumi-11"]["malId"] = 777
        apply_verified_anime_video_links(works, aliases, videos)
        self.assertNotIn("mal-777", aliases)

    def test_stale_unverified_rows_cannot_survive_refresh(self):
        work = {"season": 2, "aliases": ["蓝箱 第二季"]}
        bad = {"title": "《其他作品》第二季动画预告片公布",
               "url": "https://example.com/bad", "language": "zh",
               "titleMatchVerified": True}
        good = {"title": "《蓝箱》第二季动画预告片公布",
                "url": "https://example.com/good", "language": "zh",
                "titleMatchVerified": True}
        result = merge([bad, good], [], work)
        self.assertEqual([x["url"] for x in result], [good["url"]])


if __name__ == "__main__":
    unittest.main()
