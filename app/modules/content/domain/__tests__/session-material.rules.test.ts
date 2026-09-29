import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
	SESSION_MATERIAL_MAX_PER_SESSION,
	SESSION_MATERIAL_PREFIX,
} from "../content.config";
import { CONTENT_ERROR_CODES } from "../content.errors";
import {
	assertSessionMaterialLimit,
	assertSessionMaterialsEditable,
	createSessionMaterialRule,
	isSessionMaterialAvailable,
	sessionMaterialCourseWhere,
} from "../session-material.rules";
import { actorOf } from "./content.fixtures";

const SESSION = "33333333-3333-4333-8333-333333333333";
const codeOf = (code: string) => expect.objectContaining({ code });

describe("quién administra el material de sesiones", () => {
	test("el titular lo administra en su dependencia", () => {
		expect(sessionMaterialCourseWhere(actorOf())?.OR).toContainEqual({
			dependencyId: 3,
		});
	});

	// El capacitador sube la presentación la víspera sin pasar por el alta.
	test("el capacitador lo administra en los cursos que imparte", () => {
		const where = sessionMaterialCourseWhere(
			actorOf({ role: "USER", dependencyId: null, isTrainer: true }),
		);

		expect(where?.OR).toContainEqual({
			OR: [{ trainers: { some: { userId: 99 } } }],
		});
	});

	test("quien no administra ni imparte no alcanza ningún curso", () => {
		expect(
			sessionMaterialCourseWhere(
				actorOf({ role: "USER", dependencyId: null, isTrainer: false }),
			),
		).toBeNull();
	});
});

describe("cuándo lo ve el participante", () => {
	const startsAt = new Date("2026-10-16T16:00:00.000Z");

	test("sin la casilla, desde que se publica", () => {
		expect(
			isSessionMaterialAvailable(
				{ availableFromSession: false },
				startsAt,
				new Date("2026-10-01T00:00:00.000Z"),
			),
		).toBe(true);
	});

	test("con la casilla, hasta que empieza la sesión", () => {
		const material = { availableFromSession: true };

		expect(
			isSessionMaterialAvailable(
				material,
				startsAt,
				new Date("2026-10-16T15:59:00.000Z"),
			),
		).toBe(false);
		expect(isSessionMaterialAvailable(material, startsAt, startsAt)).toBe(true);
	});
});

describe("reglas de escritura", () => {
	test.each(["DRAFT", "PUBLISHED"] as const)(
		"un curso %s admite cambios en su material",
		(status) => {
			expect(() => assertSessionMaterialsEditable(status)).not.toThrow();
		},
	);

	test.each(["FINISHED", "CANCELLED"] as const)(
		"un curso %s conserva su material como está",
		(status) => {
			expect(() => assertSessionMaterialsEditable(status)).toThrowError(
				codeOf(CONTENT_ERROR_CODES.SESSION_MATERIALS_LOCKED),
			);
		},
	);

	test("una sesión llena no admite otro material", () => {
		expect(() =>
			assertSessionMaterialLimit(SESSION_MATERIAL_MAX_PER_SESSION - 1),
		).not.toThrow();
		expect(() =>
			assertSessionMaterialLimit(SESSION_MATERIAL_MAX_PER_SESSION),
		).toThrowError(
			expect.objectContaining({
				code: CONTENT_ERROR_CODES.TOO_MANY_SESSION_MATERIALS,
				details: { limit: SESSION_MATERIAL_MAX_PER_SESSION },
			}),
		);
	});
});

describe("contrato de alta", () => {
	const fileOf = (key: string) => ({
		sessionDocumentId: SESSION,
		type: "FILE",
		title: "Presentación",
		availableFromSession: false,
		key,
		fileName: "presentacion.pdf",
		mimeType: "application/pdf",
	});

	test("acepta un archivo subido por este flujo", () => {
		expect(
			v.safeParse(
				createSessionMaterialRule,
				fileOf(`${SESSION_MATERIAL_PREFIX}/presentacion-1.pdf`),
			).success,
		).toBe(true);
	});

	// Sin esto, quien conociera la key de un objeto privado de otro módulo podría
	// colgarlo de una sesión y volver a servirlo bajo su propio permiso.
	test("rechaza una key que no emitió el material de sesiones", () => {
		expect(
			v.safeParse(
				createSessionMaterialRule,
				fileOf("documentos/lecciones/manual-1.pdf"),
			).success,
		).toBe(false);
	});

	test("un enlace debe ser http(s)", () => {
		const linkOf = (externalUrl: string) => ({
			sessionDocumentId: SESSION,
			type: "LINK",
			title: "Formulario",
			availableFromSession: false,
			externalUrl,
		});

		expect(
			v.safeParse(createSessionMaterialRule, linkOf("https://forms.example/x"))
				.success,
		).toBe(true);
		expect(
			v.safeParse(createSessionMaterialRule, linkOf("javascript:alert(1)"))
				.success,
		).toBe(false);
	});
});
