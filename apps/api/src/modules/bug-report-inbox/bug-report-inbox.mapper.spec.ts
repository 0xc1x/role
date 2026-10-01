import { describe, expect, test } from 'bun:test';
import type { StoreEntry } from '../store/app-store.repository';
import { BugReportInboxMapper } from './bug-report-inbox.mapper';

const FECHAS = {
  created_at: new Date('2026-09-20T10:00:00.000Z'),
  updated_at: new Date('2026-09-20T10:00:00.000Z'),
  deleted_at: null,
  key: null,
} as const;

const ID = '11111111-1111-4111-8111-111111111111';

/** Lo que escribe el móvil, más el `reporter_id` que sella el trigger. */
const valueCompleto = {
  summary: 'No me deja pagar con la tarjeta que usé ayer',
  description:
    'Sale un error 500 al confirmar.\n\nPasos:\n1. Abrir el checkout',
  images: [`${ID}/captura-1.png`, `${ID}/captura-2.png`],
  reporter_id: '22222222-2222-4222-8222-222222222222',
  at: '2026-09-20T10:00:00.000Z',
};

/** Lo que escribe además el store genérico, para probar la lista blanca. */
const valueConRuido = {
  ...valueCompleto,
  device_model: 'iPhone 13',
  app_version: '1.4.2',
  to: 'hola@role.ec',
  from: 'notificaciones@role.ec',
};

/**
 * `extra` sobre una fila base. La base se escribe COMPLETA (sin `as`) para que
 * el compilador diga la verdad sobre la forma de `StoreEntry`: si el store
 * ganara una columna requerida, este archivo deja de compilar en vez de
 * fingir que la fila la tiene.
 */
const fila = (
  value: unknown,
  extra: Partial<
    Pick<StoreEntry, 'state' | 'origin' | 'delivery_status' | 'namespace'>
  > = {},
): StoreEntry => ({
  id: ID,
  namespace: 'bug_report',
  delivery_status: 'PENDIENTE',
  state: null,
  origin: 'ios',
  value,
  ...FECHAS,
  ...extra,
});

describe('BugReportInboxMapper.toListItem', () => {
  test('mapea los campos visibles del reporte', () => {
    const dto = BugReportInboxMapper.toListItem(
      fila(valueCompleto, { state: 'EN_REPRODUCCION', origin: 'android' }),
    );

    expect(dto).toMatchObject({
      id: ID,
      state: 'EN_REPRODUCCION',
      delivery_status: 'PENDIENTE',
      origin: 'android',
      readable: true,
      summary: 'No me deja pagar con la tarjeta que usé ayer',
    });
    expect(dto.created_at).toBe('2026-09-20T10:00:00.000Z');
    expect(dto.excerpt).toBe('No me deja pagar con la tarjeta que usé ayer');
  });

  /**
   * EL TEST IMPORTANTE DE ESTE ARCHIVO.
   *
   * `reporter_id` identifica a una persona y el listado es la superficie que se
   * ve de un vistazo: se amplía en un monitor de soporte, se proyecta, se
   * copia a un ticket. La §7 del design dice que el mapper es lista blanca, así
   * que esto se comprueba por CLAVES y por contenido, no por tipado: un
   * `reporter_id` reventado en el JSON tiene que fallar acá.
   */
  test('reporter_id nunca aparece en el listado', () => {
    const dto = BugReportInboxMapper.toListItem(fila(valueCompleto));

    expect('reporter_id' in dto).toBe(false);
    expect(Object.keys(dto)).not.toContain('reporter_id');
    expect(JSON.stringify(dto)).not.toContain(
      '22222222-2222-4222-8222-222222222222',
    );
  });

  test('las capturas tampoco aparecen en el listado', () => {
    const dto = BugReportInboxMapper.toListItem(fila(valueCompleto));

    // Son rutas de un bucket PRIVADO: el listado no publica ni la existence.
    expect('images' in dto).toBe(false);
    expect(JSON.stringify(dto)).not.toContain('captura-1.png');
  });

  test('el listado no filtra el cuerpo completo, solo el extracto', () => {
    const dto = BugReportInboxMapper.toListItem(fila(valueCompleto));

    expect('description' in dto).toBe(false);
    expect(JSON.stringify(dto)).not.toContain('Salir un error');
  });

  test('el listado es lista blanca: claves del store que se ignoran', () => {
    const dto = BugReportInboxMapper.toListItem(fila(valueConRuido));
    const claves = Object.keys(dto);

    // `device_model` y `app_version` son claves que el móvil puede empezar a
    // mandar mañana; el listado no las publica aunque se lean bien.
    expect(dto.readable).toBe(true);
    expect(claves).not.toContain('device_model');
    expect(claves).not.toContain('app_version');
    expect(claves).not.toContain('to');
    expect(claves).not.toContain('from');
    expect(JSON.stringify(dto)).not.toContain('1.4.2');
  });
});

