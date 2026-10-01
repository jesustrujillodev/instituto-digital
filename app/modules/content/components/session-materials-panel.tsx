import { Clock, Paperclip } from "lucide-react";
import { useState } from "react";
import { formatSessionRange } from "@/lib/date-utils";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useSessionMaterials } from "../hooks/use-session-materials";
import {
	SESSION_MATERIAL_ICONS,
	SessionMaterialSheet,
} from "./session-material-sheet";

/**
 * El material de todas las sesiones, para quien imparte: una fila por sesión
 * con lo que ya tiene y la hoja para cambiarlo.
 */
export function SessionMaterialsPanel({
	courseDocumentId,
}: {
	courseDocumentId: string;
}) {
	const state = useSessionMaterials(courseDocumentId);
	const [open, setOpen] = useState<{
		documentId: string;
		number: number;
		startsAt: Date;
		endsAt: Date;
	} | null>(null);
	const sessions = state.board?.sessions ?? [];

	return (
		<Card>
			<CardContent className="flex flex-col gap-3">
				<div className="flex flex-col gap-1">
					<h3 className="font-medium text-sm">Material de las sesiones</h3>
					<p className="text-muted-foreground text-sm">
						Presentaciones, lecturas o grabaciones que el participante ve bajo
						cada sesión. No cuentan para completar la capacitación.
					</p>
				</div>

				{state.board === null ? (
					<div aria-busy="true">
						<span className="sr-only">
							Cargando el material de las sesiones…
						</span>
						<ol className="flex flex-col divide-y divide-border">
							{["first", "second"].map((key) => (
								<li key={key} className="flex flex-col gap-2 py-3">
									<Skeleton className="h-4 w-56 rounded-md" />
									<Skeleton className="h-3 w-24 rounded-md" />
								</li>
							))}
						</ol>
					</div>
				) : (
					<ol className="flex flex-col divide-y divide-border">
						{sessions.map((session, index) => (
							<li
								key={session.documentId}
								className="flex flex-wrap items-start justify-between gap-3 py-3"
							>
								<div className="flex min-w-0 flex-col gap-1.5">
									<p className="font-medium text-sm">
										Sesión {index + 1}
										<span className="font-normal text-muted-foreground">
											{" · "}
											{formatSessionRange(
												new Date(session.startsAt),
												new Date(session.endsAt),
											)}
										</span>
									</p>
									{session.materials.length === 0 ? (
										<p className="text-muted-foreground text-xs">
											Sin material.
										</p>
									) : (
										<ul className="flex flex-col gap-1">
											{session.materials.map((material) => {
												const Icon = SESSION_MATERIAL_ICONS[material.type];

												return (
													<li
														key={material.documentId}
														className="flex items-center gap-2 text-xs"
													>
														<Icon
															className="size-3.5 shrink-0 text-muted-foreground"
															aria-hidden="true"
														/>
														<span className="truncate">{material.title}</span>
														{material.availableFromSession && (
															<Clock
																className="size-3.5 shrink-0 text-muted-foreground"
																aria-label="Disponible a partir de la sesión"
															/>
														)}
													</li>
												);
											})}
										</ul>
									)}
								</div>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() =>
										setOpen({
											documentId: session.documentId,
											number: index + 1,
											startsAt: session.startsAt,
											endsAt: session.endsAt,
										})
									}
								>
									<Paperclip aria-hidden="true" />
									{state.board?.editable ? "Administrar" : "Ver"}
								</Button>
							</li>
						))}
					</ol>
				)}
			</CardContent>

			<SessionMaterialSheet
				open={open !== null}
				title={`Material de la sesión ${open?.number ?? ""}`}
				description={
					open
						? formatSessionRange(new Date(open.startsAt), new Date(open.endsAt))
						: ""
				}
				source={open ? state.sourceFor(open.documentId) : null}
				onClose={() => setOpen(null)}
			/>
		</Card>
	);
}
