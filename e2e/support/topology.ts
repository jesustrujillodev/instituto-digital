import type { TestInfo } from "@playwright/test";

/** Las dos formas de desplegar la plataforma, levantadas por compose.test.yml. */
export const TOPOLOGIES = [
	{
		name: "queued",
		baseURL: "https://queued.idc.test",
	},
	{
		name: "inline",
		baseURL: "https://inline.idc.test",
	},
] as const;

export type Topology = (typeof TOPOLOGIES)[number];

export const topologyOf = (testInfo: TestInfo): Topology => {
	const name = testInfo.project.metadata.topology;
	const topology = TOPOLOGIES.find((candidate) => candidate.name === name);
	if (!topology)
		throw new Error(`Proyecto sin topología: ${testInfo.project.name}`);
	return topology;
};

/** Cuentas del seed (prisma/seed.ts). */
export const SEED_PASSWORD = "Password123!";
export const SUPERADMIN_EMAIL = "super@instituto.gob.mx";

export const storageStatePath = (topology: Topology) =>
	`e2e/.auth/${topology.name}-superadmin.json`;
