import { useEffect, useState } from "react";
import { useFormState } from "react-hook-form";
import { scrollIntoView } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { CourseFormValues } from "../utils/build-course-form-defaults";
import {
	COURSE_FORM_SECTIONS,
	type CourseFormSectionKey,
	sectionIdOf,
	sectionsWithErrors,
} from "../utils/course-form-sections";

/**
 * La sección que ocupa la franja superior de la pantalla. La franja empieza
 * debajo del encabezado fijo y deja fuera la mitad inferior: así la sección
 * activa es la que se está leyendo, no la que apenas asoma.
 */
function useActiveSection(): CourseFormSectionKey {
	const [active, setActive] = useState<CourseFormSectionKey>("general");

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries.find((entry) => entry.isIntersecting);
				const key = visible?.target.getAttribute("data-section");
				if (key) setActive(key as CourseFormSectionKey);
			},
			{ rootMargin: "-120px 0px -55% 0px" },
		);

		for (const { key } of COURSE_FORM_SECTIONS) {
			const element = document.getElementById(sectionIdOf(key));
			if (!element) continue;
			element.setAttribute("data-section", key);
			observer.observe(element);
		}

		return () => observer.disconnect();
	}, []);

	return active;
}

/** Índice del formulario: salta a cada sección y señala dónde hay errores. */
export function CourseFormNav() {
	const { errors } = useFormState<CourseFormValues>();
	const flagged = sectionsWithErrors(Object.keys(errors));
	const active = useActiveSection();

	const jumpTo = (event: React.MouseEvent, key: CourseFormSectionKey) => {
		const section = document.getElementById(sectionIdOf(key));
		if (!section) return;

		event.preventDefault();
		scrollIntoView(section, { block: "start" });
		section.focus({ preventScroll: true });
	};

	return (
		<nav
			aria-label="Secciones del curso"
			className="sticky top-24 hidden lg:block"
		>
			<ol className="flex flex-col gap-1">
				{COURSE_FORM_SECTIONS.map(({ key, title }) => (
					<li key={key}>
						<a
							href={`#${sectionIdOf(key)}`}
							onClick={(event) => jumpTo(event, key)}
							aria-current={active === key ? "location" : undefined}
							className={cn(
								"flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-muted-foreground text-sm transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
								active === key && "bg-muted font-medium text-foreground",
							)}
						>
							{title}
							{flagged.has(key) && (
								<>
									<span
										className="size-2 shrink-0 rounded-full bg-destructive"
										aria-hidden="true"
									/>
									<span className="sr-only">(con errores)</span>
								</>
							)}
						</a>
					</li>
				))}
			</ol>
		</nav>
	);
}
