// Fronteras de arquitectura (AGENTS.md "Inyeccion de dependencias", docs/reglas.md §4, §11 y §16).
// Se ejecuta con `bun run lint:arch` y en el pre-commit.

const TESTS = "/__tests__/";

// Un composition root por runtime (reglas §11.1): servidor HTTP, worker de colas y scripts de CLI.
// Cada test tambien lo es: arma el sujeto bajo prueba con sus dobles, incluidos los adaptadores en memoria.
const COMPOSITION_ROOTS = [
	"^app/shared/di/(container|job-handlers)\\.server\\.ts$",
	"^app/worker\\.server\\.ts$",
	"^app/root\\.tsx$",
	"^scripts/",
	"^prisma/seed\\.ts$",
	TESTS,
];

const STATEFUL_ADAPTERS = [
	"^app/core/(db|env)\\.server\\.ts$",
	"^app/shared/di/[^/]+\\.server\\.ts$",
	"^app/shared/[^/]+/[^/]+\\.factory(\\.server)?\\.ts$",
	"^app/shared/[^/]+/[^/]+\\.(redis|memory|queued)(\\.server)?\\.ts$",
	"^app/shared/logging/logger\\.console\\.ts$",
	"^app/shared/mail/[^/]+\\.mailer\\.server\\.ts$",
	"^app/shared/storage/((s3|gcs)\\.adapter|url-signer\\.server)\\.ts$",
	"^app/shared/spreadsheet/exceljs\\.[^/]+\\.ts$",
	"^app/shared/queue/(queue\\.(client|processor)|job-failure\\.repository)\\.server\\.ts$",
	"^app/shared/redis/redis\\.client\\.server\\.ts$",
	"^app/shared/time/clock\\.ts$",
];

const FRAMEWORK_LIBS =
	"(^|/)node_modules/(react|react-dom|react-router|@react-router/[^/]+)/";

const IO_LIBS =
	"(^|/)node_modules/(@prisma/[^/]+|awilix|bullmq|ioredis|@aws-sdk/[^/]+|@google-cloud/[^/]+|nodemailer|pg|puppeteer-core|exceljs)/";

const INBOUND_LAYERS = "^app/modules/[^/]+/(routes|components|hooks|utils)/";

