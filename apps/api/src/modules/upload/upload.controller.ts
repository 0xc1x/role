import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  UploadImageBodySchema,
  type UploadImageBodyDto,
} from '@0xc1x/role-commons';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  UPLOAD_MAX_FILE_SIZE,
  UploadImageParsePipe,
} from './upload-image-parse.pipe';
import { UploadService } from './upload.service';

const FIVE_MB = UPLOAD_MAX_FILE_SIZE;

/** Solo documentación Swagger del multipart (la validación real es Zod). */
class UploadImageBody {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Archivo de imagen (jpeg, png, webp)',
  })
  file: unknown;

  @ApiPropertyOptional({
    description:
      'Nombre del bucket en Supabase (opcional, por defecto el del .env)',
    example: 'public-assets',
  })
  bucket?: string;

  @ApiPropertyOptional({
    description:
      'Carpeta dentro del bucket (opcional, por defecto "categories")',
    example: 'categories',
  })
  folder?: string;
}

@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Throttle({ upload: { limit: 5, ttl: 60000 } })
  @Post('image')
  @Roles('admin')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: FIVE_MB } }))
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Upload an image (admin)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Archivo de imagen y opciones de bucket/folder',
    type: UploadImageBody,
  })
  @ApiCreatedResponse({
    description:
      'Imagen subida y comprimida a WebP. La URL pública se devuelve en el cuerpo.',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              format: 'uri',
              example:
                'https://[project].supabase.co/storage/v1/object/public/images/categories/uuid.webp',
            },
          },
          required: ['url'],
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Archivo inválido, formato no soportado o excede el tamaño máximo',
  })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Requiere rol admin' })
  async uploadImage(
    @UploadedFile(UploadImageParsePipe)
    file: Express.Multer.File,
    @Body(new ZodValidationPipe(UploadImageBodySchema))
    body: UploadImageBodyDto,
  ): Promise<{ url: string }> {
    const result = await this.uploadService.uploadImage(file, {
      bucket: body.bucket,
      folder: body.folder,
    });
    return { url: result.url };
  }
}
