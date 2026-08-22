import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ListProfilesQuerySchema,
  UpdateProfileSchema,
} from '@0xc1x/role-commons';
import type {
  ListProfilesQuery,
  ProfileDto,
  ProfilePaginatedData,
  UpdateProfileDto,
} from '@0xc1x/role-commons';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ProfilesService } from './profiles.service';

@ApiTags('Profiles')
@Roles('admin')
@ApiBearerAuth('bearer')
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get()
  @ApiOperation({ summary: 'List profiles (admin)' })
  @ApiOkResponse({ description: 'Paginated profiles' })
  list(
    @Query(new ZodValidationPipe(ListProfilesQuerySchema))
    query: ListProfilesQuery,
  ): Promise<ProfilePaginatedData> {
    return this.profilesService.list({
      ...query,
      subscribed_to: query.subscribed_to,
    });
  }

  @Get(':id')
  async getById(@Param('id', ParseUUIDPipe) id: string): Promise<ProfileDto | null> {
    return this.profilesService.getById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateProfileSchema)) body: UpdateProfileDto,
  ): Promise<ProfileDto | null> {
    // email/avatar no se editan aquí (viven en auth.users / Storage).
    const { email: _email, avatar_url: _avatar, ...rest } = body;
    void _email;
    void _avatar;
    return this.profilesService.update(id, rest);
  }
}
