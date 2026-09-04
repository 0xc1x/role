CREATE TYPE "app_role" AS ENUM('user', 'business', 'admin');--> statement-breakpoint
CREATE TYPE "business_type" AS ENUM('restaurant', 'bakery', 'cafe', 'grocery', 'other');--> statement-breakpoint
CREATE TYPE "coupon_type" AS ENUM('percentage', 'fixed');--> statement-breakpoint
CREATE TYPE "day_of_week" AS ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');--> statement-breakpoint
CREATE TYPE "order_status" AS ENUM('pending', 'confirmed', 'ready_for_pickup', 'picked_up', 'completed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "payment_gateway" AS ENUM('place_to_pay', 'stripe');--> statement-breakpoint
CREATE TYPE "payment_intent_status" AS ENUM('pending', 'processing', 'approved', 'rejected', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "payout_status" AS ENUM('pending', 'processing', 'paid', 'failed');--> statement-breakpoint
CREATE TYPE "store_entry_status" AS ENUM('PENDIENTE', 'PROCESADO', 'ERROR');--> statement-breakpoint
CREATE TYPE "campaign_status" AS ENUM('draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "email_component_type" AS ENUM('header', 'footer');--> statement-breakpoint
CREATE TYPE "email_send_status" AS ENUM('pending', 'queued', 'processing', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "email_send_type" AS ENUM('campaign', 'transactional', 'newsletter', 'notification', 'test');--> statement-breakpoint
CREATE TYPE "segment_type" AS ENUM('static', 'dynamic');--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY,
	"email" text NOT NULL,
	"full_name" text,
	"avatar_url" text,
	"phone" text,
	"role" "app_role" DEFAULT 'user'::"app_role" NOT NULL,
	"city" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "business_type" DEFAULT 'restaurant'::"business_type" NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"image" text,
	"cover_image" text,
	"rating" numeric(10,2) DEFAULT '0',
	"review_count" integer DEFAULT 0,
	"description" text,
	"phone" text,
	"email" text,
	"website" text,
	"commission_rate" numeric(10,4) DEFAULT '0.1000',
	"balance" numeric(12,2) DEFAULT '0.00',
	"currency" text DEFAULT 'USD' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"verification_status" text DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by" uuid,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"phone" text,
	"latitude" numeric(10,7) NOT NULL,
	"longitude" numeric(10,7) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"zone" text,
	"is_headquarter" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"business_id" uuid NOT NULL,
	"business_location_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"image" text,
	"original_price" numeric(12,2) NOT NULL,
	"discounted_price" numeric(12,2) NOT NULL,
	"discount_percentage" numeric(8,2),
	"stock" integer DEFAULT 1 NOT NULL,
	"initial_stock" integer DEFAULT 1 NOT NULL,
	"pickup_start" timestamp with time zone NOT NULL,
	"pickup_end" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"includes" text,
	"allergens" text,
	"rating" numeric(10,2) DEFAULT '0' NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_categories" (
	"offer_id" uuid,
	"category_id" uuid,
	CONSTRAINT "offer_categories_pkey" PRIMARY KEY("offer_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"order_id" uuid NOT NULL,
	"status" "order_status" NOT NULL,
	"previous_status" "order_status",
	"changed_by" uuid,
	"reason" text,
	"metadata" jsonb DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"order_number" text NOT NULL UNIQUE,
	"status" "order_status" DEFAULT 'pending'::"order_status" NOT NULL,
	"price" numeric(12,2) NOT NULL,
	"original_price" numeric(12,2) NOT NULL,
	"pickup_code" text NOT NULL,
	"pickup_time" timestamp with time zone,
	"coupon_id" uuid,
	"commission_rate" numeric(10,4) DEFAULT '0.1000' NOT NULL,
	"platform_fee" numeric(12,2) DEFAULT '0' NOT NULL,
	"net_amount" numeric(12,2) DEFAULT '0' NOT NULL,
	"payout_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"business_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"gross_amount" numeric(12,2) NOT NULL,
	"platform_fee" numeric(12,2) NOT NULL,
	"net_amount" numeric(12,2) NOT NULL,
	"status" "payout_status" DEFAULT 'pending'::"payout_status" NOT NULL,
	"gateway_payout_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"business_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "coupon_type" NOT NULL,
	"value" numeric NOT NULL,
	"min_order_amount" numeric DEFAULT '0',
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"order_id" uuid,
	"rating" integer,
	"comment" text,
	"product_rating" integer,
	"business_rating" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumer_notification_preferences" (
	"user_id" uuid PRIMARY KEY,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"sms_enabled" boolean DEFAULT false NOT NULL,
	"whatsapp_enabled" boolean DEFAULT false NOT NULL,
	"favorite_alerts_enabled" boolean DEFAULT true NOT NULL,
	"pickup_reminders_enabled" boolean DEFAULT true NOT NULL,
	"last_minute_deals_enabled" boolean DEFAULT false NOT NULL,
	"weekly_summary_enabled" boolean DEFAULT true NOT NULL,
	"quiet_hours_from" time,
	"quiet_hours_to" time,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"consent_type" text NOT NULL,
	"granted" boolean DEFAULT false NOT NULL,
	"granted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"notification_radius_km" integer DEFAULT 5,
	"favorite_categories" text[] DEFAULT '{}'::text[],
	"language" text DEFAULT 'es',
	"theme_mode" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_notification_preferences" (
	"business_id" uuid PRIMARY KEY,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"sms_enabled" boolean DEFAULT false NOT NULL,
	"whatsapp_enabled" boolean DEFAULT false NOT NULL,
	"new_orders_enabled" boolean DEFAULT true NOT NULL,
	"pickup_ready_enabled" boolean DEFAULT true NOT NULL,
	"reviews_enabled" boolean DEFAULT true NOT NULL,
	"low_stock_enabled" boolean DEFAULT false NOT NULL,
	"daily_summary_enabled" boolean DEFAULT true NOT NULL,
	"quiet_hours_from" time,
	"quiet_hours_to" time,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"token" text NOT NULL UNIQUE,
	"platform" text NOT NULL,
	"device_info" jsonb DEFAULT 'null',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"description" text,
	"emoji" text,
	"slug" text NOT NULL UNIQUE,
	"image_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "slides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"title" text NOT NULL,
	"caption" text NOT NULL,
	"badge_text" text,
	"cta_label" text NOT NULL,
	"redirect_url" text,
	"coupon_code" text,
	"image_url" text,
	"text_color" text,
	"button_color" text,
	"type" text NOT NULL,
	"priority" integer NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"content" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app_config" (
	"key" text PRIMARY KEY,
	"value" jsonb NOT NULL,
	"value_type" text DEFAULT 'string' NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_store" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"namespace" text NOT NULL,
	"key" text,
	"value" jsonb NOT NULL,
	"status" "store_entry_status" DEFAULT 'PENDIENTE'::"store_entry_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"template_id" uuid,
	"subject_override" text,
	"body_override" text,
	"category" text DEFAULT 'announcements' NOT NULL,
	"segment_ids" uuid[] DEFAULT '{}'::uuid[],
	"include_user_ids" uuid[] DEFAULT '{}'::uuid[],
	"exclude_user_ids" uuid[] DEFAULT '{}'::uuid[],
	"status" "campaign_status" DEFAULT 'draft'::"campaign_status" NOT NULL,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"total_recipients" integer DEFAULT 0,
	"total_sent" integer DEFAULT 0,
	"total_delivered" integer DEFAULT 0,
	"total_opened" integer DEFAULT 0,
	"total_clicked" integer DEFAULT 0,
	"total_bounced" integer DEFAULT 0,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"type" "email_component_type" NOT NULL,
	"html_content" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"type" "email_send_type" DEFAULT 'campaign'::"email_send_type" NOT NULL,
	"source_type" text,
	"source_id" uuid,
	"template_id" uuid NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"variables_used" jsonb,
	"status" "email_send_status" DEFAULT 'pending'::"email_send_status" NOT NULL,
	"resend_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"error_message" text,
	"error_code" text,
	"scheduled_at" timestamp with time zone,
	"queued_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"bounced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"header_id" uuid,
	"footer_id" uuid,
	"variables" jsonb DEFAULT '[]',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "marketing_preferences" (
	"user_id" uuid PRIMARY KEY,
	"is_subscribed" boolean DEFAULT true NOT NULL,
	"categories" text[] DEFAULT ARRAY['announcements']::text[] NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"source" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "segment_users" (
	"segment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"description" text,
	"type" "segment_type" DEFAULT 'dynamic'::"segment_type" NOT NULL,
	"filters" jsonb,
	"category" text DEFAULT 'announcements' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"estimated_count" integer DEFAULT 0,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "push_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"template_id" uuid,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb DEFAULT '{}' NOT NULL,
	"type" text DEFAULT 'announcement' NOT NULL,
	"segment_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"include_user_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"exclude_user_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"total_targeted" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb DEFAULT '{}' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "app_config_category_idx" ON "app_config" ("category");--> statement-breakpoint
CREATE INDEX "app_store_namespace_idx" ON "app_store" ("namespace");--> statement-breakpoint
CREATE INDEX "app_store_status_idx" ON "app_store" ("status");--> statement-breakpoint
CREATE INDEX "app_store_created_at_idx" ON "app_store" ("created_at");--> statement-breakpoint
CREATE INDEX "idx_campaigns_status" ON "campaigns" ("status");--> statement-breakpoint
CREATE INDEX "idx_campaigns_scheduled" ON "campaigns" ("scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_email_components_type_active" ON "email_components" ("type","is_active");--> statement-breakpoint
CREATE INDEX "idx_email_sends_type_status" ON "email_sends" ("type","status");--> statement-breakpoint
CREATE INDEX "idx_email_sends_source" ON "email_sends" ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "idx_email_sends_template" ON "email_sends" ("template_id");--> statement-breakpoint
CREATE INDEX "idx_email_sends_user" ON "email_sends" ("user_id");--> statement-breakpoint
CREATE INDEX "idx_email_sends_resend_id" ON "email_sends" ("resend_id");--> statement-breakpoint
CREATE INDEX "idx_email_sends_status" ON "email_sends" ("status");--> statement-breakpoint
CREATE INDEX "idx_email_sends_scheduled" ON "email_sends" ("scheduled_at") WHERE status in ('pending','queued');--> statement-breakpoint
CREATE INDEX "idx_email_sends_queued_at" ON "email_sends" ("queued_at");--> statement-breakpoint
CREATE INDEX "idx_segment_users_user" ON "segment_users" ("user_id");--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_owner_id_profiles_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "profiles"("id");--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_verified_by_profiles_id_fkey" FOREIGN KEY ("verified_by") REFERENCES "profiles"("id");--> statement-breakpoint
ALTER TABLE "business_locations" ADD CONSTRAINT "business_locations_business_id_businesses_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id");--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_business_id_businesses_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id");--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_business_location_id_business_locations_id_fkey" FOREIGN KEY ("business_location_id") REFERENCES "business_locations"("id");--> statement-breakpoint
ALTER TABLE "offer_categories" ADD CONSTRAINT "offer_categories_offer_id_offers_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "offer_categories" ADD CONSTRAINT "offer_categories_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id");--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_changed_by_profiles_id_fkey" FOREIGN KEY ("changed_by") REFERENCES "profiles"("id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_offer_id_offers_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_business_id_businesses_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id");--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_business_id_businesses_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id");--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_business_id_businesses_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id");--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id");--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_business_id_businesses_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id");--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id");--> statement-breakpoint
ALTER TABLE "consumer_notification_preferences" ADD CONSTRAINT "consumer_notification_preferences_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id");--> statement-breakpoint
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id");--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id");--> statement-breakpoint
ALTER TABLE "business_notification_preferences" ADD CONSTRAINT "business_notification_preferences_fduUBLG2CkL5_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id");--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id");--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id");--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_offer_id_offers_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id");--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_template_id_email_templates_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "email_sends" ADD CONSTRAINT "email_sends_template_id_email_templates_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_header_id_email_components_id_fkey" FOREIGN KEY ("header_id") REFERENCES "email_components"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_footer_id_email_components_id_fkey" FOREIGN KEY ("footer_id") REFERENCES "email_components"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "marketing_preferences" ADD CONSTRAINT "marketing_preferences_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "segment_users" ADD CONSTRAINT "segment_users_segment_id_segments_id_fkey" FOREIGN KEY ("segment_id") REFERENCES "segments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "segment_users" ADD CONSTRAINT "segment_users_user_id_profiles_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE;