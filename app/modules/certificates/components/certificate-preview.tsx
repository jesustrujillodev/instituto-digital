import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CERTIFICATE_CANVAS } from "../domain/certificate.config";
import { renderCertificateDocument } from "../domain/certificate.renderer";
import type {
	CertificateDesign,
	CertificateRenderData,
} from "../domain/certificate.types";

interface CertificatePreviewProps {
	design: CertificateDesign;
	data: CertificateRenderData;
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
	className,
}: CertificatePreviewProps) {
	const frame = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(0);

	// Escribir en un campo no regenera el documento en cada tecla: React pinta
	// primero el input y deja el iframe para cuando haya tiempo.
	const deferredDesign = useDeferredValue(design);
	const document = useMemo(
		() => renderCertificateDocument(deferredDesign, data, { assetBaseUrl: "" }),
		[deferredDesign, data],
	);

	useEffect(() => {
		const element = frame.current;
		if (!element) return;

		const observer = new ResizeObserver(([entry]) => {
			setScale(entry.contentRect.width / CERTIFICATE_CANVAS.width);
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	return (
		<div
			ref={frame}
			className={cn(
				"relative w-full overflow-hidden rounded-lg bg-muted shadow-sm ring-1 ring-foreground/10",
				className,
			)}
			style={{
				aspectRatio: `${CERTIFICATE_CANVAS.width} / ${CERTIFICATE_CANVAS.height}`,
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
						width: CERTIFICATE_CANVAS.width,
						height: CERTIFICATE_CANVAS.height,
						transform: `scale(${scale})`,
					}}
				/>
			)}
		</div>
	);
}
