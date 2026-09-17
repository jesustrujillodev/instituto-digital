import * as v from "valibot";

const recipientRule = v.object({
	email: v.pipe(v.string(), v.trim(), v.email()),
});

/**
 * ¿Se le puede escribir? Un correo mal formado no debe llegar a la cola: el
 * servidor lo rechazaría en cada reintento.
 */
export const isDeliverable = (recipient: { email: string }): boolean =>
	v.safeParse(recipientRule, recipient).success;
