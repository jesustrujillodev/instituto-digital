export interface BatchSelection {
	/** Personas o grupos elegidos. */
	selected: number;
	/** Lugares que ocuparía inscribir la selección. */
	seatsNeeded: number;
	/** `null` cuando el curso no tiene cupo. */
	seatsLeft: number | null;
	/** Personas elegidas a las que solo se puede invitar. */
	inviteOnly: number;
	canInvite: boolean;
}

export interface BatchPlan {
	canAssign: boolean;
	message: string;
	/** Hay que cambiar la selección para poder inscribir. */
	blocked: boolean;
}

const seats = (count: number) =>
	`${count} ${count === 1 ? "lugar" : "lugares"}`;

/**
 * Qué pasaría al inscribir la selección, dicho antes de enviarla.
 *
 * El servidor sigue siendo todo o nada; esto solo evita que alguien descubra
 * que no cabía después de elegir a treinta personas.
 */
export const planBatch = ({
	selected,
	seatsNeeded,
	seatsLeft,
	inviteOnly,
	canInvite,
}: BatchSelection): BatchPlan => {
	if (selected === 0) {
		return {
			canAssign: false,
			blocked: false,
			message: canInvite
				? "Elige a quién inscribir o invitar."
				: "Elige a quién inscribir.",
		};
	}
	if (inviteOnly > 0) {
		return {
			canAssign: false,
			blocked: true,
			message:
				inviteOnly === 1
					? "1 persona elegida es de otra dependencia: solo puedes invitarla."
					: `${inviteOnly} personas elegidas son de otra dependencia: solo puedes invitarlas.`,
		};
	}
	if (seatsNeeded === 0) {
		return {
			canAssign: false,
			blocked: false,
			message: "Todos ya están inscritos.",
		};
	}
	if (seatsLeft !== null && seatsNeeded > seatsLeft) {
		return {
			canAssign: false,
			blocked: true,
			message:
				seatsLeft === 0
					? `El curso está lleno.${canInvite ? " Aún puedes invitar." : ""}`
					: `Inscribir ocuparía ${seats(seatsNeeded)} y solo quedan ${seatsLeft}.`,
		};
	}

	return {
		canAssign: true,
		blocked: false,
		message:
			seatsLeft === null
				? `Inscribir ocupará ${seats(seatsNeeded)}.`
				: `Inscribir ocupará ${seatsNeeded} de ${seats(seatsLeft)} libres.`,
	};
};
