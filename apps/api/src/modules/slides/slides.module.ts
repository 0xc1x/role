import { Module } from '@nestjs/common'
import { SlidesController } from './slides.controller';
import { SlidesService } from './slides.service';
import { SlidesRepository } from './slides.repository';

@Module({
    controllers: [SlidesController],
    providers: [SlidesService, SlidesRepository],
    exports: [SlidesService, SlidesRepository],
})

export class SlidesModule { }