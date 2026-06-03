/** 依題數估算填答時間（分鐘），每題約 0.5 分鐘，最少 1 分鐘。 */
export function estimateFillMinutes(questionCount: number): number {
  return Math.max(1, Math.round(questionCount * 0.5));
}
