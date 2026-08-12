import { boolean, pgTable, text, timestamp, uuid, integer } from 'drizzle-orm/pg-core';

export const slides = pgTable('slides', {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    caption: text('caption').notNull(),
    badge_text: text('badge_text'),
    cta_label: text('cta_label'),
    redirect_url: text('redirect_url'),
    image_url: text('image_url').notNull(),
    text_color: text('text_color'),
    button_color: text('button_color'),
    type: text('type').notNull(),
    priority: integer('priority').notNull(),
    start_at: timestamp('start_at', { withTimezone: true }),
    end_at: timestamp('end_at', { withTimezone: true }),
    active: boolean('active').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }),
    deleted_at: timestamp('deleted_at', { withTimezone: true }),
});
