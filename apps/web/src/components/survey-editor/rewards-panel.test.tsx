import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RewardsPanel } from './rewards-panel';

const noop = () => {};

describe('RewardsPanel', () => {
  it('加急 express：實付 1.2x 與總預算計算正確', () => {
    const html = renderToStaticMarkup(
      <RewardsPanel
        rewardPoints={40}
        targetCount={100}
        deadlineTier="express"
        onRewardChange={noop}
        onTargetChange={noop}
        onTierChange={noop}
      />,
    );
    expect(html).toContain('加急推廣');
    expect(html).toContain('實付 NT$48/份'); // 40 × 1.2
    expect(html).toContain('4,800'); // 48 × 100
  });

  it('standard：顯示標準交付、總預算用基準值', () => {
    const html = renderToStaticMarkup(
      <RewardsPanel
        rewardPoints={30}
        targetCount={50}
        deadlineTier="standard"
        onRewardChange={noop}
        onTargetChange={noop}
        onTierChange={noop}
      />,
    );
    expect(html).toContain('標準交付');
    expect(html).toContain('1,500'); // 30 × 50
  });

  it('mutual：顯示無金錢獎勵提示', () => {
    const html = renderToStaticMarkup(
      <RewardsPanel
        isMutual
        rewardPoints={0}
        targetCount={0}
        deadlineTier="standard"
        onRewardChange={noop}
        onTargetChange={noop}
        onTierChange={noop}
      />,
    );
    expect(html).toContain('互惠問卷沒有金錢獎勵');
  });

  it('lottery：顯示獎品、開獎方式與平台履約條款', () => {
    const html = renderToStaticMarkup(
      <RewardsPanel
        rewardMode="lottery"
        lotteryPrize="饗食天堂平日晚餐券"
        lotteryWinnerCount={2}
        lotteryDrawMode="scheduled"
        lotteryDrawAt="2026-06-10T18:00"
        lotteryTermsAccepted
        rewardPoints={0}
        targetCount={100}
        deadlineTier="standard"
        onRewardChange={noop}
        onTargetChange={noop}
        onTierChange={noop}
      />,
    );
    expect(html).toContain('饗食天堂平日晚餐券');
    expect(html).toContain('指定開獎日期');
    expect(html).toContain('抽獎回報系統會自動處理');
    expect(html).toContain('抽獎資格通知');
    expect(html).toContain('中獎 / 未中獎');
    expect(html).toContain('提前截止');
    expect(html).toContain('平台會保留通知與履約核驗紀錄');
  });
});
