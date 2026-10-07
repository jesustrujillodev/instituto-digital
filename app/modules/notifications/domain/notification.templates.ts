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

/** Los colores del tema (`app.css`) en hex: los clientes de correo no leen `oklch`. */
const BRAND = {
	primary: "#750d2f",
	gold: "#ba945b",
	ink: "#383838",
	muted: "#636363",
	page: "#f2f2f2",
	tint: "#f7eef1",
} as const;

// Ningún cliente de correo carga la Avant Garde de la plataforma: Century Gothic
// es la más parecida que traen Windows y macOS.
const FONT = "'ITC Avant Garde Gothic','Century Gothic',Arial,sans-serif";

/** El logo blanco va sobre la franja guinda; la URL es absoluta porque el correo vive fuera de la app. */
const LOGO = { path: "/assets/aytoBco.png", width: 147, height: 48 } as const;

const blockToHtml = (block: Block): string => {
	switch (block.kind) {
		case "paragraph":
			return `<p style="margin:0 0 16px">${escapeHtml(block.text)}</p>`;
		case "list":
			return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr><td style="background:${BRAND.tint};border-radius:8px;padding:14px 18px"><ul style="margin:0;padding-left:18px">${block.items
				.map((item) => `<li style="margin:4px 0">${escapeHtml(item)}</li>`)
				.join("")}</ul></td></tr></table>`;
		case "action":
			// Botón de tabla: Outlook ignora el padding de un <a> suelto.
			return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td bgcolor="${BRAND.primary}" style="border-radius:6px"><a href="${escapeHtml(block.url)}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px">${escapeHtml(block.label)}</a></td></tr></table>`;
		default: {
			const exhaustive: never = block;
			return exhaustive;
		}
	}
};

/** Lo que la bandeja muestra junto al asunto: el primer párrafo después del saludo. */
const preheaderOf = (blocks: readonly Block[]): string =>
	blocks.slice(1).find((block) => block.kind === "paragraph")?.text ?? "";

