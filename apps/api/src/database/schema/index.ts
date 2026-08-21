export * from './enums';
export * from './profiles';
export * from './businesses';
export * from './business-locations';
export * from './offers';
export * from './offer-categories';
export * from './orders';
export * from './categories';
export * from './slides';
export * from './app-configs';

import { businessLocations } from './business-locations';
import { businesses } from './businesses';
import { offerCategories } from './offer-categories';
import { offers } from './offers';
import { orderEvents, orders } from './orders';
import { profiles } from './profiles';
import { categories } from './categories';
import { slides } from './slides';
import { appConfig } from './app-configs';


/** Schema map passed to drizzle() for typed queries. */
export const schema = {
  profiles,
  businesses,
  businessLocations,
  offers,
  offerCategories,
  orders,
  orderEvents,
  categories,
  slides,
  appConfig
};

export type DatabaseSchema = typeof schema;
