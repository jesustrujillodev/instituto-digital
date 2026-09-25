import { valibotResolver } from "@hookform/resolvers/valibot";
import { useEffect, useMemo, useState } from "react";
import {
	Controller,
	type Resolver,
	type SubmitErrorHandler,
	useForm,
	useWatch,
} from "react-hook-form";
import type { FetcherWithComponents } from "react-router";
import { sileo } from "sileo";
import { toFormData } from "@/lib/form-data";
import { scrollIntoView } from "@/lib/motion";
import { PasswordInput } from "@/shared/components/common/password-input";
import { PhoneInput } from "@/shared/components/common/phone-input";
import { TextInput } from "@/shared/components/common/text-input";
import { UnsavedChangesDialog } from "@/shared/components/common/unsaved-changes-dialog";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldLegend,
	FieldSeparator,
	FieldSet,
	FieldTitle,
} from "@/shared/components/ui/field";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import type { Role } from "@/shared/rules/atoms.rules";
import { createUserRule, updateUserRule } from "../domain/user.rules";
import type { SafeUser } from "../domain/user.types";
import type { UserFormIds } from "../hooks/use-user-form-ids";
import {
	buildUserFormDefaults,
	type UserFormValues,
} from "../utils/build-user-form-defaults";
import {
	CLEARABLE_FIELDS,
	INTENT_FIELD,
	PHOTO_FIELD,
	USER_INTENTS,
	type UserActionData,
} from "../utils/parse-user-form-data";
import { PhotoField } from "./photo-field";
import { ROLE_LABELS } from "./user-badges";

interface UserFormProps {
	mode: "create" | "edit";
	ids: UserFormIds;
	/** Lo crea la ruta para poder pintar el botón de guardar en el PageHeader. */
	fetcher: FetcherWithComponents<UserActionData>;
	user?: SafeUser | null;
	/**
	 * Roles que el actor puede otorgar, resueltos en el SERVIDOR con
	 * `assignableRoles`. El formulario no los deduce: si lo hiciera, dos
	 * implementaciones de la misma jerarquía podrían discrepar y el `Select`
	 * ofrecería opciones que el action rechaza.
	 */
	assignableRoles: readonly Role[];
	/** Catálogo de destinos. Vacío cuando la dependencia no se elige. */
	dependencies?: readonly { documentId: string; name: string }[];
	/**
	 * Solo el alcance global elige dependencia. Para un titular o un auxiliar el
	 * campo va fijo en la suya y deshabilitado: el servicio fuerza la propia de
	 * todos modos, así que ofrecer otra sería ofrecer algo que no ocurre.
	 */
	canChooseDependency?: boolean;
	/** La dependencia ya elegida de quien no la elige: la suya. */
	defaultDependency?: string | null;
	/**
	 * Solo en edición: abre el diálogo de restablecer contraseña. Es otra
	 * operación con su propio envío, así que el formulario solo ofrece la entrada.
	 */
	onResetPassword?: () => void;
}

/**
 * Rejilla de campos de ambas secciones. `items-start` es imprescindible: sin él
 * cada celda se estira al alto de su vecina (la contraseña, con su ayuda) y el
 * grid interno del campo reparte ese sobrante entre etiqueta e input.
 */
const FIELD_GRID = "grid items-start gap-4 md:grid-cols-2";

/** `null` cuando aún no hay de dónde sacar letras: el avatar pinta un icono. */
const initialsOf = (firstName: string, lastName: string, email: string) => {
	const letters = `${firstName.at(0) ?? ""}${lastName.at(0) ?? ""}`.trim();
	return (letters || email.at(0))?.toUpperCase() ?? null;
};

