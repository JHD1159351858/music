// 音乐史地图数据：人物与作品信息均依据公开史实整理
// x/y 为完整 public/maps/*.png 底图左上角起算的百分比，不随画布尺寸或缩放换算。
// 按 region 中的代表性地点近似标定；底图为地域示意，并非精确地理投影。

export interface Composer {
  id: string
  name: string
  years: string
  era: string
  region: string
  x: number
  y: number
  avatar: string
  intro: string
  works: string
  note: string // 思政/中外对照注解
  sources: HistorySource[]
}

export interface HistorySource { title: string; url: string }
export interface Era {
  id: string
  label: string
  span: string
  chinaContext?: string
  sources?: HistorySource[]
}

const KUNQU_SOURCE = { title: '中国非遗网 · 昆曲国家级项目档案', url: 'https://www.ihchina.cn/ccr_detail/13133/' }
const JINGJU_SOURCE = { title: '中国非遗网 · 京剧国家级项目档案', url: 'https://www.ihchina.cn/art/detail/id/13202.html' }
const LIU_SOURCE = { title: '中央音乐学院 · 刘天华创作与国乐改进', url: 'https://www.ccom.edu.cn/info/2621/28121.htm' }
const NIE_SOURCE = { title: '中国国家博物馆 ·《电通画报》与国歌创作', url: 'https://www.chnmuseum.cn/zp/zpml/gmww/202008/t20200824_247207.shtml' }
const SCHOOL_SONG_SOURCE = { title: '中央音乐学院 · 民国音乐课本与学堂乐歌', url: 'https://zhuanti.ccom.edu.cn/2015qy/info/1002/1003.htm' }

export const CHINA_ERAS: Era[] = [
  { id: 'ancient', label: '先秦至汉唐', span: '约前11世纪 — 907年' },
  { id: 'songyuan', label: '宋元', span: '960 — 1368年' },
  { id: 'mingqing', label: '明清', span: '1368 — 1912年' },
  { id: 'modern', label: '近现代', span: '1912 — 1949年' },
]

export const EUROPE_ERAS: Era[] = [
  { id: 'baroque', label: '巴洛克时期', span: '1600 — 1750年', chinaContext: '同期中国处于明末至清前期。昆曲在明代发展成型，天启至康熙年间蓬勃兴盛，可对照欧洲巴洛克音乐，观察不同社会中的戏剧与音乐表达。', sources: [KUNQU_SOURCE] },
  { id: 'classical', label: '古典主义时期', span: '1750 — 1827年', chinaContext: '同期中国处于清代乾隆至道光年间。1790年起徽班陆续进京，并吸收昆曲、秦腔及地方音乐，逐步孕育京剧，可对照欧洲古典时期的舞台音乐。', sources: [JINGJU_SOURCE] },
  { id: 'romantic', label: '浪漫主义时期', span: '1827 — 1900年', chinaContext: '同期中国的京剧在多种地方声腔交流融合中发展，以西皮、二黄为主要声腔。可对照欧洲浪漫主义的民族风格，理解地域音乐如何形成新的表达。', sources: [JINGJU_SOURCE] },
  { id: 'modern20', label: '20世纪近现代', span: '1900 — 至今', chinaContext: '20世纪前期，中国学校音乐教育与学堂乐歌发展；刘天华探索国乐改进，聂耳等参与救亡音乐创作。可从教育、民族音乐传承和时代选择三个角度开展对照。', sources: [SCHOOL_SONG_SOURCE, LIU_SOURCE, NIE_SOURCE] },
]

