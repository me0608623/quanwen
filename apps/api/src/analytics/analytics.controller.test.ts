import { describe, expect, it, vi } from 'vitest';
import { AnalyticsController } from './analytics.controller';
import type { AnalyticsService } from './analytics.service';

describe('AnalyticsController', () => {
  it('does not accept numeric prefixes in segmentation k', async () => {
    const getSegmentation = vi.fn().mockResolvedValue({ segments: [], totalRespondents: 0 });
    const controller = new AnalyticsController({ getSegmentation } as unknown as AnalyticsService);

    await controller.getSegmentation(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      { user: { id: '11111111-1111-1111-1111-111111111111' } } as never,
      '3abc',
    );

    expect(getSegmentation).toHaveBeenCalledWith(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      '11111111-1111-1111-1111-111111111111',
      Number.NaN,
    );
  });
});
