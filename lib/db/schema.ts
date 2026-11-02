import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
}, (table) => [uniqueIndex('user_email_unique').on(table.email)])

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, (table) => [uniqueIndex('session_token_unique').on(table.token), index('session_user_idx').on(table.userId)])

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
}, (table) => [index('account_user_idx').on(table.userId)])

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
}, (table) => [index('verification_identifier_idx').on(table.identifier)])

export const suppliers = pgTable('suppliers', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  platform: text('platform').notNull().default(''),
  storeUrl: text('storeUrl'),
  status: text('status').notNull().default('active'),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
}, (table) => [index('suppliers_user_name_idx').on(table.userId, table.name)])

export const products = pgTable('products', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  supplierId: text('supplierId').references(() => suppliers.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  category: text('category').notNull().default(''),
  source: text('source').notNull().default(''),
  sourceUrl: text('sourceUrl'),
  purchasePriceCny: numeric('purchasePriceCny', { precision: 12, scale: 2 }).notNull().default('0'),
  purchasePriceRub: numeric('purchasePriceRub', { precision: 12, scale: 2 }).notNull().default('0'),
  salePriceRub: numeric('salePriceRub', { precision: 12, scale: 2 }).notNull().default('0'),
  sizes: jsonb('sizes').$type<string[]>().notNull().default([]),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('draft'),
  listingStatus: text('listingStatus').notNull().default('unpublished'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
}, (table) => [index('products_user_created_idx').on(table.userId, table.createdAt)])

export const productSearches = pgTable('product_searches', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  query: text('query').notNull(),
  category: text('category').notNull().default(''),
  style: text('style').notNull().default(''),
  minPriceCny: numeric('minPriceCny', { precision: 12, scale: 2 }),
  maxPriceCny: numeric('maxPriceCny', { precision: 12, scale: 2 }),
  sizes: jsonb('sizes').$type<string[]>().notNull().default([]),
  colorMaterial: text('colorMaterial').notNull().default(''),
  sources: jsonb('sources').$type<string[]>().notNull().default([]),
  customSourceUrl: text('customSourceUrl').notNull().default(''),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
}, (table) => [index('product_searches_user_created_idx').on(table.userId, table.createdAt)])

export const agentTasks = pgTable('agent_tasks', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  prompt: text('prompt').notNull(),
  response: text('response').notNull().default(''),
  status: text('status').notNull().default('completed'),
  model: text('model').notNull(),
  inputTokens: integer('inputTokens'),
  outputTokens: integer('outputTokens'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
}, (table) => [index('agent_tasks_user_created_idx').on(table.userId, table.createdAt)])

export const orders = pgTable('orders', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  productId: text('productId').references(() => products.id, { onDelete: 'set null' }),
  customerName: text('customerName').notNull(),
  customerContact: text('customerContact').notNull(),
  productName: text('productName').notNull(),
  size: text('size').notNull().default(''),
  color: text('color').notNull().default(''),
  quantity: integer('quantity').notNull().default(1),
  status: text('status').notNull().default('Ожидает оплаты'),
  paymentStatus: text('paymentStatus').notNull().default('Ожидает оплаты'),
  procurementStatus: text('procurementStatus').notNull().default('Не заказан'),
  deliveryStatus: text('deliveryStatus').notNull().default('Не отправлен'),
  salePriceRub: numeric('salePriceRub', { precision: 12, scale: 2 }).notNull(),
  costRub: numeric('costRub', { precision: 12, scale: 2 }).notNull().default('0'),
  supplierName: text('supplierName').notNull().default(''),
  supplierProductUrl: text('supplierProductUrl'),
  threadUrl: text('threadUrl'),
  tracking: text('tracking'),
  expectedArrivalAt: timestamp('expectedArrivalAt'),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
}, (table) => [index('orders_user_created_idx').on(table.userId, table.createdAt)])

export const orderStatusHistory = pgTable('order_status_history', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  orderId: text('orderId').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  field: text('field').notNull(),
  previousValue: text('previousValue').notNull().default(''),
  newValue: text('newValue').notNull(),
  note: text('note').notNull().default(''),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
}, (table) => [index('order_status_history_user_order_created_idx').on(table.userId, table.orderId, table.createdAt)])

export const financialTransactions = pgTable('financial_transactions', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  amountRub: numeric('amountRub', { precision: 12, scale: 2 }).notNull(),
  notes: text('notes').notNull().default(''),
  occurredAt: timestamp('occurredAt').notNull().defaultNow(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
}, (table) => [index('financial_transactions_user_occurred_idx').on(table.userId, table.occurredAt)])