const toHtml = (
	subject: string,
	blocks: readonly Block[],
	context: RenderContext,
): string => {
	const body = blocks.map(blockToHtml).join("");
	const preheader = escapeHtml(preheaderOf(blocks));
	const platform = escapeHtml(PLATFORM_NAME);

	return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:0;background:${BRAND.page}"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BRAND.page}"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden"><tr><td bgcolor="${BRAND.primary}" style="padding:20px 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td><img src="${escapeHtml(context.appUrl + LOGO.path)}" width="${LOGO.width}" height="${LOGO.height}" alt="Ayuntamiento de Tijuana" style="display:block;border:0;font-family:${FONT};font-size:16px;font-weight:bold;color:#ffffff"></td><td align="right" style="font-family:${FONT};font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#ffffff">${platform}</td></tr></table></td></tr><tr><td bgcolor="${BRAND.gold}" style="height:4px;line-height:4px;font-size:0">&nbsp;</td></tr><tr><td style="padding:32px;font-family:${FONT};font-size:15px;line-height:1.6;color:${BRAND.ink}"><h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;color:${BRAND.primary}">${escapeHtml(subject)}</h1>${body}</td></tr><tr><td style="padding:20px 32px;border-top:1px solid ${BRAND.page};font-family:${FONT};font-size:12px;line-height:1.5;color:${BRAND.muted}">${platform}<br>Este es un aviso automático; no respondas a este correo.</td></tr></table></td></tr></table></body></html>`;
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
	`«${course.title}», organizada por ${course.dependencyName} (${MODALITY_LABELS[course.modality].toLowerCase()}).`;

const courseUrl = (context: RenderContext, course: NotifiedCourse) =>
	`${context.appUrl}/dashboard/mis-capacitaciones/${course.documentId}`;

/**
 * Las plantillas fijas de §6.12. Puras: el mismo evento produce siempre el
 * mismo correo, y ninguna lleva credenciales.
 */
export const renderNotification = (
	event: NotificationEvent,
	context: RenderContext,
): RenderedEmail => {
	const greeting: Block = { kind: "paragraph", text: greetingOf(event.to) };
	const build = (subject: string, blocks: Block[]): RenderedEmail => ({
		subject,
		text: toText(blocks),
		html: toHtml(subject, blocks, context),
	});

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
			return build(
				event.fromDependency
					? "Cambiaste de dependencia"
					: "Te asignaron a una dependencia",
				[
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
				],
			);

		case "COURSE_INVITATION":
			return build(`Invitación a la capacitación «${event.course.title}»`, [
				greeting,
				{
					kind: "paragraph",
					text: `Te invitaron a la capacitación ${courseSummary(event.course)} Invitar no aparta lugar: acepta la invitación para inscribirte.`,
				},
				{ kind: "list", items: sessionItems(event.sessions) },
				{
					kind: "action",
					label: "Responder la invitación",
					url: courseUrl(context, event.course),
				},
			]);

		case "ENROLLMENT_CONFIRMED":
			return build(`Inscripción confirmada: «${event.course.title}»`, [
				greeting,
				{
					kind: "paragraph",
					text: `Quedaste inscrito en la capacitación ${courseSummary(event.course)}`,
				},
				{ kind: "list", items: sessionItems(event.sessions) },
				{
					kind: "action",
					label: "Ver la capacitación",
					url: courseUrl(context, event.course),
				},
			]);

		case "ENROLLMENT_ASSIGNED":
			return build(`Te asignaron a la capacitación «${event.course.title}»`, [
				greeting,
				{
					kind: "paragraph",
					text: `Tu dependencia te inscribió en la capacitación ${courseSummary(event.course)}`,
				},
				{ kind: "list", items: sessionItems(event.sessions) },
				{
					kind: "action",
					label: "Ver la capacitación",
					url: courseUrl(context, event.course),
				},
			]);

		case "COURSE_UPDATED":
			return build(`Cambios en la capacitación «${event.course.title}»`, [
				greeting,
				{
					kind: "paragraph",
					text: `Cambiaron las sesiones, la sede o el enlace de la capacitación ${courseSummary(event.course)} Así quedan:`,
				},
				{ kind: "list", items: sessionItems(event.sessions) },
				{
					kind: "action",
					label: "Ver la capacitación",
					url: courseUrl(context, event.course),
				},
			]);

		case "COURSE_CANCELLED":
			return build(`Capacitación cancelada: «${event.course.title}»`, [
				greeting,
				{
					kind: "paragraph",
					text: `Se canceló la capacitación ${courseSummary(event.course)} Ya no se impartirá.`,
				},
				{
					kind: "action",
					label: "Ver otras capacitaciones disponibles",
					url: `${context.appUrl}/dashboard/catalogo-de-capacitaciones`,
				},
			]);

		case "ENROLLMENT_REMOVED":
			return build(`Baja de la capacitación «${event.course.title}»`, [
				greeting,
				{
					kind: "paragraph",
					text: `Quien organiza la capacitación ${courseSummary(event.course)} te dio de baja. Ya no estás inscrito y tu lugar quedó libre.`,
				},
				{
					kind: "action",
					label: "Ver otras capacitaciones disponibles",
					url: `${context.appUrl}/dashboard/catalogo-de-capacitaciones`,
				},
			]);

		case "CERTIFICATE_ISSUED":
			return build(`Tu certificado de «${event.course.title}» está listo`, [
				greeting,
				{
					kind: "paragraph",
					text: `Acreditaste la capacitación «${event.course.title}», organizada por ${event.course.dependencyName}, y se emitió tu certificado con el folio ${event.folio}.`,
				},
				...(event.message
					? [{ kind: "paragraph", text: event.message } satisfies Block]
					: []),
				event.downloadable
					? {
							kind: "action",
							label: "Ver mis certificados",
							url: `${context.appUrl}/dashboard/mis-certificados`,
						}
					: {
							kind: "paragraph",
							text: "La dependencia organizadora te lo entregará. Puedes consultarlo en «Mis certificados».",
						},
			]);

		default: {
			const exhaustive: never = event;
			return exhaustive;
		}
	}
};
