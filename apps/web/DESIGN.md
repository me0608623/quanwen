---
version: alpha
name: QuanWen-design-system
based_on: awesome-design-md / claude
description: >
  券問 QuanWen 的設計系統，改編自 Anthropic Claude 的「暖奶油 + 珊瑚紅 + 深墨」
  編輯風語彙。基底是帶暖調的奶油畫布（不是冷白），大標走襯線（中文 Noto Serif TC、
  拉丁 Cormorant Garamond）營造文學/可信的編輯嗓音，內文走人文 sans（Noto Sans TC + Inter）。
  品牌張力來自「奶油底 + 珊瑚紅 CTA」這組暖色搭配——刻意有別於多數冷藍科技品牌。
  深墨產品表面（問卷卡 / 互惠配對卡 / 錢包卡）負責展示真實產品 chrome，
  cream → dark 的交替是整頁的節奏。

# ─────────────────────────────────────────────
# Design tokens（Codex 實作時一律用 token，不要 inline hex）
# ─────────────────────────────────────────────

colors:
  # Brand / accent
  primary: "#cc785c"            # 珊瑚紅 — 唯一主 CTA 色、全幅 callout 卡、品牌字標 accent
  primary-active: "#a9583e"     # 按下 / hover-darker
  primary-disabled: "#e6dfd8"   # 去飽和奶油色 disabled
  accent-teal: "#5db8a6"        # 次要：互惠「已配對 / 解鎖」狀態點、active 指示
  accent-amber: "#e8a55a"       # 次要：分類 badge、inline highlight、獎勵/積分
  # Surface
  canvas: "#faf9f5"             # 預設頁面底（暖奶油，非純白）
  surface-soft: "#f5f0e8"       # section 分隔、極淺 band
  surface-card: "#efe9de"       # feature 卡背景（比 canvas 深一階）
  surface-cream-strong: "#e8e0d2" # 選中的分類 tab、強調 band
  surface-dark: "#181715"       # 產品 mockup 卡、pre-footer CTA、footer（主深色面）
  surface-dark-elevated: "#252320" # 深色 band 內的浮起卡
  surface-dark-soft: "#1f1e1b"  # 深色大卡內的內層區塊
  hairline: "#e6dfd8"           # 奶油面上的 1px 邊框
  hairline-soft: "#ebe6df"      # 同 band 內幾乎看不見的分隔
  # Text
  ink: "#141413"                # 所有大標 + 主文字（暖黑）
  body-strong: "#252523"        # 強調段落、lead
  body: "#3d3d3a"               # 預設內文
  muted: "#6c6a64"              # 次標題、麵包屑、footer 鄰近文字
  muted-soft: "#8e8b82"         # caption、fine-print、版權列
  on-primary: "#ffffff"         # 珊瑚紅按鈕上的字
  on-dark: "#faf9f5"            # 深色面上的奶油白（呼應 canvas）
  on-dark-soft: "#a09d96"       # footer 內文、深色 mockup 次要 label
  # Semantic
  success: "#5db872"            # 通過審核 / 入帳成功 / 可填狀態
  warning: "#d4a017"            # 配對逾時、預算告警（行銷面少用）
  error: "#c64545"             # 退件 / 驗證錯誤

typography:
  # 大標走襯線（CJK: Noto Serif TC / Latin: Cormorant Garamond），weight 400-500、負字距
  # 內文走人文 sans（CJK: Noto Sans TC / Latin: Inter）
  display-xl:  { family: serif, size: 64px, weight: 500, lineHeight: 1.08, letterSpacing: -1.5px }  # 首頁 h1
  display-lg:  { family: serif, size: 48px, weight: 500, lineHeight: 1.12, letterSpacing: -1px }    # section 大標
  display-md:  { family: serif, size: 36px, weight: 500, lineHeight: 1.18, letterSpacing: -0.5px }  # 子標、價格數字
  display-sm:  { family: serif, size: 28px, weight: 500, lineHeight: 1.22, letterSpacing: -0.3px }  # callout 標題
  title-lg:    { family: sans,  size: 22px, weight: 600, lineHeight: 1.3,  letterSpacing: 0 }
  title-md:    { family: sans,  size: 18px, weight: 600, lineHeight: 1.4,  letterSpacing: 0 }       # 卡片標題
  title-sm:    { family: sans,  size: 16px, weight: 600, lineHeight: 1.4,  letterSpacing: 0 }
  body-lg:     { family: sans,  size: 18px, weight: 400, lineHeight: 1.6,  letterSpacing: 0 }       # hero 副標 / lead
  body-md:     { family: sans,  size: 16px, weight: 400, lineHeight: 1.6,  letterSpacing: 0 }       # 預設內文
  body-sm:     { family: sans,  size: 14px, weight: 400, lineHeight: 1.6,  letterSpacing: 0 }       # footer、fine-print
  caption:     { family: sans,  size: 13px, weight: 500, lineHeight: 1.4,  letterSpacing: 0 }       # badge
  eyebrow:     { family: sans,  size: 12px, weight: 600, lineHeight: 1.4,  letterSpacing: 1.5px, transform: uppercase } # 區塊上的小標籤
  button:      { family: sans,  size: 14px, weight: 600, lineHeight: 1.0,  letterSpacing: 0 }
  nav-link:    { family: sans,  size: 14px, weight: 500, lineHeight: 1.4,  letterSpacing: 0 }

