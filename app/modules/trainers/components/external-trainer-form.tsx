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
import { PasswordInput } from "@/shared/components/common/password-input";
import { PhoneInput } from "@/shared/components/common/phone-input";
import { TextInput } from "@/shared/components/common/text-input";
import { TextareaInput } from "@/shared/components/common/textarea-input";
import { UnsavedChangesDialog } from "@/shared/components/common/unsaved-changes-dialog";
import { Card, CardContent } from "@/shared/components/ui/card";
import { FieldLegend, FieldSet } from "@/shared/components/ui/field";
import { createExternalTrainerRule } from "../domain/trainer.rules";
import type { ExternalTrainerFormIds } from "../hooks/use-trainer-form-ids";
import {
	INTENT_FIELD,
	TRAINER_INTENTS,
	type TrainerActionData,
} from "../utils/parse-trainer-form-data";

interface ExternalTrainerFormProps {
	ids: ExternalTrainerFormIds;
	fetcher: FetcherWithComponents<TrainerActionData>;
}

interface ExternalTrainerFormValues {
	firstName: string;
	lastName: string;
	email: string;
	password: string;
	phone: string;
	specialty: string;
	institution: string;
	bio: string;
}

const EMPTY: ExternalTrainerFormValues = {
	firstName: "",
	lastName: "",
	email: "",
	password: "",
	phone: "",
	specialty: "",
	institution: "",
	bio: "",
};

const FIELD_GRID = "grid items-start gap-4 md:grid-cols-2";

/**
 * Alta de capacitador externo.
 *
 * No lleva dependencia ni número de empleado: el CHECK `users_type_coherence`
 * los prohíbe para una cuenta externa, y la institución ocupa su lugar como
 * procedencia.
 */
export function ExternalTrainerForm({
	ids,
	fetcher,
}: ExternalTrainerFormProps) {
	// El cast es la única forma de expresar "resolver de un esquema cuyos campos
	// opcionales el formulario representa como cadena vacía": TypeScript no acepta
	// esa relación en un tipo contravariante. La validación real no cambia — sigue
	// siendo la misma regla que corre el servidor.
	const resolver = useMemo(
		() =>
			valibotResolver(
				createExternalTrainerRule,
			) as unknown as Resolver<ExternalTrainerFormValues>,
		[],
	);

	const {
		register,
		handleSubmit,
		setError,
		setValue,
		formState: { errors, isDirty },
	} = useForm<ExternalTrainerFormValues>({
		resolver,
		defaultValues: EMPTY,
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
			setError(name as keyof ExternalTrainerFormValues, {
				type: "server",
				message,
			});
		}
	}, [fetcher.data, setError]);

	const onSubmit = (values: ExternalTrainerFormValues) => {
		fetcher.submit(
			toFormData({ ...values, [INTENT_FIELD]: TRAINER_INTENTS.createExternal }),
			{ method: "post" },
		);
	};

	const onInvalid: SubmitErrorHandler<ExternalTrainerFormValues> = (
		formErrors,
	) => {
		const keys = Object.keys(formErrors);
		sileo.error({
			title: "Revisa el formulario",
			description:
				keys.length === 1
					? "Hay un campo marcado."
					: `Hay ${keys.length} campos marcados.`,
		});

		const firstId = ids[keys[0] as keyof ExternalTrainerFormIds];
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
									id={ids.firstName}
									label="Nombre"
									required
									error={errors.firstName?.message}
									{...register("firstName")}
								/>

								<TextInput
									id={ids.lastName}
									label="Apellidos"
									required
									error={errors.lastName?.message}
									{...register("lastName")}
								/>

								<TextInput
									id={ids.email}
									label="Correo"
									type="email"
									required
									autoComplete="off"
									error={errors.email?.message}
									{...register("email")}
								/>

								<PhoneInput
									id={ids.phone}
									label="Teléfono"
									error={errors.phone?.message}
									{...register("phone")}
								/>
							</div>

							<PasswordInput
								id={ids.password}
								label="Contraseña temporal"
								required
								autoComplete="new-password"
								showGenerator
								helperText="Se entrega por canal privado. El correo de bienvenida llega con las notificaciones."
								onGenerate={(value) =>
									setValue("password", value, {
										shouldDirty: true,
										shouldValidate: true,
									})
								}
								error={errors.password?.message}
								{...register("password")}
							/>
						</FieldSet>
					</CardContent>
				</Card>

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

								<TextInput
									id={ids.institution}
									label="Institución"
									required
									placeholder="Universidad Autónoma"
									error={errors.institution?.message}
									{...register("institution")}
								/>
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
