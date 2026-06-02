# PRD: Survey Editor Advanced Features
## 進階題型 + 邏輯跳轉 + 外觀客製化

> Issue: QUA-248
> Status: Draft — Pending CTO/Researcher Review
> Author: CEO Agent
> Date: 2026-06-02

---

## 1. Overview

QuanWen survey editor currently supports 7 basic question types (single choice, multiple choice, text, rating, numeric, yes/no, dropdown). This PRD specifies 6 new advanced question types, a comprehensive logic/branching engine, and appearance customization for the survey fill-out experience.

**Business impact**: Advanced question types + logic branching are table-stakes for professional survey platforms. Without them, power users (academic researchers, enterprise HR) will churn to competitors like SurveyMonkey or Qualtrics.

---

## 2. Current State Analysis

### 2.1 DB Schema (already exists)

- `questionTypeEnum`: `single_choice | multiple_choice | text | rating | matrix`
- `surveyLogicRules` table: supports `eq/neq/gt/gte/lt/lte/contains/not_contains/is_empty/is_not_empty` conditions with `show/hide/skip` actions
- `questionOptions` table: linked to questions
- `config` JSONB field on questions: flexible for type-specific settings

### 2.2 Frontend (current)

- `question-editor.tsx`: handles 7 display types
- `question-block-list.tsx`: drag-and-drop question ordering
- `survey-preview-player.tsx`: live preview
- Logic tab exists but only basic skip-to-question support

### 2.3 Gap Analysis

| Feature | DB Ready | API Ready | Frontend Ready |
|---------|----------|-----------|----------------|
| Matrix question | ✅ (enum) | ❌ (no endpoint logic) | ❌ |
| Ranking question | ❌ (not in enum) | ❌ | ❌ |
| Slider question | ❌ (not in enum) | ❌ | ❌ |
| Date/time picker | ❌ (not in enum) | ❌ | ❌ |
| File upload | ❌ (not in enum) | ❌ | ❌ |
| Signature | ❌ (not in enum) | ❌ | ❌ |
| Show/hide logic | ✅ | ❌ | Partial |
| Skip-to logic | ✅ | ❌ | Partial |
| Complex AND/OR conditions | ❌ | ❌ | ❌ |
| Appearance customization | N/A | ❌ | ❌ |

---

## 3. Feature Specifications

### 3.1 Advanced Question Types

#### 3.1.1 Matrix Question (矩陣題)

**Description**: Grid of rows (statements) × columns (scale options). Respondent selects one column per row.

**DB**: `question_type = 'matrix'` (already in enum)
**Config schema**:
```json
{
  "rows": [{ "id": "uuid", "label": "服務品質" }, ...],
  "columns": [{ "id": "uuid", "label": "非常滿意", "value": 5 }, ...],
  "renderAs": "radio" | "checkbox" | "dropdown",
  "randomizeRows": false
}
```

**Frontend editor UI**:
- Editable rows list (add/remove/reorder)
- Editable columns list (add/remove)
- Render-as toggle (radio grid default)
- Row randomization toggle

**Response storage** (in `responses` table answer JSONB):
```json
{ "questionId": { "rowId": "columnId", ... } }
```

**Acceptance criteria**:
- [ ] Editor: can add/remove/reorder rows and columns
- [ ] Preview: renders as grid with radio buttons
- [ ] Fill: respondent selects exactly one column per row
- [ ] Validation: all required rows must have a selection
- [ ] Export: each row exported as separate column in CSV pivot

---

#### 3.1.2 Ranking Question (排序題)

**Description**: Respondent drags items into their preferred order.

**DB**: Add `ranking` to `questionTypeEnum`
**Config schema**:
```json
{
  "items": [{ "id": "uuid", "label": "選項 A" }, ...],
  "maxRankable": null,
  "randomizeInitialOrder": true
}
```

**Frontend**: Drag-and-drop sortable list (use `@dnd-kit/core` — already React ecosystem compatible)

**Response**:
```json
{ "questionId": ["item3_id", "item1_id", "item2_id"] }
```

**Acceptance criteria**:
- [ ] Editor: add/remove/reorder items
- [ ] Preview: draggable items with rank numbers
- [ ] Fill: touch + desktop drag support
- [ ] Validation: all items must be ranked (or top-N if maxRankable set)
- [ ] Export: rank number per item

---

#### 3.1.3 Slider / Scale Question (滑桿評分題)

**Description**: Continuous scale selector with configurable min/max/step.

**DB**: Add `slider` to `questionTypeEnum`
**Config schema**:
```json
{
  "min": 0,
  "max": 100,
  "step": 1,
  "minLabel": "完全不滿意",
  "maxLabel": "非常滿意",
  "showValue": true,
  "showTicks": false
}
```

**Frontend**: HTML range input styled with Tailwind + custom track/thumb

**Response**: `{ "questionId": 73 }` (integer)

**Acceptance criteria**:
- [ ] Configurable min/max/step in editor
- [ ] Custom labels at endpoints
- [ ] Optional tick marks
- [ ] Shows current value (toggleable)
- [ ] Touch-friendly on mobile

---

