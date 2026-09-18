export { action } from "./index.action";
export { loader } from "./index.loader";

import { Send, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";
import { CourseStatusBadge } from "@/modules/courses/components/course-badges";
import { PageHeader } from "@/shared/components/common/page-header";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Label } from "@/shared/components/ui/label";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { BreadcrumbHandle } from "@/shared/layout/breadcrumb.types";
import {
	EnrollmentOriginBadge,
	EnrollmentStatusBadge,
	SeatsBadge,
} from "../../components/enrollment-badges";
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

export const handle = {
	breadcrumb: (loaderData) => [
		{ label: "Cursos", path: "/dashboard/cursos" },
		...(loaderData
			? [
					{
						label: loaderData.data.course.title,
						path: `/dashboard/cursos/${loaderData.data.course.documentId}`,
					},
				]
			: []),
		{ label: "Inscripciones" },
	],
} satisfies BreadcrumbHandle<Route.ComponentProps["loaderData"]>;

export function meta() {
	return [{ title: "Inscripciones" }];
}

export default function InscripcionesPage({
	loaderData,
}: Route.ComponentProps) {
	const {
		data: { course, entries, options, personSearch },
	} = loaderData;

	const peopleFetcher = useFetcher<EnrollmentActionData>();
	const groupFetcher = useFetcher<EnrollmentActionData>();
	useFetcherToast(peopleFetcher);
	useFetcherToast(groupFetcher);

	const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
	const enrolled = entries.filter((entry) => entry.status === "ENROLLED");

	const submitPeople = (intent: string, selected: readonly string[]) => {
		const body = new FormData();
		for (const documentId of selected) body.append(USERS_FIELD, documentId);
		body.append(INTENT_FIELD, intent);
		peopleFetcher.submit(body, { method: "post" });
	};

	const inviteGroups = () => {
		const body = new FormData();
		for (const documentId of selectedGroups) {
			body.append(GROUPS_FIELD, documentId);
		}
		body.append(INTENT_FIELD, ENROLLMENT_INTENTS.invite);
		groupFetcher.submit(body, { method: "post" });
		setSelectedGroups([]);
	};

	const toggleGroup = (documentId: string) =>
		setSelectedGroups((previous) =>
			previous.includes(documentId)
				? previous.filter((id) => id !== documentId)
				: [...previous, documentId],
		);

	return (
		<div className="flex flex-col gap-4">
			<PageHeader
				title={course.title}
				description={`Inscripciones · organiza ${course.dependencyName}.`}
				goBack={`/dashboard/cursos/${course.documentId}`}
			/>

			<div className="flex flex-wrap gap-2">
				<CourseStatusBadge status={course.status} />
				<SeatsBadge capacity={course.capacity} seatsLeft={course.seatsLeft} />
				<Badge variant="outline">{enrolled.length} inscritos</Badge>
			</div>

			{!course.isOpen && (
				<Alert>
					<AlertDescription>
						La inscripción está cerrada o el curso no está publicado: no se
						puede invitar ni asignar.
					</AlertDescription>
				</Alert>
			)}

			{options && (
				<div className="grid gap-4 lg:grid-cols-2">
					<Card>
						<CardContent className="flex flex-col gap-3">
							<div>
								<h3 className="font-medium text-sm">
									Invitar o asignar personas
								</h3>
								<p className="text-muted-foreground text-xs">
									Invitar no aparta lugar. Asignar inscribe de inmediato y solo
									admite personal de tu dependencia.
								</p>
							</div>
							<ParticipantPicker
								candidates={options.candidates}
								search={personSearch}
								showDependency
								resetKey={
									peopleFetcher.data?.success ? peopleFetcher.data : null
								}
								actions={(selected) => {
									const disabled =
										peopleFetcher.state !== "idle" || selected.length === 0;
									return (
										<div className="flex flex-wrap gap-2">
											<Button
												disabled={disabled}
												onClick={() =>
													submitPeople(ENROLLMENT_INTENTS.invite, selected)
												}
											>
												<Send className="h-4 w-4" />
												Invitar
											</Button>
											<Button
												variant="outline"
												disabled={disabled}
												onClick={() =>
													submitPeople(ENROLLMENT_INTENTS.assign, selected)
												}
											>
												<UserPlus className="h-4 w-4" />
												Asignar
											</Button>
										</div>
									);
								}}
							/>
						</CardContent>
					</Card>

					<Card>
						<CardContent className="flex flex-col gap-3">
							<div>
								<h3 className="font-medium text-sm">Invitar un grupo</h3>
								<p className="text-muted-foreground text-xs">
									Se invita a cada miembro; quien ya tiene invitación o
									inscripción se omite.
								</p>
							</div>
							{options.groups.length === 0 ? (
								<p className="text-muted-foreground text-sm">
									No hay grupos activos en tu alcance.
								</p>
							) : (
								<ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
									{options.groups.map((group) => (
										<li key={group.documentId}>
											<Label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent">
												<Checkbox
													checked={selectedGroups.includes(group.documentId)}
													onCheckedChange={() => toggleGroup(group.documentId)}
												/>
												<span className="min-w-0">
													<span className="block truncate text-sm">
														{group.name}
													</span>
													<span className="block truncate text-muted-foreground text-xs">
														{group.dependencyName} · {group.memberCount}{" "}
														miembros
													</span>
												</span>
											</Label>
										</li>
									))}
								</ul>
							)}
							<Button
								onClick={inviteGroups}
								disabled={
									groupFetcher.state !== "idle" || selectedGroups.length === 0
								}
							>
								<Users className="h-4 w-4" />
								Invitar grupo
							</Button>
						</CardContent>
					</Card>
				</div>
			)}

			<Card>
				<CardContent className="flex flex-col gap-3">
					<h3 className="font-medium text-sm">Personas</h3>
					{entries.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Nadie se ha inscrito ni ha sido invitado todavía.
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
											{entry.email} · {entry.dependencyName}
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
