import { useEffect, useMemo, useRef, useState } from "react";
import { renderCertificateDocument } from "../../domain/certificate.renderer";
import type { CertificateRenderData } from "../../domain/certificate.types";
import { pageBoxOf } from "../../domain/design/design.assets";
import type { CertificateDesignV2 } from "../../domain/design/design-v2.schema";

interface DesignThumbnailProps {
	design: CertificateDesignV2;
	data: CertificateRenderData;
	logoUrls: Record<string, string>;
	label: string;
}

/**
 * La miniatura de un diseño: el certificado real, escalado, y solo cuando
 * entra en pantalla. Una lista larga de plantillas no monta todos sus iframes
 * de golpe.
 */
export function DesignThumbnail({
	design,
	data,
	logoUrls,
	label,
}: DesignThumbnailProps) {
	const box = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const element = box.current;
		if (!element) return;
		const resize = new ResizeObserver(([entry]) =>
			setWidth(entry.contentRect.width),
		);
		const intersect = new IntersectionObserver(([entry]) => {
			if (entry.isIntersecting) setVisible(true);
		});
		resize.observe(element);
		intersect.observe(element);
		return () => {
			resize.disconnect();
			intersect.disconnect();
		};
	}, []);

	const page = pageBoxOf(design);
	const document = useMemo(
		() =>
			visible
				? renderCertificateDocument(design, data, {
						assetBaseUrl: "",
						logoUrls,
					})
				: "",
		[visible, design, data, logoUrls],
	);

	return (
		<div
			ref={box}
			className="relative w-full overflow-hidden rounded-sm bg-white ring-1 ring-foreground/10"
			style={{ aspectRatio: `${page.width} / ${page.height}` }}
		>
			{visible && width > 0 && (
				<iframe
					title={label}
					srcDoc={document}
					sandbox="allow-same-origin"
					tabIndex={-1}
					loading="lazy"
					className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
					style={{
						width: page.width,
						height: page.height,
						transform: `scale(${width / page.width})`,
					}}
				/>
			)}
		</div>
	);
}
