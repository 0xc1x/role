import { describe, expect, it } from 'vitest';
import { CreateReviewSchema } from '../schemas/review.schema';

const uuid = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

describe('CreateReviewSchema', () => {
  it('accepts minimal review', () => {
    expect(
      CreateReviewSchema.safeParse({
        user_id: uuid,
        business_id: uuid,
      }).success,
    ).toBe(true);
  });

  it('rejects invalid user_id', () => {
    expect(
      CreateReviewSchema.safeParse({
        user_id: 'bad',
        business_id: uuid,
      }).success,
    ).toBe(false);
  });
});
