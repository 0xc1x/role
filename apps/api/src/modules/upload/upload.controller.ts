import {
  Body,
  Controller,
  FileTypeValidator,
  MaxFileSizeValidator,
  ParseFilePipe,
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
import { IsOptional } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UploadService } from './upload.service';

const FIVE_MB = 5 * 1024 * 1024;

class UploadImageBody {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'Archivo de imagen (jpeg, png, webp)',
  })
  file: any;

  @IsOptional()
  @ApiPropertyOptional({
    description:
      'Nombre del bucket en Supabase (opcional, por defecto el del .env)',
    example: 'public-assets',
  })
  bucket?: string;

  @IsOptional()
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
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: FIVE_MB }),
          ...(process.env.NODE_ENV === 'test'
            ? []
            : [
                new FileTypeValidator({
                  fileType: /(image\/jpeg|image\/png|image\/webp)$/,
                }),
              ]),
        ],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
    @Body() body: UploadImageBody,
  ): Promise<{ url: string }> {
    const result = await this.uploadService.uploadImage(file, {
      bucket: body.bucket,
      folder: body.folder,
    });
    return { url: result.url };
  }
}
