import { afterEach, describe, expect, test, vi } from "vitest";
import type { LogLevel } from "../logger";
import { createConsoleLogger } from "../logger.console";

/** Espía sobre los cuatro métodos de consola que usa el adaptador. */
const spyConsole = () => ({
	log: vi.spyOn(console, "log").mockImplementation(() => {}),
	info: vi.spyOn(console, "info").mockImplementation(() => {}),
	warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
	error: vi.spyOn(console, "error").mockImplementation(() => {}),
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("createConsoleLogger — level threshold", () => {
	test("emits every level at or above the threshold", () => {
		const spies = spyConsole();
		const logger = createConsoleLogger({ level: "warn" });

		logger.debug("d");
		logger.info("i");
		logger.warn("w");
		logger.error("e");

		expect(spies.log).not.toHaveBeenCalled();
		expect(spies.info).not.toHaveBeenCalled();
		expect(spies.warn).toHaveBeenCalledTimes(1);
		expect(spies.error).toHaveBeenCalledTimes(1);
	});

	test("at level debug everything is emitted", () => {
		const spies = spyConsole();
		const logger = createConsoleLogger({ level: "debug" });

		logger.debug("d");
		logger.info("i");

		expect(spies.log).toHaveBeenCalledTimes(1);
		expect(spies.info).toHaveBeenCalledTimes(1);
	});

	// `console.debug` va a un canal que muchos runtimes ocultan por defecto; el
	// adaptador usa console.log a propósito para que el nivel más verboso se vea.
	test("debug goes through console.log, not console.debug", () => {
		const spies = spyConsole();

		createConsoleLogger({ level: "debug" }).debug("mensaje");

		expect(spies.log).toHaveBeenCalledWith("[debug] mensaje");
	});

	test("each other level goes through its own console method", () => {
		const spies = spyConsole();
		const logger = createConsoleLogger({ level: "debug" });

		logger.info("i");
		logger.warn("w");
		logger.error("e");

		expect(spies.info).toHaveBeenCalledWith("[info] i");
		expect(spies.warn).toHaveBeenCalledWith("[warn] w");
		expect(spies.error).toHaveBeenCalledWith("[error] e");
	});
});

describe("createConsoleLogger — payload", () => {
	test("omits the suffix entirely when there is no data", () => {
		const spies = spyConsole();

		createConsoleLogger({ level: "info" }).info("sin datos");

		expect(spies.info).toHaveBeenCalledWith("[info] sin datos");
	});

	test("appends the data as JSON", () => {
		const spies = spyConsole();

		createConsoleLogger({ level: "info" }).info("con datos", { userId: 7 });

		expect(spies.info).toHaveBeenCalledWith('[info] con datos {"userId":7}');
	});

	test("merges the bindings with the entry data", () => {
		const spies = spyConsole();

		createConsoleLogger({ level: "info", bindings: { module: "auth" } }).info(
			"x",
			{ userId: 7 },
		);

		expect(spies.info).toHaveBeenCalledWith(
			'[info] x {"module":"auth","userId":7}',
		);
	});

	test("the entry data wins over a binding with the same key", () => {
		const spies = spyConsole();

		createConsoleLogger({ level: "info", bindings: { module: "auth" } }).info(
			"x",
			{ module: "users" },
		);

		expect(spies.info).toHaveBeenCalledWith('[info] x {"module":"users"}');
	});
});

describe("createConsoleLogger — child", () => {
	test("accumulates bindings and keeps the level", () => {
		const spies = spyConsole();

		createConsoleLogger({ level: "info", bindings: { app: "api" } })
			.child({ module: "auth" })
			.child({ requestId: "r-1" })
			.info("x");

		expect(spies.info).toHaveBeenCalledWith(
			'[info] x {"app":"api","module":"auth","requestId":"r-1"}',
		);
	});

	test("a child does not mutate its parent's bindings", () => {
		const spies = spyConsole();
		const parent = createConsoleLogger({ level: "info" });

		parent.child({ module: "auth" });
		parent.info("x");

		expect(spies.info).toHaveBeenCalledWith("[info] x");
	});

	test("the child inherits the threshold", () => {
		const spies = spyConsole();

		createConsoleLogger({ level: "warn" }).child({ m: 1 }).info("x");

		expect(spies.info).not.toHaveBeenCalled();
	});
});

describe("createConsoleLogger — redaction", () => {
	// La invariante de seguridad del adaptador: un log es texto que acaba en un
	// fichero, en stdout de un contenedor y en un agregador de terceros. Un token
	// o una contraseña ahí es una filtración con vida propia.
	test("redacts any key that looks sensitive", () => {
		const spies = spyConsole();

		createConsoleLogger({ level: "info" }).info("x", {
			accessToken: "abc",
			Cookie: "s=1",
			password: "hunter2",
			SECRET: "s",
			authorization: "Bearer x",
			userId: 7,
		});

		const [line] = spies.info.mock.calls[0];
		expect(line).not.toContain("hunter2");
		expect(line).not.toContain("Bearer x");
		expect(line).toContain('"accessToken":"[REDACTED]"');
		expect(line).toContain('"Cookie":"[REDACTED]"');
		expect(line).toContain('"password":"[REDACTED]"');
		expect(line).toContain('"SECRET":"[REDACTED]"');
		expect(line).toContain('"authorization":"[REDACTED]"');
		expect(line).toContain('"userId":7');
	});

	// Recursiva: un secreto escondido dos niveles abajo se filtraría igual.
	test("recurses into nested plain objects", () => {
		const spies = spyConsole();

		createConsoleLogger({ level: "info" }).info("x", {
			session: { refreshToken: "raw", id: "s-1" },
		});

		expect(spies.info).toHaveBeenCalledWith(
			'[info] x {"session":{"refreshToken":"[REDACTED]","id":"s-1"}}',
		);
	});

	test("redacts a sensitive key even when its value is an object", () => {
		const spies = spyConsole();

		createConsoleLogger({ level: "info" }).info("x", {
			token: { raw: "abc" },
		});

		expect(spies.info).toHaveBeenCalledWith('[info] x {"token":"[REDACTED]"}');
	});

	// Los arrays no se recorren: es una limitación conocida del adaptador, y se
	// deja fijada para que un cambio de comportamiento sea deliberado.
	test("does not walk into arrays", () => {
		const spies = spyConsole();

		createConsoleLogger({ level: "info" }).info("x", {
			keys: [{ password: "hunter2" }],
		});

		expect(spies.info).toHaveBeenCalledWith(
			'[info] x {"keys":[{"password":"hunter2"}]}',
		);
	});

	test("leaves a payload with no sensitive keys untouched", () => {
		const spies = spyConsole();

		createConsoleLogger({ level: "info" }).info("x", { userId: 7, count: 2 });

		expect(spies.info).toHaveBeenCalledWith('[info] x {"userId":7,"count":2}');
	});
});

describe("createConsoleLogger — level ordering", () => {
	test("every level is emitted when it is its own threshold", () => {
		const levels: LogLevel[] = ["debug", "info", "warn", "error"];

		for (const level of levels) {
			const spies = spyConsole();
			createConsoleLogger({ level })[level]("x");

			const spy = level === "debug" ? spies.log : spies[level];
			expect(spy).toHaveBeenCalledTimes(1);
			vi.restoreAllMocks();
		}
	});
});
