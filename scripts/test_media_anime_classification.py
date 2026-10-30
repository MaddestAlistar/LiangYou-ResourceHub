#!/usr/bin/env python3
"""Offline coverage of exact-ID anime genre, themes and MAL advisory metadata."""
import unittest
from unittest.mock import patch
from refresh_media_anime_classification import (
    clean, mal_detail, combine, anilist_detail, record_map
)

class AnimeClassificationTests(unittest.TestCase):
    def test_one_piece_uses_real_catalog_identifier(self):
        rows=record_map()
        w=rows["bangumi-975"]
        self.assertEqual(w["bangumiId"],975)
        self.assertEqual(w["year"],1999)
        self.assertGreater(w["malId"],0)

    def test_mal_rating_is_only_shown_with_identical_id(self):
        w={"id":"bangumi-975","year":1999,"malId":21,"anilistId":21,"bangumiId":975}
        valid={"21":{"ok":True,"status":"ok","malId":21,
                      "contentRating":"pg_13","genres":["Action","Adventure"]}}
        self.assertEqual(mal_detail(w,valid)["suitability"],
                         {"source":"MAL","rating":"PG-13"})
        self.assertIsNone(mal_detail(w,{"21":{**valid["21"],"malId":22}}))
        self.assertIsNone(mal_detail(w,{"21":{**valid["21"],"contentRating":"unknown"}})["suitability"])

    def test_spoiler_and_adult_tags_never_appear(self):
        w={"id":"bangumi-975","year":1999,"anilistId":21,"malId":21,"bangumiId":975}
        x={"data":{"Media":{"id":21,"idMal":21,"type":"ANIME","isAdult":False,
           "startDate":{"year":1999},"genres":["Action","Adventure"],
           "tags":[{"name":"Pirates","rank":95,"isAdult":False,
                    "isMediaSpoiler":False,"isGeneralSpoiler":False},
                   {"name":"Secret villain","rank":100,"isAdult":False,
                    "isMediaSpoiler":True,"isGeneralSpoiler":False},
                   {"name":"18+","rank":100,"isAdult":True,
                    "isMediaSpoiler":False,"isGeneralSpoiler":False}]}}}
        with patch("refresh_media_anime_classification.request_json",return_value=x):
            r=anilist_detail(w)
        self.assertEqual(r["genres"],["Action","Adventure"])
        self.assertEqual(r["themes"],["Pirates"])
        x["data"]["Media"]["id"]=999
        with patch("refresh_media_anime_classification.request_json",return_value=x):
            self.assertIsNone(anilist_detail(w))

    def test_first_run_without_upstream_data_keeps_valid_empty_entry(self):
        w={"id":"bangumi-975","year":1999,"malId":21,"anilistId":21,"bangumiId":975}
        fresh=combine(w,{},None,None,None)
        self.assertEqual(fresh["workId"],"bangumi-975")
        self.assertEqual(fresh["genres"],[])
        self.assertEqual(fresh["keywords"],[])
        self.assertIsNone(fresh["parental_rating"])
        self.assertEqual(combine(w,fresh,None,None,None),fresh)

    def test_missing_classification_is_never_inferred(self):
        w={"id":"bangumi-975","year":1999,"malId":21,"anilistId":21,"bangumiId":975}
        r=combine(w,{},None,{"genres":["Adventure"],"themes":["Pirates"],"source":"AniList"},None)
        self.assertEqual(r["genres"],["Adventure"])
        self.assertEqual(r["keywords"],["Pirates"])
        self.assertIsNone(r["parental_rating"])
        self.assertEqual(clean(["<script>","Action","Action","Drama"]),["Action","Drama"])

if __name__=="__main__":
    unittest.main()
