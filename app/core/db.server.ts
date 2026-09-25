import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaPg } from "@prisma/adapter-pg";
import { type Prisma, PrismaClient } from "@prisma/client";

const transactionContext = new AsyncLocalStorage<PrismaClient>();

// Crear el adapter de PostgreSQL
const adapter = new PrismaPg({
	connectionString: process.env.DATABASE_URL as string,
});

/**
 * Las transacciones que cierran un curso (avance, completado, créditos,
 * certificado y su aviso) encadenan decenas de consultas por una sola
 * conexión, y cada una paga un viaje completo a la base. Contra una base
 * remota eso rebasa los 5 s por defecto de Prisma sin que haya nada mal en la
 * operación. El tope se sube; la espera por conexión se deja como estaba.
 */
const TRANSACTION_TIMEOUT_MS = 20_000;

const prismaClientSingleton = () => {
	return new PrismaClient({
		adapter,
		transactionOptions: { timeout: TRANSACTION_TIMEOUT_MS },
	});
};

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

	return await prismaInstance.$transaction(
		async (transactionalClient: Prisma.TransactionClient) => {
			return await transactionContext.run(
				transactionalClient as PrismaClient,
				async () => {
					return await callback();
				},
			);
		},
		options,
	);
}

export default prisma;
export { prisma };

export type PrismaClientType = typeof prisma;

export type RunInTransaction = typeof runInTransaction;
