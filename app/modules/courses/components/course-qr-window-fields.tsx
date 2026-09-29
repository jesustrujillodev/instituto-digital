import { useFormContext } from "react-hook-form";
import { TextInput } from "@/shared/components/common/text-input";
import type { CourseFormIds } from "../hooks/use-course-form-ids";
import type { CourseFormValues } from "../utils/build-course-form-defaults";

/**
 * Cuándo acepta registros el QR de cada sesión. Va con las sesiones, en el
 * programa: es parte de cómo se imparten, no de cómo se evalúa.
 */
export function CourseQrWindowFields({ ids }: { ids: CourseFormIds }) {
	const {
		register,
		formState: { errors },
	} = useFormContext<CourseFormValues>();

	return (
		<fieldset className="flex flex-col gap-3">
			<legend className="mb-1 font-medium text-sm">
				Ventana del código QR
			</legend>
			<p className="text-muted-foreground text-sm">
				Quien llega a una sesión escanea su QR para registrar su asistencia.
				Decide cuánto antes se activa y cuánto después deja de aceptar
				registros.
			</p>

			<div className="grid items-start gap-4 sm:grid-cols-2">
				<TextInput
					id={ids.qrOpensBeforeMinutes}
					label="Se activa (minutos antes)"
					type="number"
					min={0}
					max={240}
					error={errors.qrOpensBeforeMinutes?.message}
					{...register("qrOpensBeforeMinutes")}
				/>
				<TextInput
					id={ids.qrClosesAfterMinutes}
					label="Se cierra (minutos después)"
					type="number"
					min={0}
					max={240}
					error={errors.qrClosesAfterMinutes?.message}
					{...register("qrClosesAfterMinutes")}
				/>
			</div>
		</fieldset>
	);
}
