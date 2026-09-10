import {
  FileTypeValidator,
  Injectable,
  MaxFileSizeValidator,
  ParseFilePipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';

/** Tope de subida (también lo usa FileInterceptor en el controller). */
export const UPLOAD_MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Validación del archivo subido. En `test` se omite el FileTypeValidator
 * (los e2e suben buffers sin mimetype real); el resto de entornos exige
 * jpeg/png/webp. Lee el entorno vía ConfigService (env validado), nunca
 * accediendo al entorno del proceso de forma directa.
 */
@Injectable()
export class UploadImageParsePipe extends ParseFilePipe {
  constructor(config: ConfigService<Env, true>) {
    super({
      validators: [
        new MaxFileSizeValidator({ maxSize: UPLOAD_MAX_FILE_SIZE }),
        ...(config.get('NODE_ENV', { infer: true }) === 'test'
          ? []
          : [
              new FileTypeValidator({
                fileType: /(image\/jpeg|image\/png|image\/webp)$/,
              }),
            ]),
      ],
      fileIsRequired: true,
    });
  }
}
