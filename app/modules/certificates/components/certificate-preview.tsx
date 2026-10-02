import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { renderCertificateDocument } from "../domain/certificate.renderer";
import type {
	CertificateDesign,
	CertificateRenderData,
} from "../domain/certificate.types";
import { pageBoxOf } from "../domain/design/design.assets";

interface CertificatePreviewProps {
	design: CertificateDesign;
	data: CertificateRenderData;
	/** URL de cada logo subido que el diseño pueda usar. */
	logoUrls?: Record<string, string>;
	className?: string;
}

/**
 * El certificado tal como se emitirá, a escala del contenedor.
 *
 * En un `iframe` y no en un `div`: el CSS del certificado y el de la app no
 * se ven, y ni Tailwind ni los tokens del tema pueden tocar la plantilla.
 *
 * `sandbox` con `allow-same-origin` y SIN `allow-scripts`: el documento no
 * ejecuta nada, y el mismo origen es lo que deja que la cookie de sesión
 * acompañe la petición de una firma privada al proxy de storage. Las dos
 * banderas juntas serían peligrosas; esta sola, no.
 */
export function CertificatePreview({
	design,
	data,
	logoUrls,
	className,
}: CertificatePreviewProps) {
	const frame = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);

	// Escribir en un campo no regenera el documento en cada tecla: React pinta
	// primero el input y deja el iframe para cuando haya tiempo.
	const deferredDesign = useDeferredValue(design);
	const document = useMemo(
		() =>
			renderCertificateDocument(deferredDesign, data, {
				assetBaseUrl: "",
				logoUrls,
			}),
		[deferredDesign, data, logoUrls],
	);
	const page = pageBoxOf(deferredDesign);

	useEffect(() => {
		const element = frame.current;
		if (!element) return;

		const observer = new ResizeObserver(([entry]) => {
			setWidth(entry.contentRect.width);
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	const scale = width / page.width;

	return (
		<div
			ref={frame}
			className={cn(
				"relative w-full overflow-hidden rounded-lg bg-muted shadow-sm ring-1 ring-foreground/10",
				className,
			)}
			style={{
				aspectRatio: `${page.width} / ${page.height}`,
			}}
		>
			{scale > 0 && (
				<iframe
					title="Vista previa del certificado"
					srcDoc={document}
					sandbox="allow-same-origin"
					tabIndex={-1}
					className="absolute top-0 left-0 origin-top-left border-0"
					style={{
						width: page.width,
						height: page.height,
						transform: `scale(${scale})`,
					}}
				/>
			)}
		</div>
	);
}
