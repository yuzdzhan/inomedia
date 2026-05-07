import { redirect, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	buildAttachmentContentDisposition,
	isPreviewableImageType
} from '$lib/server/task-attachments';
import { canAccessProjectTasks } from '$lib/server/task-policy';
import type { RequestHandler } from './$types';

function canUserReachTask(
	user: { id: string; role: string },
	task: { assignees: Array<{ userId: string }> }
) {
	if (user.role !== 'employee') {
		return true;
	}

	return task.assignees.some((assignee) => assignee.userId === user.id);
}

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const user = locals.user;

	if (!canAccessProjectTasks(user.role)) {
		error(403, 'Нямате достъп до този файл.');
	}

	const company = await db.company.findFirst({
		select: {
			id: true
		}
	});

	if (!company) {
		redirect(302, '/bootstrap');
	}

	const attachment = await db.taskAttachment.findUnique({
		where: { id: params.attachmentId },
		include: {
			task: {
				include: {
					assignees: {
						select: {
							userId: true
						}
					},
					taskList: {
						include: {
							project: {
								include: {
									members: {
										select: {
											userId: true
										}
									},
									client: {
										select: {
											companyId: true
										}
									}
								}
							}
						}
					}
				}
			}
		}
	});

	if (!attachment || attachment.ownerCompanyId !== company.id) {
		error(404, 'Файлът не е намерен.');
	}

	const project = attachment.task.taskList.project;
	if (project.client.companyId !== company.id) {
		error(404, 'Файлът не е намерен.');
	}

	if (user.role === 'employee') {
		const isProjectMember = project.members.some((member) => member.userId === user.id);
		if (!isProjectMember || !canUserReachTask(user, attachment.task)) {
			error(403, 'Нямате достъп до този файл.');
		}
	}

	const previewInline = isPreviewableImageType(attachment.contentType);

	return new Response(attachment.blob, {
		headers: {
			'content-type': attachment.contentType,
			'content-length': String(attachment.sizeBytes),
			'content-disposition': buildAttachmentContentDisposition(
				attachment.originalFilename,
				previewInline
			),
			'cache-control': 'private, no-store'
		}
	});
};
