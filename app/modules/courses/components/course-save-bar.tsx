/**
 * Guardar en móvil. El encabezado esconde ahí sus botones: en un formulario
 * largo, la acción tiene que quedar al alcance del pulgar en todo momento.
 */
export function CourseSaveBar({ children }: { children: React.ReactNode }) {
	return (
		<div className="sticky bottom-0 z-10 -mx-4 mt-6 flex gap-2 border-border border-t bg-background px-4 py-3 *:flex-1 md:hidden">
			{children}
		</div>
	);
}
