import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import type { Env } from '../../config/env.schema';

export interface UploadOptions {
  bucket?: string;
  folder?: string;
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_DIMENSION = 1920;
const MAX_FILE_SIZE_AFTER_COMPRESSION = 2 * 1024 * 1024; // 2MB

@Injectable()
export class UploadService {
  private supabase;
  private allowedBuckets: string[];
  private allowedFolders: string[];

  constructor(private readonly config: ConfigService<Env, true>) {
    const url = this.config.get('SUPABASE_URL', { infer: true });
    const serviceRoleKey = this.config.get('SUPABASE_SERVICE_ROLE_KEY', {
      infer: true,
    });

    this.supabase = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const rawBuckets =
      this.config.get('SUPABASE_ALLOWED_BUCKETS', { infer: true }) ?? '';
    this.allowedBuckets = rawBuckets
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const rawFolders =
      this.config.get('SUPABASE_ALLOWED_FOLDERS', { infer: true }) ?? '';
    this.allowedFolders = rawFolders
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async uploadImage(
    file: { buffer: Buffer; mimetype?: string; originalname?: string },
    options?: UploadOptions,
  ): Promise<{ url: string; path: string }> {
    const bucket =
      options?.bucket ??
      this.config.get('SUPABASE_STORAGE_BUCKET', { infer: true }) ??
      'images';
    const folder = options?.folder ?? 'categories';

    if (!this.allowedBuckets.includes(bucket)) {
      throw new BadRequestException(`Bucket "${bucket}" no permitido`);
    }

    if (!this.allowedFolders.includes(folder)) {
      throw new BadRequestException(`Carpeta "${folder}" no permitida`);
    }

    // Validate magic bytes using sharp - it throws if not a valid image
    let metadata;
    try {
      metadata = await sharp(file.buffer).metadata();
    } catch {
      throw new BadRequestException(
        'Formato de archivo no válido. Solo JPEG, PNG y WebP son permitidos',
      );
    }

    // Check detected format
    if (
      !metadata.format ||
      !ALLOWED_MIME_TYPES.includes(`image/${metadata.format}`)
    ) {
      throw new BadRequestException(
        'Formato de archivo no válido. Solo JPEG, PNG y WebP son permitidos',
      );
    }

    // Process with sharp
    const compressed = await sharp(file.buffer)
      .resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();

    // Check compressed file size
    if (compressed.length > MAX_FILE_SIZE_AFTER_COMPRESSION) {
      throw new BadRequestException(
        `El archivo comprimido excede el tamaño máximo permitido (${MAX_FILE_SIZE_AFTER_COMPRESSION / 1024 / 1024}MB)`,
      );
    }

    // Verify dimensions after compression
    const compressedMetadata = await sharp(compressed).metadata();
    if (
      (compressedMetadata.width ?? 0) > MAX_DIMENSION ||
      (compressedMetadata.height ?? 0) > MAX_DIMENSION
    ) {
      throw new BadRequestException(
        `Las dimensiones de la imagen exceden el máximo permitido (${MAX_DIMENSION}px)`,
      );
    }

    const ext = '.webp';
    const path = `${folder}/${crypto.randomUUID()}${ext}`;

    const { error } = await this.supabase.storage
      .from(bucket)
      .upload(path, compressed, {
        contentType: 'image/webp',
        upsert: false,
      });

    if (error) {
      throw new Error(`Failed to upload image: ${error.message}`);
    }

    const { data: publicUrlData } = this.supabase.storage
      .from(bucket)
      .getPublicUrl(path);

    return { url: publicUrlData.publicUrl, path };
  }
}
