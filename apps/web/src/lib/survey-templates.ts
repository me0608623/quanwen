import type { SurveyQuestion } from '@/hooks/use-surveys';

const opt = (label: string, i: number) => ({ id: crypto.randomUUID(), label, sortOrder: i });
const sc = (title: string, labels: string[], sortOrder: number, isRequired = true): SurveyQuestion => ({
  type: 'single_choice', title, sortOrder, isRequired,
  options: labels.map((l, i) => opt(l, i)),
});
const txt = (title: string, sortOrder: number): SurveyQuestion => ({
  type: 'text', title, sortOrder, isRequired: false,
});

export interface SurveyTemplate {
  key: string;
  name: string;
  title: string;
  description: string;
  build: () => SurveyQuestion[];
}

const SAT5 = ['非常滿意', '滿意', '普通', '不滿意', '非常不滿意'];

export const SURVEY_TEMPLATES: SurveyTemplate[] = [
  {
    key: 'csat', name: '顧客滿意度', title: '顧客滿意度調查', description: '評估整體滿意度與改進方向。',
    build: () => [
      sc('整體而言，您對本次體驗的滿意度？', SAT5, 0),
      sc('您最滿意的部分是？', ['產品品質', '服務態度', '價格', '速度', '其他'], 1, false),
      txt('有什麼可以改進的地方？', 2),
    ],
  },
  {
    key: 'event', name: '活動回饋', title: '活動回饋問卷', description: '收集參加者對活動的回饋。',
    build: () => [
      sc('您對本次活動的整體評分？', ['很好', '好', '普通', '差', '很差'], 0),
      sc('您會參加下次活動嗎？', ['一定會', '可能會', '不確定', '不會'], 1),
      txt('對活動的建議', 2),
    ],
  },
  {
    key: 'product', name: '產品偏好', title: '產品偏好調查', description: '了解使用者對產品的偏好與需求。',
    build: () => [
      sc('您最常使用我們產品的哪個功能？', ['功能A', '功能B', '功能C', '其他'], 0),
      sc('您使用的頻率？', ['每天', '每週', '每月', '很少'], 1),
      txt('您希望我們新增什麼功能？', 2),
    ],
  },
  {
    key: 'engagement', name: '員工敬業度', title: '員工敬業度調查', description: '了解團隊成員的投入與滿意程度。',
    build: () => [
      sc('我對目前的工作感到有意義。', SAT5, 0),
      sc('我會向朋友推薦這裡作為工作的地方。', ['一定會', '可能會', '不確定', '不會'], 1),
      sc('我獲得完成工作所需的資源與支援。', SAT5, 2),
      txt('有什麼能讓你的工作體驗更好？', 3),
    ],
  },
  {
    key: 'course', name: '課程評價', title: '課程回饋問卷', description: '收集學員對課程內容與講師的回饋。',
    build: () => [
      sc('課程內容對您的幫助程度？', ['非常有幫助', '有幫助', '普通', '幫助不大'], 0),
      sc('講師的講解清晰度？', SAT5, 1),
      sc('課程難易度？', ['太難', '偏難', '剛好', '偏易', '太易'], 2),
      txt('對課程的其他建議', 3),
    ],
  },
];