#### 3.1.4 Date/Time Picker (日期時間選擇器)

**Description**: Calendar or time input with format control.

**DB**: Add `datetime` to `questionTypeEnum`
**Config schema**:
```json
{
  "format": "date" | "time" | "datetime",
  "minDate": "2026-01-01",
  "maxDate": "2026-12-31",
  "dateFormat": "YYYY-MM-DD"
}
```

**Frontend**: Use native `<input type="date/time/datetime-local">` with shadcn/ui DatePicker wrapper

**Response**: `{ "questionId": "2026-06-15" }`

**Acceptance criteria**:
- [ ] Three modes: date only, time only, datetime
- [ ] Min/max date validation
- [ ] Mobile keyboard triggers appropriate picker
- [ ] ISO 8601 storage format

---

#### 3.1.5 File Upload Question (檔案上傳題)

**Description**: Allow respondents to upload files (images, PDFs, docs).

**DB**: Add `file_upload` to `questionTypeEnum`
**Config schema**:
```json
{
  "acceptedTypes": ["image/*", "application/pdf"],
  "maxSizeMB": 10,
  "maxFiles": 1,
  "capture": null
}
```

**Backend**: 
- New endpoint: `POST /surveys/:id/questions/:qid/upload` → S3/R2 presigned URL
- Store file metadata in response JSONB
- Virus scan on upload (ClamAV or cloud-native equivalent)

**Response**:
```json
{
  "questionId": [{
    "filename": "receipt.pdf",
    "url": "https://storage.quanwen.ai/...",
    "size": 245678,
    "mimeType": "application/pdf"
  }]
}
```

**Acceptance criteria**:
- [ ] Drag-and-drop + click-to-browse upload zone
- [ ] File type restriction enforcement (client + server)
- [ ] File size validation (client preview + server hard limit)
- [ ] Upload progress indicator
- [ ] Max 5 files per question (configurable)
- [ ] Preview for image uploads

---

#### 3.1.6 Signature Question (簽名題)

**Description**: Canvas for handwritten signature capture.

**DB**: Add `signature` to `questionTypeEnum`
**Config schema**:
```json
{
  "width": 500,
  "height": 200,
  "penColor": "#000000",
  "penWidth": 2,
  "backgroundColor": "#ffffff"
}
```

**Frontend**: Canvas-based signature pad (recommend `signature_pad` npm package, ~12KB gzipped)

**Response**:
```json
{
  "questionId": {
    "dataUrl": "data:image/png;base64,...",
    "storageUrl": "https://storage.quanwen.ai/signatures/..."
  }
}
```

**Acceptance criteria**:
- [ ] Smooth drawing on desktop + touch
- [ ] Clear/undo button
- [ ] Export as PNG (stored in object storage)
- [ ] Minimum stroke validation (prevent empty signature)

---

### 3.2 Logic & Branching Engine

#### 3.2.1 Current State

The `surveyLogicRules` table supports single-condition rules (one trigger question → one condition → one action → one target). No AND/OR grouping.

#### 3.2.2 Proposed: Condition Groups

Add a `logic_condition_groups` table for AND/OR compound conditions:

```sql
CREATE TABLE logic_condition_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  action logic_action NOT NULL,  -- 'show', 'hide', 'skip', 'end_survey'
  target_question_id UUID REFERENCES survey_questions(id) ON DELETE CASCADE,
  target_page_id UUID,           -- for skip-to-page (future: multi-page surveys)
  combinator VARCHAR(8) NOT NULL DEFAULT 'and',  -- 'and' | 'or'
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Modify `surveyLogicRules` to reference a group:
```sql
ALTER TABLE survey_logic_rules ADD COLUMN group_id UUID REFERENCES logic_condition_groups(id) ON DELETE CASCADE;
```

**Evaluation engine** (runtime, when respondent navigates):
```
For each group G:
  results = []
  For each rule R in G (ordered by sort_order):
    evaluate R.triggerQuestionId's answer against R.condition and R.value
    results.push(outcome)
  
  if G.combinator == 'and':
    groupMatch = all(results)
  else:
    groupMatch = any(results)
  
  Apply G.action to G.target (show/hide/skip/end)
