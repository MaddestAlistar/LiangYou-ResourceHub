import unittest
from unittest.mock import patch
from datetime import timedelta
import update_media_intel as m
from media_catalog import build_catalog, normalized_ratings

class MediaTests(unittest.TestCase):
    def test_cross_source_identity_and_episode_series_identity(self):
        sources={'tmdb':{'items':[{'id':'tmdb-tv-10','kind':'tv','tmdb_id':10,'imdb_id':'tt1234567','title':'A'}]},
          'tvmaze':{'items':[{'id':'tvmaze-episode-1','tvmaze_id':9,'imdb_id':'tt1234567','kind':'tv','title':'A'},
                              {'id':'tvmaze-episode-2','tvmaze_id':9,'kind':'tv','title':'A'}]},
          'trakt':{'items':[{'id':'trakt-tv-77','tmdb_id':10,'kind':'tv','title':'English'}]}}
        works,aliases=build_catalog(sources)
        self.assertEqual(len(works),1)
        self.assertEqual(aliases['tvmaze-episode-2'],'tmdb-tv-10')
        self.assertEqual(aliases['trakt-tv-77'],'tmdb-tv-10')
    def test_equal_names_and_numeric_ids_do_not_merge_movies_with_shows(self):
        sources={'tmdb':{'items':[{'id':'tmdb-movie-10','kind':'movie','tmdb_id':10,'title':'Same'},
                                  {'id':'tmdb-tv-10','kind':'tv','tmdb_id':10,'title':'Same'}]},
                 'bangumi':{'items':[{'id':'bangumi-10','kind':'anime','title':'Same'}]}}
        works,_=build_catalog(sources)
        self.assertEqual(len(works),3)
    def test_rating_scales_dedupe_and_critic_audience_separation(self):
        sources={'tmdb':{'name':'TMDB','items':[{'id':'tmdb-movie-1','kind':'movie','tmdb_id':1,'imdb_id':'tt1234567','title':'A','source':'TMDB','ratings':[{'source':'TMDB','value':8,'scale':10}]}]},
          'omdb':{'name':'OMDb','items':[{'target_id':'tmdb-movie-1','ratings':[{'source':'Internet Movie Database','display':'8.8/10'}]}]},
          'mdblist':{'name':'MDBList','items':[{'target_id':'tmdb-movie-1','ratings':[{'source':'imdb','value':8.7},{'source':'tomatoes','value':80},{'source':'popcorn','value':95},{'source':'letterboxd','value':4.1},{'source':'bogus','value':4}]}]}}
        works,_=build_catalog(sources);scores={r['source']:r for r in works['tmdb-movie-1']['ratings']}
        self.assertEqual(scores['IMDb']['value'],8.8)
        self.assertEqual(scores['IMDb']['via'],'OMDb')
        self.assertEqual(scores['Letterboxd']['scale'],5)
        self.assertEqual(scores['Rotten Tomatoes']['display'],'80%')
        self.assertEqual(scores['RT Audience']['display'],'95%')
        self.assertNotIn('bogus',scores)
        self.assertEqual(normalized_ratings([{'source':'imdb','value':None},{'source':'imdb','value':float('nan')},{'source':'imdb','value':80}],'MDBList',None),[])
    def test_mdblist_exact_id_budget_and_wrong_work_rejection(self):
        rows=[{'id':f'tmdb-movie-{n}','kind':'movie','tmdb_id':n,'imdb_id':'tt1234567'} for n in range(1,41)]
        with patch.object(m,'key',return_value='test'),patch.object(m,'get',return_value={'ratings':[{'source':'imdb','value':8.2}]}) as get:
            result=m.enrich('mdblist',rows)
            self.assertEqual(len(result),32);self.assertEqual(get.call_count,32)
            self.assertEqual(get.call_args_list[0].args[0],'https://api.mdblist.com/tmdb/movie/1')
        with patch.object(m,'key',return_value='test'),patch.object(m,'get',return_value={'imdb_id':'tt9999999','ratings':[]}):
            with self.assertRaises(m.FeedError):m.enrich('mdblist',rows[:1])
    def test_tmdb_profile_keeps_only_official_video_links(self):
        x={'id':1,'title':'A','credits':{'cast':[{'id':2,'name':'Actor','character':'Role'}]},
           'videos':{'results':[{'site':'YouTube','official':True,'type':'Trailer','key':'abcdefghijk','name':'Trailer'},
                                 {'site':'YouTube','official':False,'type':'Trailer','key':'abcdefghijk'}]}}
        p=m.tmdb_profile(x,'movie')['profile']
        self.assertEqual(len(p['videos']),1);self.assertEqual(p['cast'][0]['name'],'Actor')
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
    def test_assrt_null_and_string_language(self):
        self.assertEqual(m.assrt_results({'status':0,'sub':{'subs':None}}),[])
        data={'sub':{'subs':[{'id':123,'native_name':'Example','lang':'简体'}]}}
        self.assertEqual(m.assrt_results(data)[0]['language'],'简体')
    def test_omdb_fields_are_complete_and_deduplicated(self):
        data={'imdbRating':'8.8','Metascore':'67','Ratings':[{'Source':'Internet Movie Database','Value':'8.8/10'},{'Source':'Rotten Tomatoes','Value':'81%'}]}
        ratings=m.omdb_ratings(data)
        self.assertEqual(len(ratings),3)
        self.assertEqual(ratings[-1],{'source':'Metacritic','display':'67/100'})
    def test_subtitle_candidates_must_match_work(self):
        movie={'title':'末世行者','original_title':'The Dog Stars','date':'2026-08-26'}
        for title in ['CSI S6','One Man and His Dog S25E01 2009 Championships','The Dog Stars 1998']:
            self.assertFalse(m.subtitle_title_matches(title,movie),title)
        for title in ['The.Dog.Stars.2026.1080p.WEB-DL','末世行者 2026 简英双语']:
            self.assertTrue(m.subtitle_title_matches(title,movie),title)
        self.assertFalse(m.subtitle_title_matches('Hopeless 2026',{'title':'Hope','date':'2026'}))
        self.assertFalse(m.subtitle_title_matches('Hope',{'title':'Hope','date':'2026'}))
        self.assertTrue(m.subtitle_title_matches('Hope 2026',{'title':'Hope','date':'2026'}))
        response={'sub':{'subs':[{'id':123,'native_name':'CSI S6','lang':'简体'}]}}
        self.assertEqual(m.assrt_results(response,movie),[])
    def test_omdb_key_url_never_becomes_request_key(self):
        with patch.dict(m.os.environ,{'OMDB_API_KEY':'https://www.omdbapi.com/?i=tt0137523&apikey=unit-test'}):
            self.assertEqual(m.key('omdb'),'unit-test')
    def test_short_titles_do_not_call_assrt(self):
        with patch.object(m,'key',return_value='test'),patch.object(m,'get') as get:
            with self.assertRaises(m.FeedError):m.enrich('assrt',[{'id':'a','title':'Up'}])
            get.assert_not_called()

if __name__=='__main__':unittest.main()
