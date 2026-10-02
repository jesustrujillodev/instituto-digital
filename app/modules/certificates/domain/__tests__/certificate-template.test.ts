import { describe, expect, test } from "vitest";
import type { AuthContext } from "@/modules/auth/domain/auth.types";
import { toProxyRef } from "@/shared/storage/public-url";
import {
	canSeeTemplate,
	canWriteTemplate,
	ownershipForNew,
	templateVisibilityOf,
} from "../certificate-template.access";
import {
	isOwnTemplateAssetRef,
	rewriteAssetRefs,
	templateAssetFolderOf,
	templateOfAssetKey,
	withoutSignatures,
} from "../certificate-template.rules";
import { PRESETS } from "../design/design.presets";
import type { DesignElement } from "../design/design-v2.schema";

const TEMPLATE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const actor = (overrides: Partial<AuthContext> = {}) => ({
	userId: 9,
	role: "DEPENDENCY_HEAD" as AuthContext["role"],
	dependencyId: 3,
	isTrainer: false,
	...overrides,
});

const institutional = { scope: "INSTITUTIONAL" as const, dependencyId: null };
const own = { scope: "DEPENDENCY" as const, dependencyId: 3 };
const foreign = { scope: "DEPENDENCY" as const, dependencyId: 4 };

describe("acceso a la biblioteca", () => {
	test("la plataforma ve y administra todo; crea institucionales", () => {
		const admin = actor({ role: "SUPERADMIN", dependencyId: null });
		expect(templateVisibilityOf(admin)).toEqual({ kind: "all" });
		for (const template of [institutional, own, foreign]) {
			expect(canSeeTemplate(admin, template)).toBe(true);
			expect(canWriteTemplate(admin, template)).toBe(true);
		}
		expect(ownershipForNew(admin)).toEqual(institutional);
	});

	test("titular: ve institucionales y las suyas; solo administra las suyas", () => {
		const head = actor();
		expect(canSeeTemplate(head, institutional)).toBe(true);
		expect(canSeeTemplate(head, own)).toBe(true);
		expect(canSeeTemplate(head, foreign)).toBe(false);
		expect(canWriteTemplate(head, institutional)).toBe(false);
		expect(canWriteTemplate(head, own)).toBe(true);
		expect(canWriteTemplate(head, foreign)).toBe(false);
		expect(ownershipForNew(head)).toEqual(own);
	});

	test("capacitador interno: ve, aplica, no administra ni crea", () => {
		const trainer = actor({ role: "USER", isTrainer: true });
		expect(canSeeTemplate(trainer, own)).toBe(true);
		expect(canWriteTemplate(trainer, own)).toBe(false);
		expect(ownershipForNew(trainer)).toBeNull();
	});

	test("quien no administra cursos no ve la biblioteca", () => {
		const learner = actor({ role: "USER", isTrainer: false });
		expect(templateVisibilityOf(learner)).toEqual({ kind: "none" });
		expect(canSeeTemplate(learner, institutional)).toBe(false);
		expect(ownershipForNew(learner)).toBeNull();
	});
});

describe("recursos de una plantilla", () => {
	test("su carpeta y de quién es cada key", () => {
		expect(templateAssetFolderOf(TEMPLATE, "image")).toBe(
			`documentos/plantillas-certificado/${TEMPLATE}/imagenes`,
		);
		expect(
			templateOfAssetKey(
				`documentos/plantillas-certificado/${TEMPLATE}/fondos/a.pdf`,
			),
		).toBe(TEMPLATE);
		expect(
			templateOfAssetKey(
				`documentos/plantillas-certificado/${TEMPLATE}/otra/a.pdf`,
			),
		).toBeNull();
		expect(
			templateOfAssetKey(
				`documentos/plantillas-certificado/${TEMPLATE}/imagenes/../a.png`,
			),
		).toBeNull();
		expect(
			templateOfAssetKey("documentos/certificados/x/imagenes/a.png"),
		).toBeNull();
	});

	test("solo acepta lo subido a ella", () => {
		const ref = toProxyRef(
			`documentos/plantillas-certificado/${TEMPLATE}/imagenes/a.png`,
		);
		expect(isOwnTemplateAssetRef(ref, TEMPLATE)).toBe(true);
		expect(isOwnTemplateAssetRef(ref, "otra")).toBe(false);
		expect(isOwnTemplateAssetRef("https://x/a.png", TEMPLATE)).toBe(false);
	});
});

describe("operaciones sobre el diseño", () => {
	const logo = PRESETS.institucional.elements.find(
		(e) => e.id === "logo",
	) as DesignElement;
	const signature = {
		...logo,
		id: "firma",
		src: { kind: "asset", ref: "/api/storage?key=f", role: "signature" },
	} as DesignElement;
	const image = {
		...logo,
		id: "sello",
		src: { kind: "asset", ref: "/api/storage?key=s", role: "image" },
	} as DesignElement;
	const design = {
		...PRESETS.institucional,
		background: {
			kind: "pdf" as const,
			pdfRef: "/api/storage?key=p",
			rasterRef: "/api/storage?key=r",
			rasterDpi: 300,
			widthPt: 841.89,
			heightPt: 595.28,
		},
		elements: [...PRESETS.institucional.elements, signature, image],
	};

	test("quita las firmas y deja las demás imágenes", () => {
		const ids = withoutSignatures(design).elements.map((e) => e.id);
		expect(ids).not.toContain("firma");
		expect(ids).toContain("sello");
	});

	test("cambia las referencias por las de sus copias", () => {
		const next = rewriteAssetRefs(
			design,
			new Map([
				["/api/storage?key=s", "/api/storage?key=s2"],
				["/api/storage?key=p", "/api/storage?key=p2"],
			]),
		);
		expect(next.elements.find((e) => e.id === "sello")).toMatchObject({
			src: { ref: "/api/storage?key=s2" },
		});
		expect(next.background).toMatchObject({
			pdfRef: "/api/storage?key=p2",
			rasterRef: "/api/storage?key=r",
		});
		expect(rewriteAssetRefs(PRESETS.marco, new Map()).background).toEqual(
			PRESETS.marco.background,
		);
	});
});
