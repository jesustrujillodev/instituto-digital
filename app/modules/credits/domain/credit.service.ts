import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type { AppResponse } from "@/shared/response/response.types";
import type {
	CreditsOverviewQueryDto,
	CreditsOverviewResponse,
	MyCreditsQueryDto,
	MyCreditsResponse,
	YearCredits,
} from "./credit.types";

export interface ICreditService {
	listMine(
		query: MyCreditsQueryDto,
		actor: AuthContext,
	): Promise<MyCreditsResponse>;
	/** Créditos y horas propios del ejercicio en curso; lo mismo que suma `listMine`. */
	summarizeYear(actor: AuthContext): Promise<AppResponse<YearCredits>>;
	/**
	 * Personal de su dependencia para titular y auxiliar. Para el alcance global,
	 * el resumen por dependencia o el personal de la que pida.
	 */
	listOverview(
		query: CreditsOverviewQueryDto,
		actor: AuthContext,
	): Promise<CreditsOverviewResponse>;
}
