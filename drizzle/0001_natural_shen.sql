CREATE TABLE `challengeAttempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`challengeId` varchar(80) NOT NULL,
	`score` int NOT NULL,
	`passed` boolean NOT NULL DEFAULT false,
	`summary` varchar(280) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `challengeAttempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `learnerAchievements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`achievementId` varchar(80) NOT NULL,
	`earnedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `learnerAchievements_id` PRIMARY KEY(`id`),
	CONSTRAINT `learnerAchievements_user_achievement_unique` UNIQUE(`userId`,`achievementId`)
);
--> statement-breakpoint
CREATE TABLE `learnerStats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`xp` int NOT NULL DEFAULT 0,
	`streak` int NOT NULL DEFAULT 0,
	`completedLessons` int NOT NULL DEFAULT 0,
	`lastActivityAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `learnerStats_id` PRIMARY KEY(`id`),
	CONSTRAINT `learnerStats_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `learningActivity` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` varchar(50) NOT NULL,
	`title` varchar(140) NOT NULL,
	`detail` varchar(280) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `learningActivity_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lessonProgress` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`lessonId` varchar(80) NOT NULL,
	`track` enum('HTML','CSS','JavaScript') NOT NULL,
	`difficulty` enum('Beginner','Intermediate','Advanced') NOT NULL,
	`status` enum('in_progress','completed') NOT NULL DEFAULT 'in_progress',
	`xpEarned` int NOT NULL DEFAULT 0,
	`score` int,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lessonProgress_id` PRIMARY KEY(`id`),
	CONSTRAINT `lessonProgress_user_lesson_unique` UNIQUE(`userId`,`lessonId`)
);
--> statement-breakpoint
CREATE INDEX `challengeAttempts_user_idx` ON `challengeAttempts` (`userId`);--> statement-breakpoint
CREATE INDEX `learningActivity_user_created_idx` ON `learningActivity` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `lessonProgress_user_status_idx` ON `lessonProgress` (`userId`,`status`);