rounded:
  sm: 6px
  md: 8px      # 按鈕、input、分類 tab
  lg: 12px     # 內容卡、產品卡
  xl: 16px     # hero 圖卡、大型元件
  pill: 9999px # badge、藥丸

spacing:
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px     # 卡片內距
  xxl: 48px    # 珊瑚 callout 內距
  section: 96px # band 之間的節奏
---

## 1. 視覺主題與氛圍

QuanWen 是台灣的雙邊問卷媒合平台，要同時傳達「**溫暖可信**」（在處理個資、金流、獎勵）與「**AI 智慧把關**」（品質審核、數據分析）。Claude 的暖編輯風正好兼顧——奶油底降低科技疏離感，襯線大標給出文學/可信賴的份量，珊瑚紅是唯一的品牌張力。

三種表面模式逐 band 交替，形成節奏：

1. **奶油畫布** `{canvas}` — 預設身體樓層
2. **奶油卡** `{surface-card}` — feature / 內容卡（比 canvas 深一階）
3. **深墨產品面** `{surface-dark}` — 問卷 mockup、互惠配對動畫卡、pre-footer CTA、footer

節奏規則：**同一種表面不可連續出現兩個 band**。順序像：奶油 → 奶油卡 → 深墨 mockup → 奶油 → 珊瑚 callout → 深墨 footer。

## 2. 色彩三位一體（不可破）

**奶油 `{canvas}` + 珊瑚紅 `{primary}` + 深墨 `{surface-dark}`** 是品牌鐵三角。

- 珊瑚紅**很省**地用在單一元素（主 CTA 按鈕、字標 accent），**很大方**地用在全幅 `callout-card-coral`。不要到處塗珊瑚。
- 次要 accent：`{accent-teal}`（互惠「已配對/解鎖」狀態、success 動態點）、`{accent-amber}`（分類 badge、獎勵/積分 highlight）。當點綴，不當主色。
- **不要**引入第四種表面色調（不要紫卡、不要綠 section）。語意色（success/warning/error）只用在狀態指示。

## 3. 字體策略（中文是重點，這裡與 Claude 原版不同）

Claude 原版用 Copernicus/StyreneB（Anthropic 私有字）。QuanWen 是繁體中文站，改用**可商用的 Google Fonts**：

| 角色 | 中文 | 拉丁/數字 | 用途 |
| ---- | ---- | -------- | ---- |
| Display（襯線） | **Noto Serif TC** (500) | **Cormorant Garamond** (500/600) | 所有大標 h1–h3、hero、價格數字 |
| Body（人文 sans） | **Noto Sans TC** (400/500) | **Inter** (400/500/600) | 內文、導覽、按鈕、caption、label |

實作建議（`next/font/google` 或 globals `@import`）：
- 用 CSS variable：`--font-serif: "Cormorant Garamond","Noto Serif TC",serif;`、`--font-sans: "Inter","Noto Sans TC",-apple-system,"PingFang TC","Microsoft JhengHei",sans-serif;`
- Tailwind 加 `fontFamily.serif` / `fontFamily.sans` 對應上面變數。
- **大標一律 serif、weight 400–500、負字距（-0.3 到 -1.5px）**。中文襯線在大字級才有編輯感；不要 bold（700 會太喧鬧）。
- 內文一律 sans、weight 400（段落）/ 500–600（label）。

> 為何不沿用舊站的 Instrument Serif + Outfit：那組是全大寫、極粗黑(font-black)的潮牌風，與「可信賴金流平台」氣質衝突；改成襯線編輯風更貼定位。

## 4. 版面與間距

- **內容最大寬** ~1200px 置中；hero 常用 6/6（左文右圖卡）。
- **section 間距** `{section}`（96px）；卡片內距 `{xl}`（32px）；珊瑚 callout 內距 `{xxl}`（48px）。
- Feature 卡格 3-up（桌機）→ 2-up（平板）→ 1-up（手機）。
- 留白哲學：奶油底 + 襯線大標 + 慷慨內距 = 像長文雜誌專欄，不像行銷模板。

## 5. 深度與陰影

**色塊優先、陰影罕用**。深度主要來自 cream-vs-dark 的表面對比，不靠陰影。

