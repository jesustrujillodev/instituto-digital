import { Download, QrCode, RefreshCw } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { formatZonedDate } from "@/lib/date-utils";
import {
	INTENT_FIELD,
	TEACHING_INTENTS,
	type TeachingActionData,
} from "@/modules/teaching/utils/parse-teaching-form-data";
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

/** "Q" tolera un 25 % de daño: el impreso se doblará, se manchará y se fotocopiará. */
const RENDER_OPTIONS = {
	errorCorrectionLevel: "Q",
	margin: 4,
	color: { dark: "#000000", light: "#FFFFFF" },
} as const;

const PNG_SIZE = 1024;

const slugOf = (title: string) =>
	title
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 60) || "curso";

const download = (href: string, filename: string) => {
	const link = document.createElement("a");
	link.href = href;
	link.download = filename;
	link.click();
};

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

	const [svg, setSvg] = useState<string | null>(null);

	// El QR codifica una URL absoluta, y el origen solo se conoce en el
	// navegador: meterlo en env obligaría a configurarlo por entorno para nada.
	useEffect(() => {
		if (!qr.token) {
			setSvg(null);
			return;
		}

		const url = `${window.location.origin}${checkInPathOf(qr.token)}`;
		let active = true;

		QRCode.toString(url, { ...RENDER_OPTIONS, type: "svg" }).then((markup) => {
			if (active) setSvg(markup);
		});

		return () => {
			active = false;
		};
	}, [qr.token]);

	const downloadSvg = () => {
		if (!svg) return;
		const blob = new Blob([svg], { type: "image/svg+xml" });
		const href = URL.createObjectURL(blob);
		download(href, `qr-${slugOf(title)}.svg`);
		URL.revokeObjectURL(href);
	};

	const downloadPng = async () => {
		if (!qr.token) return;
		const url = `${window.location.origin}${checkInPathOf(qr.token)}`;
		const href = await QRCode.toDataURL(url, {
			...RENDER_OPTIONS,
			width: PNG_SIZE,
		});
		download(href, `qr-${slugOf(title)}.png`);
	};

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
						Quien escanea registra su asistencia a la sesión en curso. Abre{" "}
						{qr.opensBeforeMinutes} min antes y cierra {qr.closesAfterMinutes}{" "}
						min después de cada sesión.
					</p>
				</div>

				{qr.token ? (
					<>
						{svg ? (
							<div
								className="mx-auto w-48 [&>svg]:h-auto [&>svg]:w-full"
								// biome-ignore lint/security/noDangerouslySetInnerHtml: SVG generado por qrcode a partir de una URL propia, sin entrada de usuario.
								dangerouslySetInnerHTML={{ __html: svg }}
								role="img"
								aria-label="Código QR de asistencia del curso"
							/>
						) : (
							<div className="mx-auto size-48 animate-pulse rounded-md bg-muted" />
						)}

						<p className="text-center text-xs text-muted-foreground">
							Imprímelo a 5 cm o más para que se lea desde la puerta.
						</p>

						<div className="flex gap-2">
							<Button
								type="button"
								variant="outline"
								className="flex-1"
								onClick={downloadSvg}
								disabled={!svg}
							>
								<Download className="size-4" aria-hidden />
								SVG
							</Button>
							<Button
								type="button"
								variant="outline"
								className="flex-1"
								onClick={downloadPng}
							>
								<Download className="size-4" aria-hidden />
								PNG
							</Button>
						</div>

						{qr.rotatedAt && (
							<p className="text-center text-xs text-muted-foreground">
								Regenerado el {formatZonedDate(qr.rotatedAt)}
							</p>
						)}
					</>
				) : (
					<p className="text-sm text-muted-foreground">
						Este curso todavía no tiene código QR.
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
