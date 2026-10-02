/**
 * Logos que viven en el código, no en storage: no se archivan ni se borran, y
 * un certificado que los usa siempre los encuentra.
 */
export const BUILTIN_LOGOS = [
	{
		id: "ayto-blanco",
		name: "Logo blanco",
		path: "/assets/aytoBco.png",
		contentType: "image/png",
		widthPx: 245,
		heightPx: 80,
	},
] as const;
export type BuiltinLogoId = (typeof BUILTIN_LOGOS)[number]["id"];

export const BUILTIN_LOGO_IDS = BUILTIN_LOGOS.map((logo) => logo.id) as [
	BuiltinLogoId,
	...BuiltinLogoId[],
];

export const builtinLogoOf = (id: string) =>
	BUILTIN_LOGOS.find((logo) => logo.id === id);