export const CHINA_COMPOSERS: Composer[] = [
  {
    id: 'boji',
    name: '伯牙（传说）',
    years: '春秋时期',
    era: 'ancient',
    region: '湖北武汉一带（传说核心流布地）',
    x: 52.5, y: 48.8,
    avatar: '/avatars/boji.png',
    intro: '春秋时期琴师，「高山流水遇知音」典故的主人公，本应用「知音」之名即源于此。',
    works: '相关琴曲与典故：《高山》《流水》。典故与后世传谱不能直接等同于可考证的个人作曲记录。',
    note: '学习提示：从伯牙与子期的故事理解倾听、友谊与相互理解；人物事迹须区分民间传说与可考史实。',
    sources: [{ title: '中国非遗网 · 伯牙子期传说项目档案', url: 'https://www.ihchina.cn/project_details/12389.html' }, { title: '故宫博物院 · 高山流水图与典故', url: 'https://www.dpm.org.cn/collection/paint/232545.html' }],
  },
  {
    id: 'jikang',
    name: '嵇康',
    years: '224 — 263年',
    era: 'ancient',
    region: '谯国铚县（今安徽濉溪）',
    x: 53.9, y: 44.9,
    avatar: '/avatars/jikang.png',
    intro: '魏晋时期思想家、音乐家，「竹林七贤」之一，临刑前弹奏《广陵散》，叹「《广陵散》于今绝矣」。',
    works: '善弹《广陵散》，著《琴赋》《声无哀乐论》，是中国音乐美学史上的重要文献。',
    note: '《声无哀乐论》讨论音乐与情感的关系。学习时可比较不同听者对同一段琴声的感受，并尊重各自的理解。',
    sources: [{ title: '故宫博物院 ·《广陵散》词条', url: 'https://www.dpm.org.cn/lemmas/242695.html' }, { title: '中国非遗网 · 田青谈古琴的人文精神', url: 'https://www.ihchina.cn/Article/Index/detail?id=19103' }],
  },
  {
    id: 'jiangkui',
    name: '姜夔',
    years: '约1155 — 1221年',
    era: 'songyuan',
    region: '鄱阳（今江西鄱阳），长期游历江浙',
    x: 54, y: 51.4,
    avatar: '/avatars/jiangkui.png',
    intro: '南宋词人、音乐家，自度曲（自作词曲）传世，是宋代词乐最重要的留存者。',
    works: '《白石道人歌曲》存词曲十七首，附宋俗字谱，含《扬州慢》《杏花天影》等名篇。',
    note: '《扬州慢》写于金兵南侵后的扬州，「废池乔木，犹厌言兵」，寄托深重的家国之痛。',
    sources: [{ title: '中国音乐学院《中国音乐》· 姜夔词乐传承研究', url: 'https://cmj.ccmusic.edu.cn/zh/article/doi/10.13812/j.cnki.cn11-1379/j.2026.02.005/' }, { title: '中央音乐学院 ·《扬州慢》的历史与音乐阐释', url: 'https://zhuanti.ccom.edu.cn/2022zgctyyxh/info/1002/1351.htm' }],
  },
  {
    id: 'zhu-zaiyu', name: '朱载堉', years: '1536 — 1611年', era: 'mingqing',
    region: '河南沁阳', x: 51.2, y: 42.8, avatar: '',
    intro: '明代乐律学家。通过数学计算与乐律实验探索十二平均律，体现了中国传统乐学与科学研究的联系。',
    works: '乐律著述《乐律全书》。此处收录其音乐理论贡献，不将乐律著作当作钢琴演奏曲目。',
    note: '学习提示：从传统乐律的科学探索理解文化传承与创新；把音乐听觉经验与可验证的测量、计算联系起来。',
    sources: [{ title: '河南博物院 · 明代宗室艺术与朱载堉乐律贡献', url: 'https://www.chnmus.net/sitesources/hnsbwy/page_pc/dzjp/mzyp/xlwzcfcstlbsbt/list1.html' }, { title: '沁阳市文广旅局 · 唢呐艺术与朱载堉乐律研究', url: 'https://www.qinyang.gov.cn/2023/02-15/318586.html' }, { title: '国家图书馆 · 国家珍贵古籍名录《乐律全书》', url: 'https://www.nlc.cn/migrated/pcab.nlc.cn/gjml/gjzggj/201412/U020141217513656781431.pdf' }],
  },
  {
    id: 'huayanjun',
    name: '华彦钧（阿炳）',
    years: '1893 — 1950年',
    era: 'modern',
    region: '江苏无锡',
    x: 56.5, y: 47.9,
    avatar: '/avatars/huayanjun.png',
    intro: '民间音乐家，道士出身，晚年失明后沿街卖艺，1950年中央音乐学院为其抢录了仅存的几首乐曲。',
    works: '二胡曲《二泉映月》《听松》《寒春风曲》，琵琶曲《大浪淘沙》《昭君出塞》《龙船》。',
    note: '《二泉映月》出自民间艺人之手，是中国民族音乐遗产抢救性保护的标志性事件。',
    sources: [{ title: '中国艺术研究院 · 阿炳六首传世乐曲与1950年录音', url: 'https://lib.zgysyjy.org.cn/ting_detail/598530.html' }],
  },
  {
    id: 'liutianhua',
    name: '刘天华',
    years: '1895 — 1932年',
    era: 'modern',
    region: '江苏江阴，任教于北平',
    x: 55.8, y: 34.6, // 取任教地北平作为地图代表点
    avatar: '/avatars/liutianhua.png',
    intro: '近代民族音乐家，将二胡从民间伴奏乐器提升为独奏乐器并引入高等音乐教育。',
    works: '二胡曲《光明行》《空山鸟语》《良宵》等十首，及四十七首练习曲。',
    note: '在「全盘西化」的争论声中，他选择整理国乐遗产、改进民族乐器，走中西融合之路。',
    sources: [LIU_SOURCE],
  },
  {
    id: 'xianxinghai',
    name: '冼星海',
    years: '1905 — 1945年',
    era: 'modern',
    region: '广东番禺（今广州），后赴延安',
    x: 52.7, y: 59.6,
    avatar: '/avatars/xianxinghai.png',
    intro: '人民音乐家。巴黎求学归国后投身抗日救亡歌咏运动，1938年赴延安任鲁迅艺术学院音乐系主任。',
    works: '《黄河大合唱》《生产大合唱》，歌曲《在太行山上》《到敌人后方去》等。',
    note: '《黄河大合唱》诞生于民族危亡之际，以黄河为象征凝聚全民族抗战意志，是音乐与时代同频共振的典范。',
    sources: [{ title: '中央音乐学院 ·《黄河大合唱》创作与时代背景', url: 'https://zhuanti.ccom.edu.cn/dangjian/info/1011/4121.htm' }],
  },
  {
    id: 'nieer',
    name: '聂耳',
    years: '1912 — 1935年',
    era: 'modern',
    region: '云南昆明，活跃于上海',
    x: 42.2, y: 57.2,
    avatar: '/avatars/nieer.png',
    intro: '中华人民共和国国歌作曲者。短暂一生中创作了大量反映民众疾苦与救亡呼声的歌曲。',
    works: '《义勇军进行曲》《卖报歌》《毕业歌》《大路歌》，民族器乐曲《金蛇狂舞》《翠湖春晓》（改编整理）。',
    note: '《义勇军进行曲》在民族危亡时刻发出「起来」的呐喊，1949年被确定为代国歌，后正式成为国歌。',
    sources: [NIE_SOURCE, { title: '中国国家博物馆 · 聂耳生平与代表作', url: 'https://www.chnmuseum.cn/zl/zlhg/201812/t20181220_32442.shtml' }],
  },
]

