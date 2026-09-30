import { RefreshCw, UserPlus } from "lucide-react";
import { useFetcher } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import { INTENT_FIELD } from "@/modules/courses/utils/parse-course-form-data";
import { QrCodeDownload } from "@/shared/components/common/qr-code-download";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/shared/components/ui/alert-dialog";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import type { AppResponse } from "@/shared/response/response.types";
import { enrollmentQrPathOf } from "../domain/enrollment-qr.config";
import type { EnrollmentQrPanel as EnrollmentQrPanelData } from "../domain/enrollment-qr.types";
import { ENROLLMENT_QR_INTENTS } from "../utils/enrollment-qr-intents";

export interface EnrollmentQrPanelProps {
	title: string;
	qr: EnrollmentQrPanelData;
}

export function EnrollmentQrPanel({ title, qr }: EnrollmentQrPanelProps) {
	const fetcher = useFetcher<AppResponse<null>>();
	useFetcherToast(fetcher);

	const rotating = fetcher.state !== "idle";

	return (
		<Card>
			<CardContent className="space-y-4 pt-6">
				<div className="space-y-1">
					<h2 className="flex items-center gap-2 text-sm font-semibold">
						<UserPlus className="size-4" aria-hidden />
						Inscripción por QR
					</h2>
					<p className="text-xs text-muted-foreground">
						Para carteles y avisos impresos. Quien lo escanea inicia sesión, ve
						la ficha de la capacitación y confirma su inscripción. Se aplican el
						cupo, la fecha límite y la audiencia de la capacitación.
					</p>
				</div>

				{!qr.enrollmentOpen && (
					<p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
						La inscripción está cerrada ahora: quien escanee verá la
						capacitación, pero no podrá inscribirse.
					</p>
				)}

				{qr.token ? (
					<>
						<QrCodeDownload
							path={enrollmentQrPathOf(qr.token)}
							fileName={`qr-inscripcion-${title}`}
							ariaLabel="Código QR de inscripción de la capacitación"
						>
							<p className="text-center text-xs text-muted-foreground">
								Imprímelo a 3 cm o más. El PNG sirve para carteles; el SVG no
								pierde nitidez a ningún tamaño.
							</p>
						</QrCodeDownload>

						{qr.rotatedAt && (
							<p className="text-center text-xs text-muted-foreground">
								Generado el {formatZonedDate(qr.rotatedAt)}
							</p>
						)}
					</>
				) : (
					<p className="text-sm text-muted-foreground">
						Esta capacitación todavía no tiene código QR de inscripción.
					</p>
				)}

				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button
							type="button"
							variant={qr.token ? "ghost" : "default"}
							className="w-full"
							disabled={rotating}
						>
							<RefreshCw className="size-4" aria-hidden />
							{qr.token ? "Regenerar código QR" : "Generar código QR"}
						</Button>
					</AlertDialogTrigger>

					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>
								{qr.token
									? "¿Regenerar el código QR de inscripción?"
									: "¿Generar el código QR de inscripción?"}
							</AlertDialogTitle>
							<AlertDialogDescription>
								{qr.token
									? "Los carteles ya impresos dejarán de funcionar de inmediato y tendrás que reemplazarlos. Las inscripciones ya hechas no cambian, y el QR de asistencia tampoco."
									: "Se creará el código que el personal podrá escanear para inscribirse a esta capacitación."}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancelar</AlertDialogCancel>
							<AlertDialogAction
								onClick={() =>
									fetcher.submit(
										{ [INTENT_FIELD]: ENROLLMENT_QR_INTENTS.rotate },
										{ method: "post" },
									)
								}
							>
								{qr.token ? "Regenerar" : "Generar"}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</CardContent>
		</Card>
	);
}