export function UserForm({
	mode,
	ids,
	fetcher,
	user,
	assignableRoles,
	dependencies = [],
	canChooseDependency = false,
	defaultDependency,
	onResetPassword,
}: UserFormProps) {
	const isEdit = mode === "edit";
	const [photo, setPhoto] = useState<File | null>(null);

	const defaultValues = useMemo(
		() => buildUserFormDefaults(user, defaultDependency ?? undefined),
		[user, defaultDependency],
	);

	// El cast es la única forma de expresar "resolver de un esquema que valida un
	// SUBCONJUNTO de los valores del formulario": updateUserRule los declara todos
	// opcionales y TypeScript no acepta esa relación en un tipo contravariante.
	// La validación real no cambia — sigue siendo la misma regla que corre el
	// servidor.
	const resolver = useMemo(
		() =>
			valibotResolver(
				isEdit ? updateUserRule : createUserRule,
			) as unknown as Resolver<UserFormValues>,
		[isEdit],
	);

	const {
		control,
		register,
		handleSubmit,
		setError,
		formState: { errors, isDirty },
	} = useForm<UserFormValues>({
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

	// Los errores que solo el servidor puede detectar (email ya registrado) se
	// pintan en SU campo, no en un toast genérico.
	useEffect(() => {
		const data = fetcher.data;
		const fieldErrors = data && !data.success ? data.error.fieldErrors : null;
		if (!fieldErrors) return;

		for (const [name, message] of Object.entries(fieldErrors)) {
			setError(name as keyof UserFormValues, { type: "server", message });
		}
	}, [fetcher.data, setError]);

	const [watchedFirstName, watchedLastName, watchedRole] = useWatch({
		control,
		name: ["firstName", "lastName", "role"],
	});

	const onSubmit = (values: UserFormValues) => {
		fetcher.submit(
			toFormData({
				...values,
				// La regla convierte estos campos vacíos en `null`, y `toFormData`
				// omite los `null`: viajan como "" para poder borrarlos al editar.
				...Object.fromEntries(
					CLEARABLE_FIELDS.map((field) => [field, values[field] ?? ""]),
				),
				[PHOTO_FIELD]: photo,
				[INTENT_FIELD]: isEdit ? USER_INTENTS.update : USER_INTENTS.create,
			}),
			{ method: "post", encType: "multipart/form-data" },
		);
	};

	const onInvalid: SubmitErrorHandler<UserFormValues> = (formErrors) => {
		const keys = Object.keys(formErrors);
		sileo.error({
			title: "Revisa el formulario",
			description:
				keys.length === 1
					? "Hay un campo marcado."
					: `Hay ${keys.length} campos marcados.`,
		});

		// shouldFocusError solo alcanza a los campos con ref registrada; el Select
		// de rol es controlado, así que se lleva el foco a mano por su id.
		const firstId = ids[keys[0] as keyof UserFormIds];
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

							<PhotoField
								id={ids.photo}
								value={photo}
								existingUrl={user?.photoUrl}
								fallback={initialsOf(
									watchedFirstName ?? "",
									watchedLastName ?? "",
									user?.email ?? "",
								)}
								onChange={setPhoto}
							/>

							<div className={FIELD_GRID}>
								<TextInput
									id={ids.firstName}
									label="Nombre"
									placeholder="Ana"
									error={errors.firstName?.message}
									{...register("firstName")}
								/>

								<TextInput
									id={ids.lastName}
									label="Apellido"
									placeholder="García"
									error={errors.lastName?.message}
									{...register("lastName")}
								/>

								<TextInput
									id={ids.email}
									label="Correo electrónico"
									type="email"
									required
									autoComplete="off"
									placeholder="ana@empresa.com"
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
						</FieldSet>
					</CardContent>
				</Card>

				<Card>
					<CardContent>
						<FieldSet>
							<FieldLegend>Adscripción</FieldLegend>

							<div className={FIELD_GRID}>
								<TextInput
									id={ids.employeeNumber}
									label="Número de empleado"
									required
									placeholder="EMP-0042"
									error={errors.employeeNumber?.message}
									{...register("employeeNumber")}
								/>

								<TextInput
									id={ids.jobTitle}
									label="Puesto"
									placeholder="Coordinadora de capacitación"
									error={errors.jobTitle?.message}
									{...register("jobTitle")}
								/>

								{/* Solo al CREAR: la adscripción se cambia con su propia
								    operación, que escribe bitácora y revoca los tokens. Dejarla
								    aquí permitiría moverla sin dejar rastro. */}
								{!isEdit && (
									<Controller
										control={control}
										name="dependency"
										render={({ field, fieldState }) => (
											<div className="grid w-full gap-1.5">
												<Label htmlFor={ids.dependency}>
													Dependencia
													{/* El superadministrador es el único interno sin dependencia. */}
													{watchedRole !== "SUPERADMIN" && (
														<span className="text-destructive">*</span>
													)}
												</Label>
												<Select
													value={field.value}
													onValueChange={field.onChange}
													disabled={!canChooseDependency}
												>
													<SelectTrigger
														id={ids.dependency}
														className="w-full"
														onBlur={field.onBlur}
														aria-invalid={Boolean(fieldState.error)}
													>
														<SelectValue
															placeholder={
																canChooseDependency
																	? "Elige la dependencia"
																	: "Tu dependencia"
															}
														/>
													</SelectTrigger>
													<SelectContent>
														{dependencies.map((dependency) => (
															<SelectItem
																key={dependency.documentId}
																value={dependency.documentId}
															>
																{dependency.name}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
												{!canChooseDependency && (
													<span className="text-muted-foreground text-sm">
														Solo puedes dar de alta en tu dependencia.
													</span>
												)}
												{fieldState.error && (
													<span
														className="text-sm text-destructive"
														role="alert"
													>
														{fieldState.error.message}
													</span>
												)}
											</div>
										)}
									/>
								)}
							</div>
						</FieldSet>
					</CardContent>
				</Card>

				<Card>
					<CardContent>
						<FieldSet>
							<FieldLegend>Acceso</FieldLegend>

							<div className={FIELD_GRID}>
								{/* Controller y no register: el Select de Radix tiene API propia
								    (onValueChange) y no expone un input nativo que registrar. */}
								<Controller
									control={control}
									name="role"
									render={({ field, fieldState }) => (
										<div className="grid w-full gap-1.5">
											<Label htmlFor={ids.role}>
												Rol<span className="text-destructive">*</span>
											</Label>
											<Select
												value={field.value}
												onValueChange={field.onChange}
											>
												<SelectTrigger
													id={ids.role}
													className="w-full"
													onBlur={field.onBlur}
													aria-invalid={Boolean(fieldState.error)}
												>
													{/* Sin placeholder: el rol siempre trae valor por defecto. */}
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													{assignableRoles.map((role) => (
														<SelectItem key={role} value={role}>
															{ROLE_LABELS[role]}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											{fieldState.error && (
												<span className="text-sm text-destructive" role="alert">
													{fieldState.error.message}
												</span>
											)}
										</div>
									)}
								/>

								{/* Al editar, la contraseña no es un campo: un admin no la conoce
								    y no debe poder sobrescribirla sin querer al guardar el perfil. */}
								{!isEdit && (
									<PasswordInput
										id={ids.password}
										label="Contraseña"
										required
										showGenerator
										autoComplete="new-password"
										helperText="Mínimo 8 caracteres"
										error={errors.password?.message}
										{...register("password")}
									/>
								)}
							</div>

							{isEdit && onResetPassword && (
								<>
									<FieldSeparator />
									<Field
										orientation="horizontal"
										className="flex-col sm:flex-row"
									>
										<FieldContent>
											<FieldTitle>Contraseña</FieldTitle>
											<FieldDescription>
												Asigna una nueva sin conocer la anterior.
											</FieldDescription>
										</FieldContent>
										<Button
											type="button"
											variant="outline"
											onClick={onResetPassword}
										>
											Restablecer…
										</Button>
									</Field>
								</>
							)}
						</FieldSet>
					</CardContent>
				</Card>
			</form>
		</>
	);
}
