import unittest
from unittest.mock import patch
from datetime import timedelta
import update_media_intel as m

class MediaTests(unittest.TestCase):
    def test_failure_preserves_real_timestamp_and_content(self):
        old={'status':'ok','items':[{'id':'1'}],'updated_at':'2026-01-01T00:00:00Z','checked_at':'2026-01-01T00:00:00Z'}
        with patch.object(m,'now',return_value=m.date('2026-02-01T00:00:00Z')):
            result=m.refresh_source('tmdb',old,lambda:(_ for _ in ()).throw(m.FeedError('http_429')))
        self.assertEqual(result['items'],old['items']);self.assertEqual(result['updated_at'],old['updated_at']);self.assertEqual(result['status'],'stale')
    def test_daily_sources_cannot_burn_quota_on_rerun(self):
        old={'status':'unavailable','items':[],'checked_at':m.iso()}
        loader=unittest.mock.Mock()
        self.assertEqual(m.refresh_source('watchmode',old,loader),old);loader.assert_not_called()
    def test_missing_key_is_not_success(self):
        with patch.dict(m.os.environ,{},clear=True):
            result=m.refresh_source('omdb',{},lambda:m.enrich('omdb',[]))
        self.assertEqual(result['status'],'unavailable');self.assertNotIn('updated_at',result)
    def test_score_scales_are_not_conflated(self):
        self.assertEqual(m.rating('AniList',81,100)[0]['scale'],100)
        self.assertEqual(m.rating('TMDB',8.1)[0]['scale'],10)
        self.assertEqual(m.rating('TMDB',None),[]);self.assertEqual(m.rating('TMDB',0),[])
    def test_untrusted_urls_and_html(self):
        self.assertEqual(m.safe_url('javascript:alert(1)'), '')
        self.assertEqual(m.safe_url('https://user:password@example.com'), '')
        self.assertEqual(m.clean('<b>标题</b> &amp; title'),'标题 & title')
    def test_tmdb_tv_identity_and_missing_date(self):
        x=m.tmdb_item({'id':12,'name':'中文名','original_name':'Original','vote_average':0},'tv')
        self.assertEqual(x['id'],'tmdb-tv-12');self.assertEqual(x['ratings'],[]);self.assertEqual(x['date'],'')
    def test_watchmode_does_not_guess_by_title(self):
        requests=[]
        def fake(url,params=None,headers=None,body=None):
            requests.append((url,params))
            if '/search/' in url:return {'title_results':[{'id':7}]}
            return [{'name':'A','type':'sub','region':'US','web_url':'https://example.com/a'}, {'name':'B','type':'sub','region':'CA','web_url':'https://example.com/b'}]
        with patch.object(m,'key',return_value='test'),patch.object(m,'get',side_effect=fake):
            data=m.enrich('watchmode',[{'id':'tmdb-movie-1','imdb_id':'tt1'}])
        self.assertEqual(requests[0][1]['search_field'],'imdb_id');self.assertEqual(len(data[0]['providers']),1)
    def test_short_titles_do_not_call_assrt(self):
        with patch.object(m,'key',return_value='test'),patch.object(m,'get') as get:
            with self.assertRaises(m.FeedError):m.enrich('assrt',[{'id':'a','title':'Up'}])
            get.assert_not_called()

if __name__=='__main__':unittest.main()
