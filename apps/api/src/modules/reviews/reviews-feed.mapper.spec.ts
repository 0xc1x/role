import { ReviewFeedMapper } from './reviews-feed.mapper';
import type {
  OfferReviewFeedRow,
  ReviewFeedRow,
} from './reviews-feed.repository';

const createdAt = new Date('2026-01-01T10:00:00.000Z');
const updatedAt = new Date('2026-01-02T10:00:00.000Z');

function feedRow(overrides: Partial<ReviewFeedRow> = {}): ReviewFeedRow {
  return {
    id: 'r1',
    business_id: 'b1',
    order_id: 'o1',
    product_rating: 4,
    business_rating: 5,
    comment: 'Excelente',
    created_at: createdAt,
    updated_at: updatedAt,
    is_hidden: false,
    author_id: 'u1',
    author_name: 'Ana',
    ...overrides,
  };
}

describe('ReviewFeedMapper', () => {
  it('toPublicDto emits the public contract and no moderation field', () => {
    const dto = ReviewFeedMapper.toPublicDto(
      feedRow({ is_hidden: false, comment: null }),
    );

    expect(Object.keys(dto).sort()).toEqual([
      'author_id',
      'author_name',
      'business_id',
      'business_rating',
      'comment',
      'created_at',
      'id',
      'order_id',
      'product_rating',
      'updated_at',
    ]);
    expect(dto.created_at).toBe('2026-01-01T10:00:00.000Z');
  });

  it('the author projection is a display name, and a missing profile is null', () => {
    // The moderation mapper established `profiles.full_name` as the whole public
    // identity of a review author; a row whose profile was deleted has to keep
    // rendering instead of vanishing from the feed.
    expect(ReviewFeedMapper.toPublicDto(feedRow()).author_name).toBe('Ana');
    expect(
      ReviewFeedMapper.toPublicDto(feedRow({ author_name: null })).author_name,
    ).toBeNull();
    expect(ReviewFeedMapper.toPublicDto(feedRow()).author_id).toBe('u1');
  });

  it('toOfferDto adds the resolved offer and nothing else', () => {
    const dto = ReviewFeedMapper.toOfferDto({
      ...feedRow(),
      offer_id: 'off-1',
      offer_title: 'Pack sorpresa',
    } satisfies OfferReviewFeedRow);

    expect(dto.offer_id).toBe('off-1');
    expect(dto.offer_title).toBe('Pack sorpresa');
    expect(Object.keys(dto).sort()).toEqual(
      [
        ...Object.keys(ReviewFeedMapper.toPublicDto(feedRow())),
        'offer_id',
        'offer_title',
      ].sort(),
    );
  });

  it('toMyDto adds is_hidden and withholds the moderation record', () => {
    const dto = ReviewFeedMapper.toMyDto(feedRow({ is_hidden: true }));

    expect(dto.is_hidden).toBe(true);
    // `moderation_reason` / `hidden_reason` are the appeal between the business
    // and the platform, not the author's to read.
    expect(Object.keys(dto)).not.toContain('moderation_reason');
    expect(Object.keys(dto)).not.toContain('hidden_reason');
  });
});
