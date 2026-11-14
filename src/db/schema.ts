import { pgTable, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(), // maps to Firebase auth uid
  email: text('email'),
  displayName: text('display_name'),
  photoUrl: text('photo_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const citizenReports = pgTable('citizen_reports', {
  id: text('id').primaryKey(),
  trackingId: text('tracking_id').notNull(),
  userId: text('user_id').references(() => users.id),
  category: text('category').notNull(),
  department: text('department').notNull(),
  severity: text('severity').notNull(),
  status: text('status').notNull().default('Dispatched'),
  latitude: text('latitude'),
  longitude: text('longitude'),
  address: text('address'),
  description: text('description').notNull(),
  imageUrl: text('image_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const trafficIncidents = pgTable('traffic_incidents', {
  id: text('id').primaryKey(),
  intersectionId: text('intersection_id').notNull(),
  intersectionName: text('intersection_name').notNull(),
  status: text('status').notNull(),
  vehicleCount: integer('vehicle_count').default(0),
  ambulanceDetected: boolean('ambulance_detected').default(false),
  reportedBy: text('reported_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
