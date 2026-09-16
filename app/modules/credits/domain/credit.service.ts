import type { AuthContext } from "@/modules/auth/domain/auth.types";
import type {
	CreditsOverviewQueryDto,
	CreditsOverviewResponse,
	MyCreditsQueryDto,
	MyCreditsResponse,
} from "./credit.types";

export interface ICreditService {
	listMine(
		query: MyCreditsQueryDto,
		actor: AuthContext,
	): Promise<MyCreditsResponse>;
	/**
	 * Personal de su dependencia para titular y auxiliar. Para el alcance global,
	 * el resumen por dependencia o el personal de la que pida.
	 */
	listOverview(
		query: CreditsOverviewQueryDto,
		actor: AuthContext,
	): Promise<CreditsOverviewResponse>;
}
