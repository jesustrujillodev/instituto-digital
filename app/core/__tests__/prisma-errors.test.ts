import { Prisma } from "@prisma/client";
import { describe, expect, test } from "vitest";
import { uniqueViolationTarget } from "../prisma-errors";

const p2002 = (meta?: Record<string, unknown>) =>
	new Prisma.PrismaClientKnownRequestError("técnico", {
		code: "P2002",
		clientVersion: "7.9.0",
		meta,
	});

/** La forma real que devuelve `@prisma/adapter-pg`, capturada contra la base. */
const adapterMeta = (constraint: string, fields: string[]) => ({
	modelName: "User",
	driverAdapterError: {
		cause: {
			originalCode: "23505",
			originalMessage: `duplicate key value violates unique constraint "${constraint}"`,
			kind: "UniqueConstraintViolation",
			constraint: { fields },
		},
	},
});

describe("uniqueViolationTarget", () => {
	test("con el adapter, reconoce la columna aunque falte meta.target", () => {
		const target = uniqueViolationTarget(
			p2002(adapterMeta("users_employee_number_key", ["employee_number"])),
		);

		expect(target).toContain("employee_number");
		expect(target).not.toContain("email");
	});

	test("con el adapter, reconoce un índice parcial por su nombre", () => {
		const target = uniqueViolationTarget(
			p2002(adapterMeta("users_one_head_per_dependency", ["dependency_id"])),
		);

		expect(target).toContain("one_head_per_dependency");
	});

	test("sin adapter, lee meta.target como texto o como lista", () => {
		expect(uniqueViolationTarget(p2002({ target: "users_email_key" }))).toBe(
			"users_email_key",
		);
		expect(uniqueViolationTarget(p2002({ target: ["email"] }))).toBe("email");
	});

	test("sin meta devuelve texto vacío", () => {
		expect(uniqueViolationTarget(p2002())).toBe("");
	});
});
