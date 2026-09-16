import { Copy, Download, ExternalLink, Trash2 } from "lucide-react";
import { sileo } from "sileo";
import { Button } from "@/shared/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/shared/components/ui/sheet";
import { toProxyRef } from "@/shared/storage/public-url";
import type { CloudObject } from "../domain/cloud.types";
import { formatBytes, formatModified } from "../utils/cloud-format";
import { UsageCell, VisibilityBadge } from "./cloud-badges";

interface CloudObjectSheetProps {
	/** `null` cierra el panel. */
	object: CloudObject | null;
	onOpenChange: (open: boolean) => void;
	onDownload: (object: CloudObject) => void;
	onDelete: (object: CloudObject) => void;
}

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1">
			<dt className="text-muted-foreground text-xs uppercase tracking-wider">
				{label}
			</dt>
			<dd className="min-w-0 text-foreground text-sm">{children}</dd>
		</div>
	);
}

/**
 * Detalle de un archivo. No pide nada al servidor: pinta lo que ya trajo el
 * listado. La vista grande de una imagen usa la misma URL que la miniatura.
 */
export function CloudObjectSheet({
	object,
	onOpenChange,
	onDownload,
	onDelete,
}: CloudObjectSheetProps) {
	const copyKey = async (key: string) => {
		try {
			await navigator.clipboard.writeText(key);
			sileo.success({ title: "Ruta copiada" });
		} catch {
			sileo.error({ title: "No se pudo copiar la ruta" });
		}
	};

	return (
		<Sheet open={Boolean(object)} onOpenChange={onOpenChange}>
			<SheetContent className="gap-0 overflow-y-auto">
				{object && (
					<>
						<SheetHeader>
							<SheetTitle className="break-all pr-8">{object.name}</SheetTitle>
							<SheetDescription>{object.contentType}</SheetDescription>
						</SheetHeader>

						<div className="flex flex-col gap-6 px-6 pb-6">
							{object.previewUrl ? (
								<div className="flex aspect-4/3 items-center justify-center overflow-hidden rounded-xl bg-muted">
									<img
										src={object.previewUrl}
										alt={object.name}
										className="size-full object-contain"
									/>
								</div>
							) : (
								<Button variant="outline" asChild>
									{/* El proxy exige sesión para lo privado y responde con una
									    URL firmada: el documento se abre sin pasar por el ZIP. */}
									<a
										href={toProxyRef(object.key)}
										target="_blank"
										rel="noreferrer"
									>
										<ExternalLink aria-hidden="true" />
										Abrir en otra pestaña
									</a>
								</Button>
							)}

							<dl className="grid grid-cols-2 gap-x-4 gap-y-5">
								<Field label="Tamaño">
									<span className="tabular-nums">
										{formatBytes(object.size)}
									</span>
								</Field>
								<Field label="Modificado">
									<span className="tabular-nums">
										{formatModified(object.lastModified)}
									</span>
								</Field>
								<Field label="Acceso">
									<VisibilityBadge visibility={object.visibility} />
								</Field>
								<Field label="Uso">
									<UsageCell reference={object.reference} />
								</Field>
								<div className="col-span-2">
									<Field label="Ruta en el almacenamiento">
										<span className="flex items-start gap-2">
											<code className="min-w-0 flex-1 break-all rounded-md bg-muted px-2 py-1.5 font-mono text-xs">
												{object.key}
											</code>
											<Button
												type="button"
												variant="ghost"
												size="icon-sm"
												onClick={() => copyKey(object.key)}
											>
												<Copy aria-hidden="true" />
												<span className="sr-only">Copiar ruta</span>
											</Button>
										</span>
									</Field>
								</div>
							</dl>

							{object.reference && (
								<p className="text-muted-foreground text-sm">
									Si lo eliminas, también se quitará de{" "}
									<span className="text-foreground">
										{object.reference.label}
									</span>
									.
								</p>
							)}
						</div>

						<SheetFooter className="mt-auto flex-row gap-2 border-border border-t">
							<Button
								type="button"
								variant="destructive"
								className="flex-1"
								onClick={() => onDelete(object)}
							>
								<Trash2 aria-hidden="true" />
								Eliminar
							</Button>
							<Button
								type="button"
								className="flex-1"
								onClick={() => onDownload(object)}
							>
								<Download aria-hidden="true" />
								Descargar
							</Button>
						</SheetFooter>
					</>
				)}
			</SheetContent>
		</Sheet>
	);
}
