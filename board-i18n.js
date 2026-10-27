/* Verified, conservative zh-CN display names for chess and professional Go.
 * Data IDs, times, results and source strings remain unchanged. Unknown person
 * names are not machine-guessed; exact translations or simplified glyphs only.
 */
(()=>{
'use strict';
const chessTournaments=new Map([
 ['Mongolian National Chess Championship 2026 | Open','2026 蒙古全国国际象棋锦标赛 · 公开组'],
 ['Baden Championship 2026 (BEM/BFEM) | BEM','2026 巴登国际象棋锦标赛 · BEM组'],
 ['Benidorm Chess Open 2026 | Group A','2026 贝尼多姆国际象棋公开赛 · A组'],
 ['KazChess Masters Almaty 2026','2026 阿拉木图 KazChess 大师赛'],
 ['Tsaghkadzor Open 2026','2026 察赫卡佐尔国际象棋公开赛'],
 ['2026 Clutch Chess: Champions Showdown','2026 Clutch Chess 冠军对决赛']
]);
const goTournaments=new Map([
 ['名人 挑戦７','日本名人战 · 挑战赛第7局'],
 ['女流名 予選','日本女子名人战 · 预选赛'],
 ['女流棋 本戦１','日本女子棋圣战 · 本赛第1轮'],
 ['碁聖 予選Ａ','日本碁圣战 · 预选A组'],
 ['女流本 予選','日本女子本因坊战 · 预选赛'],
 ['本因坊 予選Ａ','日本本因坊战 · 预选A组'],
 ['十段 本戦１','日本十段战 · 本赛第1轮'],
 ['王座 予選Ａ','日本王座战 · 预选A组'],
 ['49기 SG배 한국일보 명인전 패자결승','第49届 SG杯韩国日报名人战 · 败者组决赛'],
 ['2026 Sh수협은행 여자바둑 최강전 결승 3국','2026 Sh水协银行女子围棋最强战 · 决赛第3局'],
 ['2026 Sh수협은행 여자바둑 최강전 결승 4국','2026 Sh水协银行女子围棋最强战 · 决赛第4局'],
 ['10회 해성 여자기성전 16강','第10届 海成女子棋圣战 · 16强赛']
]);
const chessPlayers=new Map([
 ['Nakamura, Hikaru','中村光'],
 ['Caruana, Fabiano','法比亚诺·卡鲁阿纳'],
 ['Sindarov, Javokhir','贾沃希尔·辛达罗夫'],
 ['Praggnanandhaa R','普拉格纳南达'],
 ['Dubov, Daniil','丹尼尔·杜博夫'],
 ['Lazavik, Denis','丹尼斯·拉扎维克']
]);
const goPlayers=new Map([
 ['스미레','仲邑堇'],
 ['김은지','金恩持'],
 ['김미리','金美里'],
 ['박정환','朴廷桓'],
 ['신민준','申旻埈']
]);
// Japanese source Kanji are standardized to simplified Chinese characters
// only as orthography, not asserted as a verified Chinese player alias.
const kanji=Object.freeze({
 '遼':'辽','関':'关','穂':'穗','達':'达','萬':'万','満':'满','優':'优',
 '紗':'纱','澤':'泽','澁':'涩','眞':'真','輝':'辉','館':'馆','舘':'馆',
 '臨':'临','愛':'爱','義':'义','寛':'宽','紳':'绅','勝':'胜',
 '啓':'启','剛':'刚','岡':'冈','聖':'圣','碁':'碁','條':'条','齋':'斋',
 '瀬':'濑','國':'国','學':'学','宮':'宫','葉':'叶'
});
const simplify=value=>String(value||'').split('').map(c=>kanji[c]||c).join('');
const blank=s=>String(s??'').trim();
function league(value,sport,language='zh'){
 const raw=blank(value);
 if(!raw||language!=='zh')return raw;
 if(sport==='chess'){
   if(chessTournaments.has(raw))return chessTournaments.get(raw);
   return raw
    .replace(/\bNational Chess Championship\b/gi,'全国国际象棋锦标赛')
    .replace(/\bChess Championship\b/gi,'国际象棋锦标赛')
    .replace(/\bChess Open\b/gi,'国际象棋公开赛')
    .replace(/\bChampionship\b/gi,'锦标赛')
    .replace(/\bChampions Showdown\b/gi,'冠军对决赛')
    .replace(/\bGroup ([A-Z])\b/gi,'$1组')
    .replace(/\bRound (\d+)\b/gi,'第$1轮')
    .replace(/\s*\|\s*Open\b/gi,' · 公开组')
    .replace(/\s*\|\s*/g,' · ');
 }
 if(sport==='go'){
   if(goTournaments.has(raw))return goTournaments.get(raw);
   const ko=raw
    .replace(/^(\d+)기\s*/,'第$1届 ')
    .replace(/^(\d+)회\s*/,'第$1届 ')
    .replace(/(\d{4})\s*Sh수협은행/g,'$1 Sh水协银行')
    .replace(/한국일보/g,'韩国日报')
    .replace(/해성/g,'海成')
    .replace(/SG배/g,'SG杯')
    .replace(/여자바둑\s*최강전/g,'女子围棋最强战')
    .replace(/여자기성전/g,'女子棋圣战')
    .replace(/명인전/g,'名人战')
    .replace(/패자결승/g,'败者组决赛')
    .replace(/준결승/g,'半决赛')
    .replace(/결승\s*(\d+)\s*국/g,'决赛第$1局')
    .replace(/(\d+)\s*강/g,'$1强赛')
    .replace(/본선\s*(\d+)/g,'本赛第$1轮')
    .replace(/예선/g,'预选赛');
   if(!/[\uAC00-\uD7A3]/.test(ko))return simplify(ko);
   // Unknown organizer/competition in Korean: preserve original rather
   // than inventing a tournament, with structured stage still localized.
   return ko;
 }
 return raw;
}
function stage(value,sport,language='zh'){
 const raw=blank(value);
 if(!raw||language!=='zh')return raw;
 if(sport==='chess'){
   return raw.replace(/\bRound\s*(\d+)\b/gi,'第$1轮')
    .replace(/\bGame\s*(\d+)\b/gi,'第$1局')
    .replace(/\bMatch\s*(\d+)\b/gi,'第$1场')
    .replace(/\bQualifiers?\b/gi,'资格赛')
    .replace(/\bQuarter.?finals?\b/gi,'四分之一决赛')
    .replace(/\bSemi.?finals?\b/gi,'半决赛')
    .replace(/\bFinals?\b/gi,'决赛')
    .replace(/\bGroup\s*([A-Z])\b/gi,'$1组');
 }
 if(sport==='go'){
   return simplify(raw
    .replace(/패자결승/g,'败者组决赛')
    .replace(/준결승/g,'半决赛')
    .replace(/결승\s*(\d+)\s*국/g,'决赛第$1局')
    .replace(/결승/g,'决赛')
    .replace(/(\d+)\s*강/g,'$1强赛')
    .replace(/예선/g,'预选赛')
    .replace(/본선\s*(\d+)/g,'本赛第$1轮')
    .replace(/([0-9]+)R\b/gi,'第$1轮')
    .replace(/挑戦\s*([0-9０-９]+)/g,'挑战赛第$1局')
    .replace(/本戦\s*([0-9０-９]+)/g,'本赛第$1轮')
    .replace(/予選\s*([Ａ-ＺA-Z])/g,'预选$1组')
    .replace(/予選/g,'预选赛'));
 }
 return raw;
}
function player(value,sport,language='zh',verified=''){
 const raw=blank(value);
 if(language!=='zh')return blank(verified)||raw;
 if(verified&&blank(verified))return blank(verified);
 if(sport==='chess')return chessPlayers.get(raw)||raw;
 if(sport==='go'){
   const unranked=raw.replace(/\s+(?:[一二三四五六七八九]段|初段|名人|棋聖|本因坊|碁聖|天元|王座|十段)$/,'');
   return goPlayers.get(unranked)||simplify(unranked);
 }
 return raw;
}
function searchTerms(value,sport,language='zh'){
 const raw=blank(value);
 return [raw,league(raw,sport,language),stage(raw,sport,language)].join(' ');
}
window.LiangYouBoardI18n=Object.freeze({league,stage,player,searchTerms});
})();