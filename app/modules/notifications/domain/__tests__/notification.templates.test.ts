import { describe, expect, test } from "vitest";
import { zonedInputToUtc } from "@/lib/date-utils";
import { renderNotification } from "../notification.templates";
import type { NotificationEvent } from "../notification.types";

const APP_URL = "https://capacitacion.example.gob.mx";
const to = {
	email: "diana@instituto.gob.mx",
	firstName: "Diana",
	lastName: "Sánchez",
};
const course = {
	documentId: "c-1",
	title: "Seguridad en obra",
	dependencyName: "Obras Públicas",
	modality: "HYBRID" as const,
};
const sessions = [
	{
		startsAt: zonedInputToUtc("2026-07-10", "09:00"),
		endsAt: zonedInputToUtc("2026-07-10", "12:00"),
		venue: "Aula 2",
		link: "https://meet.example.com/x",
	},
	{
		startsAt: zonedInputToUtc("2026-11-20", "09:00"),
		endsAt: zonedInputToUtc("2026-11-20", "12:00"),
		venue: null,
		link: null,
	},
];

const ALL_EVENTS: NotificationEvent[] = [
	{ template: "ACCOUNT_CREATED", to },
	{ template: "PASSWORD_RESET", to },
	{
		template: "DEPENDENCY_CHANGED",
		to,
		fromDependency: "Obras Públicas",
		toDependency: "Desarrollo Social",
	},
	{ template: "COURSE_INVITATION", to, course, sessions },
	{ template: "ENROLLMENT_CONFIRMED", to, course, sessions },
	{ template: "ENROLLMENT_ASSIGNED", to, course, sessions },
	{ template: "COURSE_UPDATED", to, course, sessions },
	{ template: "COURSE_CANCELLED", to, course },
];

const render = (event: NotificationEvent) =>
	renderNotification(event, { appUrl: APP_URL });

describe("renderNotification", () => {
	test("cada plantilla produce asunto, texto y HTML con el saludo", () => {
		for (const event of ALL_EVENTS) {
			const email = render(event);

			expect(email.subject.length).toBeGreaterThan(0);
			expect(email.text).toContain("Hola, Diana Sánchez:");
			expect(email.html).toContain("<!doctype html>");
		}
	});

	test("ningún aviso de cuenta incluye una contraseña", () => {
		for (const event of ALL_EVENTS.slice(0, 3)) {
			const { text } = render(event);

			expect(text).not.toMatch(/contraseña\s*:\s*\S/i);
		}
	});

	test("las horas salen en la zona del instituto, en verano e invierno", () => {
		const { text } = render(ALL_EVENTS[4]);

		expect(text).toContain("09:00–12:00");
		expect(text).not.toContain("16:00");
		expect(text).not.toContain("17:00");
		expect(text).toContain("Sede: Aula 2 · Enlace: https://meet.example.com/x");
	});

	test("escapa lo capturado en el HTML y no en el texto", () => {
		const hostile = { ...course, title: '<script>alert("x")</script>' };
		const email = render({ template: "COURSE_CANCELLED", to, course: hostile });

		expect(email.html).not.toContain("<script>");
		expect(email.html).toContain("&lt;script&gt;");
		expect(email.text).toContain('<script>alert("x")</script>');
	});

	test("los enlaces usan el origen configurado", () => {
		expect(render(ALL_EVENTS[4]).text).toContain(
			`${APP_URL}/dashboard/cursos-disponibles/c-1`,
		);
		expect(render(ALL_EVENTS[3]).text).toContain(
			`${APP_URL}/dashboard/mis-cursos`,
		);
	});

	test("sin nombre, el saludo es genérico", () => {
		const { text } = render({
			template: "PASSWORD_RESET",
			to: { email: "x@y.z", firstName: null, lastName: null },
		});

		expect(text.startsWith("Hola:")).toBe(true);
	});

	test("un curso sin sesiones lo dice en lugar de dejar la lista vacía", () => {
		const { text } = render({
			template: "COURSE_INVITATION",
			to,
			course,
			sessions: [],
		});

		expect(text).toContain("Sin sesiones programadas por ahora.");
	});

	describe("CERTIFICATE_ISSUED", () => {
		const issued = (
			overrides: Partial<{
				downloadable: boolean;
				message: string | null;
			}> = {},
		) =>
			render({
				template: "CERTIFICATE_ISSUED",
				to,
				course: {
					title: "Primeros auxilios",
					dependencyName: "Secretaría de Obras Públicas",
				},
				folio: "2026-0001",
				downloadable: true,
				message: null,
				...overrides,
			});

		test("dice el curso y el folio, y lleva a «Mis certificados»", () => {
			const { subject, text } = issued();

			expect(subject).toBe("Tu certificado de «Primeros auxilios» está listo");
			expect(text).toContain("2026-0001");
			expect(text).toContain(`${APP_URL}/dashboard/mis-certificados`);
		});

		test("el mensaje del curso va como párrafo, escapado en el HTML", () => {
			const { text, html } = issued({
				message: '<img src=x onerror="alert(1)"> ¡Felicidades!',
			});

			expect(text).toContain("¡Felicidades!");
			expect(html).not.toContain("<img src=x");
			expect(html).toContain("&lt;img src=x");
		});

		test("con la descarga apagada dice quién lo entrega y no ofrece el botón", () => {
			const { text, html } = issued({ downloadable: false });

			expect(text).toContain("La dependencia organizadora te lo entregará");
			expect(html).not.toContain("Ver mis certificados");
		});
	});
});
