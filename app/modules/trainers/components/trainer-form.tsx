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
import { TextareaInput } from "@/shared/components/common/textarea-input";
import { UnsavedChangesDialog } from "@/shared/components/common/unsaved-changes-dialog";
import { Card, CardContent } from "@/shared/components/ui/card";
import { FieldLegend, FieldSet } from "@/shared/components/ui/field";
import { updateProfileRule } from "../domain/trainer.rules";
import type { TrainerDetail } from "../domain/trainer.types";
import type { TrainerFormIds } from "../hooks/use-trainer-form-ids";
import {
	buildTrainerFormDefaults,
	type TrainerFormValues,
} from "../utils/build-trainer-form-defaults";
import {
	INTENT_FIELD,
	TRAINER_INTENTS,
	type TrainerActionData,
} from "../utils/parse-trainer-form-data";

interface TrainerFormProps {
	ids: TrainerFormIds;
	/** Lo crea la ruta para poder pintar el botón de guardar en el PageHeader. */
	fetcher: FetcherWithComponents<TrainerActionData>;
	trainer: TrainerDetail;
}

const FIELD_GRID = "grid items-start gap-4 md:grid-cols-2";

export function TrainerForm({ ids, fetcher, trainer }: TrainerFormProps) {
	const isExternal = trainer.type === "EXTERNAL";

	const defaultValues = useMemo(
		() => buildTrainerFormDefaults(trainer),
		[trainer],
	);

	// El cast es la única forma de expresar "resolver de un esquema que valida un
	// SUBCONJUNTO de los valores del formulario": updateProfileRule los declara
	// todos opcionales y TypeScript no acepta esa relación en un tipo
	// contravariante. La validación real es la misma regla que corre el servidor.
	const resolver = useMemo(
		() =>
			valibotResolver(
				updateProfileRule,
			) as unknown as Resolver<TrainerFormValues>,
		[],
	);

	const {
		register,
		handleSubmit,
		setError,
		formState: { errors, isDirty },
	} = useForm<TrainerFormValues>({
		resolver,
		defaultValues,
		mode: "onTouched",
		reValidateMode: "onChange",
		shouldFocusError: true,
	});

	const isSubmitting = fetcher.state !== "idle";
	const isSaved = fetcher.data?.success === true;
	const hasUnsavedChanges = isDirty && !isSubmitting && !isSaved;

	useEffect(() => {
		const data = fetcher.data;
		const fieldErrors = data && !data.success ? data.error.fieldErrors : null;
		if (!fieldErrors) return;

		for (const [name, message] of Object.entries(fieldErrors)) {
			setError(name as keyof TrainerFormValues, { type: "server", message });
		}
	}, [fetcher.data, setError]);

	const onSubmit = (values: TrainerFormValues) => {
		// La institución solo viaja para un externo: para un interno el servicio la
		// rechaza, y mandarla vacía la convertiría en ausencia igualmente.
		const { institution, ...rest } = values;

		fetcher.submit(
			toFormData({
				...rest,
				...(isExternal ? { institution } : {}),
				[INTENT_FIELD]: TRAINER_INTENTS.update,
			}),
			{ method: "post" },
		);
	};

	const onInvalid: SubmitErrorHandler<TrainerFormValues> = (formErrors) => {
		const keys = Object.keys(formErrors);
		sileo.error({
			title: "Revisa el formulario",
			description:
				keys.length === 1
					? "Hay un campo marcado."
					: `Hay ${keys.length} campos marcados.`,
		});

		const firstId = ids[keys[0] as keyof TrainerFormIds];
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
							<FieldLegend>Perfil</FieldLegend>

							<div className={FIELD_GRID}>
								<TextInput
									id={ids.specialty}
									label="Especialidad"
									required
									placeholder="Protección civil"
									error={errors.specialty?.message}
									{...register("specialty")}
								/>

								{isExternal && (
									<TextInput
										id={ids.institution}
										label="Institución"
										required
										placeholder="Universidad Autónoma"
										error={errors.institution?.message}
										{...register("institution")}
									/>
								)}
							</div>

							<TextareaInput
								id={ids.bio}
								label="Semblanza"
								rows={4}
								placeholder="Trayectoria breve, en una o dos frases."
								error={errors.bio?.message}
								{...register("bio")}
							/>
						</FieldSet>
					</CardContent>
				</Card>
			</form>
		</>
	);
}
