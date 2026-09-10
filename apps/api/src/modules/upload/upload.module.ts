import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { UploadImageParsePipe } from './upload-image-parse.pipe';

@Module({
  controllers: [UploadController],
  providers: [UploadService, UploadImageParsePipe],
})
export class UploadModule {}
