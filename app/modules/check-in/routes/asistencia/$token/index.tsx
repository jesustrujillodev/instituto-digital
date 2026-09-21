import { useEffect, useRef } from "react";
import {
	Form,
	isRouteErrorResponse,
	Link,
	useFetcher,
	useLoaderData,
	useRouteError,
} from "react-router";
import {
	formatSessionRange,
	formatZonedTime,
	INSTITUTE_TIME_ZONE_LABEL,
} from "@/lib/date-utils";
import { ThemeModeToggle } from "@/modules/theme/components/theme-mode-toggle";
import { InstitutionalLogo } from "@/shared/components/common/institutional-logo";
import { Button } from "@/shared/components/ui/button";
import type { RouteErrorData } from "@/shared/http/route-error";
import { CHECK_IN_ERROR_CODES } from "../../../domain/check-in.errors";
import type { CheckInActionData } from "./index.action";
import type { loader } from "./index.loader";

export { action } from "./index.action";
export { loader } from "./index.loader";

function Shell({ children }: { children: React.ReactNode }) {
	return (
		<main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-sidebar px-6 py-12 text-sidebar-foreground">
			<div className="absolute top-4 right-4">
				<ThemeModeToggle />
			</div>

			<InstitutionalLogo className="h-12" />

			<div className="w-full max-w-sm rounded-xl bg-background p-6 text-foreground shadow-lg">
				{children}
			</div>
		</main>
	);
}

export default function AsistenciaPage() {
	const { data } = useLoaderData<typeof loader>();
	const fetcher = useFetcher<CheckInActionData>();
	const sent = useRef(false);

	// El envío es automático pero viaja como POST. StrictMode monta dos veces en
	// desarrollo, de ahí la guarda: un segundo envío sería inofensivo —el
	// registro es idempotente— pero pintaría "ya estaba registrada" al primero.
	useEffect(() => {
		if (sent.current || !data.canRegister) return;
		sent.current = true;
		fetcher.submit(null, { method: "post" });
	}, [data.canRegister, fetcher.submit]);

	const result = fetcher.data;
	const pending = fetcher.state !== "idle" || (!result && data.canRegister);

	return (
		<Shell>
			<p className="text-sm text-muted-foreground">{data.course.title}</p>
			<p className="mt-1 text-xs text-muted-foreground">
				{data.course.dependencyName}
			</p>

			<hr className="my-4 border-border" />

			<p className="text-sm font-medium">
				Sesión {data.session.ordinal} de {data.session.total}
			</p>
			<p className="text-sm text-muted-foreground">
				{formatSessionRange(data.session.startsAt, data.session.endsAt)}
			</p>
			<p className="text-xs text-muted-foreground">
				{INSTITUTE_TIME_ZONE_LABEL}
			</p>
			{data.session.venue && (
				<p className="text-sm text-muted-foreground">{data.session.venue}</p>
			)}

			<div className="mt-6" role="status" aria-live="polite">
				{pending && (
					<p className="text-sm text-muted-foreground">
						Registrando tu asistencia…
					</p>
				)}

				{!pending && result?.success && (
					<div className="rounded-md bg-primary/10 px-3 py-3">
						<p className="text-sm font-semibold text-primary">
							{result.data.status === "ALREADY_RECORDED"
								? "Tu asistencia ya estaba registrada"
								: "Asistencia registrada"}
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							{formatZonedTime(result.data.recordedAt)} (
							{INSTITUTE_TIME_ZONE_LABEL})
						</p>
					</div>
				)}

				{!pending && result && !result.success && (
					<p
						role="alert"
						className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
					>
						{result.error.message}
					</p>
				)}
			</div>

			{/* Reserva sin JS: el auto-envío no llega y el botón queda a mano. */}
			{!result && (
				<Form method="post" className="mt-4">
					<Button type="submit" className="w-full" disabled={pending}>
						Registrar mi asistencia
					</Button>
				</Form>
			)}

			<Link
				to="/dashboard/mis-cursos"
				className="mt-6 block text-center text-xs text-muted-foreground underline"
			>
				Ir a mis cursos
			</Link>
		</Shell>
	);
}

export function ErrorBoundary() {
	const error = useRouteError();

	if (!isRouteErrorResponse(error)) throw error;

	const { code, message } = (error.data ?? {}) as Partial<RouteErrorData>;

	return (
		<Shell>
			<h1 className="text-base font-semibold">No se registró tu asistencia</h1>
			<p role="alert" className="mt-2 text-sm text-muted-foreground">
				{message ?? "Este código de asistencia no es válido."}
			</p>

			{code === CHECK_IN_ERROR_CODES.INVITATION_PENDING && (
				<Button asChild className="mt-6 w-full">
					<Link to="/dashboard/mis-cursos">Ver mi invitación</Link>
				</Button>
			)}

			<Link
				to="/dashboard"
				className="mt-6 block text-center text-xs text-muted-foreground underline"
			>
				Volver al inicio
			</Link>
		</Shell>
	);
}
