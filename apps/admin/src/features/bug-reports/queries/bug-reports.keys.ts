export const bugReportKeys = {
	all: ["bug-report-inbox"] as const,
	lists: () => [...bugReportKeys.all, "list"] as const,
	list: (params: unknown) => [...bugReportKeys.lists(), params] as const,
	details: () => [...bugReportKeys.all, "detail"] as const,
	detail: (id: string) => [...bugReportKeys.details(), id] as const,
};
