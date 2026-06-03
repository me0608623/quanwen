import { describe, expect, it } from 'vitest';
import { SubmitResponseSchema } from './submit-response.dto';

describe('SubmitResponseSchema', () => {
  it('allows zero-based rating answers', () => {
    const result = SubmitResponseSchema.safeParse({
      answers: [{
        questionId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
        ratingValue: 0,
      }],
    });

    expect(result.success).toBe(true);
  });

  it('allows synthetic yes-no option ids', () => {
    const result = SubmitResponseSchema.safeParse({
      answers: [{
        questionId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
        selectedOptionIds: ['yes'],
      }],
    });

    expect(result.success).toBe(true);
  });
});
