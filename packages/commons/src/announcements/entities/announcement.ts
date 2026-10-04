import { z } from "zod";
import type { AnnouncementSchema } from "../schemas/announcement.schema";

/**
 * Vocabulario de `severity`. En Postgres es `text` con CHECK y no un enum a
 * propósito: un enum obliga a una migración cada vez que aparece un valor
 * nuevo. Acá sí se cierra con `z.enum`, porque el listado es corto y lo que
 * tiene que quedar en el panel es el vocabulario, no la libertad de escribir
 * cualquier texto.
 */
export const AnnouncementSeveritySchema = z.enum(["info", "required"]);
export type AnnouncementSeverity = z.infer<typeof AnnouncementSeveritySchema>;

/**
 * A quién le toca el aviso. `specific` es el único que mira `user_ids` y
 * `business_ids`; los otros tres se resuelven enteros con el rol o con nada.
 */
export const AudienceKindSchema = z.enum([
	"all",
	"consumers",
	"businesses",
	"specific",
]);
export type AudienceKind = z.infer<typeof AudienceKindSchema>;

/**
 * Row shape for `public.announcements` — derivado del schema Zod (SSOT).
 *
 * Deliberadamente NO lleva `user_ids` ni `business_ids`: son el camino de
 * escritura (quién publica elige a quién le llega) y ninguna lectura los
 * necesita. Ver el comentario del schema.
 */
export type Announcement = z.infer<typeof AnnouncementSchema>;
