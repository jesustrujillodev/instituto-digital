import { Outlet } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import { PageHeader } from "@/shared/components/common/page-header";
import { Card, CardContent } from "@/shared/components/ui/card";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { ClassroomOutline } from "../../../components/classroom-outline";
import { ProgressBar } from "../../../components/progress-bar";
import type { Route } from "./+types/index";

export { loader } from "./index.loader";

const MY_COURSES_PATH = "/dashboard/mis-cursos";

export const handle = {
	breadcrumb: (loaderData) => [
		{ label: "Mis cursos", path: MY_COURSES_PATH },
		{ label: loaderData?.data.course.title ?? "Curso" },
		{ label: "Aula" },
	],
} satisfies BreadcrumbHandle<Route.ComponentProps["loaderData"]>;

export function meta({ data }: Route.MetaArgs) {
	return [{ title: data ? `Aula · ${data.data.course.title}` : "Aula" }];
}

/** Lo que el curso le dice a quien lo recorre sobre qué cuenta y cuándo. */
function progressNote({
	countsContent,
	readOnly,
	contentCompletedAt,
	completed,
}: {
	countsContent: boolean;
	readOnly: boolean;
	contentCompletedAt: Date | string | null;
	completed: boolean;
}): string {
	if (!countsContent) {
		return "Material de apoyo: recorrerlo no cuenta para completar el curso.";
	}
	if (completed) return "Completaste el curso.";
	if (contentCompletedAt) {
		return `Terminaste el contenido el ${formatZonedDate(new Date(contentCompletedAt))}.`;
	}
	if (readOnly) return "El curso terminó: puedes repasar sus lecciones.";

	return "Completa las lecciones obligatorias para terminar el curso.";
}

export default function AulaLayout({ loaderData }: Route.ComponentProps) {
	const {
		data: { course, modules, percent, contentCompletedAt, completed },
	} = loaderData;

	return (
		<div className="flex flex-col">
			<PageHeader
				title={course.title}
				description={progressNote({
					countsContent: course.countsContent,
					readOnly: course.readOnly,
					contentCompletedAt,
					completed,
				})}
				goBack={MY_COURSES_PATH}
			/>

			<div className="grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
				<Card className="order-2 lg:sticky lg:top-4 lg:order-1">
					<CardContent className="flex flex-col gap-5">
						<div className="flex flex-col gap-2">
							<div className="flex items-baseline justify-between text-sm">
								<span className="font-medium">Tu avance</span>
								<span className="text-muted-foreground tabular-nums">
									{percent} %
								</span>
							</div>
							<ProgressBar value={percent} label="Avance del curso" />
						</div>

						<ClassroomOutline
							courseDocumentId={course.documentId}
							modules={modules}
						/>
					</CardContent>
				</Card>

				<div className="order-1 min-w-0 lg:order-2">
					<Outlet />
				</div>
			</div>
		</div>
	);
}
