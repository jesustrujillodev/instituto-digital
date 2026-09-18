import { Badge } from "@/shared/components/ui/badge";
import type { CourseAccessType } from "../domain/course.rules";
import type { CourseAudience as CourseAudienceValue } from "../domain/course.types";

interface CourseAudienceProps {
	access: CourseAccessType;
	audience: CourseAudienceValue;
}

/** Quién puede ver el curso, dicho en las palabras de cada tipo de acceso. */
export function CourseAudience({ access, audience }: CourseAudienceProps) {
	if (access === "PUBLIC") {
		return (
			<p className="text-sm">
				Cualquier persona interna puede verlo e inscribirse.
			</p>
		);
	}

	if (access === "INVITATION") {
		return (
			<p className="text-sm">
				Solo lo ven las personas invitadas. Las invitaciones se envían desde
				Inscripciones una vez publicado.
			</p>
		);
	}

	const { dependencies, groups } = audience;

	if (dependencies.length + groups.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				Restringido, pero todavía sin dependencias ni grupos: nadie podría
				verlo.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			{[
				{ label: "Dependencias completas", entries: dependencies },
				{ label: "Grupos", entries: groups },
			]
				.filter(({ entries }) => entries.length > 0)
				.map(({ label, entries }) => (
					<div key={label} className="flex flex-col gap-2">
						<h3 className="text-muted-foreground text-xs">{label}</h3>
						<ul className="flex flex-wrap gap-2">
							{entries.map((entry) => (
								<li key={entry.documentId}>
									<Badge variant="outline">{entry.name}</Badge>
								</li>
							))}
						</ul>
					</div>
				))}
		</div>
	);
}
