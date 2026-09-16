import { Prisma } from "@prisma/client";
import type { ICradle } from "@/shared/di/container.types";
import type { ICreditRepository } from "../domain/credit.repository";
import type { StaffQuery } from "../domain/credit.types";

type Dependencies = {
	prisma: ICradle["prisma"];
};

const SEARCHABLE_FIELDS = ["firstName", "lastName", "email"] as const;

const DEPENDENCY_SELECT = {
	id: true,
	documentId: true,
	name: true,
} satisfies Prisma.DependencySelect;

const creditsFor = (dependencyId: number, fiscalYear: number) => ({
	dependencyId,
	fiscalYear,
	revokedAt: null,
});

const staffWhere = ({
	dependencyId,
	fiscalYear,
	search,
}: Omit<StaffQuery, "page" | "pageSize">): Prisma.UserWhereInput => ({
	AND: [
		{
			OR: [
				{ dependencyId, type: "INTERNAL", archivedAt: null },
				{ credits: { some: creditsFor(dependencyId, fiscalYear) } },
			],
		},
		...(search
			? [
					{
						OR: SEARCHABLE_FIELDS.map((field) => ({
							[field]: { contains: search, mode: Prisma.QueryMode.insensitive },
						})),
					},
				]
			: []),
	],
});

export const createCreditRepository = ({
	prisma,
}: Dependencies): ICreditRepository => ({
	async findByCourse(courseId) {
		return prisma.credit.findMany({
			where: { courseId },
			select: { userId: true, dependencyId: true, revokedAt: true },
		});
	},

	async grant(candidates, { courseId, fiscalYear, at, actorId }) {
		if (candidates.length === 0) return;

		await prisma.credit.createMany({
			data: candidates.map((candidate) => ({
				userId: candidate.userId,
				dependencyId: candidate.dependencyId,
				courseId,
				fiscalYear,
				grantedAt: at,
				grantedById: actorId,
			})),
		});
	},

	async restore(userIds, { courseId, fiscalYear, at, actorId }) {
		if (userIds.length === 0) return;

		await prisma.credit.updateMany({
			where: {
				courseId,
				userId: { in: [...userIds] },
				revokedAt: { not: null },
			},
			data: {
				fiscalYear,
				grantedAt: at,
				grantedById: actorId,
				revokedAt: null,
				revokedById: null,
			},
		});
	},

	async revoke(userIds, { courseId, at, actorId }) {
		if (userIds.length === 0) return;

		await prisma.credit.updateMany({
			where: { courseId, userId: { in: [...userIds] }, revokedAt: null },
			data: { revokedAt: at, revokedById: actorId },
		});
	},

	async findMine(userId) {
		const rows = await prisma.credit.findMany({
			where: { userId, revokedAt: null },
			orderBy: [{ fiscalYear: "desc" }, { grantedAt: "desc" }],
			select: {
				documentId: true,
				fiscalYear: true,
				grantedAt: true,
				dependency: { select: { name: true } },
				course: { select: { documentId: true, title: true } },
			},
		});

		return rows.map((row) => ({
			documentId: row.documentId,
			courseDocumentId: row.course.documentId,
			courseTitle: row.course.title,
			dependencyName: row.dependency.name,
			fiscalYear: row.fiscalYear,
			grantedAt: row.grantedAt,
		}));
	},

	async findStaff(query) {
		const rows = await prisma.user.findMany({
			where: staffWhere(query),
			orderBy: [{ firstName: "asc" }, { email: "asc" }],
			skip: (query.page - 1) * query.pageSize,
			take: query.pageSize,
			select: {
				documentId: true,
				firstName: true,
				lastName: true,
				email: true,
				dependencyId: true,
				dependency: { select: { name: true } },
				_count: {
					select: {
						credits: {
							where: creditsFor(query.dependencyId, query.fiscalYear),
						},
					},
				},
			},
		});

		return rows.map((row) => ({
			userDocumentId: row.documentId,
			firstName: row.firstName,
			lastName: row.lastName,
			email: row.email,
			currentDependencyName: row.dependency?.name ?? null,
			transferred: row.dependencyId !== query.dependencyId,
			credits: row._count.credits,
		}));
	},

	async countStaff(query) {
		return prisma.user.count({ where: staffWhere(query) });
	},

	async summarizeByDependency(fiscalYear) {
		const groups = await prisma.credit.groupBy({
			by: ["dependencyId", "userId"],
			where: { fiscalYear, revokedAt: null },
			_count: { _all: true },
		});

		const totals = new Map<number, { credits: number; people: number }>();
		for (const group of groups) {
			const current = totals.get(group.dependencyId) ?? {
				credits: 0,
				people: 0,
			};
			current.credits += group._count._all;
			current.people += 1;
			totals.set(group.dependencyId, current);
		}

		// Una dependencia desactivada sigue apareciendo si obtuvo créditos ese año.
		const dependencies = await prisma.dependency.findMany({
			where: {
				OR: [{ archivedAt: null }, { id: { in: [...totals.keys()] } }],
			},
			orderBy: { name: "asc" },
			select: DEPENDENCY_SELECT,
		});

		return dependencies.map((dependency) => ({
			dependencyDocumentId: dependency.documentId,
			name: dependency.name,
			credits: totals.get(dependency.id)?.credits ?? 0,
			people: totals.get(dependency.id)?.people ?? 0,
		}));
	},

	async findDependency(documentId) {
		return prisma.dependency.findUnique({
			where: { documentId },
			select: DEPENDENCY_SELECT,
		});
	},

	async findDependencyById(id) {
		return prisma.dependency.findUnique({
			where: { id },
			select: DEPENDENCY_SELECT,
		});
	},
});
