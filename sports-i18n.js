/* Bilingual labels for the sports center; no external translation service.
 * English names always come from the market feed. Unmatched proper names
 * intentionally remain unchanged instead of being mistranslated.
 */
(() => {
  'use strict';
  const groups = {
    lol: [
      ["Top Esports","TES（滔搏）"],["Anyone's Legend","AL"],["CTBC Flying Oyster","CFO"],
      ["Movistar KOI","KOI"],["G2 Esports","G2"],["LOS","LOS"],
      ["LYON","LYON"],["Karmine Corp","KC"],["Invictus Gaming","IG"],
      ["Team Secret Whales","TSW"],["Hanwha Life Esports","HLE（韩华）"],
      ["Gen.G","GEN"],["Dplus KIA","DK"],["T1","T1"],
      ["Team Liquid","TL（液体）"],["Bilibili Gaming","BLG（哔哩哔哩）"],
      ["Vitality Rising Bees","Vitality 青训队"],["Mental Rush","Mental Rush"],
      ["Fnatic","FNC"],["Cloud9","C9"],["FlyQuest","FLY"],["100 Thieves","100T"],
      ["Weibo Gaming","WBG（微博）"],["JD Gaming","JDG（京东）"],
      ["LNG Esports","LNG"],["EDward Gaming","EDG"],["Royal Never Give Up","RNG"],
      ["FunPlus Phoenix","FPX"],["Ninjas in Pyjamas","NIP"],["Team WE","WE"],
      ["DRX","DRX"],["KT Rolster","KT"],["BNK FEARX","BFX"],["OKSavingsBank BRION","BRO"],
      ["Dplus","DK"],["PSG Talon","PSG"],["GAM Esports","GAM"],
      ["Vivo Keyd Stars","VKS"],["paiN Gaming","PNG"],["Leviatan","LEV"],
      ["Isurus","ISG"],["Loud","LOUD"],["Movistar R7","R7"]
    ],
    basketball: [
      ["Hawks","老鹰"],["Celtics","凯尔特人"],["Nets","篮网"],["Hornets","黄蜂"],
      ["Bulls","公牛"],["Cavaliers","骑士"],["Mavericks","独行侠"],["Nuggets","掘金"],
      ["Pistons","活塞"],["Warriors","勇士"],["Rockets","火箭"],["Pacers","步行者"],
      ["Clippers","快船"],["Lakers","湖人"],["Grizzlies","灰熊"],["Heat","热火"],
      ["Bucks","雄鹿"],["Timberwolves","森林狼"],["Pelicans","鹈鹕"],["Knicks","尼克斯"],
      ["Thunder","雷霆"],["Magic","魔术"],["76ers","76人"],["Suns","太阳"],
      ["Trail Blazers","开拓者"],["Kings","国王"],["Spurs","马刺"],["Raptors","猛龙"],
      ["Jazz","爵士"],["Wizards","奇才"],["Philadelphia 76ers","费城76人"],
      ["Los Angeles Lakers","洛杉矶湖人"],["Golden State Warriors","金州勇士"],
      ["Boston Celtics","波士顿凯尔特人"],["Houston Rockets","休斯敦火箭"],
      ["Miami Heat","迈阿密热火"],["New York Knicks","纽约尼克斯"],
      ["Denver Nuggets","丹佛掘金"],["Phoenix Suns","菲尼克斯太阳"],
      ["Dallas Mavericks","达拉斯独行侠"],["San Antonio Spurs","圣安东尼奥马刺"]
    ],
    football: [
      ["Aston Villa FC","阿斯顿维拉"],["Manchester City FC","曼城"],
      ["Manchester United FC","曼联"],["Arsenal FC","阿森纳"],
      ["Everton FC","埃弗顿"],["Chelsea FC","切尔西"],
      ["Tottenham Hotspur FC","托特纳姆热刺"],["Liverpool FC","利物浦"],
      ["Newcastle United FC","纽卡斯尔联"],["Fulham FC","富勒姆"],
      ["Coventry City FC","考文垂城"],["West Ham United FC","西汉姆联"],
      ["Southampton FC","南安普顿"],["Wolverhampton Wanderers FC","狼队"],
      ["Nottingham Forest FC","诺丁汉森林"],["Brighton & Hove Albion FC","布莱顿"],
      ["Crystal Palace FC","水晶宫"],["Brentford FC","布伦特福德"],
      ["AFC Bournemouth","伯恩茅斯"],["Leeds United FC","利兹联"],
      ["Rayo Vallecano de Madrid","巴列卡诺"],["Elche CF","埃尔切"],
      ["Real Racing Club","桑坦德竞技"],["RCD Espanyol de Barcelona","西班牙人"],
      ["Valencia CF","瓦伦西亚"],["Villarreal CF","比利亚雷亚尔"],
      ["FC Barcelona","巴塞罗那"],["Real Madrid CF","皇家马德里"],
      ["Real Madrid","皇家马德里"],["Atletico de Madrid","马德里竞技"],
      ["Atlético de Madrid","马德里竞技"],["Real Betis","皇家贝蒂斯"],
      ["Real Sociedad","皇家社会"],["Sevilla FC","塞维利亚"],
      ["Athletic Club","毕尔巴鄂竞技"],["Girona FC","赫罗纳"],
      ["Como 1907","科莫"],["US Sassuolo Calcio","萨索洛"],
      ["Cagliari Calcio","卡利亚里"],["Bologna FC 1909","博洛尼亚"],
      ["SSC Napoli","那不勒斯"],["AS Roma","罗马"],
      ["SS Lazio","拉齐奥"],["Parma Calcio 1913","帕尔马"],
      ["Juventus FC","尤文图斯"],["AC Milan","AC米兰"],
      ["Inter Milan","国际米兰"],["FC Internazionale Milano","国际米兰"],
      ["ACF Fiorentina","佛罗伦萨"],["Atalanta BC","亚特兰大"],
      ["Torino FC","都灵"],["Genoa CFC","热那亚"],
      ["1. FSV Mainz 05","美因茨05"],["SV Werder Bremen","云达不莱梅"],
      ["FC Bayern Munich","拜仁慕尼黑"],["Bayern Munich","拜仁慕尼黑"],
      ["Borussia Dortmund","多特蒙德"],["RB Leipzig","RB莱比锡"],
      ["Bayer Leverkusen","勒沃库森"],["VfB Stuttgart","斯图加特"],
      ["Eintracht Frankfurt","法兰克福"],["VfL Wolfsburg","沃尔夫斯堡"],
      ["Hamburger SV","汉堡"],["Paris Saint-Germain","巴黎圣日耳曼"],
      ["PSG","巴黎圣日耳曼"],["Olympique de Marseille","马赛"],
      ["Olympique Lyonnais","里昂"],["AS Monaco","摩纳哥"],
      ["LOSC Lille","里尔"],["OGC Nice","尼斯"]
    ],
    esports: [
      ["Team Yandex","Yandex战队"],["OG","OG"],["Team Synapse","Synapse战队"],
      ["Zero Tenacity","Zero Tenacity"],["Team Spirit","Spirit战队"],
      ["BetBoom Team","BetBoom战队"],["Yellow Submarine","Yellow Submarine"],
      ["Dawn Bulls","Dawn Bulls"],["Astra Invicta","Astra Invicta"],
      ["LEGION","LEGION"],["TheBot$","TheBot$"],["CyberHero","CyberHero"],
      ["Team Liquid","Liquid战队"],["1win","1win"],["PARIVISION","PARIVISION"],
      ["Natus Vincere","NaVi"],["Gaimin Gladiators","GG战队"],
      ["Tundra Esports","Tundra"],["Team Falcons","Falcons"],["Virtus.pro","VP"],
      ["Aurora Gaming","Aurora"],["Xtreme Gaming","XG"],
      ["Team Secret","Secret战队"],["MOUZ","MOUZ"],["FaZe Clan","FaZe"],
      ["Vitality","Vitality"],["G2 Esports","G2"],["FURIA","FURIA"]
    ],
    other: [
      ["Tampa Bay Rays","坦帕湾光芒"],["Milwaukee Brewers","密尔沃基酿酒人"],
      ["New York Yankees","纽约扬基"],["Los Angeles Dodgers","洛杉矶道奇"],
      ["New York Mets","纽约大都会"],["Boston Red Sox","波士顿红袜"],
      ["Chicago Cubs","芝加哥小熊"],["San Francisco Giants","旧金山巨人"],
      ["Seattle Mariners","西雅图水手"],["Atlanta Braves","亚特兰大勇士"],
      ["Houston Astros","休斯敦太空人"],["Philadelphia Phillies","费城费城人"],
      ["Kansas City Chiefs","堪萨斯城酋长"],["Buffalo Bills","布法罗比尔"],
      ["New England Patriots","新英格兰爱国者"],["Philadelphia Eagles","费城老鹰"],
      ["Dallas Cowboys","达拉斯牛仔"],["San Francisco 49ers","旧金山49人"]
    ]
  };
  const tables = Object.fromEntries(Object.entries(groups).map(([group, list]) => [
    group, new Map(list.map(([en, zh]) => [en.trim().toLocaleLowerCase('en'), zh]))
  ]));

  const ui = {
    zh: {
      title: '赛事数据中心',
      intro: '英雄联盟、NBA、足球与热门电竞赛事。自动整理公开市场的赛前胜负预测概率，数据以来源市场为准，不构成投注建议。',
      all: '全部赛事', lol: '🎮 英雄联盟', basketball: '🏀 NBA',
      football: '⚽ 足球', esports: '🕹️ 其他电竞', other: '🏈 其他体育',
      loading: '正在读取赛事数据', firstLoad: '首次同步前不会展示示意赔率或虚构比赛。',
      sourceNote: '数据来源：Polymarket 公开 Gamma API 与 Predict.fun API · 显示的是市场隐含概率，并非博彩公司赔率、官方胜率或实时比分。每 2 小时计划检查，页面每 5 分钟读取更新；仅展示尚未开赛、开放报价的胜负市场。独立市场的概率合计可能略偏离 100%。时间按北京时间显示。常见队名提供中文译名，未收录的名称保留原文。',
      promoTitle: '想边看赛事数据，边追比赛直播？',
      promoText: '欢迎使用「汇流直播」关注电竞与体育内容，查看支持的赛事信息及相关直播。实际数据展示、赛程与可观看场次以 App 当前版本和直播平台为准。',
      download: '获取汇流直播 ↗',
      timeUnknown: '时间待确认', timezone: '北京时间',
      prediction: '赛前市场隐含概率', source: '查看市场 ↗',
      sourcesHeading: '数据来源', allSources: '全部来源',
      richHint: 'Predict.fun 详细模式：展示赛制、赛事阶段及可展开的双边报价；数据定时采集，非实时。',
      preMatch: '赛前胜负', details: '展开买卖报价详情', bestBid: '最高买价', bestAsk: '最低卖价',
      asOf: '采集时间', quoteNote: '价格对应市场隐含概率，并非官方胜率或传统博彩公司赔率。买卖报价可能存在价差。',
      sourceAria: '打开赛事数据来源：',
      vs: '对阵', draw: '平局', match: '赛事',
      total: n => '收录 ' + n + ' 场', current: n => '当前显示 ' + n + ' 场',
      shown: (n, t) => '已显示 ' + n + ' / ' + t + ' 场',
      more: n => '再看 ' + n + ' 场 ↓', collapse: '收起赛事 ↑',
      emptyTitle: '当前暂无可展示的赛事',
      emptyMessage: '赛事尚未开始或公开市场暂无有效数据。新数据会定时同步。',
      pending: '等待首次同步', updated: s => '上次同步：' + s,
      delayed: '同步延迟或部分来源不可用', expired: '数据等待更新',
      staleMessage: '超过 6 小时未完成核验，旧概率已隐藏，恢复后自动显示。',
      failed: '同步失败', unavailable: '同步数据暂不可用',
      unavailableTitle: '赛事数据暂不可用',
      unavailableMessage: '请稍后刷新。本栏目不会展示未经验证的赔率。'
    },
    en: {
      title: 'Sports Data Center',
      intro: 'League of Legends, NBA, football and popular esports. Pre-match probabilities from public prediction markets, refreshed automatically. Not betting advice.',
      all: 'All Sports', lol: '🎮 League of Legends', basketball: '🏀 NBA',
      football: '⚽ Football', esports: '🕹️ Other Esports', other: '🏈 Other Sports',
      loading: 'Loading sports data', firstLoad: 'No placeholder matches or fabricated odds are shown.',
      sourceNote: 'Sources: Polymarket public Gamma API and Predict.fun API. Prices reflect implied market probabilities, not bookmaker odds, official win rates or live scores. Checked every 2 hours; this page reloads data every 5 minutes. Only open pre-match winner markets are shown. Independent market prices may not sum to 100%. Times shown in UTC+8. Original English names are preserved.',
      promoTitle: 'Follow the data and watch the games',
      promoText: 'Explore esports and sports content with Conflux Live. Available event information, streams and viewing rights depend on the app version and respective providers.',
      download: 'Get Conflux Live ↗',
      timeUnknown: 'Time TBD', timezone: 'UTC+8',
      prediction: 'Pre-match implied probability', source: 'View market ↗',
      sourcesHeading: 'Sources', allSources: 'All sources',
      richHint: 'Predict.fun detail view: format, tournament stage and expandable bid/ask quotes. Snapshots are not live.',
      preMatch: 'Pre-match winner', details: 'Show bid / ask quotes', bestBid: 'Best bid', bestAsk: 'Best ask',
      asOf: 'Captured', quoteNote: 'Quotes imply market probabilities, not official win odds or bookmaker prices. Bid and ask can differ.',
      sourceAria: 'Open prediction market source for ',
      vs: 'vs', draw: 'Draw', match: 'Match',
      total: n => n + ' matches', current: n => n + ' shown',
      shown: (n, t) => 'Showing ' + n + ' of ' + t,
      more: n => 'Show ' + n + ' more ↓', collapse: 'Collapse ↑',
      emptyTitle: 'No upcoming matches available',
      emptyMessage: 'No eligible upcoming prediction markets in this category. Data is checked regularly.',
      pending: 'Waiting for first sync', updated: s => 'Last synced: ' + s,
      delayed: 'Delayed or partially unavailable', expired: 'Waiting for fresh data',
      staleMessage: 'Quotes older than 6 hours are hidden until a successful refresh.',
      failed: 'Sync failed', unavailable: 'Data currently unavailable',
      unavailableTitle: 'Sports data unavailable',
      unavailableMessage: 'Please check back later. No unverified probabilities are displayed.'
    }
  };

  function team(name, category, lang) {
    const raw = String(name ?? '').trim();
    if (lang === 'en') return raw === '平局' ? 'Draw' : raw;
    if (raw === '平局' || raw.toLowerCase() === 'draw' || raw.toLowerCase() === 'tie') return '平局';
    return (tables[category] && tables[category].get(raw.toLocaleLowerCase('en'))) || raw;
  }
  function league(name, category, lang) {
    const raw = String(name || '').trim();
    if (lang === 'en') return raw === '平局' ? 'Draw' : raw;
    if (category === 'lol' || /^league of legends$/i.test(raw)) return '英雄联盟';
    if (category === 'basketball' && /^NBA(?:\s+\d{4})?$/i.test(raw)) return raw.replace(/^NBA/i, 'NBA').replace(/(\d{4})$/, '$1 赛季');
    // Match whole league names so second divisions and other countries are not relabelled.
    const clean = raw.replace(/\s+20\d{2}(?:[-/]\d{2,4})?$/, '').trim();
    const leagueNames = {
      'premier league':'英超', 'english premier league':'英超',
      'la liga':'西甲', 'la liga 2':'西乙', 'laliga 2':'西乙', 'segunda division':'西乙',
      'serie a':'意甲', 'serie b':'意乙', 'bundesliga':'德甲', 'bundesliga 2':'德乙', '2. bundesliga':'德乙',
      'ligue 1':'法甲', 'ligue 2':'法乙', 'champions league':'欧冠', 'uefa champions league':'欧冠',
      'europa league':'欧联杯', 'uefa europa league':'欧联杯', 'efl championship':'英冠'
    };
    if (leagueNames[clean.toLowerCase()]) return leagueNames[clean.toLowerCase()];
    if (/superettan/i.test(raw)) return '瑞典足球甲级联赛';
    if (/dota\s*2/i.test(raw)) return 'Dota 2';
    if (raw === 'MLB') return '美国职棒 MLB';
    if (raw === 'NFL') return '美式橄榄球 NFL';
    if (raw === 'WTA') return '女子网球 WTA';
    if (raw === 'ATP') return '男子网球 ATP';
    if (raw === 'ITF') return '国际网球 ITF';
    return raw || (ui.zh[category] || '赛事');
  }
  function stage(text) {
    return String(text || '').trim()
      .replace(/Worlds Group Stage/gi, '全球总决赛小组赛')
      .replace(/Worlds Swiss Stage/gi, '全球总决赛瑞士轮')
      .replace(/Worlds (?:Knockout Stage|Playoffs)/gi, '全球总决赛淘汰赛')
      .replace(/Worlds Finals?/gi, '全球总决赛决赛')
      .replace(/MSI Group Stage/gi, '季中冠军赛小组赛')
      .replace(/Group ([A-Z])\b/gi, '$1 组')
      .replace(/\bGroup Stage\b/gi, '小组赛')
      .replace(/\bPlayoffs\b/gi, '季后赛')
      .replace(/\bQuarterfinals\b/gi, '四分之一决赛')
      .replace(/\bSemifinals\b/gi, '半决赛')
      .replace(/\bGrand Finals\b/gi, '总决赛')
      .replace(/\bFinals\b/gi, '决赛')
      .replace(/\bMasters\b/gi, '大师赛');
  }
  function title(event, lang) {
    const original = String(event?.title || '');
    if (lang === 'en') return original;
    const values = Array.isArray(event?.outcomes) ? event.outcomes : [];
    if (values.length < 2) return original;
    const first = team(values[0].name, event.category, 'zh');
    const last = team(values[values.length - 1].name, event.category, 'zh');
    let text = first + ' 对阵 ' + last;
    if (event.category === 'lol' || event.category === 'esports') {
      const format = original.match(/\((BO[1-9])\)/i);
      const suffix = original.match(/\)\s*-\s*(.+)$/);
      if (format) text += ' · ' + format[1].toUpperCase();
      if (suffix) text += ' · ' + stage(suffix[1]);
    }
    return text;
  }

  window.LiangYouSportsI18n = Object.freeze({ ui, team, league, title, stage });
})();