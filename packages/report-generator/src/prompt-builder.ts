/**
 * Prompt builder — constructs the prompt to send to the AI agent
 * for generating survey report HTML.
 *
 * Adapted from nexu-io/html-anything's template/skill approach.
 */

import { loadSkill, type LoadedSkill } from "./skills.js";

export type SurveyReportData = {
  /** Report title */
  title: string;
  /** Survey name */
  surveyName: string;
  /** Date range or collection period */
  period?: string;
  /** Total responses */
  totalResponses: number;
  /** Completion rate (0-1) */
  completionRate?: number;
  /** Average time to complete in seconds */
  avgCompletionSeconds?: number;
  /** Question-level results */
  questions: SurveyQuestionResult[];
  /** Optional executive summary / key insights */
  insights?: string[];
};

export type SurveyQuestionResult = {
  /** Question text */
  question: string;
  /** Question type */
  type: "single_choice" | "multiple_choice" | "rating" | "text" | "number" | "yes_no";
  /** Response count for this question */
  responseCount: number;
  /** For choice questions: option -> count */
  choiceCounts?: Record<string, number>;
  /** For rating questions: average value */
  averageRating?: number;
  /** For number questions: stats */
  numberStats?: { min: number; max: number; mean: number; median: number };
  /** For text questions: top themes / word cloud data */
  textThemes?: string[];
};

/**
 * Build the full prompt for generating an HTML survey report.
 * Uses the skill's prompt body as the template instruction.
 */
export function buildReportPrompt(
  skill: LoadedSkill,
  data: SurveyReportData,
): string {
  const dataJson = JSON.stringify(data, null, 2);

  return `${skill.body}

## Task
Generate a complete, single-file HTML document (inline CSS + JS) that presents the following survey data as a beautiful visualization report.

## Survey Data (JSON)
\`\`\`json
${dataJson}
\`\`\`

## Requirements
- The HTML must be fully self-contained (no external files, CDN for Chart.js/Tailwind is OK).
- Parse the actual survey data from the JSON above — do NOT fabricate numbers.
- Use the "${skill.zhName}" template style.
- Include KPI cards, charts (Chart.js via CDN), data tables, and insight blocks.
- Chart containers MUST have fixed height parent divs to avoid Chart.js ResizeObserver loops.
- Use professional, restrained color palette.
- Generate a complete document ready to save and share.
`;
}

/**
 * Convenience: build a report prompt using a skill from a directory.
 */
export function buildSurveyReport(
  skillDir: string,
  data: SurveyReportData,
): string | null {
  const skill = loadSkill(skillDir);
  if (!skill) return null;
  return buildReportPrompt(skill, data);
}
