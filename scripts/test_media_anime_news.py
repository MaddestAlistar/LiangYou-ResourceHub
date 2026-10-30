"""Offline regression checks for edition-scoped anime headlines."""
import unittest

from scripts.refresh_media_anime_news import (
    catalog, merge, search_names, season, verified_headline,
)


class AnimeNewsMatchingTests(unittest.TestCase):
    def test_season_spellings(self):
        for name in ("第二季", "第2期", "Season２", "Season 2", "2nd Season"):
            self.assertEqual(season(name), 2, name)
        self.assertEqual(season("第三季"), 3)
        self.assertEqual(season("第一季"), 0)

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
        self.assertEqual(works["mal-61323"]["season"], 2)
        self.assertIn("蓝箱 第二季", works["mal-61323"]["aliases"])

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
