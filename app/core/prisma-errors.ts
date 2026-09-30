import type { Prisma } from "@prisma/client";

type AdapterCause = {
	originalMessage?: string;
	constraint?: { fields?: string[]; index?: string };
};

/**
 * Qué índice único rompió un P2002, como texto en el que buscar la columna o el
 * nombre del índice.
 *
 * Con `@prisma/adapter-pg` Prisma ya no llena `meta.target`: las columnas llegan
 * en `driverAdapterError.cause.constraint.fields` y el nombre del índice solo en
 * el mensaje original de Postgres. Un índice parcial como
 * `users_one_head_per_dependency` no se distingue por sus columnas, así que se
 * juntan las tres fuentes.
 */
export const uniqueViolationTarget = (
	error: Prisma.PrismaClientKnownRequestError,
): string => {
	const adapterError = error.meta?.driverAdapterError as
		| { cause?: AdapterCause }
		| undefined;
	const cause = adapterError?.cause;

	return [
		error.meta?.target,
		cause?.constraint?.fields,
		cause?.constraint?.index,
		cause?.originalMessage,
	]
		.flat()
		.filter((part) => typeof part === "string")
		.join(" ");
};
