import { QrCode, RefreshCw } from "lucide-react";
import { useFetcher } from "react-router";
import { formatZonedDate, INSTITUTE_TIME_ZONE_LABEL } from "@/lib/date-utils";
import {
	INTENT_FIELD,
	TEACHING_INTENTS,
	type TeachingActionData,
} from "@/modules/teaching/utils/parse-teaching-form-data";
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
import { checkInPathOf } from "../domain/check-in.config";

export interface CourseQrPanelProps {
	title: string;
	qr: {
		token: string | null;
		rotatedAt: Date | null;
		opensBeforeMinutes: number;
		closesAfterMinutes: number;
	};
}

export function CourseQrPanel({ title, qr }: CourseQrPanelProps) {
	const fetcher = useFetcher<TeachingActionData>();
	useFetcherToast(fetcher);

	const rotating = fetcher.state !== "idle";

	return (
		<Card>
			<CardContent className="space-y-4 pt-6">
				<div className="space-y-1">
					<h2 className="flex items-center gap-2 text-sm font-semibold">
						<QrCode className="size-4" aria-hidden />
						Asistencia por QR
					</h2>
					<p className="text-xs text-muted-foreground">
						Quien escanea registra su asistencia a la sesión en curso. Acepta
						registros sin interrupción desde {qr.opensBeforeMinutes} min antes
						del inicio hasta {qr.closesAfterMinutes} min después del fin de cada
						sesión, en {INSTITUTE_TIME_ZONE_LABEL}.
					</p>
				</div>

				{qr.token ? (
					<>
						<QrCodeDownload
							path={checkInPathOf(qr.token)}
							fileName={`qr-${title}`}
							ariaLabel="Código QR de asistencia de la capacitación"
						>
							<p className="text-center text-xs text-muted-foreground">
								Imprímelo a 5 cm o más para que se lea desde la puerta.
							</p>
						</QrCodeDownload>

						{qr.rotatedAt && (
							<p className="text-center text-xs text-muted-foreground">
								Regenerado el {formatZonedDate(qr.rotatedAt)}
							</p>
						)}
					</>
				) : (
					<p className="text-sm text-muted-foreground">
						Esta capacitación todavía no tiene código QR.
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
									? "¿Regenerar el código QR?"
									: "¿Generar el código QR?"}
							</AlertDialogTitle>
							<AlertDialogDescription>
								{qr.token
									? "El código impreso dejará de funcionar de inmediato. Tendrás que imprimir y colocar el nuevo antes de la siguiente sesión. No se borra ninguna asistencia ya registrada."
									: "Se creará el código que el personal escaneará para registrar su asistencia."}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancelar</AlertDialogCancel>
							<AlertDialogAction
								onClick={() =>
									fetcher.submit(
										{ [INTENT_FIELD]: TEACHING_INTENTS.rotateQr },
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
