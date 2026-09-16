import { Loader2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { formatBytes, pluralize } from "../utils/cloud-format";
import {
	CLOUD_INTENTS,
	type CloudActionData,
	toSelectionFormData,
} from "../utils/cloud-intents";
import { deleteConfirmationPhrase } from "../utils/to-cloud-rows";

export interface CloudDeleteRequest {
	keys: string[];
	prefixes: string[];
	/** Nombre legible para el título cuando es un solo elemento. */
	name?: string;
}

interface CloudDeleteDialogProps {
	request: CloudDeleteRequest | null;
	onOpenChange: (open: boolean) => void;
	onConfirm: (request: CloudDeleteRequest) => void;
	/** El borrado ya se envió y aún no vuelve. */
	deleting: boolean;
}

/**
 * Confirmación de un borrado en cascada.
 *
 * Antes de ofrecer el botón pregunta al servidor QUÉ se va a borrar: una carpeta
 * no dice cuántos archivos tiene ni si alguno es la portada de un vehículo. Sin
 * ese resumen, confirmar sería firmar a ciegas.
 */
export function CloudDeleteDialog({
	request,
	onOpenChange,
	onConfirm,
	deleting,
}: CloudDeleteDialogProps) {
	// Un fetcher por selección: la respuesta de un borrado anterior no puede
	// colarse en el resumen del siguiente.
	const signature = request
		? JSON.stringify([request.keys, request.prefixes])
		: "none";
	const preview = useFetcher<CloudActionData>({
		key: `cloud-delete-preview:${signature}`,
	});
	const [typed, setTyped] = useState("");
	const inputId = useId();

	// Un resumen por apertura: un `submit` con otra identidad no debe reenviar.
	const requestedRef = useRef<CloudDeleteRequest | null>(null);
	const { submit } = preview;
	useEffect(() => {
		if (!request) {
			requestedRef.current = null;
			return;
		}
		if (requestedRef.current === request) return;
		requestedRef.current = request;
		setTyped("");
		submit(toSelectionFormData(CLOUD_INTENTS.deletePreview, request), {
			method: "post",
		});
	}, [request, submit]);

	const phrase = request ? deleteConfirmationPhrase(request) : null;
	const data = preview.state === "idle" ? preview.data : undefined;
	const impact =
		data?.success && data.data.intent === CLOUD_INTENTS.deletePreview
			? data.data.impact
			: null;
	const error = data && !data.success ? data.error.message : null;
	const confirmed = phrase === null || typed.trim() === phrase;
	const count = request ? request.keys.length + request.prefixes.length : 0;

	const title =
		count === 1 && request?.name
			? `Eliminar «${request.name}»`
			: `Eliminar ${pluralize(count, "elemento", "elementos")}`;

	return (
		<AlertDialog open={Boolean(request)} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle className="break-words">{title}</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="flex flex-col gap-3 text-left">
							{!impact && !error && (
								<div className="flex flex-col gap-2" aria-busy="true">
									<span className="sr-only">Calculando qué se eliminará…</span>
									<Skeleton className="h-4 w-4/5" />
									<Skeleton className="h-4 w-3/5" />
								</div>
							)}

							{error && (
								<Alert variant="destructive">
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							)}

							{impact && (
								<>
									<p>
										Se eliminarán{" "}
										<strong className="font-semibold text-foreground">
											{pluralize(impact.objectCount, "archivo", "archivos")}
										</strong>{" "}
										({formatBytes(impact.totalBytes)}) del almacenamiento. No se
										puede deshacer.
									</p>

									{impact.owners.length > 0 && (
										<div className="flex flex-col gap-2">
											<p>Algunos están en uso y se quitarán de sus fichas:</p>
											<ul className="flex flex-col divide-y divide-border rounded-lg bg-muted/60 text-foreground">
												{impact.owners.map((owner) => (
													<li
														key={`${owner.owner}:${owner.href ?? owner.label}`}
														className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm"
													>
														<span className="min-w-0 truncate">
															{owner.label}
														</span>
														<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
															{pluralize(owner.count, "archivo", "archivos")}
														</span>
													</li>
												))}
											</ul>
										</div>
									)}
								</>
							)}
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>

				{impact && phrase && (
					<div className="flex flex-col gap-2">
						<Label htmlFor={inputId} className="font-normal text-sm">
							Escribe <strong className="font-semibold">{phrase}</strong> para
							confirmar
						</Label>
						<Input
							id={inputId}
							value={typed}
							onChange={(event) => setTyped(event.target.value)}
							autoComplete="off"
							autoCapitalize="off"
							spellCheck={false}
						/>
					</div>
				)}

				<AlertDialogFooter>
					<AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
					<Button
						type="button"
						variant="destructive"
						disabled={!impact || !confirmed || deleting}
						onClick={() => request && onConfirm(request)}
						className={cn(deleting && "cursor-progress")}
					>
						{deleting && (
							<Loader2
								className="animate-spin motion-reduce:animate-none"
								aria-hidden="true"
							/>
						)}
						{deleting ? "Eliminando…" : "Eliminar"}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
