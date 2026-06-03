interface LotteryDisclosureSurvey {
  lotteryWinnerCount?: number | null;
  lotteryDrawMode?: 'when_full' | 'scheduled' | 'manual' | null;
  lotteryDrawAt?: string | null;
}

export function lotteryDrawRule(survey: LotteryDisclosureSurvey): string {
  if (survey.lotteryDrawMode === 'scheduled' && survey.lotteryDrawAt) {
    return `預計於 ${new Date(survey.lotteryDrawAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })} 開獎`;
  }
  if (survey.lotteryDrawMode === 'when_full') return '問卷收滿後由系統自動開獎';
  if (survey.lotteryDrawMode === 'manual') return '問卷收滿後由建立者通知開獎';
  return '依問卷建立者公告開獎';
}

export function lotteryDisclosure(survey: LotteryDisclosureSurvey): string {
  return `${survey.lotteryWinnerCount ?? 1} 名中獎者 · ${lotteryDrawRule(survey)}；若問卷提前截止，將依截止時有效資格名單開獎`;
}
