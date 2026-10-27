#!/usr/bin/env python3
"""Offline regression tests: honest market history, bounded retention."""
import copy
import unittest
from datetime import datetime, timedelta, timezone
from update_market_history import build, valid_outcomes

UTC = timezone.utc

def iso(t):
    return t.isoformat(timespec="seconds").replace("+00:00","Z")

class MarketHistoryTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026,10,28,0,0,tzinfo=UTC)
        self.start = self.now + timedelta(days=2)
        self.checked = self.now - timedelta(hours=1)
        self.market = {"id":"sample-123","verification":"open_match_winner_market",
                       "start_time":iso(self.start),"checked_at":iso(self.checked),
                       "outcomes":[{"name":"T1","probability":.64},
                                   {"name":"GEN","probability":.36}]}
        self.feed = {"schema":1,"source_type":"prediction_market",
                     "generated_at":iso(self.checked),"events":[self.market]}
    def test_snapshot_seeds_and_idempotent(self):
        first=build({},[("polymarket",self.feed)],self.now)
        self.assertEqual(len(first["markets"]),1)
        self.assertEqual(first["markets"]["polymarket:sample-123"]["points"][0]["outcomes"][0],["T1",.64])
        second=build(first,[("polymarket",self.feed)],self.now)
        self.assertEqual(first,second)
    def test_separate_verified_snapshots_accumulate(self):
        first=build({},[("polymarket",self.feed)],self.now)
        later=copy.deepcopy(self.feed)
        later["generated_at"]=iso(self.now)
        later["events"][0]["checked_at"]=iso(self.now)
        later["events"][0]["outcomes"][0]["probability"]=.63
        later["events"][0]["outcomes"][1]["probability"]=.37
        result=build(first,[("polymarket",later)],self.now+timedelta(minutes=1))
        points=result["markets"]["polymarket:sample-123"]["points"]
        self.assertEqual(len(points),2)
        self.assertEqual([x["outcomes"][0][1] for x in points],[.64,.63])
    def test_no_stale_replayed_or_unverified_quotes(self):
        self.assertEqual(build({},[("polymarket",{
          **self.feed,"generated_at":iso(self.now-timedelta(hours=9))
        })],self.now)["markets"],{})
        fake=copy.deepcopy(self.feed)
        fake["events"][0]["verification"]="unconfirmed"
        self.assertEqual(build({},[("polymarket",fake)],self.now)["markets"],{})
        wrong=copy.deepcopy(self.feed)
        wrong["events"][0]["time_kind"]="market_close"
        self.assertEqual(build({},[("polymarket",wrong)],self.now)["markets"],{})
    def test_invalid_probability_or_duplicate_names(self):
        self.assertIsNone(valid_outcomes([{"name":"A","probability":.65},{"name":"A","probability":.35}]))
        self.assertIsNone(valid_outcomes([{"name":"A","probability":float("nan")},
                                          {"name":"B","probability":.25}]))
        invalid=copy.deepcopy(self.feed)
        invalid["events"][0]["outcomes"][0]["probability"]=99
        self.assertEqual(build({},[("predict",invalid)],self.now)["markets"],{})
    def test_expired_points_pruned(self):
        earlier=self.now-timedelta(days=9)
        record={"schema":1,"source_type":"verified_market_history","markets":{
            "polymarket:old":{"provider":"polymarket","id":"old","points":[
                {"at":iso(earlier),"outcomes":[["A",.5],["B",.5]]}
            ]}
        }}
        self.assertEqual(build(record,[],self.now)["markets"],{})

if __name__=="__main__":
    unittest.main()
