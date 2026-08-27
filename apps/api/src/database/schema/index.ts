export * from './enums';
export * from './profiles';
export * from './businesses';
export * from './business-locations';
export * from './offers';
export * from './offer-categories';
export * from './orders';
export * from './coupons';
export * from './reviews';
export * from './user-preferences';
export * from './business-notification-preferences';
export * from './categories';
export * from './slides';
export * from './tips';
export * from './app-configs';
export * from './email-marketing';

import { businessLocations } from './business-locations';
import { businesses } from './businesses';
import { offerCategories } from './offer-categories';
import { offers } from './offers';
import { orderEvents, orders } from './orders';
import { coupons } from './coupons';
import { reviews } from './reviews';
import {
  consumerNotificationPreferences,
  userConsents,
  userPreferences,
} from './user-preferences';
import { businessNotificationPreferences } from './business-notification-preferences';
import { profiles } from './profiles';
import { categories } from './categories';
import { slides } from './slides';
import { tips } from './tips';
import { appConfig } from './app-configs';
import {
  campaigns,
  emailComponents,
  emailSends,
  emailTemplates,
  marketingPreferences,
  segmentUsers,
  segments,
} from './email-marketing';
import { payouts } from './payouts';

/** Schema map passed to drizzle() for typed queries. */
export const schema = {
  profiles,
  businesses,
  businessLocations,
  offers,
  offerCategories,
  orders,
  orderEvents,
  coupons,
  reviews,
  userPreferences,
  consumerNotificationPreferences,
  userConsents,
  businessNotificationPreferences,
  payouts,
  categories,
  slides,
  tips,
  appConfig,
  emailComponents,
  emailTemplates,
  marketingPreferences,
  segments,
  segmentUsers,
  campaigns,
  emailSends,
};

export type DatabaseSchema = typeof schema;
