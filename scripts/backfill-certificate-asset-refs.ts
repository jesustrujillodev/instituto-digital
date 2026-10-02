/**
 * Llena `certificate_issues.asset_refs` en las emisiones anteriores a la
 * columna (docs/adr/0030). Idempotente: recalcula desde el snapshot y solo
 * escribe las filas que cambian.
 *
 * Uso:
 *   bun scripts/backfill-certificate-asset-refs.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { env } from "@/core/env.server";
import { toCertificateDesign } from "@/modules/certificates/domain/certificate.mapper";
import { issuedAssetRefsOf } from "@/modules/certificates/domain/design/design.assets";
import { builtinLogoOf } from "@/modules/certificates/domain/design/logos";

const prisma = new PrismaClient({
	adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

const isBuiltinLogo = (logoId: string) => builtinLogoOf(logoId) !== undefined;

const rows = await prisma.certificateIssue.findMany({
	select: { id: true, designSnapshot: true, assetRefs: true },
});

let updated = 0;
let unreadable = 0;
for (const row of rows) {
	const design = toCertificateDesign(row.designSnapshot);
	if (!design) {
		unreadable++;
		continue;
	}
	const refs = issuedAssetRefsOf(design, isBuiltinLogo);
	if (
		JSON.stringify([...refs].sort()) ===
		JSON.stringify([...row.assetRefs].sort())
	) {
		continue;
	}
	await prisma.certificateIssue.update({
		where: { id: row.id },
		data: { assetRefs: refs },
	});
	updated++;
}

console.log(
	`${rows.length} emisiones revisadas · ${updated} actualizadas · ${unreadable} con diseño ilegible`,
);
await prisma.$disconnect();
