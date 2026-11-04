CREATE TABLE `worksheetLevels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`worksheetId` int NOT NULL,
	`level` enum('매우 쉬움','쉬움','보통','어려움','매우 어려움') NOT NULL,
	`title` varchar(255) NOT NULL,
	`learningGoal` text NOT NULL,
	`content` text NOT NULL,
	`answerGuide` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `worksheetLevels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `worksheets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`originalName` varchar(255) NOT NULL,
	`originalMime` varchar(120) NOT NULL,
	`originalFileKey` varchar(512),
	`sourceText` text,
	`subject` varchar(100),
	`gradeBand` varchar(100),
	`status` enum('ready','failed') NOT NULL DEFAULT 'ready',
	`analysis` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `worksheets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `worksheetLevels` ADD CONSTRAINT `worksheetLevels_worksheetId_worksheets_id_fk` FOREIGN KEY (`worksheetId`) REFERENCES `worksheets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `worksheets` ADD CONSTRAINT `worksheets_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `worksheet_levels_worksheet_idx` ON `worksheetLevels` (`worksheetId`);--> statement-breakpoint
CREATE INDEX `worksheets_user_created_idx` ON `worksheets` (`userId`,`createdAt`);