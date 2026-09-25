import {
	FileText,
	Link2,
	ListChecks,
	type LucideIcon,
	SquarePlay,
	Text,
} from "lucide-react";
import type { LessonType } from "../domain/content.rules";

export const LESSON_TYPE_ICONS: Record<LessonType, LucideIcon> = {
	VIDEO: SquarePlay,
	TEXT: Text,
	FILE: FileText,
	LINK: Link2,
	QUIZ: ListChecks,
};

export function LessonTypeIcon({
	type,
	className,
}: {
	type: LessonType;
	className?: string;
}) {
	const Icon = LESSON_TYPE_ICONS[type];
	return <Icon className={className} aria-hidden="true" />;
}
