export const SLIDE_TYPES = ['ad', 'tip', 'info', 'sponsor'] as const;

export type SlideType = (typeof SLIDE_TYPES)[number];

export const SlideType = {
    AD: 'ad',
    SPONSOR: 'sponsor',
    TIP: 'tip',
    INFO: 'info'
} as const satisfies Record<string, SlideType>;
