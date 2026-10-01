import { describe, expect, test } from 'bun:test';
import type { StoreEntry } from '../store/app-store.repository';
import { ContactInboxMapper } from './contact-inbox.mapper';

const FECHAS = {
  created_at: new Date('2026-09-20T10:00:00.000Z'),
  updated_at: new Date('2026-09-20T10:00:00.000Z'),
  deleted_at: null,
  key: null,
} as const;

const valueCompleto = {
  name: 'Ana',
  email: 'ana@example.com',
  role: 'persona',
  city: 'Quito',
  city_raw: 'Quito',
  city_other: null,
  message: 'Quiero recibir comida en mi casa los viernes',
  at: '2026-09-20T10:00:00.000Z',
  ip: '203.0.113.7',
  to: 'hola@role.ec',
  from: 'notificaciones@role.ec',
};

const fila = (
  value: unknown,
  deliveryStatus: StoreEntry['delivery_status'] = 'PENDIENTE',
) =>
  ({
    id: '11111111-1111-4111-8111-111111111111',
    namespace: 'contact',
    delivery_status: deliveryStatus,
    state: null,
    origin: null,
    value,
    ...FECHAS,
  }) as StoreEntry;

describe('ContactInboxMapper.toListItem', () => {
  test('mapea los campos visibles del mensaje', () => {
    const dto = ContactInboxMapper.toListItem(fila(valueCompleto));

    expect(dto).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      delivery_status: 'PENDIENTE',
      readable: true,
      name: 'Ana',
      email: 'ana@example.com',
      role: 'persona',
      city: 'Quito',
    });
    expect(dto.created_at).toBe('2026-09-20T10:00:00.000Z');
  });

  test('el listado nunca emite las direcciones de ruteo', () => {
    const claves = Object.keys(
      ContactInboxMapper.toListItem(fila(valueCompleto)),
    );
    expect(claves).not.toContain('to');
    expect(claves).not.toContain('from');
  });

  test('el listado nunca emite la ip', () => {
    const dto = ContactInboxMapper.toListItem(fila(valueCompleto));
    expect('ip' in dto).toBe(false);
    expect(JSON.stringify(dto)).not.toContain('203.0.113.7');
  });

  test('el listado nunca emite el cuerpo completo, solo el extracto', () => {
    const dto = ContactInboxMapper.toListItem(fila(valueCompleto));
    expect('message' in dto).toBe(false);
    expect(dto.excerpt).toBe('Quiero recibir comida en mi casa los viernes');
  });

  test('el listado no filtra el error crudo del proveedor de correo', () => {
    const dto = ContactInboxMapper.toListItem(
      fila({ ...valueCompleto, error: 'resend: cuenta ca-ej-1234' }),
    );
    // La fila sigue siendo legible y el texto interno no sale.
    expect(dto.readable).toBe(true);
    expect(JSON.stringify(dto)).not.toContain('ca-ej-1234');
  });
});

describe('ContactInboxMapper.toDetail', () => {
  test('agrega el mensaje completo y la ip', () => {
    const dto = ContactInboxMapper.toDetail(fila(valueCompleto));

    expect(dto.message).toBe(valueCompleto.message);
    expect(dto.ip).toBe('203.0.113.7');
    expect(dto.received_at).toBe('2026-09-20T10:00:00.000Z');
  });

  test('sigue sin emitir las direcciones de ruteo', () => {
    const claves = Object.keys(
      ContactInboxMapper.toDetail(fila(valueCompleto)),
    );
    expect(claves).not.toContain('to');
    expect(claves).not.toContain('from');
    expect(
      JSON.stringify(ContactInboxMapper.toDetail(fila(valueCompleto))),
    ).not.toContain('hola@role.ec');
  });
});

describe('una fila con value corrupto no rompe el listado', () => {
  test('queda como no legible en vez de lanzar', () => {
    for (const roto of [
      null,
      'no soy un objeto',
      { email: 42 },
      { role: 'un-rol-que-no-existe' },
      [1, 2, 3],
    ]) {
      const dto = ContactInboxMapper.toListItem(fila(roto));
      expect(dto.readable).toBe(false);
      expect(dto.name).toBeNull();
      expect(dto.email).toBeNull();
      expect(dto.city).toBeNull();
      expect(dto.excerpt).toBeNull();
    }
  });

  test('el detalle de una fila corrupto tampoco lanza', () => {
    const dto = ContactInboxMapper.toDetail(fila({ basura: true }));
    expect(dto.readable).toBe(false);
    expect(dto.message).toBeNull();
    expect(dto.ip).toBeNull();
  });

  test('una fila válida con la clave error sigue siendo legible', () => {
    // `contact.service` agrega `error` al value cuando la entrega del correo
    // falla: esa fila la tiene que poder leer el operador.
    const dto = ContactInboxMapper.toListItem(
      fila({ ...valueCompleto, error: 'NotFoundException' }),
    );
    expect(dto.readable).toBe(true);
    expect(dto.email).toBe('ana@example.com');
  });
});

describe('el extracto del listado', () => {
  test('colapsa espacios y recorta los mensajes largos', () => {
    const dto = ContactInboxMapper.toListItem(
      fila({
        ...valueCompleto,
        message: `${'palabra '.repeat(60)}\n\ncon saltos`,
      }),
    );
    expect(dto.excerpt).toBeDefined();
    expect(dto.excerpt?.length).toBeLessThanOrEqual(161);
    expect(dto.excerpt?.endsWith('…')).toBe(true);
    expect(dto.excerpt).not.toContain('\n');
  });

  test('un mensaje ausente deja el extracto en null, no en cadena vacía', () => {
    const dto = ContactInboxMapper.toListItem(
      fila({ ...valueCompleto, message: null }),
    );
    expect(dto.excerpt).toBeNull();
  });
});
