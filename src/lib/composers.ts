// 音乐史地图数据：人物与作品信息均依据公开史实整理
// x/y 为示意图上的百分比坐标（非精确地理坐标，仅示意地域分布）

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
}

export interface Era {
  id: string
  label: string
  span: string
}

export const CHINA_ERAS: Era[] = [
  { id: 'ancient', label: '先秦至汉唐', span: '约前11世纪 — 907年' },
  { id: 'songyuan', label: '宋元', span: '960 — 1368年' },
  { id: 'mingqing', label: '明清', span: '1368 — 1912年' },
  { id: 'modern', label: '近现代', span: '1912 — 1949年' },
]

export const EUROPE_ERAS: Era[] = [
  { id: 'baroque', label: '巴洛克时期', span: '1600 — 1750年' },
  { id: 'classical', label: '古典主义时期', span: '1750 — 1827年' },
  { id: 'romantic', label: '浪漫主义时期', span: '1827 — 1900年' },
  { id: 'modern20', label: '20世纪近现代', span: '1900 — 至今' },
]

export const CHINA_COMPOSERS: Composer[] = [
  {
    id: 'boji',
    name: '伯牙（传说）',
    years: '春秋时期',
    era: 'ancient',
    region: '中原（今湖北一带）',
    x: 55, y: 58,
    avatar: '/avatars/boji.png',
    intro: '春秋时期琴师，「高山流水遇知音」典故的主人公，本应用「知音」之名即源于此。',
    works: '传作《高山》《流水》，见于《列子·汤问》《吕氏春秋》记载。',
    note: '先秦时期礼乐制度成熟，琴已成为士大夫修身之器，「知音」观念由此而生。',
  },
  {
    id: 'jikang',
    name: '嵇康',
    years: '224 — 263年',
    era: 'ancient',
    region: '谯国铚县（今安徽濉溪）',
    x: 62, y: 48,
    avatar: '/avatars/jikang.png',
    intro: '魏晋时期思想家、音乐家，「竹林七贤」之一，临刑前弹奏《广陵散》，叹「《广陵散》于今绝矣」。',
    works: '善弹《广陵散》，著《琴赋》《声无哀乐论》，是中国音乐美学史上的重要文献。',
    note: '《声无哀乐论》探讨音乐与情感的关系，是世界音乐美学史上极早的系统论述。',
  },
  {
    id: 'jiangkui',
    name: '姜夔',
    years: '约1155 — 1221年',
    era: 'songyuan',
    region: '鄱阳（今江西鄱阳），长期游历江浙',
    x: 66, y: 60,
    avatar: '/avatars/jiangkui.png',
    intro: '南宋词人、音乐家，自度曲（自作词曲）传世，是宋代词乐最重要的留存者。',
    works: '《白石道人歌曲》存词曲十七首，附宋俗字谱，含《扬州慢》《杏花天影》等名篇。',
    note: '《扬州慢》写于金兵南侵后的扬州，「废池乔木，犹厌言兵」，寄托深重的家国之痛。',
  },
  {
    id: 'huayanjun',
    name: '华彦钧（阿炳）',
    years: '1893 — 1950年',
    era: 'modern',
    region: '江苏无锡',
    x: 68, y: 62,
    avatar: '/avatars/huayanjun.png',
    intro: '民间音乐家，道士出身，晚年失明后沿街卖艺，1950年中央音乐学院为其抢录了仅存的几首乐曲。',
    works: '二胡曲《二泉映月》《听松》《寒春风曲》，琵琶曲《大浪淘沙》《昭君出塞》《龙船》。',
    note: '《二泉映月》出自民间艺人之手，是中国民族音乐遗产抢救性保护的标志性事件。',
  },
  {
    id: 'liutianhua',
    name: '刘天华',
    years: '1895 — 1932年',
    era: 'modern',
    region: '江苏江阴，任教于北平',
    x: 67, y: 55,
    avatar: '/avatars/liutianhua.png',
    intro: '近代民族音乐家，将二胡从民间伴奏乐器提升为独奏乐器并引入高等音乐教育。',
    works: '二胡曲《光明行》《空山鸟语》《良宵》等十首，及四十七首练习曲。',
    note: '在「全盘西化」的争论声中，他选择整理国乐遗产、改进民族乐器，走中西融合之路。',
  },
  {
    id: 'xianxinghai',
    name: '冼星海',
    years: '1905 — 1945年',
    era: 'modern',
    region: '广东番禺（今广州），后赴延安',
    x: 58, y: 82,
    avatar: '/avatars/xianxinghai.png',
    intro: '人民音乐家。巴黎求学归国后投身抗日救亡歌咏运动，1938年赴延安任鲁迅艺术学院音乐系主任。',
    works: '《黄河大合唱》《生产大合唱》，歌曲《在太行山上》《到敌人后方去》等。',
    note: '《黄河大合唱》诞生于民族危亡之际，以黄河为象征凝聚全民族抗战意志，是音乐与时代同频共振的典范。',
  },
  {
    id: 'nieer',
    name: '聂耳',
    years: '1912 — 1935年',
    era: 'modern',
    region: '云南昆明，活跃于上海',
    x: 45, y: 78,
    avatar: '/avatars/nieer.png',
    intro: '中华人民共和国国歌作曲者。短暂一生中创作了大量反映民众疾苦与救亡呼声的歌曲。',
    works: '《义勇军进行曲》《卖报歌》《毕业歌》《大路歌》，民族器乐曲《金蛇狂舞》《翠湖春晓》（改编整理）。',
    note: '《义勇军进行曲》在民族危亡时刻发出「起来」的呐喊，1949年被确定为代国歌，后正式成为国歌。',
  },
]

