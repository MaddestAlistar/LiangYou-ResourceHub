"""Regression checks for false freebies, stale data and wrong sports markets."""
import json
import unittest
from datetime import datetime, timezone, timedelta
import datetime as dt
from unittest.mock import patch
import update_daily_free as apple
import update_android_free as android
import update_game_free as games
import update_sports as sports
import update_predict_sports as predict
import update_kalshi_sports as kalshi
from refresh_data import is_due, verified_time

NOW = datetime(2026, 10, 24, 11, 30, tzinfo=timezone.utc)

class FeedRules(unittest.TestCase):
    def test_iap_is_not_app_free_and_29_cents_is_not_free(self):
        def feed(summary):
            return ('<feed xmlns="http://www.w3.org/2005/Atom"><entry><link href="https://appstore-discounts.eyelly.me/us/123456789"/><updated>2026-10-24T09:00:00Z</updated><summary>' + summary + '</summary></entry></feed>').encode()
        self.assertEqual(apple.parse_rss(feed('Lifetime Membership: $9.99 → Free'), 'us', NOW), [])
        self.assertEqual(apple.parse_rss(feed('Price: $2.99 → $0.29'), 'us', NOW), [])
        self.assertEqual(apple.parse_rss(feed('Price: $0.99 → Free'), 'us', NOW)[0]['original_price'], '$0.99')

    def test_us_unspecified_local_time_does_not_drop_today(self):
        raw = b'<h2>Price history</h2><table><tr><td>10/24/2026 13:05</td><td>Free</td></tr><tr><td>09/16/2026 07:05</td><td>$0.99</td></tr></table>'
        value = apple.parse_us_history(raw, 123456789, NOW)
        self.assertIsNotNone(value)
        self.assertEqual(value['date_precision'], 'day')
        self.assertIsNone(apple.parse_us_history(raw.replace(b'10/24/2026', b'08/24/2026'), 123456789, NOW))
        self.assertIsNone(apple.parse_us_history(raw.replace(b'$0.99', b'Free'), 123456789, NOW))

    def test_google_play_identity_currency_and_price(self):
        item = {'@type':'SoftwareApplication', 'url':'https://play.google.com/store/apps/details?id=com.example.app', 'name':'Example', 'offers':[{'price':'0','priceCurrency':'USD','availability':'https://schema.org/InStock'}]}
        def raw(): return '<script type="application/ld+json">' + json.dumps(item) + '</script>'
        self.assertEqual(android.play_price(raw(), 'com.example.app')[0], 0)
        item['offers'][0]['price'] = '0.99'
        self.assertEqual(android.play_price(raw(), 'com.example.app')[0], .99)
        with self.assertRaises(ValueError): android.play_price(raw(), 'com.example.other')
        item['offers'][0]['priceCurrency'] = 'EUR'
        with self.assertRaises(ValueError): android.play_price(raw(), 'com.example.app')

    def test_sub_dollar_android_prices_are_not_lost(self):
        raw = b'<div><h3>Example</h3><a href="https://play.google.com/store/apps/details?id=com.example.app">Store</a> FREE $0.49 -100%</div>'
        self.assertEqual(android.parse_appsales(raw, 1)[0]['original_price'], '$0.49')
        self.assertEqual(android.parse_appsales(raw.replace(b'$0.49', b'$0.00'), 1), [])

    def epic_data(self):
        return {'data':{'Catalog':{'searchStore':{'elements':[{'id':'game1','title':'Example','offerType':'BASE_GAME', 'productSlug':'example', 'price':{'totalPrice':{'discountPrice':0,'originalPrice':1000,'currencyCode':'CNY','fmtPrice':{'originalPrice':'¥10'}}}, 'promotions':{'promotionalOffers':[{'promotionalOffers':[{'startDate':'2026-10-22T15:00:00Z','endDate':'2026-10-29T15:00:00Z','discountSetting':{'discountPercentage':0}}]}]}}]}}}}

    def test_epic_current_window_and_original_price_required(self):
        data = self.epic_data()
        self.assertEqual(len(games.parse_epic(data, 'cn', NOW)), 1)
        self.assertEqual(games.parse_epic(data, 'cn', NOW + timedelta(days=10)), [])
        self.assertEqual(games.parse_epic(data, 'cn', NOW - timedelta(days=10)), [])
        data['data']['Catalog']['searchStore']['elements'][0]['price']['totalPrice']['originalPrice'] = 0
        self.assertEqual(games.parse_epic(data, 'cn', NOW), [])

    def test_steam_free_weekend_is_not_keep_and_dlc_is_labelled(self):
        option = {'packageid':1,'is_free_to_keep':1,'discount_pct':100,'final_price_in_cents':'0','original_price_in_cents':'499','free_to_keep_ends':int((NOW + timedelta(days=1)).timestamp())}
        def raw(): return '<div data-props=\'' + json.dumps({'best_purchase_option':option}) + '\'></div>'
        app = {'steam_appid':1234, 'name':'Example DLC', 'type':'dlc','fullgame':{'name':'Example Game'}}
        result = games.parse_steam(raw(), app, NOW)
        self.assertEqual(result['kind'], 'dlc')
        self.assertEqual(result['requires_base_game'], 'Example Game')
        option['is_free_to_keep'] = 0
        self.assertIsNone(games.parse_steam(raw(), app, NOW))
        option['is_free_to_keep'] = 1
        option['free_to_keep_ends'] = int(NOW.timestamp()) - 1
        self.assertIsNone(games.parse_steam(raw(), app, NOW))

    def event(self):
        return {'id':123, 'slug':'lol-team-a-team-b-2026-10-25', 'title':'Team Alpha vs. Team Beta', 'active':True, 'closed':False, 'startTime':'2026-10-25T11:00:00Z','markets':[{'id':'111', 'active':True, 'closed':False,'acceptingOrders':True,'sportsMarketType':'moneyline','question':'Team Alpha vs. Team Beta','outcomes':['Team Alpha','Team Beta'],'outcomePrices':['0.575','0.425'],'gameStartTime':'2026-10-25T11:00:00Z'}]}

    def test_sports_only_active_match_winner(self):
        event = self.event()
        self.assertEqual(sports.normalize(event,'lol','LoL',NOW)['outcomes'][0]['probability'], .575)
        event['markets'][0]['acceptingOrders'] = False
        self.assertIsNone(sports.normalize(event,'lol','LoL',NOW))
        event['markets'][0]['acceptingOrders'] = True
        event['markets'][0]['sportsMarketType'] = 'spreads'
        self.assertIsNone(sports.normalize(event,'lol','LoL',NOW))

    def test_sports_listing_date_cannot_be_kickoff(self):
        event = self.event()
        del event['startTime']; del event['markets'][0]['gameStartTime']
        event['startDate'] = '2026-10-25T11:00:00Z'
        self.assertIsNone(sports.normalize(event,'lol','LoL',NOW))
        event['startTime'] = '2026-10-23T11:00:00Z'
        self.assertIsNone(sports.normalize(event,'lol','LoL',NOW))

    def test_sports_rejects_map_market_and_inconsistent_times(self):
        event = self.event(); event['markets'][0]['question'] = 'Game 1: Team Alpha vs. Team Beta'
        self.assertIsNone(sports.normalize(event,'lol','LoL',NOW))
        event = self.event(); event['markets'][0]['gameStartTime'] = '2026-10-26T11:00:00Z'
        self.assertIsNone(sports.normalize(event,'lol','LoL',NOW))

    def test_football_reconstructs_only_complete_three_way_market(self):
        event = self.event(); event['markets'] = []
        for index,(question,p) in enumerate([('Will Team Alpha win?',.5),('Will Team Alpha vs. Team Beta end in a draw?',.2),('Will Team Beta win?',.3)]):
            event['markets'].append({'id':str(index),'active':True,'closed':False,'acceptingOrders':True,'sportsMarketType':'moneyline','question':question,'outcomes':['Yes','No'],'outcomePrices':[p,1-p]})
        self.assertEqual(len(sports.normal_market(event,'football')),3)
        event['markets'].pop()
        self.assertIsNone(sports.normal_market(event,'football'))


    def test_polymarket_selected_market_stats_are_not_mixed_with_side_bets(self):
        event = self.event()
        market = event["markets"][0]
        market.update({"volume24hr": 1280.5, "volumeNum": 9200,
                       "liquidityNum": 840, "clobTokenIds": ["12345678901234567890", "98765432109876543210"]})
        event["markets"].append({"id": "side", "volume24hr": 999999, "volumeNum": 999999})
        row = sports.normalize(event, "lol", "League of Legends", NOW)
        self.assertEqual(row["stats"]["volume_24h_usd"], 1280.5)
        self.assertEqual(row["stats"]["volume_total_usd"], 9200)
        self.assertEqual(row["stats"]["liquidity_usd"], 840)
        self.assertEqual(row["outcomes"][0]["_clob_token"], "12345678901234567890")
        self.assertNotIn("best_bid", row["outcomes"][0])
        market["volumeNum"] = 1000
        row = sports.normalize(event, "lol", "League of Legends", NOW)
        self.assertEqual(row["stats"]["volume_24h_usd"], 1280.5)
        self.assertNotIn("volume_total_usd", row["stats"])

    def test_polymarket_orderbook_filters_invalid_prices_and_selects_best(self):
        raw = {"bids": [{"price":"0.4","size":"11"}, {"price":"0.49","size":"22"}],
               "asks": [{"price":"0.55","size":"10"}, {"price":"0.53","size":"9"}]}
        class Resp:
            def __enter__(self): return self
            def __exit__(self,*args): return False
            def read(self): return json.dumps(raw).encode()
        with patch.object(sports, "urlopen", return_value=Resp()):
            result = sports.book_quote("12345678901234567890")
        self.assertEqual(result["best_bid"], .49)
        self.assertEqual(result["best_ask"], .53)
        self.assertEqual(result["best_bid_size"], 22)
        self.assertIsNone(sports.book_quote("not-a-token"))

    def test_polymarket_cleans_internal_token_ids_when_book_unavailable(self):
        rows = [{"outcomes":[{"name":"A","_clob_token":"12345678901234567890"}]}]
        with patch.object(sports, "book_quote", return_value=None):
            self.assertEqual(sports.enrich_books(rows), 0)
        self.assertNotIn("_clob_token", rows[0]["outcomes"][0])
        self.assertNotIn("_clob_ref", rows[0]["outcomes"][0])

    def test_predict_stats_accept_only_valid_positive_amounts(self):
        class Resp:
            def __enter__(self): return self
            def __exit__(self,*args): return False
            def read(self): return json.dumps({"success": True,
                "data":{"volume24hUsd":123.4,"volumeTotalUsd":2345,
                        "totalLiquidityUsd":0}}).encode()
        with patch.object(predict, "urlopen", return_value=Resp()):
            stats = predict.market_statistics("dummy", "3333")
        self.assertEqual(stats, {"volume_24h_usd":123.4,"volume_total_usd":2345.0})
        self.assertEqual(predict.market_statistics("dummy", "oops"), {})

    def test_predict_stats_keep_valid_fields_when_24h_exceeds_lifetime(self):
        class Resp:
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self):
                return json.dumps({"success": True, "data": {
                    "volume24hUsd": 1250, "volumeTotalUsd": 975,
                    "totalLiquidityUsd": 4200
                }}).encode()
        with patch.object(predict, "urlopen", return_value=Resp()):
            stats = predict.market_statistics("dummy", "12345")
        self.assertEqual(stats["volume_24h_usd"], 1250.0)
        self.assertEqual(stats["liquidity_usd"], 4200.0)
        self.assertNotIn("volume_total_usd", stats)

    def test_predict_stats_allow_consistent_equal_volumes(self):
        class Resp:
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self):
                return json.dumps({"success": True, "data": {
                    "volume24hUsd": 100, "volumeTotalUsd": 100
                }}).encode()
        with patch.object(predict, "urlopen", return_value=Resp()):
            stats = predict.market_statistics("dummy", "12345")
        self.assertEqual(stats["volume_total_usd"], 100.0)

    def test_kalshi_three_way_moneyline_and_units(self):
        now = NOW
        when = "2026-10-25T13:00:00Z"
        event = {"event_ticker":"KXEPLGAME-26OCT25AB", "series_ticker":"KXEPLGAME",
                 "category":"Sports","title":"Team Alpha vs Team Beta",
                 "product_metadata":{"game_start_time":when},
                 "markets":[]}
        for suffix,name,bid,ask in (("A","Team Alpha",".49",".51"),
                                    ("D","Draw",".20",".22"),
                                    ("B","Team Beta",".29",".29")):
            event["markets"].append({
                "ticker":event["event_ticker"]+"-"+suffix,
                "event_ticker":event["event_ticker"],"market_type":"binary",
                "status":"active","result":"","yes_sub_title":name,
                "yes_bid_dollars":bid,"yes_ask_dollars":ask,
                "yes_bid_size_fp":"10.50","yes_ask_size_fp":"20.00",
                "volume_fp":"100.00","volume_24h_fp":"30.00",
                "open_interest_fp":"44.00","close_time":when
            })
        answer = kalshi.normalize(event,"KXEPLGAME",now)
        self.assertIsNotNone(answer)
        self.assertEqual([o["name"] for o in answer["outcomes"]],
                         ["Team Alpha","平局","Team Beta"])
        self.assertEqual(answer["time_kind"],"kickoff")
        self.assertEqual(kalshi.normalize(event,"KXEPLGAME",now,"english-premier-league-game")["source_url"],
                         "https://kalshi.com/markets/kxeplgame/english-premier-league-game/kxeplgame-26oct25ab")
        self.assertEqual(answer["stats"]["volume_24h_contracts"],90)
        self.assertNotIn("volume_24h_usd",answer["stats"])
        self.assertEqual(answer["outcomes"][0]["best_bid_size"],10.5)
        event["markets"][0]["yes_bid_dollars"]="0"
        self.assertIsNone(kalshi.normalize(event,"KXEPLGAME",now))

    def test_kalshi_close_time_not_kickoff_and_banned_props(self):
        when="2026-10-25T13:00:00Z"
        event={"event_ticker":"KXLOLGAME-26OCT25A","series_ticker":"KXLOLGAME",
               "title":"Team Alpha vs Team Beta","markets":[]}
        for team,p in (("Team Alpha",".45"),("Team Beta",".55")):
            event["markets"].append({
                "ticker":event["event_ticker"]+("-A" if team.endswith("Alpha") else "-B"),
                "event_ticker":event["event_ticker"],
                "market_type":"binary","status":"active","result":"",
                "yes_sub_title":team,"yes_bid_dollars":p,"yes_ask_dollars":p,
                "close_time":when
            })
        out=kalshi.normalize(event,"KXLOLGAME",NOW)
        self.assertEqual(out["time_kind"],"market_close")
        event["markets"][0]["yes_sub_title"]="Game 1 kills over 25"
        self.assertIsNone(kalshi.normalize(event,"KXLOLGAME",NOW))
        event["markets"][0]["yes_sub_title"]="Team Alpha"
        event["markets"][0]["status"]="settled"
        self.assertIsNone(kalshi.normalize(event,"KXLOLGAME",NOW))

    def test_kalshi_empty_series_keeps_schema_and_rejects_invalid_market(self):
        self.assertEqual(kalshi.price("0.6012"),.6012)
        self.assertIsNone(kalshi.price("0"))
        self.assertIsNone(kalshi.price("nan"))
        self.assertIsNone(kalshi.positive_number("-4"))
        self.assertIsNone(kalshi.moment("not-an-iso-time"))


    def test_sports_coverage_requires_no_new_concurrent_workflows(self):
        from refresh_data import JOBS
        self.assertIn("sports", JOBS)
        self.assertIn("kalshi", JOBS)
        self.assertEqual(JOBS["sports"][2], 2)
        self.assertEqual(JOBS["kalshi"][2], 2)

    def test_sports_event_source_expansion_remains_bounded(self):
        self.assertGreater(len(sports.SOURCES), 3)
        self.assertLessEqual(len({t for _,_,tags in sports.SOURCES for t in tags}),25)
        self.assertTrue("nhl" in [t for _,_,tags in sports.SOURCES for t in tags])

    def test_kalshi_series_discovery_is_bounded_and_filters_props(self):
        mock = {"series":[
            {"ticker":"KXWNBAABC","title":"WNBA Game Match Winner","tags":["WNBA"]},
            {"ticker":"KXSPREADNCAA","title":"NCAA Basketball Game Spread","tags":["College Basketball"]},
            {"ticker":"KXUFCH2H","title":"UFC Fight Match","tags":["MMA"]},
        ]}
        class Resp:
            def __enter__(self): return self
            def __exit__(self,*args): return False
            def read(self): return json.dumps(mock).encode()
        with patch.object(kalshi,"urlopen",return_value=Resp()):
            extras=kalshi.find_extra_series()
        self.assertEqual(len(extras),2)
        self.assertEqual(extras[0][0],"basketball")
        self.assertEqual(extras[1][0],"other")

    def test_scheduler_uses_oldest_successful_region_not_generation_time(self):
        snapshot = {'generated_at':'2026-10-24T11:30:00Z','regions':{'cn':{'verified_at':'2026-10-24T11:00:00Z'},'us':{'verified_at':'2026-10-24T07:00:00Z'}}}
        self.assertTrue(is_due(verified_time('apple',snapshot),NOW,3))
        self.assertFalse(is_due(NOW - timedelta(hours=2),NOW,3))
        self.assertTrue(is_due(None,NOW,3))

    def test_predict_sports_requires_real_start_time_and_moneyline_quote(self):
        category = {
            "id": 42, "slug": "lol-alpha-beta-2026-10-25",
            "title": "LoL: Team Alpha vs Team Beta", "status": "OPEN",
            "startsAt": "2026-10-25T13:00:00Z", "isVisible": True,
            "teams": [{"name": "Team Alpha"}, {"name": "Team Beta"}],
            "markets": [{
                "id": 100, "marketType": "SPORTS_MONEYLINE", "tradingStatus": "OPEN",
                "outcomes": [
                    {"name": "TA", "variantDetails": {"sports": {"team": {"name": "Team Alpha"}}},
                     "bestBid": {"price": .60}, "bestAsk": {"price": .62}},
                    {"name": "TB", "variantDetails": {"sports": {"team": {"name": "Team Beta"}}},
                     "bestBid": {"price": .38}, "bestAsk": {"price": .40}}
                ]
            }]
        }
        record = predict.normalize(category, NOW)
        self.assertEqual(record["provider"], "predict")
        self.assertAlmostEqual(record["outcomes"][0]["probability"], .61)
        self.assertAlmostEqual(record["outcomes"][1]["probability"], .39)
        self.assertAlmostEqual(record["outcomes"][0]["best_bid"], .60)
        self.assertAlmostEqual(record["outcomes"][0]["best_ask"], .62)
        self.assertIsNone(record["best_of"])
        self.assertIsNone(record["competition"])
        category["markets"][0]["marketType"] = "SPORTS_SPREAD"
        self.assertIsNone(predict.normalize(category, NOW))
        category["markets"][0]["marketType"] = "SPORTS_MONEYLINE"
        category["markets"][0]["outcomes"][0]["bestAsk"]["price"] = 1
        self.assertIsNone(predict.normalize(category, NOW))
        category["markets"][0]["outcomes"][0]["bestAsk"]["price"] = .62
        category.pop("startsAt")
        self.assertIsNone(predict.normalize(category, NOW))

    def test_predict_rich_metadata_uses_only_real_match_fields(self):
        category = {
            "id": 88, "slug": "lol-team-a-team-b-2026-10-25",
            "title": "LoL: Team A vs Team B (BO3) - Worlds Group Stage",
            "status": "OPEN", "startsAt": "2026-10-25T13:00:00Z",
            "variantDetails": {"sports": {
                "teams": [{"name": "Team A"}, {"name": "Team B"}],
                "scoreboard": {"bestOf": 3}}},
            "markets": [{"id": 200, "marketType": "SPORTS_MONEYLINE", "tradingStatus": "OPEN",
                "outcomes": [
                    {"name": "Team A", "bestBid": {"price": .48}, "bestAsk": {"price": .50}},
                    {"name": "Team B", "bestBid": {"price": .50}, "bestAsk": {"price": .52}}
                ]}]
        }
        event = predict.normalize(category, NOW)
        self.assertIsNotNone(event)
        self.assertEqual(event["best_of"], 3)
        self.assertEqual(event["competition"], "Worlds Group Stage")
        self.assertEqual(event["outcomes"][0]["best_ask"], .50)
        self.assertTrue("best_bid_size" not in event["outcomes"][0])

    def test_predict_sports_skips_map_or_bad_outcomes(self):
        category = {
            "slug": "lol-team-a-vs-team-b-map-1", "title": "LoL Team A vs Team B Map 1",
            "status": "OPEN", "startsAt": "2026-10-25T13:00:00Z",
            "teams": [{"name": "Team A"}, {"name": "Team B"}],
            "markets": []
        }
        self.assertIsNone(predict.normalize(category, NOW))


    def test_official_football_and_basketball_status_scores(self):
        import update_real_sports as real
        now = dt.datetime(2026,10,27,12,0,tzinfo=dt.timezone.utc)
        football={"fixture":{"id":12,"date":"2026-10-27T15:00:00+00:00",
                   "status":{"short":"FT","long":"Match Finished"}},
                  "league":{"name":"Premier League","round":"Regular Season - 10"},
                  "teams":{"home":{"name":"Team A"},"away":{"name":"Team B"}},
                  "goals":{"home":2,"away":1}}
        event=real.football_row(football,now)
        self.assertEqual(event["status"],"finished")
        self.assertEqual((event["score_home"],event["score_away"]),(2,1))
        football["fixture"]["status"]["short"]="NS"
        self.assertIsNone(real.football_row(football,now)["score_home"])
        basketball={"id":99,"date":"2026-10-27T15:00:00Z","league":{"name":"NBA"},
                    "teams":{"home":{"name":"Lakers"},"away":{"name":"Warriors"}},
                    "status":{"short":"Q3"},"scores":{"home":{"total":55},"away":{"total":51}}}
        parsed=real.basketball_row(basketball,now)
        self.assertEqual(parsed["status"],"live")
        self.assertEqual(parsed["score_away"],51)

    def test_pandascore_only_real_teams_scores_and_schedule(self):
        import update_real_sports as real
        now = dt.datetime(2026,10,27,12,0,tzinfo=dt.timezone.utc)
        raw={"id":52,"scheduled_at":"2026-10-29T12:00:00Z","status":"finished",
             "videogame":{"slug":"league-of-legends","name":"LoL"},
             "league":{"name":"Worlds"},"tournament":{"name":"Playoffs"},
             "opponents":[{"opponent":{"id":2,"name":"TES"}},{"opponent":{"id":3,"name":"T1"}}],
             "results":[{"team_id":2,"score":2},{"team_id":3,"score":3}],
             "number_of_games":5}
        row=real.pandascore_row(raw,now)
        self.assertEqual(row["sport"],"lol")
        self.assertEqual((row["score_home"],row["score_away"]),(2,3))
        self.assertEqual(row["best_of"],5)
        raw["opponents"]=[]
        self.assertIsNone(real.pandascore_row(raw,now))

    def test_diversified_esports_standings_budget(self):
        import update_real_sports as real
        records=[
          {"tournament_id":i,"sport":"lol","league":"Worlds","tournament_name":"Group Stage"}
          for i in range(1,9)
        ]+[
          {"tournament_id":i,"sport":"esports","league":"PGL Masters","tournament_name":"Group Stage"}
          for i in range(100,104)
        ]
        called=[]
        def fake_get(url,headers):
            called.append(url)
            if "/standings?" in url:
                ident=int(url.split("/tournaments/")[1].split("/")[0])
                return [{"team":{"name":"Team"+str(ident)},"rank":1,"wins":2,"losses":0}]
            return []
        with patch.object(real,"json_request",side_effect=fake_get):
            _,standings=real.tournament_extras(records,"dummy")
        self.assertEqual(len(standings),6)
        self.assertEqual(sum(s["sport"]=="lol" for s in standings),4)
        self.assertEqual(sum(s["sport"]=="esports" for s in standings),2)
        self.assertLessEqual(len(called),real.MAX_STANDINGS_REQUESTS)

    def test_official_collectors_rate_budget(self):
        import update_real_sports as real
        self.assertEqual(len(real.FOOTBALL),5)
        self.assertEqual(len(real.PANDA_ENDPOINTS),3)
        self.assertEqual(len(real.PANDA_LOL_MATCHES),2)
        self.assertEqual(len(real.PANDA_LOL_TOURNAMENTS),2)
        self.assertEqual(real.MAX_BRACKET_REQUESTS,5)
        self.assertEqual(real.MAX_STANDINGS_REQUESTS,6)
        self.assertLessEqual(len(real.PANDA_ENDPOINTS)+len(real.PANDA_LOL_MATCHES)+
            len(real.PANDA_LOL_TOURNAMENTS)+real.MAX_BRACKET_REQUESTS+
            real.MAX_STANDINGS_REQUESTS,18)



    def test_real_tournament_bracket_requires_provider_teams(self):
        import update_real_sports as real
        raw=[{"round_name":"Semifinals","matches":[
            {"id":19,"opponents":[
                {"opponent":{"id":1,"name":"T1"}},{"opponent":{"id":2,"name":"BLG"}}],
             "results":[{"team_id":1,"score":3},{"team_id":2,"score":1}],"winner_id":1}]}]
        result=real.official_bracket(raw,345,"Worlds")
        self.assertEqual(result["rounds"][0]["round"],"Semifinals")
        self.assertEqual(result["rounds"][0]["matches"][0]["winner"],"T1")
        self.assertEqual(result["rounds"][0]["matches"][0]["score_home"],3)
        self.assertIsNone(real.official_bracket([{"name":"Unknown"}],345,"Worlds"))

    def test_real_standings_no_inferred_ranks(self):
        import update_real_sports as real
        raw=[{"rank":2,"team":{"name":"TES"},"wins":5,"losses":3},
             {"team":{"name":"Unranked"}}]
        board=real.panda_standings(raw,123,"Playoffs")
        self.assertEqual(len(board["groups"]),1)
        self.assertEqual(board["groups"][0]["rank"],2)
        self.assertEqual(board["groups"][0]["wins"],5)


    def test_featured_tournament_prioritizes_worlds(self):
        import update_real_sports as real
        self.assertGreater(real.popularity("Worlds","Knockout Stage","lol"),
                           real.popularity("LGC Rising","Playoffs","lol"))
        self.assertGreater(real.popularity("NBA","","basketball"),
                           real.popularity("DFRAG Invitational","","esports"))

    def test_high_priority_lol_tournament_discovery(self):
        import update_real_sports as real
        fake=[{"id":810,"name":"Playoffs","has_bracket":True,
               "begin_at":"2026-10-23T00:00:00Z","end_at":"2026-11-02T00:00:00Z",
               "league":{"name":"Worlds"}},
              {"id":812,"name":"Groups","has_bracket":False,
               "begin_at":"2026-10-23T00:00:00Z"}]
        with patch.object(real,"json_request",return_value=fake):
            results=real.discover_lol_tournaments("dummy",
                dt.datetime(2026,10,27,tzinfo=dt.timezone.utc))
        self.assertEqual(len(results),2)
        self.assertTrue(all(v["tournament_id"]==810 and v["sport"]=="lol" for v in results))

    def test_bracket_round_sorting_never_uses_match_title_as_round(self):
        import update_real_sports as real
        raw=[{"name":"Final: A vs B","opponents":[{"opponent":{"id":1,"name":"A"}},{"opponent":{"id":2,"name":"B"}}]},
             {"name":"Semifinal 2: A vs C","opponents":[{"opponent":{"id":1,"name":"A"}},{"opponent":{"id":3,"name":"C"}}]},
             {"name":"Quarterfinal 4: B vs D","opponents":[{"opponent":{"id":2,"name":"B"}},{"opponent":{"id":4,"name":"D"}}]}]
        normalized=real.official_bracket(raw,55,"Cup · Playoffs")
        self.assertEqual([r["round"] for r in normalized["rounds"]],
                         ["Quarterfinals","Semifinals","Final"])
        self.assertEqual(normalized["rounds"][0]["matches"][0]["score_home"],None)

if __name__ == '__main__': unittest.main()
