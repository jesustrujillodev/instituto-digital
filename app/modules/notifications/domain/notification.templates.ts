import { formatSessionRange } from "@/lib/date-utils";
import { MODALITY_LABELS } from "@/modules/courses/utils/course-labels";
import { escapeHtml } from "@/shared/html/escape-html";
import { PLATFORM_NAME } from "./notification.config";
import type {
	NotificationEvent,
	NotifiedCourse,
	NotifiedSession,
	Recipient,
	RenderedEmail,
} from "./notification.types";

interface RenderContext {
	/** Origen absoluto, sin barra final. */
	appUrl: string;
}

/** Un bloque del correo: se escribe una vez y sale en texto y en HTML. */
type Block =
	| { kind: "paragraph"; text: string }
	| { kind: "list"; items: string[] }
	| { kind: "action"; label: string; url: string };

const greetingOf = (to: Recipient): string => {
	const name = [to.firstName, to.lastName].filter(Boolean).join(" ").trim();
	return name ? `Hola, ${name}:` : "Hola:";
};

const toText = (blocks: readonly Block[]): string =>
	blocks
		.map((block) => {
			switch (block.kind) {
				case "paragraph":
					return block.text;
				case "list":
					return block.items.map((item) => `- ${item}`).join("\n");
				case "action":
					return `${block.label}: ${block.url}`;
				default: {
					const exhaustive: never = block;
					return exhaustive;
				}
			}
		})
		.join("\n\n");

const toHtml = (subject: string, blocks: readonly Block[]): string => {
	const body = blocks
		.map((block) => {
			switch (block.kind) {
				case "paragraph":
					return `<p style="margin:0 0 16px">${escapeHtml(block.text)}</p>`;
				case "list":
					return `<ul style="margin:0 0 16px;padding-left:20px">${block.items
						.map((item) => `<li>${escapeHtml(item)}</li>`)
						.join("")}</ul>`;
				case "action":
					return `<p style="margin:24px 0"><a href="${escapeHtml(block.url)}" style="background:#1f4e79;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none">${escapeHtml(block.label)}</a></p>`;
				default: {
					const exhaustive: never = block;
					return exhaustive;
				}
			}
		})
		.join("");

	return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head><body style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1f2937;max-width:560px;margin:0 auto;padding:24px">${body}<p style="margin:32px 0 0;font-size:12px;color:#6b7280">${escapeHtml(PLATFORM_NAME)} · Este es un aviso automático; no respondas a este correo.</p></body></html>`;
};

const sessionItems = (sessions: readonly NotifiedSession[]): string[] =>
	sessions.length === 0
		? ["Sin sesiones programadas por ahora."]
		: sessions.map((session) =>
				[
					formatSessionRange(session.startsAt, session.endsAt),
					session.venue && `Sede: ${session.venue}`,
					session.link && `Enlace: ${session.link}`,
				]
					.filter(Boolean)
					.join(" · "),
			);

const courseSummary = (course: NotifiedCourse): string =>
	`«${course.title}», organizado por ${course.dependencyName} (${MODALITY_LABELS[course.modality].toLowerCase()}).`;

const courseUrl = (context: RenderContext, course: NotifiedCourse) =>
	`${context.appUrl}/dashboard/cursos-disponibles/${course.documentId}`;

const build = (subject: string, blocks: Block[]): RenderedEmail => ({
	subject,
	text: toText(blocks),
	html: toHtml(subject, blocks),
});

/**
 * Las plantillas fijas de §6.12. Puras: el mismo evento produce siempre el
 * mismo correo, y ninguna lleva credenciales.
 */