export const EUROPE_COMPOSERS: Composer[] = [
  {
    id: 'bach',
    name: '巴赫',
    years: '1685 — 1750年',
    era: 'baroque',
    region: '德国（艾森纳赫、莱比锡）',
    x: 50, y: 38,
    avatar: '/avatars/bach.png',
    intro: '巴洛克音乐集大成者，复调艺术的高峰，被称为「西方音乐之父」。',
    works: '《平均律钢琴曲集》《哥德堡变奏曲》《勃兰登堡协奏曲》《马太受难曲》。',
    note: '同一时期（清康熙年间），中国宫廷正由徐日升、德理格等传教士引入西方古钢琴，中西音乐开始接触。',
  },
  {
    id: 'mozart',
    name: '莫扎特',
    years: '1756 — 1791年',
    era: 'classical',
    region: '奥地利（萨尔茨堡、维也纳）',
    x: 52, y: 45,
    avatar: '/avatars/mozart.png',
    intro: '古典主义天才作曲家，五岁作曲，一生留下六百余部作品，涵盖几乎所有体裁。',
    works: '歌剧《费加罗的婚礼》《魔笛》，第四十、四十一交响曲，大量钢琴奏鸣曲与协奏曲。',
    note: '约当清乾隆年间；同一时期中国形成昆曲鼎盛与花部诸腔兴起的局面，《霓裳羽衣》传统早已化入戏曲音乐。',
  },
  {
    id: 'beethoven',
    name: '贝多芬',
    years: '1770 — 1827年',
    era: 'classical',
    region: '德国波恩，定居维也纳',
    x: 49, y: 41,
    avatar: '/avatars/beethoven.png',
    intro: '在失聪中创作的巨人，把古典主义推向顶峰并为浪漫主义开辟道路。',
    works: '九部交响曲，《月光》《热情》《悲怆》奏鸣曲，歌剧《费德里奥》。',
    note: '与清代嘉庆年间同时；此时中国各地民间歌舞、说唱与戏曲声腔（如皮黄腔）蓬勃发展，孕育着京剧的诞生。',
  },
  {
    id: 'chopin',
    name: '肖邦',
    years: '1810 — 1849年',
    era: 'romantic',
    region: '波兰华沙，侨居巴黎',
    x: 55, y: 38,
    avatar: '/avatars/chopin.png',
    intro: '「钢琴诗人」，一生几乎只为钢琴写作，作品中深植对故国波兰的眷恋。',
    works: '《革命练习曲》《降E大调夜曲》、二十四首前奏曲、玛祖卡与波罗乃兹舞曲。',
    note: '肖邦在华沙起义失败后的悲愤中写下《革命练习曲》；同期中国正值鸦片战争前后，民族命运同样风雨飘摇。',
  },
  {
    id: 'debussy',
    name: '德彪西',
    years: '1862 — 1918年',
    era: 'modern20',
    region: '法国巴黎',
    x: 42, y: 42,
    avatar: '/avatars/debussy.png',
    intro: '印象主义音乐开创者，以色彩与光影重构和声语言，深受东方艺术影响。',
    works: '《月光》（贝加摩组曲）、《大海》《牧神午后前奏曲》《版画集》。',
    note: '德彪西在1889年巴黎世博会上听到爪哇甘美兰音乐深受启发；同一时期中国学堂乐歌兴起，沈心工、李叔同把新式音乐教育带入课堂。',
  },
  {
    id: 'stravinsky',
    name: '斯特拉文斯基',
    years: '1882 — 1971年',
    era: 'modern20',
    region: '俄国，后居法国、美国',
    x: 62, y: 33,
    avatar: '/avatars/stravinsky.png',
    intro: '20世纪最具影响力的作曲家之一，《春之祭》首演引发骚动，改写现代音乐语言。',
    works: '《春之祭》《火鸟》《彼得鲁什卡》，后期转向新古典主义与序列写作。',
    note: '《春之祭》首演（1913年）后不久，中国进入新文化运动时期，刘天华等人开始探索民族音乐的现代化道路。',
  },
]
