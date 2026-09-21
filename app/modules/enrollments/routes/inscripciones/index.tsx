export { action } from "./index.action";
export { loader } from "./index.loader";

import { useFetcher } from "react-router";
import {
	CourseAccessBadge,
	CourseStatusBadge,
} from "@/modules/courses/components/course-badges";
import { PageHeader } from "@/shared/components/common/page-header";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent } from "@/shared/components/ui/card";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/shared/components/ui/tabs";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import { BatchActions } from "../../components/batch-actions";
import {
	EnrollmentOriginBadge,
	EnrollmentStatusBadge,
	SeatsBadge,
} from "../../components/enrollment-badges";
import { GroupPicker } from "../../components/group-picker";
import { ParticipantPicker } from "../../components/participant-picker";
import { personNameOf } from "../../utils/enrollment-labels";
import {
	ENROLLMENT_INTENTS,
	type EnrollmentActionData,
	GROUPS_FIELD,
	INTENT_FIELD,
	USERS_FIELD,
} from "../../utils/parse-enrollment-form-data";
import type { Route } from "./+types/index";

const AVAILABLE_PATH = "/dashboard/cursos-disponibles";

export const handle = {
	breadcrumb: (loaderData) => {
		const data = loaderData?.data;
		if (!data) return [{ label: "Inscripciones" }];

		// Quien no organiza el curso llegó desde el catálogo y no puede abrir su
		// ficha de administración: sus migas vuelven por donde vino.
		return data.reach.organizer
			? [
					{ label: "Cursos", path: "/dashboard/cursos" },
					{
						label: data.course.title,
						path: `/dashboard/cursos/${data.course.documentId}`,
					},
					{ label: "Inscripciones" },
				]
			: [
					{ label: "Cursos disponibles", path: AVAILABLE_PATH },
					{
						label: data.course.title,
						path: `${AVAILABLE_PATH}/${data.course.documentId}`,
					},
					{ label: "Inscribir personal" },
				];
	},
} satisfies BreadcrumbHandle<Route.ComponentProps["loaderData"]>;

export function meta() {
	return [{ title: "Inscripciones" }];
}

export default function InscripcionesPage({
	loaderData,
}: Route.ComponentProps) {
	const {
		data: { course, entries, options, personSearch, reach },
	} = loaderData;

	const fetcher = useFetcher<EnrollmentActionData>();
	useFetcherToast(fetcher);
	const busy = fetcher.state !== "idle";
	const resetKey = fetcher.data?.success ? fetcher.data : null;

	const enrolled = entries.filter((entry) => entry.status === "ENROLLED");
	const showDependency = reach.organizer;

	const submit = (
		intent: string,
		field: typeof USERS_FIELD | typeof GROUPS_FIELD,
		documentIds: readonly string[],
	) => {
		const body = new FormData();
		for (const documentId of documentIds) body.append(field, documentId);
		body.append(INTENT_FIELD, intent);
		fetcher.submit(body, { method: "post" });
	};

	return (
		<div className="flex flex-col gap-4">
			<PageHeader
				title={course.title}
				description={
					reach.organizer
						? `Inscripciones · organiza ${course.dependencyName}.`
						: `Inscribe a personal de tu dependencia · organiza ${course.dependencyName}.`
				}
				goBack={
					reach.organizer
						? `/dashboard/cursos/${course.documentId}`
						: `${AVAILABLE_PATH}/${course.documentId}`
				}
			/>

			<div className="flex flex-wrap gap-2">
				{reach.organizer && <CourseStatusBadge status={course.status} />}
				<CourseAccessBadge access={course.access} />
				<SeatsBadge capacity={course.capacity} seatsLeft={course.seatsLeft} />
				<Badge variant="outline">
					{reach.organizer
						? `${enrolled.length} inscritos`
						: `${enrolled.length} de tu dependencia`}
				</Badge>
			</div>

			{!course.isOpen && (
				<Alert>
					<AlertDescription>
						La inscripción está cerrada o el curso no está publicado: ya no se
						puede inscribir ni invitar.
					</AlertDescription>
				</Alert>
			)}

			{options && (
				<Card>
					<CardContent className="flex flex-col gap-4">
						<div>
							<h3 className="font-medium text-sm">
								{reach.canInvite ? "Inscribir o invitar" : "Inscribir"}
							</h3>
							<p className="text-muted-foreground text-xs">
								{reach.canInvite
									? "Inscribir aparta el lugar de inmediato. Invitar deja que cada persona acepte o rechace."
									: "Inscribir aparta el lugar de inmediato y avisa por correo a cada persona."}
							</p>
						</div>

						<Tabs defaultValue="people">
							<TabsList>
								<TabsTrigger value="people">Personas</TabsTrigger>
								<TabsTrigger value="groups">Grupos</TabsTrigger>
							</TabsList>

							<TabsContent value="people" className="pt-2">
								<ParticipantPicker
									candidates={options.candidates}
									search={personSearch}
									showDependency={showDependency}
									resetKey={resetKey}
									actions={(selected) => {
										const ids = selected.map((person) => person.documentId);
										return (
											<BatchActions
												selected={selected.length}
												seatsNeeded={selected.length}
												seatsLeft={course.seatsLeft}
												inviteOnly={
													selected.filter((person) => !person.assignable).length
												}
												canInvite={reach.canInvite}
												busy={busy}
												onAssign={() =>
													submit(ENROLLMENT_INTENTS.assign, USERS_FIELD, ids)
												}
												onInvite={() =>
													submit(ENROLLMENT_INTENTS.invite, USERS_FIELD, ids)
												}
											/>
										);
									}}
								/>
							</TabsContent>

							<TabsContent value="groups" className="pt-2">
								<GroupPicker
									groups={options.groups}
									showDependency={showDependency}
									resetKey={resetKey}
									actions={(selected) => {
										const ids = selected.map((group) => group.documentId);
										const members = new Set(
											selected.flatMap((group) => group.enrollableMemberIds),
										);
										return (
											<BatchActions
												selected={selected.length}
												seatsNeeded={members.size}
												seatsLeft={course.seatsLeft}
												inviteOnly={0}
												canInvite={reach.canInvite}
												busy={busy}
												onAssign={() =>
													submit(ENROLLMENT_INTENTS.assign, GROUPS_FIELD, ids)
												}
												onInvite={() =>
													submit(ENROLLMENT_INTENTS.invite, GROUPS_FIELD, ids)
												}
											/>
										);
									}}
								/>
							</TabsContent>
						</Tabs>
					</CardContent>
				</Card>
			)}

			<Card>
				<CardContent className="flex flex-col gap-3">
					<h3 className="font-medium text-sm">
						{reach.organizer
							? "Personas en el curso"
							: "Tu personal en el curso"}
					</h3>
					{entries.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							{reach.organizer
								? "Nadie se ha inscrito ni ha sido invitado todavía."
								: "Nadie de tu dependencia está en este curso todavía."}
						</p>
					) : (
						<ul className="flex flex-col divide-y divide-border">
							{entries.map((entry) => (
								<li
									key={entry.documentId}
									className="flex flex-wrap items-center justify-between gap-2 py-2"
								>
									<div className="min-w-0">
										<p className="truncate font-medium text-sm">
											{personNameOf(entry)}
										</p>
										<p className="truncate text-muted-foreground text-xs">
											{showDependency
												? `${entry.email} · ${entry.dependencyName}`
												: entry.email}
										</p>
									</div>
									<div className="flex flex-wrap gap-2">
										<EnrollmentStatusBadge status={entry.status} />
										<EnrollmentOriginBadge origin={entry.origin} />
									</div>
								</li>
							))}
						</ul>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
