import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CreateContactSchema, type CreateContactDto } from '@0xc1x/role-commons';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ContactService } from './contact.service';

@ApiTags('Contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly service: ContactService) {}

  @Public()
  @Post()
  @Throttle({ contact: { ttl: 60000, limit: 5 } })
  async create(
    @Body(new ZodValidationPipe(CreateContactSchema)) body: CreateContactDto,
    @Req() req: { ip?: string },
  ) {
    return this.service.handle(body, req.ip);
  }
}
