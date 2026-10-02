import type { AppResponse } from "@/shared/response/response.types";
import type { LogoOption } from "../domain/certificate.types";

export const LOGO_INTENTS = {
	upload: "upload",
	replace: "replace",
	archive: "archive",
} as const;

export const LOGOS_PATH = "/dashboard/logos-institucionales";

export type LogoActionData = AppResponse<LogoOption | null>;
