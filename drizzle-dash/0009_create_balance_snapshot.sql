CREATE TABLE `dash_snap_balance_monthly` (
	`period_id` bigint NOT NULL,
	`segment_id` bigint NOT NULL DEFAULT '0',
	`group_key` varchar(32) NOT NULL,
	`amount` decimal(22,2) NOT NULL DEFAULT '0.00',
	CONSTRAINT `dash_snap_balance_monthly_period_id_segment_id_group_key_pk` PRIMARY KEY(`period_id`,`segment_id`,`group_key`)
);
--> statement-breakpoint
CREATE TABLE `dash_snap_balance_periods` (
	`period_id` bigint NOT NULL,
	`built_at` datetime,
	`row_count` int DEFAULT 0,
	`duration_ms` int DEFAULT 0,
	`period_key` varchar(100),
	`stats_key` varchar(100),
	`checked_at` datetime,
	CONSTRAINT `dash_snap_balance_periods_period_id` PRIMARY KEY(`period_id`)
);
