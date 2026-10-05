import { afterEach, describe, expect, test, vi } from "vitest";
import {
	buildContentObjectKey,
	buildObjectKey,
	sanitizeFileName,
} from "../object-key";

const NOW = 1_800_000_000_000;

afterEach(() => {
	vi.useRealTimers();
});

const freezeClock = () => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
};

describe("sanitizeFileName", () => {
	test("leaves alphanumerics, dots and dashes untouched", () => {
		expect(sanitizeFileName("foto-2026.v2.png")).toBe("foto-2026.v2.png");
	});

	// El nombre lo elige quien sube el archivo. Si los separadores de ruta
	// sobrevivieran, una key podría escaparse de su prefijo y escribir donde no
	// debe: es path traversal contra el bucket.
	test("strips path separators", () => {
		expect(sanitizeFileName("carpeta/foto.png")).toBe("carpeta_foto.png");
		expect(sanitizeFileName("carpeta\\foto.png")).toBe("carpeta_foto.png");
	});

	test("neutralises a traversal sequence", () => {
		expect(sanitizeFileName("../../etc/passwd")).toBe(".._.._etc_passwd");
	});

	test("replaces spaces, accents and any other character", () => {
		expect(sanitizeFileName("mi foto ñ.png")).toBe("mi_foto__.png");
		expect(sanitizeFileName("a?b*c:d.png")).toBe("a_b_c_d.png");
	});

	test("an empty name stays empty", () => {
		expect(sanitizeFileName("")).toBe("");
	});
});

describe("buildObjectKey", () => {
	test("builds prefix/base-timestamp.ext", () => {
		freezeClock();

		expect(buildObjectKey("profile-photos", "foto.png")).toBe(
			`profile-photos/foto-${NOW}.png`,
		);
	});

	test("sanitises the original name before using it", () => {
		freezeClock();

		expect(buildObjectKey("documents", "../secreto .pdf")).toBe(
			`documents/.._secreto_-${NOW}.pdf`,
		);
	});

	test("appends no extension when the name has none", () => {
		freezeClock();

		expect(buildObjectKey("documents", "README")).toBe(
			`documents/README-${NOW}`,
		);
	});

	// El `dot > 0` está para esto: en ".gitignore" el punto inicial no separa una
	// extensión, es parte del nombre. Tratarlo como extensión dejaría la base vacía
	// y la key sería "documents/-1700000000.gitignore".
	test("treats a leading dot as part of the name, not as an extension", () => {
		freezeClock();

		expect(buildObjectKey("documents", ".gitignore")).toBe(
			`documents/.gitignore-${NOW}`,
		);
	});

	test("uses only the last dot as the extension separator", () => {
		freezeClock();

		expect(buildObjectKey("documents", "informe.v2.pdf")).toBe(
			`documents/informe.v2-${NOW}.pdf`,
		);
	});

	// El timestamp es lo que evita que dos subidas del mismo nombre se pisen.
	test("two uploads of the same name at different instants do not collide", () => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		const first = buildObjectKey("p", "foto.png");

		vi.setSystemTime(NOW + 1000);
		const second = buildObjectKey("p", "foto.png");

		expect(second).not.toBe(first);
	});
});

describe("buildContentObjectKey", () => {
	const DIGEST = "0123456789abcdef0123456789abcdef";

	test("builds prefix/base-digest.ext with the sanitised name", () => {
		expect(buildContentObjectKey("documents", "../mi fondo.pdf", DIGEST)).toBe(
			`documents/.._mi_fondo-${DIGEST}.pdf`,
		);
	});

	// Es lo que evita duplicados: subir o copiar dos veces lo mismo cae en la
	// misma key y el segundo guardado reescribe el objeto en vez de crear otro.
	test("the same bytes land on the same key at any instant", () => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		const first = buildContentObjectKey("p", "fondo.pdf", DIGEST);

		vi.setSystemTime(NOW + 1000);
		expect(buildContentObjectKey("p", "fondo.pdf", DIGEST)).toBe(first);
	});
});
