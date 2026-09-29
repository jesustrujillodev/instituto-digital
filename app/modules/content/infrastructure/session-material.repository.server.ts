import type { Prisma } from "@prisma/client";
import type { ICradle } from "@/shared/di/container.types";
import type { ISessionMaterialRepository } from "../domain/session-material.repository";
import type { SessionMaterialCourseWhere } from "../domain/session-material.rules";

type Dependencies = {
	prisma: ICradle["prisma"];
};

const asCourseWhere = (where: SessionMaterialCourseWhere) =>
	where as unknown as Prisma.CourseWhereInput;

const MATERIAL_SELECT = {
	documentId: true,
	type: true,
	title: true,
	fileUrl: true,
	fileName: true,
	fileSize: true,
	mimeType: true,
	externalUrl: true,
	availableFromSession: true,
} as const;

const SESSIONS_SELECT = {
	orderBy: { startsAt: "asc" },
	select: {
		documentId: true,
		startsAt: true,
		endsAt: true,
		materials: { orderBy: { createdAt: "asc" }, select: MATERIAL_SELECT },
	},
} as const;

export const createSessionMaterialRepository = ({
	prisma,
}: Dependencies): ISessionMaterialRepository => ({
	async findCourse(courseDocumentId, where) {
		return prisma.course.findFirst({
			where: { AND: [{ documentId: courseDocumentId }, asCourseWhere(where)] },
			select: { id: true, status: true },
		});
	},

	async findSessions(courseId) {
		return prisma.courseSession.findMany({
			where: { courseId },
			...SESSIONS_SELECT,
		});
	},

	async findSessionsForParticipant(courseDocumentId, userId) {
		const course = await prisma.course.findFirst({
			where: {
				documentId: courseDocumentId,
				enrollments: { some: { userId, status: "ENROLLED" } },
			},
			select: { sessions: SESSIONS_SELECT },
		});

		return course?.sessions ?? null;
	},

	async findSession(courseId, sessionDocumentId) {
		const session = await prisma.courseSession.findFirst({
			where: { courseId, documentId: sessionDocumentId },
			select: { id: true, _count: { select: { materials: true } } },
		});

		return session
			? { id: session.id, materialCount: session._count.materials }
			: null;
	},

	async findMaterial(courseId, materialDocumentId) {
		return prisma.sessionMaterial.findFirst({
			where: { documentId: materialDocumentId, session: { courseId } },
			select: { id: true, fileUrl: true },
		});
	},

	async create(sessionId, write) {
		return prisma.sessionMaterial.create({
			data: { sessionId, ...write },
			select: { documentId: true },
		});
	},

	async update(id, patch) {
		await prisma.sessionMaterial.update({ where: { id }, data: patch });
	},

	async remove(id) {
		await prisma.sessionMaterial.delete({ where: { id } });
	},
});