export const EUROPE_COMPOSERS: Composer[] = [
  {
    id: 'bach',
    name: '巴赫',
    years: '1685 — 1750年',
    era: 'baroque',
    region: '德国（艾森纳赫、莱比锡）',
    x: 43.5, y: 59, // 莱比锡
    avatar: '/avatars/bach.png',
    intro: '巴洛克音乐集大成者，复调艺术的高峰，被称为「西方音乐之父」。',
    works: '《平均律钢琴曲集》《哥德堡变奏曲》《勃兰登堡协奏曲》《马太受难曲》。',
    note: '同期中国处于清代前期，昆曲广泛发展。可比较不同传统中的声部组织与舞台音乐，避免把中西音乐时期机械对应。',
    sources: [{ title: '莱比锡巴赫档案馆 · 生平年表与作品', url: 'https://www.bach-leipzig.de/de/node/3231' }, KUNQU_SOURCE],
  },
  {
    id: 'mozart',
    name: '莫扎特',
    years: '1756 — 1791年',
    era: 'classical',
    region: '奥地利（萨尔茨堡、维也纳）',
    x: 44, y: 69, // 萨尔茨堡
    avatar: '/avatars/mozart.png',
    intro: '古典主义天才作曲家，五岁作曲，一生留下六百余部作品，涵盖几乎所有体裁。',
    works: '歌剧《费加罗的婚礼》《魔笛》，第四十、四十一交响曲，大量钢琴奏鸣曲与协奏曲。',
    note: '同期中国处于清乾隆年间，1790年徽班进京。可将欧洲歌剧与中国戏曲并置聆听，比较各自的语言、角色与音乐组织。',
    sources: [{ title: '萨尔茨堡莫扎特基金会 · 莫扎特生平', url: 'https://mozarteum.at/en/wolfgang-amade-mozart' }, { title: '莫扎特基金会 · 数字作品与史料', url: 'https://mozarteum.at/en/digital-mozart-edition' }, JINGJU_SOURCE],
  },
  {
    id: 'beethoven',
    name: '贝多芬',
    years: '1770 — 1827年',
    era: 'classical',
    region: '德国波恩，定居维也纳',
    x: 39.2, y: 60.5, // 波恩
    avatar: '/avatars/beethoven.png',
    intro: '在失聪中创作的巨人，把古典主义推向顶峰并为浪漫主义开辟道路。',
    works: '九部交响曲，《月光》《热情》《悲怆》奏鸣曲，歌剧《费德里奥》。',
    note: '与清代嘉庆年间同时；此时中国各地民间歌舞、说唱与戏曲声腔（如皮黄腔）蓬勃发展，孕育着京剧的诞生。',
    sources: [{ title: '波恩贝多芬故居 · 生平与原始文献', url: 'https://www.beethoven.de/en/beethoven' }, { title: '贝多芬故居 · 图像传记及作品史料', url: 'https://internet.beethoven.de/biography/picturebiography.html' }, JINGJU_SOURCE],
  },
  {
    id: 'chopin',
    name: '肖邦',
    years: '1810 — 1849年',
    era: 'romantic',
    region: '波兰华沙，侨居巴黎',
    x: 52.6, y: 54, // 华沙
    avatar: '/avatars/chopin.png',
    intro: '「钢琴诗人」，一生几乎只为钢琴写作，作品中深植对故国波兰的眷恋。',
    works: '《革命练习曲》《降E大调夜曲》、二十四首前奏曲、玛祖卡与波罗乃兹舞曲。',
    note: '肖邦的创作与波兰文化及旅法经历密切相关。学习提示：比较玛祖卡、波罗乃兹与中国地方音乐的节奏特征，不把作品标题当作未经核实的创作故事。',
    sources: [{ title: '波兰肖邦研究所 · 生平与史料', url: 'https://chopin.nifc.pl/en/chopin/osoba/1_chopin_fryderyk' }],
  },
  {
    id: 'debussy',
    name: '德彪西',
    years: '1862 — 1918年',
    era: 'modern20',
    region: '法国巴黎',
    x: 34.6, y: 65.5,
    avatar: '/avatars/debussy.png',
    intro: '印象主义音乐开创者，以色彩与光影重构和声语言，深受东方艺术影响。',
    works: '《月光》（贝加摩组曲）、《大海》《牧神午后前奏曲》《版画集》。',
    note: '《大海》写于1903至1905年，以三个交响素描组织声音。同期中国学堂乐歌与学校音乐教育发展，可对照音乐语言创新与教育传播。',
    sources: [{ title: '巴黎爱乐厅 ·《大海》作品档案与作曲家书信', url: 'https://pad.philharmoniedeparis.fr/0752348-la-mer-de-claude-debussy.aspx' }, { title: '巴黎爱乐厅 · 德彪西生平与作品', url: 'https://basenationale.philharmoniedeparis.fr/CIMU/ermes/player.aspx?id=1151321' }, SCHOOL_SONG_SOURCE],
  },
  {
    id: 'stravinsky',
    name: '斯特拉文斯基',
    years: '1882 — 1971年',
    era: 'modern20',
    region: '俄国，后居法国、美国',
    x: 59.2, y: 36.5, // 俄罗斯西部代表点
    avatar: '/avatars/stravinsky.png',
    intro: '20世纪最具影响力的作曲家之一，《春之祭》首演引发骚动，改写现代音乐语言。',
    works: '《春之祭》《火鸟》《彼得鲁什卡》，后期转向新古典主义与序列写作。',
    note: '《春之祭》首演（1913年）后不久，中国进入新文化运动时期，刘天华等人开始探索民族音乐的现代化道路。',
    sources: [{ title: '美国国会图书馆 · 斯特拉文斯基档案与生平', url: 'https://findingaids.loc.gov/repositories/15/resources/1443' }, { title: '美国国会图书馆 ·《春之祭》1913年首演史料', url: 'https://www.loc.gov/loc/lcib/09078/rite.html' }, LIU_SOURCE],
  },
]
