import { describe, expect, it } from 'vitest';
import { CreateSlideSchema } from '../schemas/slide.schema';
import { SlideType } from '../enums/slide.enum';

function validSlide(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Promo verano',
    caption: 'Hasta 50% off en bolsas sorpresa',
    cta_label: 'Ver ofertas',
    image_url: 'https://cdn.example.com/slide.jpg',
    redirect_url: 'https://role.ec/offers',
    type: SlideType.AD,
    ...overrides,
  };
}

describe('CreateSlideSchema', () => {
  it('accepts valid slide', () => {
    expect(CreateSlideSchema.safeParse(validSlide()).success).toBe(true);
  });

  it('rejects empty title', () => {
    expect(CreateSlideSchema.safeParse(validSlide({ title: '' })).success).toBe(
      false,
    );
  });

  it('accepts internal route destination (starts with /)', () => {
    expect(
      CreateSlideSchema.safeParse(validSlide({ redirect_url: '/explore' }))
        .success,
    ).toBe(true);
  });

  it('rejects relative route without leading slash', () => {
    expect(
      CreateSlideSchema.safeParse(validSlide({ redirect_url: 'explore' }))
        .success,
    ).toBe(false);
  });

  it('rejects non-coupon slide without redirect_url', () => {
    expect(
      CreateSlideSchema.safeParse(validSlide({ redirect_url: null })).success,
    ).toBe(false);
  });

  it('accepts coupon slide with code and no destination', () => {
    expect(
      CreateSlideSchema.safeParse(
        validSlide({
          type: SlideType.COUPON,
          coupon_code: 'ROLE10',
          redirect_url: null,
        }),
      ).success,
    ).toBe(true);
  });

  it('rejects coupon slide without coupon_code', () => {
    expect(
      CreateSlideSchema.safeParse(
        validSlide({ type: SlideType.COUPON, redirect_url: null }),
      ).success,
    ).toBe(false);
  });

  it('rejects coupon slide with redirect_url', () => {
    expect(
      CreateSlideSchema.safeParse(
        validSlide({
          type: SlideType.COUPON,
          coupon_code: 'ROLE10',
        }),
      ).success,
    ).toBe(false);
  });
});
