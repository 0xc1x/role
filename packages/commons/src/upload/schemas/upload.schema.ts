import { z } from 'zod';

/**
 * Campos opcionales del multipart de subida de imágenes (el archivo viaja
 * en `file` vía multer; aquí solo bucket/folder como strings).
 */
export const UploadImageBodySchema = z.object({
  /** Bucket de Supabase (el service valida contra la allowlist de env). */
  bucket: z.string().trim().min(1).max(63).optional(),
  /** Carpeta dentro del bucket (el service valida contra la allowlist). */
  folder: z.string().trim().min(1).max(120).optional(),
});

export type UploadImageBodyDto = z.infer<typeof UploadImageBodySchema>;
