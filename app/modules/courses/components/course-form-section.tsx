import { Card, CardContent } from "@/shared/components/ui/card";
import {
	COURSE_FORM_SECTIONS,
	type CourseFormSectionKey,
	sectionIdOf,
} from "../utils/course-form-sections";

interface CourseFormSectionProps {
	section: CourseFormSectionKey;
	description?: React.ReactNode;
	children: React.ReactNode;
}

/** Un bloque del formulario, con el ancla a la que salta el índice. */
export function CourseFormSection({
	section,
	description,
	children,
}: CourseFormSectionProps) {
	const id = sectionIdOf(section);
	const title = COURSE_FORM_SECTIONS.find(
		(entry) => entry.key === section,
	)?.title;

	return (
		<section
			id={id}
			aria-labelledby={`${id}-title`}
			tabIndex={-1}
			className="scroll-mt-28 outline-none"
		>
			<Card>
				<CardContent className="flex flex-col gap-6">
					<header className="flex flex-col gap-1">
						<h2 id={`${id}-title`} className="font-medium text-base">
							{title}
						</h2>
						{description && (
							<p className="max-w-prose text-muted-foreground text-sm">
								{description}
							</p>
						)}
					</header>
					{children}
				</CardContent>
			</Card>
		</section>
	);
}