export const renderNotification = (
	event: NotificationEvent,
	context: RenderContext,
): RenderedEmail => {
	const greeting: Block = { kind: "paragraph", text: greetingOf(event.to) };

	switch (event.template) {
		case "ACCOUNT_CREATED":
			return build(`Tu cuenta en ${PLATFORM_NAME}`, [
				greeting,
				{
					kind: "paragraph",
					text: `Se creó tu cuenta en la plataforma con el correo ${event.to.email}.`,
				},
				{
					kind: "paragraph",
					text: "Por seguridad, este correo no incluye tu contraseña; la persona que administra tu dependencia te la entregará por un canal privado. Al entrar por primera vez, cámbiala desde tu perfil.",
				},
				{
					kind: "action",
					label: "Iniciar sesión",
					url: `${context.appUrl}/iniciar-sesion`,
				},
			]);

		case "PASSWORD_RESET":
			return build("Tu contraseña fue restablecida", [
				greeting,
				{
					kind: "paragraph",
					text: "Un administrador restableció la contraseña de tu cuenta. La nueva contraseña te la entregará por un canal privado; este correo no la incluye.",
				},
				{
					kind: "paragraph",
					text: "Si no esperabas este cambio, avisa a la persona que administra tu dependencia.",
				},
			]);

		case "DEPENDENCY_CHANGED":
			return build("Cambiaste de dependencia", [
				greeting,
				{
					kind: "paragraph",
					text: event.fromDependency
						? `Un administrador te cambió de ${event.fromDependency} a ${event.toDependency}.`
						: `Un administrador te asignó a ${event.toDependency}.`,
				},
				{
					kind: "paragraph",
					text: "Tus inscripciones vigentes se conservan, y tus créditos siguen contando para la dependencia en la que los obtuviste.",
				},
				{
					kind: "action",
					label: "Ver mi perfil",
					url: `${context.appUrl}/dashboard/perfil`,
				},
			]);

		case "COURSE_INVITATION":
			return build(`Invitación al curso «${event.course.title}»`, [
				greeting,
				{
					kind: "paragraph",
					text: `Te invitaron al curso ${courseSummary(event.course)} Invitar no aparta lugar: acepta la invitación para inscribirte.`,
				},
				{ kind: "list", items: sessionItems(event.sessions) },
				{
					kind: "action",
					label: "Responder la invitación",
					url: `${context.appUrl}/dashboard/mis-cursos`,
				},
			]);

		case "ENROLLMENT_CONFIRMED":
			return build(`Inscripción confirmada: «${event.course.title}»`, [
				greeting,
				{
					kind: "paragraph",
					text: `Quedaste inscrito en el curso ${courseSummary(event.course)}`,
				},
				{ kind: "list", items: sessionItems(event.sessions) },
				{
					kind: "action",
					label: "Ver el curso",
					url: courseUrl(context, event.course),
				},
			]);

		case "ENROLLMENT_ASSIGNED":
			return build(`Te asignaron al curso «${event.course.title}»`, [
				greeting,
				{
					kind: "paragraph",
					text: `Tu dependencia te inscribió en el curso ${courseSummary(event.course)}`,
				},
				{ kind: "list", items: sessionItems(event.sessions) },
				{
					kind: "action",
					label: "Ver el curso",
					url: courseUrl(context, event.course),
				},
			]);

		case "COURSE_UPDATED":
			return build(`Cambios en el curso «${event.course.title}»`, [
				greeting,
				{
					kind: "paragraph",
					text: `Cambiaron las sesiones, la sede o el enlace del curso ${courseSummary(event.course)} Así quedan:`,
				},
				{ kind: "list", items: sessionItems(event.sessions) },
				{
					kind: "action",
					label: "Ver el curso",
					url: courseUrl(context, event.course),
				},
			]);

		case "COURSE_CANCELLED":
			return build(`Curso cancelado: «${event.course.title}»`, [
				greeting,
				{
					kind: "paragraph",
					text: `Se canceló el curso ${courseSummary(event.course)} Ya no se impartirá.`,
				},
				{
					kind: "action",
					label: "Ver otros cursos disponibles",
					url: `${context.appUrl}/dashboard/cursos-disponibles`,
				},
			]);

		default: {
			const exhaustive: never = event;
			return exhaustive;
		}
	}
};
