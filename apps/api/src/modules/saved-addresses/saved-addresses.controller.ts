import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AddSavedAddressRequestSchema,
  UpdateSavedAddressSchema,
} from '@0xc1x/role-commons';
import type {
  AddSavedAddressRequestDto,
  SavedAddressDto,
  UpdateSavedAddressDto,
} from '@0xc1x/role-commons';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../auth/auth.types';
import { SavedAddressesService } from './saved-addresses.service';

@ApiTags('Saved Addresses')
@ApiBearerAuth('bearer')
@Controller('addresses')
export class SavedAddressesController {
  constructor(private readonly savedAddressesService: SavedAddressesService) {}

  // No `@Public()` and no `@Roles(...)`: the global AuthGuard is default-deny,
  // so every route here requires a token, and the absent role list is what
  // makes it a consumer surface (any authenticated role) instead of an admin
  // one. The owner is the token subject in all four routes.
  @Get()
  @ApiOperation({ summary: 'List my saved addresses' })
  @ApiOkResponse({ description: 'My address book, default first' })
  list(@CurrentUser() user: AuthUser): Promise<SavedAddressDto[]> {
    return this.savedAddressesService.list(user);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Save one of my addresses' })
  @ApiCreatedResponse({ description: 'Address saved' })
  create(
    @CurrentUser() user: AuthUser,
    // `user_id` is not in the request schema, so the pipe strips it: the
    // address belongs to the caller, not to whoever the body named.
    @Body(new ZodValidationPipe(AddSavedAddressRequestSchema))
    body: AddSavedAddressRequestDto,
  ): Promise<SavedAddressDto> {
    return this.savedAddressesService.create(user, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit one of my addresses' })
  @ApiOkResponse({ description: 'Address updated' })
  @ApiNotFoundResponse({ description: 'No such address of mine' })
  @ApiConflictResponse({
    description: 'The request would leave the book with no default address',
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateSavedAddressSchema))
    body: UpdateSavedAddressDto,
  ): Promise<SavedAddressDto> {
    return this.savedAddressesService.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove one of my addresses' })
  @ApiNoContentResponse({ description: 'Address removed' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.savedAddressesService.remove(user, id);
  }
}