```

#### 3.2.3 Logic Actions

| Action | Description | Target |
|--------|-------------|--------|
| `show` | Show target question (hidden by default) | question |
| `hide` | Hide target question (shown by default) | question |
| `skip` | Jump to target question (skip intervening) | question/page |
| `end_survey` | Immediately end survey with custom message | N/A |

#### 3.2.4 Logic Editor UI

In the question editor's "Logic" tab:
- Visual rule builder (condition cards → drag to group)
- Each card: [Trigger Question ▼] [Condition ▼] [Value ___]
- Cards grouped with AND/OR toggle pill
- Group action: [Show ▼] [Target Question ▼]
- "Add condition" / "Add group" buttons
- Live preview updates in real-time

**Acceptance criteria**:
- [ ] Can create single-condition rules (backward compatible)
- [ ] Can create AND condition groups (all must match)
- [ ] Can create OR condition groups (any matches)
- [ ] Can chain multiple groups for the same target
- [ ] Preview mode shows logic in action (select answers → see questions appear/disappear)
- [ ] Circular dependency detection (question A shows B, B hides A → warning)
- [ ] `end_survey` action renders customizable end message

---

### 3.3 Appearance Customization

#### 3.3.1 Survey Theme Config

Add `theme` JSONB column to `surveys` table:
```json
{
  "colors": {
    "primary": "#6366f1",
    "background": "#ffffff",
    "text": "#1f2937",
    "accent": "#8b5cf6"
  },
  "logo": {
    "url": "https://storage.quanwen.ai/logos/...",
    "height": 60
  },
  "font": "Noto Sans TC",
  "backgroundImage": {
    "url": null,
    "opacity": 0.1,
    "fit": "cover"
  },
  "borderRadius": "rounded-lg",
  "questionSpacing": "comfortable"
}
```

#### 3.3.2 Theme Editor UI

New "外觀" tab in survey editor:
1. **Color presets**: 6 pre-built palettes (one click apply)
2. **Custom colors**: Color picker for primary/background/text/accent
3. **Logo upload**: Drag-and-drop image upload (max 200KB, auto-resize to 60px height)
4. **Font selector**: Dropdown with 5 CJK-friendly fonts (loaded via Google Fonts)
5. **Background image**: Optional, with opacity slider
6. **Spacing**: Comfortable / Compact / Spacious toggle
7. **Preview**: Live preview panel updates in real-time

**Font options**:
- Noto Sans TC (default)
- Noto Serif TC
- Taipei Sans TC
- jjti
- Custom (via URL)

**Acceptance criteria**:
- [ ] Theme tab visible in survey editor
- [ ] Color presets apply with one click
- [ ] Custom colors via color picker
- [ ] Logo upload → stored in object storage
- [ ] Font change applies to preview immediately
- [ ] Theme persists with survey draft
- [ ] Fill-out page renders with custom theme
- [ ] Mobile responsive (theme doesn't break on small screens)
- [ ] Default theme = current QuanWen look (no regression)

---

## 4. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- Add new question types to `questionTypeEnum` migration
- Matrix question (DB already supports) — full stack
- Logic condition groups migration + evaluation engine
- Theme JSONB column migration

### Phase 2: Interactive Types (Week 3-4)
- Ranking question (dnd-kit integration)
- Slider question
- Date/time picker
- Logic editor UI (visual rule builder)

### Phase 3: Advanced Types + Polish (Week 5-6)
- File upload (presigned URL flow)
- Signature pad
- Theme editor UI
- Appearance preview
- E2E tests for all new types

---

## 5. Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Drag-and-drop library | `@dnd-kit/core` | Modern, accessible, React 18 compatible, small bundle |
| Signature pad | `signature_pad` | Lightweight, well-maintained, touch-compatible |
| File storage | S3/R2 presigned URLs | Direct-to-cloud upload, no server bottleneck |
| Theme storage | JSONB on surveys | Flexible schema, no migration per theme change |
| Logic evaluation | Server-side (API) | Security: client can't bypass skip/end_survey rules |
| Date picker | Native + shadcn wrapper | Best mobile compatibility, no heavy dep |

---

## 6. Migration Plan

```sql
-- Phase 1: New question types
ALTER TYPE question_type ADD VALUE 'ranking';
ALTER TYPE question_type ADD VALUE 'slider';
ALTER TYPE question_type ADD VALUE 'datetime';
ALTER TYPE question_type ADD VALUE 'file_upload';
ALTER TYPE question_type ADD VALUE 'signature';

-- Phase 1: Theme support
ALTER TABLE surveys ADD COLUMN theme jsonb DEFAULT '{}';

-- Phase 1: Logic condition groups
CREATE TABLE logic_condition_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  action logic_action NOT NULL,
  target_question_id UUID REFERENCES survey_questions(id) ON DELETE CASCADE,
  target_page_id UUID,
  combinator VARCHAR(8) NOT NULL DEFAULT 'and',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE survey_logic_rules ADD COLUMN group_id UUID REFERENCES logic_condition_groups(id) ON DELETE CASCADE;

-- Add 'end_survey' to logic_action enum
ALTER TYPE logic_action ADD VALUE 'end_survey';
```

---

## 7. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Logic engine performance on long surveys (50+ questions) | Medium | High | Cache evaluated visibility per page, lazy-evaluate only visible questions |
| Signature pad poor on old Android browsers | Low | Medium | Feature-detect canvas support, fallback to typed name |
| File upload abuse (malware, large files) | Medium | High | Server-side virus scan, strict MIME check, size limit enforcement |
| Theme breaking mobile layout | Medium | Medium | Mobile-first CSS, constrain custom font sizes, test on 375px viewport |

---

## 8. Success Metrics

- [ ] All 6 new question types editable in survey creator
- [ ] All 6 new question types render correctly in fill-out mode
- [ ] Logic engine supports AND/OR conditions with show/hide/skip/end
- [ ] Theme customization with ≥ 1 custom font + logo upload
- [ ] No regression in existing 7 question types
- [ ] Lighthouse score ≥ 90 on themed survey pages
