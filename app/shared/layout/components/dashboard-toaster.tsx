import { useEffect, useState } from "react";
import { Toaster } from "sileo";
import { useThemeMode } from "@/modules/theme/hooks/use-theme-mode";

/**
 * Radio de superficie del tema (`rounded-4xl`, el de botones y tarjetas), en
 * píxeles.
 *
 * Sileo dibuja la píldora en SVG y su `roundness` es un número: no acepta
 * `var(--radius)`. Tampoco basta con pisar `rx` por CSS, porque el mismo número
 * fija el desenfoque del filtro que funde píldora y cuerpo, y ese filtro vuelve
 * a redondear las esquinas a su medida. Se mide una sonda con el cálculo de
 * `--radius-4xl` para no repetir aquí el valor de app.css.
 */
function readSurfaceRadius(): number {
	const probe = document.createElement("div");
	probe.style.cssText =
		"position:absolute;visibility:hidden;width:calc(var(--radius) * 2.6)";
	document.body.append(probe);
	const radius = probe.getBoundingClientRect().width;
	probe.remove();
	return radius;
}

export function DashboardToaster() {
	const { mode } = useThemeMode();
	const [roundness, setRoundness] = useState<number>();

	useEffect(() => {
		setRoundness(readSurfaceRadius());
	}, []);

	/*
	 * Sileo no lee la clase `dark` de <html>: necesita el modo para elegir el
	 * relleno de la píldora, que va invertido a propósito (oscura en claro, clara
	 * en oscuro). `mode` ya es el resuelto por el servidor y Sileo entiende los
	 * mismos tres valores. Relleno, tipografía y colores de estado salen de los
	 * tokens del tema: ver el bloque de Sileo en app.css.
	 */
	return <Toaster theme={mode} position="top-center" options={{ roundness }} />;
}
