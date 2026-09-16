import { RefreshCw, SearchCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/shared/components/ui/empty";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/shared/components/ui/sheet";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { CLOUD_LIMITS } from "../domain/cloud.config";
import { parentFolder } from "../domain/cloud.paths";
import { formatBytes, formatModified, pluralize } from "../utils/cloud-format";
import {
	CLOUD_INTENTS,
	type CloudActionData,
	INTENT_FIELD,
	SELECTION_FIELDS,
} from "../utils/cloud-intents";
import { CloudThumb } from "./cloud-thumb";

interface CloudOrphansSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Carpeta que se escanea, con sus subcarpetas. */
	path: string;
	pathLabel: string;
	onDelete: (keys: string[]) => void;
	/** Cambia tras cada borrado: vuelve a escanear. */
	scanToken: number;
}

const GRACE_MINUTES = Math.round(CLOUD_LIMITS.orphanGraceMs / 60_000);

export function CloudOrphansSheet({
	open,
	onOpenChange,
	path,
	pathLabel,
	onDelete,
	scanToken,
}: CloudOrphansSheetProps) {
	const scan = useFetcher<CloudActionData>({ key: "cloud-orphan-scan" });
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const { submit } = scan;
	const rescan = useCallback(() => {
		setSelected(new Set());
		submit(
			{
				[INTENT_FIELD]: CLOUD_INTENTS.scanOrphans,
				[SELECTION_FIELDS.path]: path,
			},
			{ method: "post" },
		);
	}, [submit, path]);

	// Se escanea al abrir, al cambiar de carpeta y tras cada borrado (`scanToken`),
	// UNA vez por combinación: un `submit` con otra identidad no debe reenviar.
	const scannedRef = useRef<string | null>(null);
	useEffect(() => {
		if (!open) {
			scannedRef.current = null;
			return;
		}
		const trigger = `${path}|${scanToken}`;
		if (scannedRef.current === trigger) return;
		scannedRef.current = trigger;
		rescan();
	}, [open, path, scanToken, rescan]);

	const loading = scan.state !== "idle";
	const data = loading ? undefined : scan.data;
	const result =
		data?.success &&
		data.data.intent === CLOUD_INTENTS.scanOrphans &&
		data.data.scan.prefix === path
			? data.data.scan
			: null;
	const error = data && !data.success ? data.error.message : null;
	const orphans = result?.orphans ?? [];

	const allSelected = orphans.length > 0 && selected.size === orphans.length;
	const selectedBytes = orphans
		.filter((orphan) => selected.has(orphan.key))
		.reduce((sum, orphan) => sum + orphan.size, 0);

	const toggle = (key: string, checked: boolean) =>
		setSelected((current) => {
			const next = new Set(current);
			if (checked) next.add(key);
			else next.delete(key);
			return next;
		});

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="gap-0">
				<SheetHeader>
					<SheetTitle>Huérfanos en {pathLabel}</SheetTitle>
					<SheetDescription>
						Archivos que ningún vehículo ni usuario usa y que llevan más de{" "}
						{GRACE_MINUTES} minutos subidos. Incluye subcarpetas.
					</SheetDescription>
				</SheetHeader>

				<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
					{loading && (
						<div className="flex flex-col gap-3" aria-busy="true">
							<span className="sr-only">Revisando archivos…</span>
							{[0, 1, 2, 3].map((index) => (
								<div key={index} className="flex items-center gap-3">
									<Skeleton className="size-10 rounded-md" />
									<div className="flex flex-1 flex-col gap-1.5">
										<Skeleton className="h-3.5 w-3/5" />
										<Skeleton className="h-3 w-2/5" />
									</div>
								</div>
							))}
						</div>
					)}

					{error && (
						<Alert variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					{result?.truncated && (
						<Alert>
							<AlertDescription>
								Se revisaron los primeros{" "}
								{pluralize(result.scanned, "archivo", "archivos")}. Abre una
								subcarpeta para revisar el resto.
							</AlertDescription>
						</Alert>
					)}

					{result && orphans.length === 0 && (
						<Empty>
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<SearchCheck aria-hidden="true" />
								</EmptyMedia>
								<EmptyTitle>Sin huérfanos</EmptyTitle>
								<EmptyDescription>
									Los{" "}
									{pluralize(
										result.scanned,
										"archivo revisado",
										"archivos revisados",
									)}{" "}
									están en uso o se subieron hace poco.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					)}

					{orphans.length > 0 && (
						<>
							<div className="flex items-center gap-3 border-border border-b pb-3">
								<Checkbox
									id="cloud-orphans-all"
									checked={allSelected}
									onCheckedChange={(checked) =>
										setSelected(
											checked === true
												? new Set(orphans.map((orphan) => orphan.key))
												: new Set(),
										)
									}
								/>
								<label htmlFor="cloud-orphans-all" className="flex-1 text-sm">
									Seleccionar todos ({orphans.length.toLocaleString("es-MX")})
								</label>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									onClick={rescan}
									title="Volver a revisar"
								>
									<RefreshCw aria-hidden="true" />
									<span className="sr-only">Volver a revisar</span>
								</Button>
							</div>

							<ul className="flex flex-col">
								{orphans.map((orphan) => {
									const checkboxId = `orphan-${orphan.key}`;

									return (
										<li
											key={orphan.key}
											className="flex items-center gap-3 rounded-lg px-1 py-2 hover:bg-muted/50"
										>
											<Checkbox
												id={checkboxId}
												checked={selected.has(orphan.key)}
												onCheckedChange={(checked) =>
													toggle(orphan.key, checked === true)
												}
											/>
											<label
												htmlFor={checkboxId}
												className="flex min-w-0 flex-1 cursor-pointer items-center gap-3"
											>
												<CloudThumb
													row={{ id: orphan.key, kind: "file", object: orphan }}
												/>
												<span className="flex min-w-0 flex-1 flex-col">
													<span
														className="truncate font-medium text-sm"
														title={orphan.key}
													>
														{orphan.name}
													</span>
													<span className="truncate text-muted-foreground text-xs tabular-nums">
														{parentFolder(orphan.key) || "Raíz"} ·{" "}
														{formatModified(orphan.lastModified)}
													</span>
												</span>
												<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
													{formatBytes(orphan.size)}
												</span>
											</label>
										</li>
									);
								})}
							</ul>
						</>
					)}
				</div>

				{orphans.length > 0 && (
					<SheetFooter className="border-border border-t">
						<Button
							type="button"
							variant="destructive"
							disabled={selected.size === 0}
							onClick={() => onDelete([...selected])}
						>
							<Trash2 aria-hidden="true" />
							{selected.size === 0
								? "Selecciona archivos para eliminar"
								: `Eliminar ${pluralize(selected.size, "archivo", "archivos")} (${formatBytes(selectedBytes)})`}
						</Button>
					</SheetFooter>
				)}
			</SheetContent>
		</Sheet>
	);
}