/** @type {import("dependency-cruiser").IConfiguration} */
module.exports = {
	forbidden: [
		{
			name: "di-no-service-import",
			severity: "error",
			comment:
				"Un servicio de application/ se resuelve por el cradle (context.<servicio> en loaders/actions, " +
				"`type Dependencies` en otros servicios), nunca por import. Si solo necesitas el contrato, " +
				"usa `import type` del puerto en domain/. (AGENTS.md: Inyeccion de dependencias; reglas §11.5)",
			from: {
				pathNot: [...COMPOSITION_ROOTS, "^app/modules/[^/]+/application/"],
			},
			to: {
				path: "^app/modules/[^/]+/application/",
				dependencyTypesNot: ["type-only"],
			},
		},
		{
			name: "di-no-cross-module-application",
			severity: "error",
			comment:
				"Un caso de uso no importa la implementacion de otro modulo: la declara en `type Dependencies` " +
				'con ICradle["<servicio>"] y la recibe en su factory. Los helpers internos de application/ ' +
				"solo se comparten dentro de su propio modulo. (AGENTS.md: Inyeccion de dependencias)",
			from: { path: "^app/modules/([^/]+)/application/" },
			to: {
				path: "^app/modules/[^/]+/application/",
				pathNot: "^app/modules/$1/application/",
				dependencyTypesNot: ["type-only"],
			},
		},
		{
			name: "di-no-repository-import",
			severity: "error",
			comment:
				"Los repositorios y adaptadores de infrastructure/ solo se instancian en el composition root. " +
				"Un servicio los recibe por `type Dependencies` tipado contra el puerto de domain/. " +
				"(AGENTS.md: Inyeccion de dependencias, punto 2; reglas §11.5)",
			from: {
				pathNot: [...COMPOSITION_ROOTS, "^app/modules/[^/]+/infrastructure/"],
			},
			to: {
				path: "^app/modules/[^/]+/infrastructure/",
				dependencyTypesNot: ["type-only"],
			},
		},
		{
			name: "di-no-cross-module-infrastructure",
			severity: "error",
			comment:
				"Un adaptador de infrastructure/ no importa los de otro modulo; la composicion entre modulos " +
				"ocurre en container.server.ts. (AGENTS.md: Inyeccion de dependencias)",
			from: { path: "^app/modules/([^/]+)/infrastructure/" },
			to: {
				path: "^app/modules/[^/]+/infrastructure/",
				pathNot: "^app/modules/$1/infrastructure/",
				dependencyTypesNot: ["type-only"],
			},
		},
		{
			name: "di-no-stateful-adapter-import",
			severity: "error",
			comment:
				"Prisma, env, logger, Redis, colas, correo, storage y reloj tienen estado o I/O: llegan por el " +
				"cradle (prisma, env, logger, storageProvider, clock...). Solo el composition root importa la " +
				"implementacion concreta. (AGENTS.md: Inyeccion de dependencias, criterio de desempate)",
			from: {
				pathNot: [...COMPOSITION_ROOTS, ...STATEFUL_ADAPTERS, "^app/core/"],
			},
			to: {
				path: STATEFUL_ADAPTERS,
				dependencyTypesNot: ["type-only"],
			},
		},
		{
			name: "domain-is-pure",
			severity: "error",
			comment:
				"domain/ solo contiene tipos, reglas, puertos, mappers, validadores y errores. No depende de " +
				"application, infrastructure, adaptadores de entrada ni archivos server-only. " +
				"(reglas §2 y §4; AGENTS.md: Sufijo .server, punto 2)",
			from: { path: "^app/modules/[^/]+/domain/" },
			to: {
				path: [
					"^app/modules/[^/]+/(application|infrastructure|routes|components|hooks|utils)/",
					"^app/core/",
					"^app/shared/(di|http|components|layout|hooks)/",
					"\\.server\\.tsx?$",
				],
			},
		},
		{
			name: "domain-no-framework",
			severity: "error",
			comment:
				"La logica de negocio no conoce el framework, el ORM ni SDKs de proveedores. (reglas §1, §4.1 y §8.2)",
			from: { path: "^app/modules/[^/]+/domain/" },
			to: { path: [FRAMEWORK_LIBS, IO_LIBS] },
		},
		{
			name: "domain-no-node-core",
			severity: "error",
			comment:
				"domain/ se mantiene agnostico a I/O: los modulos de Node pertenecen a application/ o infrastructure/. " +
				"Los tests si pueden leer fixtures del disco. (AGENTS.md: Sufijo .server, punto 2)",
			from: { path: "^app/modules/[^/]+/domain/", pathNot: TESTS },
			to: { dependencyTypes: ["core"] },
		},
		{
			name: "application-no-inbound",
			severity: "error",
			comment:
				"Un caso de uso no conoce React, React Router ni los adaptadores de entrada (routes, components, " +
				"hooks, utils). Devuelve AppResponse<T>; el adaptador traduce. (reglas §4.1, §10 y §17.2)",
			from: { path: "^app/modules/[^/]+/application/" },
			to: {
				path: [
					FRAMEWORK_LIBS,
					INBOUND_LAYERS,
					"^app/shared/(http|components|layout|hooks)/",
				],
			},
		},
		{
			name: "infrastructure-no-inbound",
			severity: "error",
			comment:
				"infrastructure/ implementa puertos de domain/: no depende de casos de uso ni de adaptadores de " +
				"entrada. (reglas §2 y §4.4)",
			from: { path: "^app/modules/[^/]+/infrastructure/" },
			to: {
				path: [
					"^app/modules/[^/]+/application/",
					INBOUND_LAYERS,
					FRAMEWORK_LIBS,
				],
			},
		},
		{
			name: "orm-only-in-infrastructure",
			severity: "error",
			comment:
				"Prisma, incluidos sus tipos, solo se usa en infrastructure/. El resto del modulo trabaja con " +
				"tipos de domain/. (AGENTS.md: Excepciones permitidas, punto 4; reglas §8.2)",
			from: { path: "^app/modules/[^/]+/(?!infrastructure/)" },
			to: {
				path: [
					"(^|/)node_modules/@prisma/",
					"^app/core/prisma-errors\\.ts$",
					"^app/shared/query/query\\.prisma\\.ts$",
				],
			},
		},
		{
			name: "not-to-unresolvable",
			severity: "error",
			comment:
				"Un import que no resuelve escapa a todas las reglas anteriores. Revisa la ruta o el alias en tsconfig.json.",
			from: {},
			to: {
				couldNotResolve: true,
				pathNot: ["^virtual:", "(^|/)\\+types/"],
			},
		},
	],
	options: {
		doNotFollow: { path: "(^|/)node_modules/" },
		exclude: { path: ["(^|/)\\.react-router/", "^build/"] },
		moduleSystems: ["es6", "cjs"],
		tsPreCompilationDeps: true,
		tsConfig: { fileName: "tsconfig.json" },
		enhancedResolveOptions: {
			exportsFields: ["exports"],
			conditionNames: ["import", "require", "node", "default", "types"],
			mainFields: ["module", "main", "types", "typings"],
			extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".d.ts"],
		},
		skipAnalysisNotInRules: true,
		cache: {
			folder: "node_modules/.cache/dependency-cruiser",
			strategy: "content",
		},
		reporterOptions: {
			text: { highlightFocused: true },
		},
	},
};
