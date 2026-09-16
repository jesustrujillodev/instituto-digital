import { Download, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import type { ZipDownloadState } from "../hooks/use-zip-download";
import { formatBytes, pluralize } from "../utils/cloud-format";

interface CloudSelectionBarProps {
	count: number;
	zip: ZipDownloadState;
	onZip: () => void;
	onDelete: () => void;
	onClear: () => void;
	onCancelZip: () => void;
}

/**
 * Barra fija al pie mientras hay algo seleccionado o un ZIP en curso.
 *
 * El progreso del ZIP vive aquí y no en un toast: la descarga puede durar
 * minutos, necesita un botón de cancelar a mano y no debe desaparecer sola.
 */
export function CloudSelectionBar({
	count,
	zip,
	onZip,
	onDelete,
	onClear,
	onCancelZip,
}: CloudSelectionBarProps) {
	const busy = zip.phase !== "idle";
	if (count === 0 && !busy) return null;

	return (
		<div className="pointer-events-none sticky bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 mt-6 flex justify-center">
			<section
				aria-label="Selección"
				className="pointer-events-auto flex w-full max-w-2xl flex-col gap-3 rounded-2xl bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-foreground/10"
			>
				{busy ? (
					<ZipProgress zip={zip} onCancel={onCancelZip} />
				) : (
					<div className="flex flex-wrap items-center gap-2">
						<p className="mr-auto pl-2 font-medium text-sm" aria-live="polite">
							{pluralize(
								count,
								"elemento seleccionado",
								"elementos seleccionados",
							)}
						</p>
						<Button type="button" variant="ghost" size="sm" onClick={onClear}>
							<X aria-hidden="true" />
							Quitar selección
						</Button>
						<Button type="button" variant="outline" size="sm" onClick={onZip}>
							<Download aria-hidden="true" />
							Descargar ZIP
						</Button>
						<Button
							type="button"
							variant="destructive"
							size="sm"
							onClick={onDelete}
						>
							<Trash2 aria-hidden="true" />
							Eliminar
						</Button>
					</div>
				)}
			</section>
		</div>
	);
}

function ZipProgress({
	zip,
	onCancel,
}: {
	zip: Exclude<ZipDownloadState, { phase: "idle" }>;
	onCancel: () => void;
}) {
	const downloading = zip.phase === "downloading";
	const percent =
		downloading && zip.total > 0
			? Math.min(100, Math.round((zip.loaded / zip.total) * 100))
			: 0;

	return (
		<div className="flex flex-col gap-2.5 px-2 py-1">
			<div className="flex items-center gap-3">
				<Loader2
					className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
					aria-hidden="true"
				/>
				<div className="flex min-w-0 flex-1 flex-col">
					<span className="truncate font-medium text-sm">{zip.fileName}</span>
					<span
						className="text-muted-foreground text-xs tabular-nums"
						aria-live="polite"
					>
						{downloading
							? `${formatBytes(zip.loaded)} de ${formatBytes(zip.total)}`
							: "Preparando la lista de archivos…"}
					</span>
				</div>
				<Button type="button" variant="ghost" size="sm" onClick={onCancel}>
					Cancelar
				</Button>
			</div>
			<div
				role="progressbar"
				aria-label={`Descargando ${zip.fileName}`}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={downloading ? percent : undefined}
				className="h-1.5 overflow-hidden rounded-full bg-muted"
			>
				<div
					className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
					style={{ width: `${downloading ? percent : 0}%` }}
				/>
			</div>
		</div>
	);
}
