import { Prisma } from "@prisma/client";
import type { ICradle } from "@/shared/di/container.types";
import { ThemePreferenceNotSavedError } from "../domain/theme.errors";
import type { IThemeRepository } from "../domain/theme.repository";
import { isThemeMode } from "../domain/theme.rules";
import type { ThemeMode } from "../domain/theme.types";

type Dependencies = {
	prisma: ICradle["prisma"];
};

/** P2025: la fila ya no existe. Es el único error de Prisma que aquí se tipa. */
const isMissingRow = (error: unknown): boolean =>
	error instanceof Prisma.PrismaClientKnownRequestError &&
	error.code === "P2025";

export const createThemeRepository = ({
	prisma,
}: Dependencies): IThemeRepository => ({
	async findModeByUserId(userId) {
		const row = await prisma.user.findUnique({
			where: { id: userId },
			select: { themeMode: true },
		});

		// La columna es un `String?` libre. Un valor que el dominio no reconoce
		// —resto de una versión anterior, escritura manual— se trata como "sin
		// preferencia" en vez de propagarse: el peor desenlace es el modo por
		// defecto. Mismo criterio que `toLockdownScope` en el módulo auth.
		return isThemeMode(row?.themeMode) ? row.themeMode : null;
	},

	async saveMode(userId: number, mode: ThemeMode) {
		try {
			await prisma.user.update({
				where: { id: userId },
				data: { themeMode: mode },
			});
		} catch (error) {
			// P2025: la cuenta ya no existe (archivada y purgada mientras la sesión
			// seguía viva). El error tipado deja que el adaptador diga la verdad —la
			// cookie sí se guardó, la cuenta no— en vez de un fallo genérico.
			if (isMissingRow(error)) throw new ThemePreferenceNotSavedError();
			throw error;
		}
	},
});
