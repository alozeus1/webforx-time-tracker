import prisma from '../config/db';

export const normalizeIdList = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(
        value
            .filter((id): id is string => typeof id === 'string')
            .map((id) => id.trim())
            .filter(Boolean),
    ));
};

export const assertProjectBelongsToOrganization = async (
    projectId: string | null | undefined,
    organizationId: string,
): Promise<void> => {
    if (!projectId) return;

    const project = await prisma.project.findFirst({
        where: { id: projectId, organization_id: organizationId, is_active: true },
        select: { id: true },
    });

    if (!project) {
        const error = new Error('Project not found');
        (error as NodeJS.ErrnoException).code = 'TENANT_PROJECT_NOT_FOUND';
        throw error;
    }
};

export const assertTagsBelongToOrganization = async (
    tagIds: string[],
    organizationId: string,
): Promise<void> => {
    if (tagIds.length === 0) return;

    const tags = await prisma.tag.findMany({
        where: { id: { in: tagIds }, organization_id: organizationId },
        select: { id: true },
    });

    if (tags.length !== tagIds.length) {
        const error = new Error('One or more tags not found');
        (error as NodeJS.ErrnoException).code = 'TENANT_TAG_NOT_FOUND';
        throw error;
    }
};
