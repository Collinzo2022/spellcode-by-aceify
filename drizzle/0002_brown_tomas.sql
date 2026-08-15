CREATE TABLE `trackEnrollments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`trackId` varchar(40) NOT NULL,
	`enrolledAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trackEnrollments_id` PRIMARY KEY(`id`),
	CONSTRAINT `trackEnrollments_user_track_unique` UNIQUE(`userId`,`trackId`)
);
