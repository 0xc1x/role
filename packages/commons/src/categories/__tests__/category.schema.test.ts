import { describe, expect, it } from 'vitest';
import { CreateCategorySchema } from '../schemas/category.schema';

describe('CreateCategorySchema', () => {
  it('accepts valid category', () => {
    expect(
      CreateCategorySchema.safeParse({
        name: 'Panadería',
        description: 'Panes y repostería',
        emoji: '🥖',
        slug: 'panaderia',
        image_url: null,
        active: true,
      }).success,
    ).toBe(true);
  });

  it('rejects invalid slug', () => {
    expect(
      CreateCategorySchema.safeParse({
        name: 'Panadería',
        description: 'Desc',
        emoji: null,
        slug: 'Invalid Slug',
        image_url: null,
        active: true,
      }).success,
    ).toBe(false);
  });
});
