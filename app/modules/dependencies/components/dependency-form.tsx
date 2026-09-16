import { valibotResolver } from "@hookform/resolvers/valibot";
import { useEffect, useMemo } from "react";
import {
	type Resolver,
	type SubmitErrorHandler,
	useForm,
} from "react-hook-form";
import type { FetcherWithComponents } from "react-router";
import { sileo } from "sileo";
import { toFormData } from "@/lib/form-data";
import { scrollIntoView } from "@/lib/motion";
import { TextInput } from "@/shared/components/common/text-input";
import { UnsavedChangesDialog } from "@/shared/components/common/unsaved-changes-dialog";
import { Card, CardContent } from "@/shared/components/ui/card";
import { FieldLegend, FieldSet } from "@/shared/components/ui/field";
import {
	createDependencyRule,
	updateDependencyRule,
} from "../domain/dependency.rules";
import type { Dependency } from "../domain/dependency.types";
import type { DependencyFormIds } from "../hooks/use-dependency-form-ids";
import {
	buildDependencyFormDefaults,
	type DependencyFormValues,
} from "../utils/build-dependency-form-defaults";
import {
	DEPENDENCY_INTENTS,
	type DependencyActionData,
	INTENT_FIELD,
} from "../utils/parse-dependency-form-data";

interface DependencyFormProps {
	mode: "create" | "edit";
	ids: DependencyFormIds;
	/** Lo crea la ruta para poder pintar el botón de guardar en el PageHeader. */
	fetcher: FetcherWithComponents<DependencyActionData>;
	dependency?: Dependency | null;
}

/**
 * `items-start` es imprescindible: sin él cada celda se estira al alto de su
 * vecina y el grid interno del campo reparte ese sobrante entre etiqueta e input.
 */
const FIELD_GRID = "grid items-start gap-4 md:grid-cols-2";

export function DependencyForm({
	mode,
	ids,
	fetcher,
	dependency,
}: DependencyFormProps) {
	const isEdit = mode === "edit";

	const defaultValues = useMemo(
		() => buildDependencyFormDefaults(dependency),
		[dependency],
	);

	// El cast es la única forma de expresar "resolver de un esquema que valida un
	// SUBCONJUNTO de los valores del formulario": updateDependencyRule los declara
	// todos opcionales y TypeScript no acepta esa relación en un tipo
	// contravariante. La validación real no cambia — sigue siendo la misma regla
	// que corre el servidor.
	const resolver = useMemo(
		() =>
			valibotResolver(
				isEdit ? updateDependencyRule : createDependencyRule,
			) as unknown as Resolver<DependencyFormValues>,
		[isEdit],
	);

	const {
		register,
		handleSubmit,
		setError,
		formState: { errors, isDirty },
	} = useForm<DependencyFormValues>({
		resolver,
		defaultValues,
		mode: "onTouched",
		reValidateMode: "onChange",
		shouldFocusError: true,
	});

	const isSubmitting = fetcher.state !== "idle";
	const isSaved = fetcher.data?.success === true;

	// `isSaved` es imprescindible: al guardar, el formulario sigue marcado como
	// sucio y la navegación posterior dispararía el aviso de cambios pendientes
	// justo después de un guardado correcto. Se evalúa en render (no en efecto)
	// para que el blocker ya esté desactivado cuando la ruta navega.
	const hasUnsavedChanges = isDirty && !isSubmitting && !isSaved;

	// Los errores que solo el servidor puede detectar (nombre ya registrado) se
	// pintan en SU campo, no en un toast genérico.
	useEffect(() => {
		const data = fetcher.data;
		const fieldErrors = data && !data.success ? data.error.fieldErrors : null;
		if (!fieldErrors) return;

		for (const [name, message] of Object.entries(fieldErrors)) {
			setError(name as keyof DependencyFormValues, {
				type: "server",
				message,
			});
		}
	}, [fetcher.data, setError]);

	const onSubmit = (values: DependencyFormValues) => {
		fetcher.submit(
			toFormData({
				...values,
				[INTENT_FIELD]: isEdit
					? DEPENDENCY_INTENTS.update
					: DEPENDENCY_INTENTS.create,
			}),
			{ method: "post" },
		);
	};

	const onInvalid: SubmitErrorHandler<DependencyFormValues> = (formErrors) => {
		const keys = Object.keys(formErrors);
		sileo.error({
			title: "Revisa el formulario",
			description:
				keys.length === 1
					? "Hay un campo marcado."
					: `Hay ${keys.length} campos marcados.`,
		});

		const firstId = ids[keys[0] as keyof DependencyFormIds];
		scrollIntoView(document.getElementById(firstId), { block: "center" });
	};

	return (
		<>
			<UnsavedChangesDialog when={hasUnsavedChanges} />
			<form
				id={ids.form}
				onSubmit={handleSubmit(onSubmit, onInvalid)}
				className="flex flex-col gap-4"
			>
				<Card>
					<CardContent>
						<FieldSet>
							<FieldLegend>Identidad</FieldLegend>

							<div className={FIELD_GRID}>
								<TextInput
									id={ids.name}
									label="Nombre"
									required
									placeholder="Secretaría de Obras Públicas"
									error={errors.name?.message}
									{...register("name")}
								/>

								<TextInput
									id={ids.acronym}
									label="Siglas"
									placeholder="SOP"
									error={errors.acronym?.message}
									{...register("acronym")}
								/>
							</div>
						</FieldSet>
					</CardContent>
				</Card>
			</form>
		</>
	);
}
