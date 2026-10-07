import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaPg } from "@prisma/adapter-pg";
import { type Prisma, PrismaClient } from "@prisma/client";
import { createAfterCommitQueue } from "./after-commit.server";
import { env } from "./env.server";

const transactionContext = new AsyncLocalStorage<PrismaClient>();
const afterCommitQueue = createAfterCommitQueue();

/**
 * Cada transacción retiene su conexión de principio a fin, así que el tope del
 * pool decide cuántos guardados caben a la vez por proceso
 * (docs/database/00-pool-de-conexiones.md). La espera por conexión se acota
 * igual para consultas sueltas y para transacciones: sin tope, una consulta
 * suelta esperaría para siempre con el pool lleno.
 */
const adapter = new PrismaPg({
	connectionString: env.DATABASE_URL,
	max: env.DATABASE_POOL_MAX,
	connectionTimeoutMillis: env.DATABASE_POOL_WAIT_MS,
});

/**
 * Las transacciones que cierran un curso (avance, completado, créditos,
 * certificado y su aviso) encadenan decenas de consultas por una sola
 * conexión, y cada una paga un viaje completo a la base. Contra una base
 * remota eso rebasa los 5 s por defecto de Prisma sin que haya nada mal en la
 * operación. El tope se sube; la espera por conexión se deja como estaba.
 */
const TRANSACTION_TIMEOUT_MS = 20_000;

/**
 * Solo en desarrollo: cuenta las consultas de cada petición para medir cuántos
 * viajes a la base paga una pantalla. Apagado no registra el evento.
 */
const COUNT_QUERIES =
	process.env.NODE_ENV !== "production" &&
	process.env.DEBUG_QUERY_COUNT === "true";

type QueryStats = { count: number; dbMs: number };

const queryStatsContext = new AsyncLocalStorage<QueryStats>();

const prismaClientSingleton = () => {
	const client = new PrismaClient({
		adapter,
		transactionOptions: {
			timeout: TRANSACTION_TIMEOUT_MS,
			maxWait: env.DATABASE_POOL_WAIT_MS,
		},
		log: COUNT_QUERIES ? [{ level: "query", emit: "event" }] : [],
	});

	if (COUNT_QUERIES) {
		client.$on("query" as never, (event: Prisma.QueryEvent) => {
			const stats = queryStatsContext.getStore();
			if (!stats) return;
			stats.count += 1;
			stats.dbMs += event.duration;
		});
	}

	return client;
};

/** Ejecuta `callback` contando sus consultas; sin la bandera, no mide nada. */
export async function measureQueries<T>(
	callback: () => Promise<T>,
): Promise<{ result: T; stats: QueryStats | null }> {
	if (!COUNT_QUERIES) return { result: await callback(), stats: null };

	const stats: QueryStats = { count: 0, dbMs: 0 };
	const result = await queryStatsContext.run(stats, callback);
	return { result, stats };
}

type GlobalWithPrisma = typeof globalThis & {
	prismaGlobal: ReturnType<typeof prismaClientSingleton> | undefined;
};

const globalWithPrisma = globalThis as GlobalWithPrisma;

const prismaInstance = globalWithPrisma.prismaGlobal ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
	globalWithPrisma.prismaGlobal = prismaInstance;
}

const prisma = new Proxy(prismaInstance, {
	get(target, prop, receiver) {
		const transactionClient = transactionContext.getStore();
		if (transactionClient) {
			return Reflect.get(transactionClient, prop, receiver);
		}
		return Reflect.get(target, prop, receiver);
	},
});

export async function runInTransaction<T>(
	callback: () => Promise<T>,
	options?: Parameters<PrismaClient["$transaction"]>[1],
): Promise<T> {
	if (transactionContext.getStore()) {
		return await callback();
	}

	return await afterCommitQueue.track(() =>
		prismaInstance.$transaction(
			async (transactionalClient: Prisma.TransactionClient) => {
				return await transactionContext.run(
					transactionalClient as PrismaClient,
					async () => {
						return await callback();
					},
				);
			},
			options,
		),
	);
}

/** Lo ejecuta tras el commit de la transacción en curso, o ya si no hay una. */
export const afterCommit = afterCommitQueue.afterCommit;

export default prisma;
export { prisma };

export type PrismaClientType = typeof prisma;

export type RunInTransaction = typeof runInTransaction;

export type AfterCommit = typeof afterCommit;
