/** 平台預設興趣標籤（種子資料）*/
export const SEED_TAGS = [
  // tech
  { name: '科技/程式', category: 'tech' as const,        sortOrder: 1  },
  { name: '3C/消費電子', category: 'tech' as const,      sortOrder: 2  },
  { name: 'AI/機器學習', category: 'tech' as const,      sortOrder: 3  },
  // lifestyle
  { name: '設計/藝術',   category: 'lifestyle' as const, sortOrder: 10 },
  { name: '音樂',        category: 'lifestyle' as const, sortOrder: 11 },
  { name: '運動/健身',   category: 'lifestyle' as const, sortOrder: 12 },
  { name: '時尚/美妝',   category: 'lifestyle' as const, sortOrder: 13 },
  { name: '寵物',        category: 'lifestyle' as const, sortOrder: 14 },
  { name: '汽車/機車',   category: 'lifestyle' as const, sortOrder: 15 },
  // finance
  { name: '投資/理財',   category: 'finance' as const,   sortOrder: 20 },
  { name: '職場/創業',   category: 'finance' as const,   sortOrder: 21 },
  // health
  { name: '健康/醫療',   category: 'health' as const,    sortOrder: 30 },
  { name: '親子/育兒',   category: 'health' as const,    sortOrder: 31 },
  // entertainment
  { name: '電影/影集',   category: 'entertainment' as const, sortOrder: 40 },
  { name: '電玩/遊戲',   category: 'entertainment' as const, sortOrder: 41 },
  { name: '閱讀/寫作',   category: 'entertainment' as const, sortOrder: 42 },
  // food
  { name: '美食',        category: 'food' as const,      sortOrder: 50 },
  { name: '食品/飲料',   category: 'food' as const,      sortOrder: 51 },
  // travel
  { name: '旅遊',        category: 'travel' as const,    sortOrder: 60 },
  // education
  { name: '學術研究',    category: 'education' as const, sortOrder: 70 },
  { name: '語言學習',    category: 'education' as const, sortOrder: 71 },
  // society
  { name: '環保/永續',   category: 'society' as const,   sortOrder: 80 },
  { name: '社會議題',    category: 'society' as const,   sortOrder: 81 },
] as const;

export const TW_REGIONS = [
  '台北市', '新北市', '桃園市', '台中市', '台南市', '高雄市',
  '基隆市', '新竹市', '新竹縣', '苗栗縣', '彰化縣', '南投縣',
  '雲林縣', '嘉義市', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣',
  '台東縣', '澎湖縣', '金門縣', '連江縣',
] as const;
