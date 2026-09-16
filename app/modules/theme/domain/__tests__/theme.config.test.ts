import { describe, expect, test } from "vitest";
import { DEFAULT_THEME_TOKENS, THEME_PRESETS } from "../theme.config";
import {
	CONTRAST_MINIMUM,
	type ContrastResult,
	evaluateContrast,
	THEME_VARIANTS,
} from "../theme.rules";

/**
 * Los presets son la RED DE SEGURIDAD de toda la feature: lo que queda para
 * volver cuando un tema publicado sale mal, y el ejemplo del que parte cualquier
 * admin al duplicar. La documentación los describe así, y sin embargo ninguno
 * pasaba el panel de contraste que la propia aplicación le enseña a quien los
 * edita.
 *
 * Esta prueba es lo que impide que vuelvan a desviarse: si alguien retoca un
 * token de fábrica y deja un par por debajo de su mínimo, falla aquí y no en la
 * pantalla de un cliente.
 */
describe("presets de fábrica · contraste", () => {
	const failing = (results: ContrastResult[]) =>
		results.filter((result) => result.passes === false);

	const describeRow = (result: ContrastResult) =>
		`${result.background}/${result.foreground} = ${result.ratio}:1 (mínimo ${CONTRAST_MINIMUM[result.usage]})`;

	test.each(
		THEME_PRESETS.flatMap((preset) =>
			THEME_VARIANTS.map(
				(variant) => [preset.name, variant, preset.tokens[variant]] as const,
			),
		),
	)("%s · %s cumple su propio panel", (_name, _variant, colors) => {
		expect(failing(evaluateContrast(colors)).map(describeRow)).toEqual([]);
	});

	// El tema base es lo que se sirve sin tema activo y cuando la base de datos no
	// responde con la caché fría: es el único que la plataforma puede pintar sin
	// que nadie lo haya elegido.
	test.each(THEME_VARIANTS)("el tema base cumple en %s", (variant) => {
		expect(failing(evaluateContrast(DEFAULT_THEME_TOKENS[variant]))).toEqual(
			[],
		);
	});

	// Cada par medible tiene que dar un número: un token ilegible en un preset
	// saldría como "sin medir" y se colaría entre los que pasan.
	test.each(THEME_PRESETS.map((preset) => [preset.name, preset] as const))(
		"%s no deja ningún par sin medir",
		(_name, preset) => {
			for (const variant of THEME_VARIANTS) {
				for (const result of evaluateContrast(preset.tokens[variant])) {
					expect(result.ratio).not.toBeNull();
				}
			}
		},
	);
});
