export const SLIDE_TYPES = ['ad', 'tip', 'info', 'sponsor', 'coupon'] as const;

export type SlideType = (typeof SLIDE_TYPES)[number];

export const SlideType = {
    AD: 'ad',
    SPONSOR: 'sponsor',
    TIP: 'tip',
    INFO: 'info',
    COUPON: 'coupon'
} as const satisfies Record<string, SlideType>;