describe('BugReportInboxMapper.toDetail', () => {
  test('agrega el cuerpo, las capturas y quién lo mandó', () => {
    const dto = BugReportInboxMapper.toDetail(fila(valueCompleto));

    expect(dto.summary).toBe('No me deja pagar con la tarjeta que usé ayer');
    expect(dto.description).toBe(
      'Sale un error 500 al confirmar.\n\nPasos:\n1. Abrir el checkout',
    );
    expect(dto.images).toHaveLength(2);
    expect(dto.images[0]).toBe(`${ID}/captura-1.png`);
    // En el detalle SÍ va: el operador lo necesita para seguir el reporte.
    expect(dto.reporter_id).toBe('22222222-2222-4222-8222-222222222222');
    expect(dto.received_at).toBe('2026-09-20T10:00:00.000Z');
  });

  test('el detalle colapsa lo ausente y lo vacío, no los deja undefined', () => {
    const dto = BugReportInboxMapper.toDetail(
      fila({
        summary: 'Se reinició la app',
        description: null,
        images: [],
        reporter_id: null,
      }),
    );

    expect(dto.description).toBeNull();
    expect(dto.images).toEqual([]);
    expect(dto.reporter_id).toBeNull();
    expect(dto.received_at).toBeNull();
  });

  test('el detalle sigue sin emitir el cuerpo crudo del store', () => {
    const dto = BugReportInboxMapper.toDetail(fila(valueConRuido));

    expect(dto.readable).toBe(true);
    expect(Object.keys(dto)).not.toContain('to');
    expect(JSON.stringify(dto)).not.toContain('hola@role.ec');
  });
});

describe('un value sin summary no sale como una fila legible', () => {
  /**
   * `summary` es el ANCLA del schema. Sin ella, el objeto guardado bajo el
   * namespace no es un reporte: sale con `readable: false` y todo en `null`, en
   * vez de aparecer como una fila "legible" con el texto en blanco, que es
   * indistinguible de un reporte realmente vacío.
   */
  test('un value sin summary sale con readable: false y summary null', () => {
    for (const sinAncla of [
      { description: 'me pasó algo' },
      { summary: undefined },
      {},
      null,
      'no soy un objeto',
      { summary: 42 },
      { summary: null },
      [1, 2, 3],
    ]) {
      const dto = BugReportInboxMapper.toListItem(fila(sinAncla));

      expect(dto.readable).toBe(false);
      expect(dto.summary).toBeNull();
      expect(dto.excerpt).toBeNull();
    }
  });

  test('un value corrupto no tumba el mapeo del detalle', () => {
    const dto = BugReportInboxMapper.toDetail(fila({ lo_que_sea: true }));

    expect(dto.readable).toBe(false);
    expect(dto.description).toBeNull();
    expect(dto.images).toEqual([]);
    expect(dto.reporter_id).toBeNull();
  });

  test('una fila recién insertada sigue siendo legible', () => {
    // El trigger `stamp_bug_reporter` sella `reporter_id` DESPUÉS de que el
    // cliente escribiera su `value`, así que toda fila viva trae esa clave.
    // Si el schema fuera `strict`, el buzón entero sería ilegible; por eso no
    // lo es. Esta fila lo fija.
    const filaViva = fila({
      summary: 'La app crashea al abrir la lista',
      reporter_id: '22222222-2222-4222-8222-222222222222',
      device_model: 'Pixel 8',
    });

    expect(BugReportInboxMapper.toListItem(filaViva).readable).toBe(true);
  });

  test('un summary vacío es un reporte malo, no un reporte invisible', () => {
    // La policy de insert no mira `value`, así que `summary: ''` LLEGA a
    // existir. Sale legible, con el texto en blanco y un motivo visible.
    const dto = BugReportInboxMapper.toListItem(fila({ summary: '' }));

    expect(dto.readable).toBe(true);
    expect(dto.summary).toBe('');
  });
});

