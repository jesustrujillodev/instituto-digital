import type {
	CourseFormat,
	CourseModality,
} from "@/modules/courses/domain/course.rules";
import type { MyCourseEntry, MyCourses } from "../domain/enrollment.types";

/** En el orden en que se leen en la página. */
export const MY_COURSE_SECTIONS = [
	"invitations",
	"inProgress",
	"upcoming",
	"finished",
	"withdrawn",
] as const satisfies readonly (keyof MyCourses)[];
export type MyCourseSection = (typeof MY_COURSE_SECTIONS)[number];

/** Las canceladas no se enseñan de entrada: se piden desde el filtro. */
const DEFAULT_SECTIONS: readonly MyCourseSection[] = MY_COURSE_SECTIONS.filter(
	(section) => section !== "withdrawn",
);

export const SECTION_TITLES: Record<MyCourseSection, string> = {
	invitations: "Te invitaron",
	inProgress: "En curso",
	upcoming: "Próximos",
	finished: "Finalizados",
	withdrawn: "Inscripciones canceladas",
};

export const SECTION_FILTER_LABELS: Record<MyCourseSection, string> = {
	...SECTION_TITLES,
	invitations: "Invitaciones",
};

export interface MyCoursesFilter {
	query: string;
	sections: MyCourseSection[];
	modalities: CourseModality[];
	formats: CourseFormat[];
	dependencies: string[];
}

export const EMPTY_FILTER: MyCoursesFilter = {
	query: "",
	sections: [],
	modalities: [],
	formats: [],
	dependencies: [],
};

const normalize = (value: string) =>
	value
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.trim();

const allows = <T>(selected: readonly T[], value: T) =>
	selected.length === 0 || selected.includes(value);

/** Busca en el título y en la dependencia, sin distinguir acentos. */
export const matchesFilter = (
	{ course }: MyCourseEntry,
	filter: MyCoursesFilter,
): boolean => {
	const query = normalize(filter.query);

	return (
		(query === "" ||
			normalize(course.title).includes(query) ||
			normalize(course.dependencyName).includes(query)) &&
		allows(filter.modalities, course.modality) &&
		allows(filter.formats, course.format) &&
		allows(filter.dependencies, course.dependencyName)
	);
};

export const visibleSectionsOf = (
	filter: MyCoursesFilter,
): readonly MyCourseSection[] =>
	filter.sections.length === 0
		? DEFAULT_SECTIONS
		: MY_COURSE_SECTIONS.filter((section) => filter.sections.includes(section));

/** Lo que el botón «Filtrar» cuenta como elegido; la búsqueda va aparte. */
export const activeFilterCount = (filter: MyCoursesFilter): number =>
	filter.sections.length +
	filter.modalities.length +
	filter.formats.length +
	filter.dependencies.length;

export const dependencyOptionsOf = (mine: MyCourses): string[] =>
	[
		...new Set(
			MY_COURSE_SECTIONS.flatMap((section) =>
				mine[section].map((entry) => entry.course.dependencyName),
			),
		),
	].sort((a, b) => a.localeCompare(b, "es"));

const plural = (count: number, one: string, many: string) =>
	`${count} ${count === 1 ? one : many}`;

/** «1 invitación · 2 en curso · 1 próximo»: solo lo que hay. */
export const summaryOf = (mine: MyCourses): string =>
	[
		mine.invitations.length > 0 &&
			plural(mine.invitations.length, "invitación", "invitaciones"),
		mine.inProgress.length > 0 && `${mine.inProgress.length} en curso`,
		mine.upcoming.length > 0 &&
			plural(mine.upcoming.length, "próximo", "próximos"),
		mine.finished.length > 0 &&
			plural(mine.finished.length, "finalizado", "finalizados"),
	]
		.filter(Boolean)
		.join(" · ");
