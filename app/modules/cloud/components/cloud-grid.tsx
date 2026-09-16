import { FolderOpen, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/shared/components/ui/empty";
import { formatBytes } from "../utils/cloud-format";
import { type CloudRow, displayNameOf } from "../utils/to-cloud-rows";
import { CloudThumb } from "./cloud-thumb";

interface CloudGridProps {
	rows: CloudRow[];
	selectedIds: string[];
	onToggle: (id: string, checked: boolean) => void;
	onOpen: (row: CloudRow) => void;
	emptyState: { title: string; description: string };
	summary: React.ReactNode;
}

const metaLine = (row: CloudRow) => {
	if (row.kind === "folder")
		return row.folder.label ? row.folder.name : "Carpeta";

	const size = formatBytes(row.object.size);
	return row.object.reference
		? `${size} · ${row.object.reference.label}`
		: `${size} · Sin uso`;
};

/**
 * Rejilla de miniaturas para revisar galerías (`media/<slug>/`).
 *
 * La celda entera abre; la casilla vive por encima con su propio foco. En
 * pantallas táctiles no hay hover, así que la casilla se ve siempre por debajo
 * de `sm`; con puntero aparece al pasar o al enfocar, y se queda si está marcada.
 */
export function CloudGrid({
	rows,
	selectedIds,
	onToggle,
	onOpen,
	emptyState,
	summary,
}: CloudGridProps) {
	if (rows.length === 0) {
		return (
			<Empty className="border border-border">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<FolderOpen aria-hidden="true" />
					</EmptyMedia>
					<EmptyTitle>{emptyState.title}</EmptyTitle>
					<EmptyDescription>{emptyState.description}</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
				{rows.map((row) => {
					const selected = selectedIds.includes(row.id);
					const name = displayNameOf(row);
					const isPrivate =
						(row.kind === "folder"
							? row.folder.visibility
							: row.object.visibility) === "private";

					return (
						<li
							key={row.id}
							className={cn(
								"group relative overflow-hidden rounded-xl bg-card ring-1 ring-border transition-shadow",
								"focus-within:ring-2 focus-within:ring-ring hover:ring-foreground/25",
								selected && "ring-2 ring-primary hover:ring-primary",
							)}
						>
							<button
								type="button"
								onClick={() => onOpen(row)}
								aria-label={
									row.kind === "folder"
										? `Abrir carpeta ${name}`
										: `Ver ${name}`
								}
								className="block w-full text-left outline-none"
							>
								<CloudThumb row={row} variant="tile" />
								<span className="flex flex-col gap-0.5 px-3 py-2.5">
									<span className="flex min-w-0 items-center gap-1.5">
										<span className="truncate font-medium text-foreground text-sm">
											{name}
										</span>
										{isPrivate && (
											<Lock
												className="size-3.5 shrink-0 text-muted-foreground"
												aria-label="Privado"
											/>
										)}
									</span>
									<span className="truncate text-muted-foreground text-xs">
										{metaLine(row)}
									</span>
								</span>
							</button>

							<div
								className={cn(
									"absolute top-2 left-2 flex rounded-md bg-background/90 p-1.5 shadow-xs transition-opacity",
									"sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100",
									selected && "sm:opacity-100",
								)}
							>
								<Checkbox
									checked={selected}
									onCheckedChange={(checked) =>
										onToggle(row.id, checked === true)
									}
									aria-label={`Seleccionar ${name}`}
								/>
							</div>
						</li>
					);
				})}
			</ul>
			<p className="text-muted-foreground text-sm">{summary}</p>
		</div>
	);
}