| 層級 | 處理 | 用途 |
| ---- | ---- | ---- |
| 平 | 無陰影無邊框 | body section、top nav、hero band |
| 細線 | 1px `{hairline}` 邊框 | input、卡片 |
| 奶油卡 | `{surface-card}` 底、無陰影 | feature 卡 |
| 深墨卡 | `{surface-dark}` 底、無陰影 | 產品 mockup |
| 微陰影 | `0 1px 3px rgba(20,20,19,0.08)` | 罕用，僅 hover 微浮起 |

## 6. 形狀與圓角

`{md}`(8px) 按鈕/input → `{lg}`(12px) 內容卡 → `{xl}`(16px) hero 圖卡 → `{pill}` badge。**不要**用舊站那種 `rounded-[40px]` 的超大圓角。

## 7. 元件規格

- **top-nav**：奶油底、64px 高，左為「QW 字標 + 券問 QuanWen」，中為主選單（產品優勢/解決方案/整合/價格/客戶故事），右為「登入」text-link + 「免費開始」珊瑚主按鈕。
- **button-primary**：珊瑚底 `{primary}`、白字、`{button}` 字、`{md}` 圓角、padding 12×20、高 40。Active 變 `{primary-active}`。
- **button-secondary**：奶油底 + `{hairline}` 1px 邊、`{ink}` 字。
- **button-secondary-on-dark**：深墨面上用 `{surface-dark-elevated}` 底、`{on-dark}` 字（不反白）。
- **feature-card**：`{surface-card}` 底、`{lg}` 圓角、內距 32、上方小 icon + `{title-md}` 標題 + `{body-md}` 描述。
- **product-mockup-card-dark**：`{surface-dark}` 底，展示**真實 QuanWen 產品 chrome**——例如問卷題目卡、互惠配對狀態、錢包/收益面板。不要畫抽象插畫。
- **callout-card-coral**：全幅珊瑚底、白字、`{lg}` 圓角、內距 48；裡面 CTA 用反白（奶油按鈕）。
- **pricing 強調卡**：背景翻成 `{surface-dark}`、字反白——深色面本身就是「推薦方案」訊號。
- **badge-pill**：`{surface-card}` 底；**badge-coral**：珊瑚底白字、`{eyebrow}` 全大寫；分類 badge 可用 `{accent-amber}` 系。
- **footer**：深墨 `{surface-dark}` 底、`{on-dark-soft}` 字、4 欄連結（產品 / 公司 / 資源 / 法務），永不反白。

## 8. QuanWen 專屬的「產品 chrome」素材（取代 Claude 的 code mockup）

深墨 mockup 卡裡放這些真實感的產品片段（用 div/SVG 畫，不用截圖）：

1. **互惠配對卡**：兩個頭像 A↔B、中間珊瑚連線 + `{accent-teal}` 脈動點、「30 秒內配對」「雙方填寫」「AI 審過 → 同時解鎖」三段狀態。← 首頁 hero 主角
2. **三層審核流**：Layer 1 行為訊號 → Layer 2 邏輯檢核 → Layer 3 AI 灰區裁決，三個堆疊的小面板 + 分數條（落在灰區才喚醒 AI）。
3. **問卷題目卡**：一題 Likert/單選的填答樣式（呼應產品實際 UI）。
4. **錢包/收益面板**：「我的收益 NT$」「7-11 / 全家 禮券」「綠界託管」標籤 + 入帳成功 `{success}` 勾。

## 9. Do / Don't

**Do**
- 每頁錨定奶油畫布；大標用襯線 + 負字距；珊瑚只給主 CTA 與全幅 callout。
- cream 卡與深墨 mockup 交替成節奏；band 間距 96px。
- 深墨卡展示真實產品片段（互惠配對 / 三層審核 / 錢包）。

**Don't**
- 不要純白或冷灰當底（奶油才是品牌）。
- 不要 bold 襯線大標（停在 500）。
- 不要到處塗珊瑚；不要引入第四種表面色。
- 不要 `cursor:none` 自訂游標、不要依賴外部 `grainy-gradients.vercel.app/noise.svg`、不要 `rounded-[40px]` 超大圓角、不要全大寫 font-black 潮牌風（這些是舊站要淘汰的）。
- **不要在任何對外文案出現 AI 模型或廠商名（GLM / Z.ai 等）**——一律寫「AI 品質審核 / AI 數據分析」。

## 10. RWD

| 斷點 | 寬 | 變化 |
| ---- | -- | ---- |
| Mobile | <768px | 漢堡選單；hero h1 64→32px；右側圖卡堆到文字下方；feature 1-up；pricing 1-up；footer 4 欄→1 |
| Tablet | 768–1024px | nav 收緊但維持橫向；feature 2-up；pricing 2-up |
| Desktop | 1024–1440px | 完整 nav；feature 3-up；pricing 3-up |
| Wide | >1440px | 同桌機，外距更寬，內容最大寬 1200px |

觸控目標 ≥40px；hero 6/6 在 mobile 收成單欄（文字在上、圖卡在下）。
