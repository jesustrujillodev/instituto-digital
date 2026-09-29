import { formatZonedDate } from "@/lib/date-utils";
import type { DataTableAction } from "@/shared/components/common/data-table";
import { Button } from "@/shared/components/ui/button";
import type { TrainerDetail } from "../domain/trainer.types";
import type { TrainerProfileSubject } from "../hooks/use-trainer-profile-actions";

interface TrainerProfileSectionProps<T extends TrainerProfileSubject> {
	item: T & { trainerProfile: TrainerDetail | null };
	/** Las acciones del perfil de la fila; se pintan las que apliquen. */
	actions: DataTableAction<T>[];
}

const ratingOf = (averageRating: number | null) =>
	averageRating === null
		? "Sin valoraciones"
		: `${averageRating.toLocaleString("es-MX", { maximumFractionDigits: 1 })} de 5`;

function Datum({
	label,
	children,
	wide,
}: {
	label: string;
	children: React.ReactNode;
	wide?: boolean;
}) {
	return (
		<div
			className={
				wide ? "col-span-2 flex flex-col gap-1" : "flex flex-col gap-1"
			}
		>
			<dt className="text-muted-foreground text-xs uppercase tracking-wider">
				{label}
			</dt>
			<dd className="text-foreground text-sm">{children}</dd>
		</div>
	);
}

/**
 * El perfil de capacitador dentro del detalle de una persona: qué imparte,
 * cómo le ha ido y, para quien lo administra, cómo cambiarlo.
 *
 * Distingue los tres estados porque piden cosas distintas: sin perfil se
 * habilita con una especialidad; deshabilitado se recupera tal como estaba.
 */
export function TrainerProfileSection<T extends TrainerProfileSubject>({
	item,
	actions,
}: TrainerProfileSectionProps<T>) {
	const profile = item.trainerProfile;
	const visible = actions.filter((action) => action.show?.(item) ?? true);

	return (
		<section
			aria-labelledby={`trainer-${item.documentId}`}
			className="flex flex-col gap-4 border-border border-t px-6 py-5"
		>
			<h3
				id={`trainer-${item.documentId}`}
				className="font-medium text-foreground text-sm"
			>
				Perfil de capacitador
			</h3>

			{profile === null && (
				<p className="text-muted-foreground text-sm">
					{visible.length > 0
						? "No imparte cursos. Al habilitarlo podrá crearlos e impartirlos, y cualquier dependencia podrá asignarle los suyos."
						: "No imparte cursos."}
				</p>
			)}

			{profile?.archivedAt && (
				<p className="text-muted-foreground text-sm">
					Deshabilitado desde el {formatZonedDate(new Date(profile.archivedAt))}
					. No se puede asignar a cursos; conserva su especialidad y lo que
					impartió.
				</p>
			)}

			{profile && (
				<dl className="grid grid-cols-2 gap-x-4 gap-y-4">
					<Datum label="Especialidad" wide={item.type !== "EXTERNAL"}>
						{profile.specialty}
					</Datum>
					{item.type === "EXTERNAL" && (
						<Datum label="Institución">{profile.institution ?? "—"}</Datum>
					)}
					<Datum label="Semblanza" wide>
						{profile.bio ? (
							<span className="whitespace-pre-line">{profile.bio}</span>
						) : (
							<span className="text-muted-foreground">Sin semblanza</span>
						)}
					</Datum>
					<Datum label="Cursos impartidos">
						<span className="tabular-nums">{profile.coursesTaught}</span>
					</Datum>
					<Datum label="Valoración promedio">
						<span className="tabular-nums">
							{ratingOf(profile.averageRating)}
						</span>
					</Datum>
				</dl>
			)}

			{visible.length > 0 && (
				<div className="flex flex-wrap gap-2">
					{visible.map((action) => {
						const Icon = action.getIcon?.(item) ?? action.icon;
						const label =
							typeof action.label === "function"
								? action.label(item)
								: action.label;

						return (
							<Button
								key={label}
								type="button"
								size="sm"
								variant="outline"
								onClick={() => action.onClick(item)}
							>
								{Icon && <Icon aria-hidden="true" />}
								{label}
							</Button>
						);
					})}
				</div>
			)}
		</section>
	);
}
