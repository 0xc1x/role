import { describe, expect, it } from 'bun:test';
import { CreateEmailTemplateSchema } from '../schemas/email.schema';

describe('CreateEmailTemplateSchema', () => {
  it('accepts template with defaults', () => {
    expect(
      CreateEmailTemplateSchema.safeParse({
        name: 'contacto-notificacion',
        subject: 'Nuevo contacto',
        body_html: '<p>Hola</p>',
      }).success,
    ).toBe(true);
  });

  it('rejects empty name', () => {
    expect(
      CreateEmailTemplateSchema.safeParse({
        name: '',
        subject: 'Test',
        body_html: '<p>x</p>',
        variables: [],
      }).success,
    ).toBe(false);
  });
});
