CREATE TABLE `dash_snap_ap_ar_hist_dates` (
	`as_of_date` date NOT NULL,
	`built_at` datetime,
	`row_count` int DEFAULT 0,
	`duration_ms` int DEFAULT 0,
	`is_final` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `dash_snap_ap_ar_hist_dates_as_of_date` PRIMARY KEY(`as_of_date`)
);
--> statement-breakpoint
CREATE TABLE `dash_snap_ap_ar_hist_open` (
	`as_of_date` date NOT NULL,
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
	CONSTRAINT `dash_snap_ap_ar_hist_open_as_of_date_card_id_pk` PRIMARY KEY(`as_of_date`,`card_id`)
);
--> statement-breakpoint
CREATE TABLE `dash_snap_ap_ar_hist_unallocated` (
	`as_of_date` date NOT NULL,
	`card_id` bigint NOT NULL,
	`module_type` tinyint NOT NULL,
	`party_id` bigint,
	`location_id` bigint,
	`coa_id` bigint,
	`tx_date` date NOT NULL,
	`balance` decimal(22,2) NOT NULL DEFAULT '0.00',
	CONSTRAINT `dash_snap_ap_ar_hist_unallocated_as_of_date_card_id_pk` PRIMARY KEY(`as_of_date`,`card_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_dash_hist_open_date_mod` ON `dash_snap_ap_ar_hist_open` (`as_of_date`,`module_type`);--> statement-breakpoint
CREATE INDEX `idx_dash_hist_unalloc_date_mod` ON `dash_snap_ap_ar_hist_unallocated` (`as_of_date`,`module_type`);