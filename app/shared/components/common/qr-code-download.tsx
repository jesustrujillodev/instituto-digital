import { Download } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Button } from "@/shared/components/ui/button";

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

export interface QrCodeDownloadProps {
	/** Ruta relativa al origen que codifica el QR. */
	path: string;
	/** Base del nombre de archivo; se normaliza a slug. */
	fileName: string;
	ariaLabel: string;
	/** Se pinta entre el código y los botones de descarga. */
	children?: React.ReactNode;
}

/** El QR de una URL propia con su descarga en SVG y PNG. */
export function QrCodeDownload({
	path,
	fileName,
	ariaLabel,
	children,
}: QrCodeDownloadProps) {
	const [svg, setSvg] = useState<string | null>(null);

	// El QR codifica una URL absoluta, y el origen solo se conoce en el
	// navegador: meterlo en env obligaría a configurarlo por entorno para nada.
	useEffect(() => {
		const url = `${window.location.origin}${path}`;
		let active = true;

		QRCode.toString(url, { ...RENDER_OPTIONS, type: "svg" }).then((markup) => {
			if (active) setSvg(markup);
		});

		return () => {
			active = false;
		};
	}, [path]);

	const baseName = slugOf(fileName);

	const downloadSvg = () => {
		if (!svg) return;
		const blob = new Blob([svg], { type: "image/svg+xml" });
		const href = URL.createObjectURL(blob);
		download(href, `${baseName}.svg`);
		URL.revokeObjectURL(href);
	};

	const downloadPng = async () => {
		const href = await QRCode.toDataURL(`${window.location.origin}${path}`, {
			...RENDER_OPTIONS,
			width: PNG_SIZE,
		});
		download(href, `${baseName}.png`);
	};

	return (
		<>
			{svg ? (
				<div
					className="mx-auto w-48 [&>svg]:h-auto [&>svg]:w-full"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: SVG generado por qrcode a partir de una URL propia, sin entrada de usuario.
					dangerouslySetInnerHTML={{ __html: svg }}
					role="img"
					aria-label={ariaLabel}
				/>
			) : (
				<div className="mx-auto size-48 animate-pulse rounded-md bg-muted" />
			)}

			{children}

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
		</>
	);
}
