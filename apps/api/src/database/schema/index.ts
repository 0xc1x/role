export * from './enums';
export * from './profiles';
export * from './businesses';
export * from './business-companions';
export * from './business-members';
export * from './subscription-plans';
export * from './business-locations';
export * from './business-hours';
export * from './offers';
export * from './offer-categories';
export * from './orders';
export * from './payouts';
export * from './payment-methods';
export * from './coupons';
export * from './reviews';
export * from './user-preferences';
export * from './business-notification-preferences';
export * from './device-tokens';
export * from './favorites';
export * from './saved-addresses';
export * from './categories';
export * from './announcements';
export * from './slides';
export * from './tips';
export * from './app-configs';
export * from './app-store';
export * from './email-marketing';
export * from './push-notifications';

import { businessHours } from './business-hours';
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
import { announcements, announcementAcknowledgements } from './announcements';
import { slides } from './slides';
import { tips } from './tips';
import { appConfig } from './app-configs';
import { appStore } from './app-store';
import { deviceTokens } from './device-tokens';
import { favorites } from './favorites';
import { savedAddresses } from './saved-addresses';
import {
  campaigns,
  emailComponents,
  emailSends,
  emailTemplates,
  marketingPreferences,
  segmentUsers,
  segments,
} from './email-marketing';
import {
  pushNotifications,
  pushSends,
  pushTemplates,
} from './push-notifications';
import { payouts } from './payouts';
import { paymentMethods } from './payment-methods';
import { businessFinance, businessModeration } from './business-companions';
import {
  businessMemberLocations,
  businessMembers,
  businessPlansState,
} from './business-members';
import {
  subscriptionPlanFeatures,
  subscriptionPlans,
} from './subscription-plans';
import { defineRelations } from 'drizzle-orm';

/** Schema map passed to drizzle() for typed queries. */
export const schema = {
  profiles,
  businesses,
  businessLocations,
  businessHours,
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
  paymentMethods,
  categories,
  slides,
  tips,
  announcements,
  announcementAcknowledgements,
  deviceTokens,
  favorites,
  savedAddresses,
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
  pushSends,
  businessFinance,
  businessModeration,
  businessMembers,
  businessMemberLocations,
  businessPlansState,
  subscriptionPlans,
  subscriptionPlanFeatures,
};

export type DatabaseSchema = typeof schema;

/**
 * Relations for the relational query builder. Only the business aggregate is
 * declared: it is the one relation set that is not inferable from a join in
 * the query (a business is read together with its three companions). The
 * repositories still join explicitly, so this is the RQB view of the same
 * shape.
 *
 * The three staff tables are declared the same way and for the same reason: each
 * row points at its parent, and that link is the one thing a query cannot infer.
 * `businesses.members` is deliberately NOT declared — a business is not read
 * together with its staff anywhere yet, and the member list arrives already
 * scoped by role and branch, which is not the aggregate this file describes.
 */
export const relations = defineRelations(schema, (helpers) => ({
  businesses: {
    finance: helpers.one.businessFinance(),
    moderation: helpers.one.businessModeration(),
  },
  businessFinance: {
    business: helpers.one.businesses({
      from: helpers.businessFinance.business_id,
      to: helpers.businesses.id,
    }),
  },
  businessModeration: {
    business: helpers.one.businesses({
      from: helpers.businessModeration.business_id,
      to: helpers.businesses.id,
    }),
  },
  businessMembers: {
    business: helpers.one.businesses({
      from: helpers.businessMembers.business_id,
      to: helpers.businesses.id,
    }),
  },
  // The scope table has TWO parents and no `business_id` of its own, so it
  // declares both: a member of two branches is one member with two rows here.
  businessMemberLocations: {
    member: helpers.one.businessMembers({
      from: helpers.businessMemberLocations.member_id,
      to: helpers.businessMembers.id,
    }),
    location: helpers.one.businessLocations({
      from: helpers.businessMemberLocations.location_id,
      to: helpers.businessLocations.id,
    }),
  },
  businessPlansState: {
    business: helpers.one.businesses({
      from: helpers.businessPlansState.business_id,
      to: helpers.businesses.id,
    }),
  },
  // El catálogo: cada feature pertenece a un plan, y ese vínculo es lo que una
  // consulta no puede inferir — `plan_code` es el código del plan y no una
  // foreign key a `subscription_plans.code` que el query builder sepa resolver.
  subscriptionPlanFeatures: {
    plan: helpers.one.subscriptionPlans({
      from: helpers.subscriptionPlanFeatures.plan_code,
      to: helpers.subscriptionPlans.code,
    }),
  },
}));
