"""Regression checks for false freebies, stale data and wrong sports markets."""
import json
import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
import update_daily_free as apple
import update_android_free as android
import update_game_free as games
import update_sports as sports
import update_predict_sports as predict
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
        category["markets"][0]["marketType"] = "SPORTS_SPREAD"
        self.assertIsNone(predict.normalize(category, NOW))
        category["markets"][0]["marketType"] = "SPORTS_MONEYLINE"
        category["markets"][0]["outcomes"][0]["bestAsk"]["price"] = 1
        self.assertIsNone(predict.normalize(category, NOW))
        category["markets"][0]["outcomes"][0]["bestAsk"]["price"] = .62
        category.pop("startsAt")
        self.assertIsNone(predict.normalize(category, NOW))

    def test_predict_sports_skips_map_or_bad_outcomes(self):
        category = {
            "slug": "lol-team-a-vs-team-b-map-1", "title": "LoL Team A vs Team B Map 1",
            "status": "OPEN", "startsAt": "2026-10-25T13:00:00Z",
            "teams": [{"name": "Team A"}, {"name": "Team B"}],
            "markets": []
        }
        self.assertIsNone(predict.normalize(category, NOW))

if __name__ == '__main__': unittest.main()