describe('state fuera del vocabulario cae a null sin lanzar', () => {
  /**
   * `state` es `text` sin CHECK: nada en la base impide que mañana haya un
   * `'REABIERTO'` escrito a mano. El que estrecha es ESTE mapper, comparando
   * contra `BUG_TRIAGE_STATES` — con un `as` pasaría el typecheck y dejaría
   * llegar al panel un estado que no sabe pintar.
   */
  test('un state desconocido sale null, y la fila sigue legible', () => {
    for (const raro of ['REABIERTO', 'abierto', '', 'CORREGIDO ']) {
      const dto = BugReportInboxMapper.toListItem(
        fila(valueCompleto, { state: raro }),
      );

      expect(dto.readable).toBe(true);
      expect(dto.state).toBeNull();
      expect(dto.summary).toBe('No me deja pagar con la tarjeta que usé ayer');
    }
  });

  test('state en NULL (sin triage) sale null, no "ABIERTO"', () => {
    // El insert del móvil no nombra `state`: lo pone la policy. Antes de
    // arreglarlo, `null` es "sin triage" y no se puede inventar el estado.
    const dto = BugReportInboxMapper.toListItem(
      fila(valueCompleto, { state: null }),
    );
    expect(dto.state).toBeNull();
  });

  test('cada estado del vocabulario pasa intacto', () => {
    for (const estado of [
      'ABIERTO',
      'EN_REPRODUCCION',
      'CORREGIDO',
      'DUPLICADO',
      'DESCARTADO',
    ] as const) {
      const dto = BugReportInboxMapper.toListItem(
        fila(valueCompleto, { state: estado }),
      );
      expect(dto.state).toBe(estado);
    }
  });
});

describe('el origen viaja porque es un enum de Postgres', () => {
  test('cada origen del enum pasa intacto', () => {
    for (const origin of ['ios', 'android', 'pwa', 'web'] as const) {
      const dto = BugReportInboxMapper.toListItem(
        fila(valueCompleto, { origin }),
      );
      expect(dto.origin).toBe(origin);
    }
  });

  test('un origin NULL (filas de otro escritor) no se inventa', () => {
    const dto = BugReportInboxMapper.toListItem(
      fila(valueCompleto, { origin: null }),
    );
    expect(dto.origin).toBeNull();
  });
});

describe('el extracto del listado', () => {
  test('colapsa espacios y recorta los resúmenes largos', () => {
    const dto = BugReportInboxMapper.toListItem(
      fila({ summary: `${'palabra '.repeat(60)}\n\ncon saltos` }),
    );

    expect(dto.excerpt).toBeDefined();
    expect(dto.excerpt?.length).toBeLessThanOrEqual(161);
    expect(dto.excerpt?.endsWith('…')).toBe(true);
    expect(dto.excerpt).not.toContain('\n');
  });

  test('un summary de solo espacios sale legible, no ilegible', () => {
    // El ancla está presente, así que la fila es un reporte: sale `readable:
    // true` y con el extracto ya colapsado a cadena vacía, que es la señal de
    // "llegó un reporte en blanco" en vez de "esto no es un reporte". La fila
    // ilegible (sin ancla) sí sale con el extracto en `null`, y eso se prueba
    // en el bloque de arriba.
    const dto = BugReportInboxMapper.toListItem(fila({ summary: '   \n  ' }));

    expect(dto.readable).toBe(true);
    expect(dto.summary).toBe('   \n  ');
    expect(dto.excerpt).toBe('');
  });
});
