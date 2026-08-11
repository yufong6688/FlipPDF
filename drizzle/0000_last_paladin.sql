CREATE TABLE `pdf_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`object_key` text NOT NULL,
	`size` integer NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pdf_documents_object_key_unique` ON `pdf_documents` (`object_key`);--> statement-breakpoint
CREATE TABLE `pdf_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`document_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`document_id`) REFERENCES `pdf_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pdf_shares_token_hash_unique` ON `pdf_shares` (`token_hash`);