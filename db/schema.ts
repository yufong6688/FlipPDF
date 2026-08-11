import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const pdfDocuments = sqliteTable("pdf_documents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  objectKey: text("object_key").notNull().unique(),
  size: integer("size").notNull(),
  ownerId: text("owner_id").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const pdfShares = sqliteTable("pdf_shares", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  documentId: text("document_id").notNull().references(() => pdfDocuments.id, { onDelete: "cascade" }),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at"),
  revokedAt: integer("revoked_at"),
});
