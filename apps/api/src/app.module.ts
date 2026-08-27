import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { SecurityModule } from './auth/security.module';
import { validateEnv, type Env } from './config/env.schema';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { TipsModule } from './modules/tips/tips.module';
import { OffersModule } from './modules/offers/offers.module';
import { OrdersModule } from './modules/orders/orders.module';
import { UploadModule } from './modules/upload/upload.module';
import { SlidesModule } from './modules/slides/slides.module';
import { BusinessesModule } from './modules/businesses/businesses.module';
import { AppConfigModule } from './modules/app-config/app-config.module';
import { StatsModule } from './modules/stats/stats.module';
import { EmailMarketingModule } from './modules/email-marketing/email-marketing.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { PayoutsModule } from './modules/payouts/payouts.module';
import { CommissionsModule } from './modules/commissions/commissions.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReviewsModule } from './modules/reviews/reviews.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const url = config.get('REDIS_URL', { infer: true });
        if (!url) return { connection: { host: 'localhost', port: 6379, lazyConnect: true, enableReadyCheck: false, maxRetriesPerRequest: null } } as never;
        try {
          const u = new URL(url);
          return {
            connection: {
              host: u.hostname,
              port: Number(u.port) || 6379,
              username: u.username || undefined,
              password: u.password || undefined,
              maxRetriesPerRequest: null,
            },
          } as never;
        } catch {
          return { connection: { host: 'localhost', port: 6379, lazyConnect: true, enableReadyCheck: false, maxRetriesPerRequest: null } } as never;
        }
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
      {
        name: 'auth',
        ttl: 60000,
        limit: 10,
      },
      {
        name: 'orders',
        ttl: 60000,
        limit: 30,
      },
      {
        name: 'upload',
        ttl: 60000,
        limit: 20,
      },
    ]),
    DatabaseModule,
    SecurityModule,
    AuthModule,
    HealthModule,
    CategoriesModule,
    TipsModule,
    OffersModule,
    OrdersModule,
    UploadModule,
    SlidesModule,
    BusinessesModule,
    AppConfigModule,
    StatsModule,
    EmailMarketingModule,
    ProfilesModule,
    PayoutsModule,
    CommissionsModule,
    ReviewsModule,
    NotificationsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
