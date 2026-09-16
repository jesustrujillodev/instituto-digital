import type { DependencyChangeEntry } from "../domain/user.types";

const formatDate = (value: Date | string) =>
	new Intl.DateTimeFormat("es-MX", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));

/**
 * Bitácora de adscripción.
 *
 * Se pinta como sección —en el perfil y en la hoja de detalle— y no como ruta
 * propia: es un dato que el loader ya trajo, y una pantalla aparte obligaría a un
 * segundo guard sobre el mismo recurso.
 */
export function DependencyHistory({
	entries,
}: {
	entries: readonly DependencyChangeEntry[];
}) {
	if (entries.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				Sin cambios de dependencia registrados.
			</p>
		);
	}

	return (
		<ol className="flex flex-col gap-2">
			{entries.map((entry) => (
				<li
					key={entry.id}
					className="flex flex-col gap-0.5 border-border border-l-2 pl-3 text-sm"
				>
					<span className="text-foreground">
						{entry.fromDependencyName
							? `${entry.fromDependencyName} → ${entry.toDependencyName}`
							: `Alta en ${entry.toDependencyName}`}
					</span>
					<span className="text-muted-foreground text-xs">
						{formatDate(entry.createdAt)} ·{" "}
						{entry.bySelf ? "por la propia persona" : "por un administrador"}
					</span>
				</li>
			))}
		</ol>
	);
}
