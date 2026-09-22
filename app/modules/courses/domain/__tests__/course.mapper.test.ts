import { describe, expect, test } from "vitest";
import { toDetail, toSummary } from "../course.mapper";

const baseRow = {
	id: 1,
	documentId: "0b6c6d8e-1c2a-4f3b-9d4e-5f6a7b8c9d0e",
	dependencyId: 10,
	title: "Ofimática básica",
	coverImageUrl: null,
	modality: "IN_PERSON" as const,
	format: "SCHEDULED" as const,
	completionRule: "ATTENDANCE" as const,
	access: "PUBLIC" as const,
	status: "DRAFT" as const,
	capacity: 20,
	createdAt: new Date("2026-09-01T00:00:00.000Z"),
	updatedAt: new Date("2026-09-02T00:00:00.000Z"),
};

describe("toSummary", () => {
	test("aplana el join, los conteos y el rango de sesiones", () => {
		const summary = toSummary({
			...baseRow,
			dependency: { name: "Recursos Humanos" },
			createdBy: { firstName: "Ana", lastName: "López" },
			_count: { sessions: 3, trainers: 2 },
			sessions: [
				{ startsAt: new Date("2026-10-05T16:00:00.000Z") },
				{ startsAt: new Date("2026-10-06T16:00:00.000Z") },
				{ startsAt: new Date("2026-10-07T16:00:00.000Z") },
			],
		});

		expect(summary).toMatchObject({
			dependencyName: "Recursos Humanos",
			createdByName: "Ana López",
			sessionCount: 3,
			trainerCount: 2,
			firstSessionAt: new Date("2026-10-05T16:00:00.000Z"),
			lastSessionAt: new Date("2026-10-07T16:00:00.000Z"),
		});
	});

	// Un borrador recién creado no tiene sesiones: el rango es nulo, no una
	// fecha inventada.
	test("un curso sin sesiones no inventa fechas", () => {
		const summary = toSummary({
			...baseRow,
			dependency: { name: "Recursos Humanos" },
			createdBy: null,
			_count: { sessions: 0, trainers: 0 },
			sessions: [],
		});

		expect(summary.firstSessionAt).toBeNull();
		expect(summary.lastSessionAt).toBeNull();
		expect(summary.createdByName).toBeNull();
	});

	test("una cuenta sin nombre capturado no produce una cadena vacía", () => {
		expect(
			toSummary({
				...baseRow,
				dependency: { name: "Recursos Humanos" },
				createdBy: { firstName: null, lastName: null },
				_count: { sessions: 0, trainers: 0 },
			}).createdByName,
		).toBeNull();
	});
});

const detailRow = {
	...baseRow,
	description: "Introducción a hojas de cálculo",
	enrollmentDeadline: null,
	minAttendance: 80,
	qrOpensBeforeMinutes: 15,
	qrClosesAfterMinutes: 15,
	requiresEvaluation: true,
	planLine: null,
	publishedAt: null,
	cancelledAt: null,
	dependency: { name: "Recursos Humanos" },
	createdBy: { firstName: "Ana", lastName: "López" },
	_count: { sessions: 1, trainers: 2 },
	sessions: [
		{
			id: 5,
			documentId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
			startsAt: new Date("2026-10-05T16:00:00.000Z"),
			endsAt: new Date("2026-10-05T20:00:00.000Z"),
			venue: "Sala A",
			link: null,
		},
	],
};

const trainerRow = (
	overrides: Partial<{
		archivedAt: Date | null;
		profileArchivedAt: Date | null;
	}> = {},
) => ({
	user: {
		documentId: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e",
		firstName: "Luis",
		lastName: "Ramírez",
		email: "luis@example.mx",
		archivedAt: overrides.archivedAt ?? null,
		trainerProfile: {
			specialty: "Ofimática",
			archivedAt: overrides.profileArchivedAt ?? null,
		},
	},
});

describe("toDetail", () => {
	test("proyecta sesiones, capacitadores y audiencia", () => {
		const detail = toDetail({
			...detailRow,
			trainers: [trainerRow()],
			dependencyAudience: [
				{ dependency: { documentId: "dep-1", name: "Recursos Humanos" } },
			],
			groupAudience: [{ group: { documentId: "grp-1", name: "Inducción" } }],
		});

		expect(detail.sessions).toHaveLength(1);
		expect(detail.sessions[0]).toMatchObject({ venue: "Sala A", link: null });
		expect(detail.trainers[0]).toMatchObject({
			specialty: "Ofimática",
			isActive: true,
		});
		expect(detail.audience).toEqual({
			dependencies: [{ documentId: "dep-1", name: "Recursos Humanos" }],
			groups: [{ documentId: "grp-1", name: "Inducción" }],
		});
	});

	// `isActive` se deriva de la relación y no de una columna: es lo que mira
	// `assertPublishable` para no publicar un curso que nadie puede impartir.
	test.each([
		["el perfil archivado", { profileArchivedAt: new Date() }],
		["la cuenta archivada", { archivedAt: new Date() }],
	])("%s deja al capacitador inactivo", (_case, overrides) => {
		const detail = toDetail({
			...detailRow,
			trainers: [trainerRow(overrides)],
			dependencyAudience: [],
			groupAudience: [],
		});

		expect(detail.trainers[0].isActive).toBe(false);
	});

	test("un curso sin audiencia la proyecta vacía, no ausente", () => {
		const detail = toDetail({ ...detailRow, trainers: [] });

		expect(detail.audience).toEqual({ dependencies: [], groups: [] });
		expect(detail.trainers).toEqual([]);
	});
});

describe("portada", () => {
	test("la referencia persistida viaja al resumen tal cual", () => {
		// Sin resolver: quien la pinta decide si va por el CDN o por el proxy.
		const summary = toSummary({
			...baseRow,
			coverImageUrl: "/api/storage?key=media/portadas/a.webp",
			dependency: { name: "RH" },
			_count: { sessions: 0, trainers: 0 },
			sessions: [],
		});

		expect(summary.coverImageUrl).toBe(
			"/api/storage?key=media/portadas/a.webp",
		);
	});
});
