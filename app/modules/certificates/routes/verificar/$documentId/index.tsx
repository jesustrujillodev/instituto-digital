import { BadgeCheck, CircleX } from "lucide-react";
import {
	isRouteErrorResponse,
	useLoaderData,
	useRouteError,
} from "react-router";
import { ThemeModeToggle } from "@/modules/theme/components/theme-mode-toggle";
import { InstitutionalLogo } from "@/shared/components/common/institutional-logo";
import type { RouteErrorData } from "@/shared/http/route-error";
import { CERTIFICATE_ERROR_CODES } from "../../../domain/certificate.errors";
import type { loader } from "./index.loader";

export { loader } from "./index.loader";

/**
 * Lleva nombres de personas: ni buscadores ni cachés compartidas. También en
 * los errores, que es cuando más se prueba la ruta.
 */
export function headers() {
	return {
		"X-Robots-Tag": "noindex, nofollow",
		"Cache-Control": "private, no-store",
	};
}

export function meta() {
	return [
		{ title: "Verificación de certificado" },
		{ name: "robots", content: "noindex, nofollow" },
	];
}

function Shell({ children }: { children: React.ReactNode }) {
	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-sidebar px-6 py-12 text-sidebar-foreground">
			<div className="absolute top-4 right-4">
				<ThemeModeToggle />
			</div>

			<InstitutionalLogo className="h-12" />

			<div className="w-full max-w-md rounded-xl bg-background p-6 text-foreground shadow-lg">
				{children}
			</div>
		</main>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<dt className="text-xs text-muted-foreground uppercase tracking-wide">
				{label}
			</dt>
			<dd className="text-sm font-medium">{value}</dd>
		</div>
	);
}

export default function VerificarCertificadoPage() {
	const { data } = useLoaderData<typeof loader>();

	if (data.status === "revoked") {
		return (
			<Shell>
				<div className="flex items-center gap-2 text-destructive">
					<CircleX className="size-5" aria-hidden="true" />
					<h1 className="text-base font-semibold">Certificado no válido</h1>
				</div>
				<p className="mt-2 text-sm text-muted-foreground">
					El certificado con folio <strong>{data.folio}</strong> fue revocado y
					ya no acredita el curso.
				</p>
			</Shell>
		);
	}

	return (
		<Shell>
			<div className="flex items-center gap-2 text-primary">
				<BadgeCheck className="size-5" aria-hidden="true" />
				<h1 className="text-base font-semibold">Certificado válido</h1>
			</div>
			<p className="mt-1 text-xs text-muted-foreground">
				Emitido por el Instituto Digital de Capacitación.
			</p>

			<dl className="mt-5 grid gap-3">
				<Row label="Otorgado a" value={data.recipientName} />
				<Row label="Curso" value={data.courseTitle} />
				<Row label="Dependencia" value={data.dependencyName} />
				{data.hours && <Row label="Duración" value={data.hours} />}
				<Row label="Fecha de emisión" value={data.issuedOn} />
				<Row label="Folio" value={data.folio} />
			</dl>
		</Shell>
	);
}

export function ErrorBoundary() {
	const error = useRouteError();

	if (!isRouteErrorResponse(error)) throw error;

	const { code, message } = (error.data ?? {}) as Partial<RouteErrorData>;
	const limited = code === CERTIFICATE_ERROR_CODES.VERIFY_RATE_LIMITED;

	return (
		<Shell>
			<div className="flex items-center gap-2 text-destructive">
				<CircleX className="size-5" aria-hidden="true" />
				<h1 className="text-base font-semibold">
					{limited ? "Demasiadas consultas" : "No existe este certificado"}
				</h1>
			</div>
			<p role="alert" className="mt-2 text-sm text-muted-foreground">
				{limited
					? message
					: "No hay ningún certificado con este código. Revisa que el enlace o el QR sean los del documento."}
			</p>
		</Shell>
	);
}
