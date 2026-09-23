import { diffCredits } from "@/modules/credits/domain/credit.rules";
import type { ICradle } from "@/shared/di/container.types";
import {
	completedParticipantsOf,
	creditCandidatesOf,
	fiscalYearOf,
} from "../domain/teaching.rules";
import type { ICompletionSync } from "../domain/teaching.service";

type Dependencies = {
	teachingRepository: ICradle["teachingRepository"];
	enrollmentRepository: ICradle["enrollmentRepository"];
	creditRepository: ICradle["creditRepository"];
};

export const createCompletionSync = ({
	teachingRepository,
	enrollmentRepository,
	creditRepository,
}: Dependencies): ICompletionSync => ({
	/** Lee después de escribir para que el cálculo vea lo que se acaba de guardar. */
	async sync(courseId: number, actorId: number, at: Date) {
		const course = await teachingRepository.findCourseById(courseId);
		const completed = completedParticipantsOf(course);

		await enrollmentRepository.setCompletion(
			course.id,
			completed.map((participant) => participant.userId),
		);

		const diff = diffCredits(
			await creditRepository.findByCourse(course.id),
			creditCandidatesOf(completed),
		);
		const context = {
			courseId: course.id,
			fiscalYear: fiscalYearOf(course, at),
			at,
			actorId,
		};

		await creditRepository.grant(diff.grant, context);
		await creditRepository.restore(diff.restore, context);
		await creditRepository.revoke(diff.revoke, context);

		return { completed: completed.length, diff };
	},
});
