import { describe, expect, test } from "vitest";
import type { Logger } from "@/shared/logging/logger";
import { RESPONSE_ERROR_CODES } from "@/shared/rules/response.rules";
import type {
	IObjectReferenceSource,
	ObjectReader,
} from "@/shared/storage/object-reference.port";
import { createStorageAccessService } from "../storage-access.service.server";

const silentLogger: Logger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	child: () => silentLogger,
};

const KEY = "documentos/lecciones/curso/leccion/manual-1700000000.pdf";

const readerOf = (role: ObjectReader["role"] = "USER"): ObjectReader => ({
	userId: 7,
	role,
	dependencyId: 3,
	isTrainer: false,
});

const sourceOf = (
	answer: boolean | Error,
	asked: { key: string; reader: ObjectReader }[] = [],
) =>
	({
		canRead: async (key: string, reader: ObjectReader) => {
			asked.push({ key, reader });
			if (answer instanceof Error) throw answer;
			return answer;
		},
	}) as unknown as IObjectReferenceSource;

const serviceOf = (sources: IObjectReferenceSource[]) =>
	createStorageAccessService({
		objectReferenceSources: sources,
		logger: silentLogger,
	});

describe("canRead", () => {
	test("basta con que una fuente lo conceda; se pregunta a todas", async () => {
		const asked: { key: string; reader: ObjectReader }[] = [];
		const reader = readerOf();

		const result = await serviceOf([
			sourceOf(false, asked),
			sourceOf(true, asked),
		]).canRead(KEY, reader);

		expect(result).toMatchObject({ success: true, data: true });
		expect(asked).toEqual([
			{ key: KEY, reader },
			{ key: KEY, reader },
		]);
	});

	// Un huérfano no tiene fuente que lo conceda: es el caso por defecto.
	test("lo que ninguna fuente concede se niega", async () => {
		const result = await serviceOf([sourceOf(false), sourceOf(false)]).canRead(
			KEY,
			readerOf(),
		);

		expect(result).toMatchObject({ success: true, data: false });
	});

	test("SUPERADMIN abre cualquier objeto sin consultar", async () => {
		const asked: { key: string; reader: ObjectReader }[] = [];

		const result = await serviceOf([sourceOf(false, asked)]).canRead(
			KEY,
			readerOf("SUPERADMIN"),
		);

		expect(result).toMatchObject({ success: true, data: true });
		expect(asked).toEqual([]);
	});

	test("si una fuente falla, el fallo sale en el envelope", async () => {
		const result = await serviceOf([
			sourceOf(true),
			sourceOf(new Error("la base no respondió")),
		]).canRead(KEY, readerOf());

		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.code).toBe(RESPONSE_ERROR_CODES.UNEXPECTED);
	});
});
