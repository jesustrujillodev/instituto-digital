import { ArrowRight, ExternalLink, MapPin, Users } from "lucide-react";
import { Link } from "react-router";
import { formatSessionRange } from "@/lib/date-utils";
import {
	CourseModalityBadge,
	CourseStatusBadge,
} from "@/modules/courses/components/course-badges";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/shared/components/ui/sheet";
import type { CalendarSession } from "../domain/calendar.types";
import { LENS_LABELS } from "../utils/calendar-labels";

export function CalendarSessionPanel({
	session,
	onClose,
}: {
	session: CalendarSession | null;
	onClose: () => void;
}) {
	return (
		<Sheet open={session !== null} onOpenChange={(open) => !open && onClose()}>
			<SheetContent className="w-full sm:max-w-md">
				{session && (
					<>
						<SheetHeader>
							<SheetTitle>{session.course.title}</SheetTitle>
							<SheetDescription>
								Organiza {session.course.dependency.name}
							</SheetDescription>
						</SheetHeader>

						<div className="flex flex-col gap-4 overflow-y-auto px-6">
							<p className="font-medium text-sm">
								{formatSessionRange(
									new Date(session.startsAt),
									new Date(session.endsAt),
								)}
							</p>

							<div className="flex flex-wrap gap-2">
								<CourseModalityBadge modality={session.course.modality} />
								{session.course.status !== "PUBLISHED" && (
									<CourseStatusBadge status={session.course.status} />
								)}
								{session.lenses.map((lens) => (
									<Badge key={lens} variant="secondary">
										{LENS_LABELS[lens]}
									</Badge>
								))}
							</div>

							{session.venue && (
								<p className="flex items-start gap-2 text-sm">
									<MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
									{session.venue}
								</p>
							)}
							{session.link && (
								<a
									href={session.link}
									target="_blank"
									rel="noreferrer"
									className="flex items-start gap-2 break-all text-primary text-sm underline-offset-2 hover:underline"
								>
									<ExternalLink className="mt-0.5 h-4 w-4 shrink-0" />
									{session.link}
								</a>
							)}
							{session.trainers.length > 0 && (
								<p className="flex items-start gap-2 text-sm">
									<Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
									{session.trainers.map((trainer) => trainer.name).join(", ")}
								</p>
							)}
						</div>

						{session.courseHref && (
							<SheetFooter>
								<Button asChild>
									<Link to={session.courseHref}>
										Ver curso
										<ArrowRight className="h-4 w-4" />
									</Link>
								</Button>
							</SheetFooter>
						)}
					</>
				)}
			</SheetContent>
		</Sheet>
	);
}
