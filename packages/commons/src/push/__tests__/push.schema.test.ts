import { describe, expect, it } from 'bun:test';
import {
  CreatePushSendSchema,
  CreatePushTemplateSchema,
  PushTestSchema,
} from '../schemas/push.schema';

describe('CreatePushTemplateSchema', () => {
  it('accepts template with defaults', () => {
    expect(
      CreatePushTemplateSchema.safeParse({
        name: 'bienvenida',
        title: '¡Bienvenido a Rolé!',
        body: 'Descubre ofertas cercanas',
      }).success,
    ).toBe(true);
  });

  it('rejects empty title', () => {
    expect(
      CreatePushTemplateSchema.safeParse({
        name: 'bienvenida',
        title: '',
        body: 'cuerpo',
      }).success,
    ).toBe(false);
  });
});

describe('CreatePushSendSchema', () => {
  const base = { title: 'Título', body: 'Cuerpo' };

  it('requires at least one segment or include user', () => {
    expect(CreatePushSendSchema.safeParse(base).success).toBe(false);
    expect(
      CreatePushSendSchema.safeParse({ ...base, include_user_ids: ['8f3a1c2e-4b5d-4e6f-8a9b-0c1d2e3f4a5b'] }).success,
    ).toBe(true);
    expect(
      CreatePushSendSchema.safeParse({
        ...base,
        segment_ids: ['8f3a1c2e-4b5d-4e6f-8a9b-0c1d2e3f4a5b'],
      }).success,
    ).toBe(true);
  });

  it('defaults type to announcement', () => {
    const parsed = CreatePushSendSchema.parse({
      ...base,
      include_user_ids: ['8f3a1c2e-4b5d-4e6f-8a9b-0c1d2e3f4a5b'],
    });
    expect(parsed.type).toBe('announcement');
  });
});

describe('PushTestSchema', () => {
  it('accepts one to ten users', () => {
    expect(
      PushTestSchema.safeParse({
        user_ids: ['8f3a1c2e-4b5d-4e6f-8a9b-0c1d2e3f4a5b'],
        title: '[TEST] Hola',
        body: 'cuerpo',
      }).success,
    ).toBe(true);
    expect(
      PushTestSchema.safeParse({ user_ids: [], title: 't', body: 'b' }).success,
    ).toBe(false);
  });
});
