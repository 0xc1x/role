jest.mock('juice', () => ({
  __esModule: true,
  default: jest.fn((html: string) => html),
}));
jest.mock('resend', () => ({
  Resend: jest.fn(),
}));
jest.mock('@0xc1x/role-commons', () => ({
  CreateContactSchema: {},
}));

import { Test } from '@nestjs/testing';
import type { CreateContactDto } from '@0xc1x/role-commons';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';

describe('ContactController', () => {
  let controller: ContactController;
  const handle = jest.fn();

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ContactController],
      providers: [{ provide: ContactService, useValue: { handle } }],
    }).compile();

    controller = module.get(ContactController);
    jest.clearAllMocks();
  });

  it('delegates POST to ContactService.handle with ip', async () => {
    const dto: CreateContactDto = {
      name: 'Ana',
      email: 'ana@example.com',
      role: 'persona',
      city: 'Quito',
    };
    handle.mockResolvedValue({ ok: true, id: 'entry-1' });

    const result = await controller.create(dto, { ip: '10.0.0.1' });

    expect(handle).toHaveBeenCalledWith(dto, '10.0.0.1');
    expect(result).toEqual({ ok: true, id: 'entry-1' });
  });
});
