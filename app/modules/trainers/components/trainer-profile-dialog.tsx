import { GraduationCap } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useFetcher } from "react-router";
import * as v from "valibot";
import type { UserType } from "@/modules/users/domain/user.rules";
import { TextInput } from "@/shared/components/common/text-input";
import { TextareaInput } from "@/shared/components/common/textarea-input";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { useFetcherToast } from "@/shared/hooks/use-fetcher-toast";
import {
	externalProfileFieldsRule,
	profileFieldsRule,
} from "../domain/trainer.rules";
import type { TrainerDetail } from "../domain/trainer.types";
import { useTrainerProfileFormIds } from "../hooks/use-trainer-form-ids";
import {
	INTENT_FIELD,
	TRAINER_INTENTS,
	type TrainerActionData,
} from "../utils/parse-trainer-form-data";
import { trainerProfileActionPath } from "../utils/trainer-profile-paths";

export interface TrainerProfileDialogTarget {
	mode: "activate" | "edit";
	userDocumentId: string;
	name: string;
	type: UserType;
	profile: Pick<TrainerDetail, "specialty" | "institution" | "bio"> | null;
}

interface TrainerProfileDialogProps {
	/** `null` cierra el diálogo. */
	target: TrainerProfileDialogTarget | null;
	onOpenChange: (open: boolean) => void;
}

type Field = "specialty" | "institution" | "bio";
type FieldErrors = Partial<Record<Field, string>>;

const BIO_MAX = 600;

const emptyValues = { specialty: "", institution: "", bio: "" };

const clientErrorsOf = (
	values: typeof emptyValues,
	withInstitution: boolean,
): FieldErrors => {
	const parsed = v.safeParse(
		withInstitution ? externalProfileFieldsRule : profileFieldsRule,
		withInstitution ? values : { specialty: values.specialty, bio: values.bio },
	);
	if (parsed.success) return {};

	const nested = v.flatten(parsed.issues).nested ?? {};
	return Object.fromEntries(
		Object.entries(nested).map(([key, messages]) => [key, messages?.[0]]),
	) as FieldErrors;
};

/**
 * Habilitar a alguien como capacitador o editar su perfil: los mismos campos,
 * dos intenciones.
 *
 * La institución solo se pide al editar a un externo; un interno pertenece a su
 * dependencia y el servicio la rechazaría.
 */
export function TrainerProfileDialog({
	target,
	onOpenChange,
}: TrainerProfileDialogProps) {
	const ids = useTrainerProfileFormIds();
	const fetcher = useFetcher<TrainerActionData>();
	const [values, setValues] = useState(emptyValues);
	const [errors, setErrors] = useState<FieldErrors>({});

	const isSubmitting = fetcher.state !== "idle";
	const isEdit = target?.mode === "edit";
	const withInstitution = isEdit && target?.type === "EXTERNAL";

	useFetcherToast(fetcher, { onSuccess: () => onOpenChange(false) });

	// Cada apertura parte de lo guardado, no de lo que se tecleó y descartó.
	useEffect(() => {
		if (!target) return;

		setValues({
			specialty: target.profile?.specialty ?? "",
			institution: target.profile?.institution ?? "",
			bio: target.profile?.bio ?? "",
		});
		setErrors({});
	}, [target]);

	useEffect(() => {
		const data = fetcher.data;
		if (data && !data.success && data.error.fieldErrors) {
			setErrors(data.error.fieldErrors as FieldErrors);
		}
	}, [fetcher.data]);

	const update = (field: Field) => (value: string) => {
		setValues((current) => ({ ...current, [field]: value }));
		if (errors[field]) setErrors((current) => ({ ...current, [field]: "" }));
	};

	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (!target) return;

		const found = clientErrorsOf(values, withInstitution);
		if (Object.keys(found).length > 0) {
			setErrors(found);
			document.getElementById(ids[Object.keys(found)[0] as Field])?.focus();
			return;
		}

		fetcher.submit(
			{
				specialty: values.specialty,
				bio: values.bio,
				...(withInstitution ? { institution: values.institution } : {}),
				[INTENT_FIELD]: isEdit
					? TRAINER_INTENTS.update
					: TRAINER_INTENTS.activate,
			},
			{
				method: "post",
				action: trainerProfileActionPath(target.userDocumentId),
			},
		);
	};

	return (
		<Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{isEdit
							? "Editar perfil de capacitador"
							: "Habilitar como capacitador"}
					</DialogTitle>
					<DialogDescription>
						{isEdit
							? target?.name
							: `${target?.name} conserva su rol y además podrá crear e impartir cursos; cualquier dependencia podrá asignarle los suyos. Su sesión se cerrará para aplicar el cambio.`}
					</DialogDescription>
				</DialogHeader>

				<form
					id={ids.form}
					onSubmit={submit}
					noValidate
					className="flex flex-col gap-4"
				>
					<TextInput
						id={ids.specialty}
						name="specialty"
						label="Especialidad"
						required
						autoFocus
						placeholder="Protección civil"
						value={values.specialty}
						error={errors.specialty}
						onChange={(event) => update("specialty")(event.target.value)}
					/>

					{withInstitution && (
						<TextInput
							id={ids.institution}
							name="institution"
							label="Institución"
							required
							placeholder="Universidad Autónoma de Baja California"
							value={values.institution}
							error={errors.institution}
							onChange={(event) => update("institution")(event.target.value)}
						/>
					)}

					<TextareaInput
						id={ids.bio}
						name="bio"
						label="Semblanza"
						rows={3}
						maxLength={BIO_MAX}
						placeholder="Trayectoria breve, en una o dos frases."
						helperText={`Opcional · ${values.bio.length}/${BIO_MAX}`}
						value={values.bio}
						error={errors.bio}
						onChange={(event) => update("bio")(event.target.value)}
					/>
				</form>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isSubmitting}
					>
						Cancelar
					</Button>
					<Button type="submit" form={ids.form} disabled={isSubmitting}>
						{!isEdit && <GraduationCap aria-hidden="true" />}
						{isEdit
							? isSubmitting
								? "Guardando…"
								: "Guardar cambios"
							: isSubmitting
								? "Habilitando…"
								: "Habilitar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
