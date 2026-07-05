# Task: Headlessly verify the multi-select matrix (複選矩陣) actually works via survey-core

## Context
QuanWen monorepo (pnpm). Frontend `apps/web` uses SurveyJS (`survey-core`) to render survey fill pages.
We just added "multi-select matrix" support. The adapter `apps/web/src/lib/surveyjs-adapter.ts`,
function `quanswenToSurveyJs`, converts a QuanWen question of `type: 'matrix'` with
`config.matrix = { rows: string[], columns: string[], multiple?: boolean }`:
- `multiple !== true` → SurveyJS `{ type: 'matrix', rows:[{value,text}], columns:[{value,text}] }`
- `multiple === true` → SurveyJS `{ type: 'matrixdropdown', rows:[{value,text}], columns:[{name,title,cellType:'boolean'}] }`

Answers are extracted by `extractAnswers(surveyJsData, questions)` in the same file; for `type:'matrix'`
it does `answer.textAnswer = JSON.stringify(raw)` where `raw = surveyJsData[questionId]`.

The author (Claude) could NOT headlessly render SurveyJS to confirm `matrixdropdown` + boolean columns
behaves as intended. THIS TASK = prove it with an automated test, or surface the real failure.

## Goal
Add ONE new vitest test file in apps/web that imports the REAL `survey-core` and the REAL adapter, and proves
the end-to-end multi-select matrix path:

1. Build a QuanWen question: matrix, rows ['陳述A','陳述B'], columns ['不同意','普通','同意'], multiple:true.
2. `const model = quanswenToSurveyJs({ questions:[q] })` → assert emitted element `type==='matrixdropdown'`
   and columns are `{name,title,cellType:'boolean'}`.
3. Instantiate `new Model(model)` from `survey-core`. Assert it builds without throwing and
   `model.getAllQuestions()[0].getType() === 'matrixdropdown'`, rows length 2, columns length 3.
4. Simulate a multi-select answer (a respondent ticks multiple cells per row), e.g.
   `m.setValue(q.id, { '陳述A': { '同意': true, '普通': true }, '陳述B': { '不同意': true } })`,
   then read `m.getValue(q.id)` back and assert it preserves the multiple selections.
5. Run `extractAnswers(m.getValue ? { [q.id]: m.getValue(q.id) } : ..., [q])` (use the model data object,
   i.e. `m.data`) and assert the returned answer's `textAnswer` is a JSON string that, when parsed, still
   contains the multiple ticked cells (e.g. parsed['陳述A'] has both '同意' and '普通' true).
6. Also add a single-select control case (multiple omitted) → emitted `type==='matrix'`, and a Model builds.

Then RUN the test and report PASS/FAIL with the actual output.

## Constraints
- ADD a new test file only: `apps/web/src/lib/surveyjs-adapter.matrix-multi.integration.test.ts`.
- Do NOT modify `surveyjs-adapter.ts` or any source UNLESS the test reveals a genuine bug. If it does,
  STOP and report the exact survey-core error/behavior in the result summary — do NOT silently "fix" by
  weakening the assertions to make them pass. A failing test that exposes a real problem is a SUCCESS here.
- Use the existing import style: `import { Model } from 'survey-core'`. The web vitest config uses jsdom
  (survey-core may need a DOM; jsdom should suffice — if it needs more, report what it needs).
- Run exactly: `pnpm --filter web test src/lib/surveyjs-adapter.matrix-multi.integration.test.ts`
- Traditional Chinese is fine in test data. Do not touch other tests.

## Acceptance
- The new test file exists and is self-contained.
- The test run output is captured. If it PASSES: the multi-select matrix is confirmed working through
  survey-core (build + value round-trip + answer extraction).
- If it FAILS: the result summary states the precise failing assertion and the survey-core error/behavior,
  so Claude can fix the adapter. Either outcome is a valid deliverable — report truthfully, do not fabricate.
- List files changed and the exact test command output (pass/fail counts).
