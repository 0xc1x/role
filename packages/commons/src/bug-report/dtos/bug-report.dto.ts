import type { z } from "zod";
import type { PaginatedData } from "../../_common/dtos/api.dto";
import type {
	BugReportDetailSchema,
	BugReportListItemSchema,
	BugReportListResponseSchema,
	ListBugReportsQuerySchema,
	SetBugReportStateSchema,
} from "../schemas/bug-report.schema";

/** Fila del listado del buzón de reportes (admin). */
export type BugReportListItemDto = z.infer<typeof BugReportListItemSchema>;

/** Detalle de un reporte: listado + cuerpo, capturas y autor. */
export type BugReportDetailDto = z.infer<typeof BugReportDetailSchema>;

export type ListBugReportsQuery = z.infer<typeof ListBugReportsQuerySchema>;

/** Cuerpo del PATCH de triaje. Solo `state`: la entrega no la mueve el panel. */
export type SetBugReportStateDto = z.infer<typeof SetBugReportStateSchema>;

export type BugReportPaginatedData = PaginatedData<BugReportListItemDto>;

export type BugReportListResponse = z.infer<typeof BugReportListResponseSchema>;
