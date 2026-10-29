CREATE TABLE `dash_snap_gl_monthly` (
	`period_id` bigint NOT NULL,
	`coa_id` bigint NOT NULL,
	`segment_id` bigint NOT NULL DEFAULT '0',
	`debet` decimal(22,2) NOT NULL DEFAULT '0.00',
	`credit` decimal(22,2) NOT NULL DEFAULT '0.00',
	CONSTRAINT `dash_snap_gl_monthly_period_id_coa_id_segment_id_pk` PRIMARY KEY(`period_id`,`coa_id`,`segment_id`)
);
--> statement-breakpoint
CREATE TABLE `dash_snap_gl_periods` (
	`period_id` bigint NOT NULL,
	`built_at` datetime,
	`row_count` int DEFAULT 0,
	`duration_ms` int DEFAULT 0,
	CONSTRAINT `dash_snap_gl_periods_period_id` PRIMARY KEY(`period_id`)
);
