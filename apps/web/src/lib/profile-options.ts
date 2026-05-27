// 受試者個人資料選項常數 — onboarding / profile 編輯 / profile 顯示共用，
// 集中定義避免三處重複漂移。新增選項只改這裡。

export interface Option {
  value: string;
  label: string;
}

export const AGE_RANGE_OPTIONS: Option[] = [
  { value: 'under_18', label: '18 歲以下' },
  { value: '18_24', label: '18–24 歲' },
  { value: '25_34', label: '25–34 歲' },
  { value: '35_44', label: '35–44 歲' },
  { value: '45_54', label: '45–54 歲' },
  { value: '55_plus', label: '55 歲以上' },
];

export const GENDER_OPTIONS: Option[] = [
  { value: 'male', label: '男性' },
  { value: 'female', label: '女性' },
  { value: 'non_binary', label: '非二元性別' },
  { value: 'prefer_not_to_say', label: '不透露' },
];

// 就業狀態（DB enum `occupation`）— 描述「在不在職、何種雇用型態」
export const EMPLOYMENT_OPTIONS: Option[] = [
  { value: 'student', label: '學生' },
  { value: 'employed_full_time', label: '全職員工' },
  { value: 'employed_part_time', label: '兼職員工' },
  { value: 'self_employed', label: '自雇/創業' },
  { value: 'unemployed', label: '待業中' },
  { value: 'retired', label: '退休' },
  { value: 'homemaker', label: '家庭主婦/夫' },
  { value: 'other', label: '其他' },
];

// 行業／職業類別（DB enum `industry`）— 受眾媒合用，可與就業狀態交叉鎖定
// 選「其他」時前端會顯示自由填寫欄（存進 industryOther）
export const INDUSTRY_OPTIONS: Option[] = [
  { value: 'info_tech', label: '資訊科技 / 軟體' },
  { value: 'manufacturing', label: '製造業' },
  { value: 'engineering_construction', label: '工程 / 建築營造' },
  { value: 'healthcare', label: '醫療 / 生技' },
  { value: 'education', label: '教育 / 學術研究' },
  { value: 'finance', label: '金融 / 保險 / 會計' },
  { value: 'legal', label: '法律' },
  { value: 'public_sector', label: '公務 / 軍警消' },
  { value: 'service', label: '服務業' },
  { value: 'food_beverage', label: '餐飲' },
  { value: 'hospitality_travel', label: '旅宿 / 觀光' },
  { value: 'retail_wholesale', label: '零售 / 批發' },
  { value: 'transport_logistics', label: '運輸 / 物流' },
  { value: 'agriculture', label: '農林漁牧' },
  { value: 'arts_media', label: '藝術 / 設計 / 媒體' },
  { value: 'marketing_pr', label: '行銷 / 公關 / 廣告' },
  { value: 'nonprofit', label: '非營利組織 / NGO' },
  { value: 'freelance', label: '自由接案' },
  { value: 'student', label: '學生' },
  { value: 'other', label: '其他（請填寫）' },
];

export const EDUCATION_OPTIONS: Option[] = [
  { value: 'junior_high', label: '國中' },
  { value: 'senior_high', label: '高中/高職' },
  { value: 'vocational', label: '專科' },
  { value: 'bachelor', label: '學士' },
  { value: 'master', label: '碩士' },
  { value: 'phd', label: '博士' },
  { value: 'other', label: '其他' },
];

export const TW_REGIONS: string[] = [
  '台北市', '新北市', '桃園市', '台中市', '台南市', '高雄市',
  '基隆市', '新竹市', '嘉義市', '新竹縣', '苗栗縣', '彰化縣',
  '南投縣', '雲林縣', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣',
  '台東縣', '澎湖縣', '金門縣', '連江縣',
];

// 縣市的 {value,label} 形式（受眾鎖定多選用）
export const REGION_OPTIONS: Option[] = TW_REGIONS.map((r) => ({ value: r, label: r }));

// 顯示用 label map（由 options 衍生，單一真相）
const toLabelMap = (opts: Option[]): Record<string, string> =>
  Object.fromEntries(opts.map((o) => [o.value, o.label]));

export const AGE_RANGE_LABELS = toLabelMap(AGE_RANGE_OPTIONS);
export const GENDER_LABELS = toLabelMap(GENDER_OPTIONS);
export const EMPLOYMENT_LABELS = toLabelMap(EMPLOYMENT_OPTIONS);
export const INDUSTRY_LABELS = toLabelMap(INDUSTRY_OPTIONS);
export const EDUCATION_LABELS = toLabelMap(EDUCATION_OPTIONS);
