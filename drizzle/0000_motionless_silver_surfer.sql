CREATE TABLE `cloud_entities` (
	`kind` text NOT NULL,
	`id` text NOT NULL,
	`payload` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`kind`, `id`)
);
--> statement-breakpoint
CREATE INDEX `cloud_entities_kind_updated` ON `cloud_entities` (`kind`,`updated_at`);--> statement-breakpoint
CREATE TABLE `cloud_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`storage_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`byte_length` integer NOT NULL,
	`file_name` text NOT NULL,
	`created_at` text NOT NULL
);
