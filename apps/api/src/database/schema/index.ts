export * from './enums';
export * from './profiles';
export * from './businesses';
export * from './business-locations';
export * from './offers';
export * from './offer-categories';
export * from './orders';
export * from './payouts';
export * from './coupons';
export * from './reviews';
export * from './user-preferences';
export * from './business-notification-preferences';
export * from './device-tokens';
export * from './favorites';
export * from './categories';
export * from './slides';
export * from './tips';
export * from './app-configs';
export * from './app-store';
export * from './email-marketing';
export * from './push-notifications';

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
import { appStore } from './app-store';
import { deviceTokens } from './device-tokens';
import { favorites } from './favorites';
import {
  campaigns,
  emailComponents,
  emailSends,
  emailTemplates,
  marketingPreferences,
  segmentUsers,
  segments,
} from './email-marketing';
import { pushNotifications, pushTemplates } from './push-notifications';
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
  deviceTokens,
  favorites,
  appConfig,
  appStore,
  emailComponents,
  emailTemplates,
  marketingPreferences,
  segments,
  segmentUsers,
  campaigns,
  emailSends,
  pushTemplates,
  pushNotifications,
};

export type DatabaseSchema = typeof schema;
