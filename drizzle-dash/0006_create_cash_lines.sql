CREATE TABLE `dash_snap_cash_lines` (
	`period_id` bigint NOT NULL,
	`gl_id` bigint NOT NULL,
	`journal_type` int NOT NULL DEFAULT 0,
	`coa_id` bigint NOT NULL,
	`segment_id` bigint,
	`is_cash` tinyint NOT NULL DEFAULT 0,
	`debet` decimal(22,2) NOT NULL DEFAULT '0.00',
	`credit` decimal(22,2) NOT NULL DEFAULT '0.00'
);
--> statement-breakpoint
CREATE TABLE `dash_snap_cash_periods` (
	`period_id` bigint NOT NULL,
	`built_at` datetime,
	`row_count` int DEFAULT 0,
	`duration_ms` int DEFAULT 0,
	`period_key` varchar(100),
	`stats_key` varchar(100),
	`checked_at` datetime,
	`cash_hash` varchar(32),
	CONSTRAINT `dash_snap_cash_periods_period_id` PRIMARY KEY(`period_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_dash_cash_key` ON `dash_snap_cash_lines` (`period_id`,`is_cash`,`segment_id`,`gl_id`);--> statement-breakpoint
CREATE INDEX `idx_dash_cash_period_gl` ON `dash_snap_cash_lines` (`period_id`,`gl_id`);