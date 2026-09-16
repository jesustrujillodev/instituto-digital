import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaPg } from "@prisma/adapter-pg";
import { type Prisma, PrismaClient } from "@prisma/client";

const transactionContext = new AsyncLocalStorage<PrismaClient>();

// Crear el adapter de PostgreSQL
const adapter = new PrismaPg({
	connectionString: process.env.DATABASE_URL as string,
});

const prismaClientSingleton = () => {
	return new PrismaClient({ adapter });
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
