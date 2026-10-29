CREATE TABLE `dash_snap_ap_ar_open` (
	`card_id` bigint NOT NULL,
	`module_type` tinyint NOT NULL,
	`party_id` bigint,
	`location_id` bigint,
	`coa_id` bigint,
	`tx_date` date NOT NULL,
	`due_date` date,
	`item_type` int NOT NULL DEFAULT 0,
	`invoice_number` varchar(120) NOT NULL DEFAULT '',
	`original_amount` decimal(22,2) NOT NULL DEFAULT '0.00',
	`balance` decimal(22,2) NOT NULL DEFAULT '0.00',
	CONSTRAINT `dash_snap_ap_ar_open_card_id` PRIMARY KEY(`card_id`)
);
--> statement-breakpoint
CREATE TABLE `dash_snap_ap_ar_unallocated` (
	`card_id` bigint NOT NULL,
	`module_type` tinyint NOT NULL,
	`party_id` bigint,
	`location_id` bigint,
	`coa_id` bigint,
	`tx_date` date NOT NULL,
	`balance` decimal(22,2) NOT NULL DEFAULT '0.00',
	CONSTRAINT `dash_snap_ap_ar_unallocated_card_id` PRIMARY KEY(`card_id`)
);
--> statement-breakpoint
CREATE TABLE `dash_snap_meta` (
	`name` varchar(64) NOT NULL,
	`refreshed_at` datetime,
	`as_of_date` date,
	`row_count` int DEFAULT 0,
	`duration_ms` int DEFAULT 0,
	`status` varchar(16) NOT NULL DEFAULT 'ok',
	`error` text,
	CONSTRAINT `dash_snap_meta_name` PRIMARY KEY(`name`)
);
--> statement-breakpoint
CREATE INDEX `idx_dash_open_mod_loc_due` ON `dash_snap_ap_ar_open` (`module_type`,`location_id`,`due_date`);--> statement-breakpoint
CREATE INDEX `idx_dash_open_mod_party` ON `dash_snap_ap_ar_open` (`module_type`,`party_id`);--> statement-breakpoint
CREATE INDEX `idx_dash_unalloc_mod_loc` ON `dash_snap_ap_ar_unallocated` (`module_type`,`location_id`);