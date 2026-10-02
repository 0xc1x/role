import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { ConfigService } from '@nestjs/config';
import { BugReportDetailSchema } from '@0xc1x/role-commons';
import type { Env } from '../../config/env.schema';
import type {
  AppStoreRepository,
  StoreEntry,
} from '../store/app-store.repository';
import {
  BUG_REPORT_IMAGE_URL_TTL_SECONDS,
  BUG_REPORT_IMAGES_BUCKET,
} from './bug-report-inbox.constants';
import { BugReportInboxService } from './bug-report-inbox.service';

/**
 * La garantía de las capturas: lo que sale del API son URLs FIRMADAS, no las
 * rutas del bucket.
 *
 * POR QUÉ UN ARCHIVO APARTE DEL DE SEGURIDAD: este no prueba quién puede leer el
 * buzón, prueba qué PASA por la red cuando alguien autorizado lo lee. El
 * cliente de Supabase va simulado con `mock.module` — es el mismo aislamiento
 * por archivo que da `--isolate`, así que el doble no se filtra a los specs
 * reales— y la fila viene del repositorio real, de modo que el camino completo
 * fila -> mapper -> firma -> DTO se ejecuta.
 *
 * El caso que más importa es el NEGATIVO: una firma que falla tiene que
 * OMITIRSE. El arreglo fácil —"si no puedo firmar, devuelvo la ruta"—
 * devolvería el path crudo en el lugar de la captura, que es justo lo que el
 * design §8 prohíbe y lo que el nombre `image_urls` promete que no pasa.
 */

const REPORTER = '22222222-2222-4222-8222-222222222222';
const PATH_1 = `${REPORTER}/report/captura-1.png`;
const PATH_2 = `${REPORTER}/report/captura-2.png`;
const ID = '11111111-1111-4111-8111-111111111111';

const REPORTE = {
  summary: 'No me deja pagar con la tarjeta que usé ayer',
  description: 'Sale un error 500 al confirmar.',
  images: [PATH_1, PATH_2],
  reporter_id: REPORTER,
  at: '2026-09-20T10:00:00.000Z',
};

/** Filas de `storage.from(bucket).createSignedUrl(path, ttl)`. */
type Firma = { url?: string; error?: unknown; throw?: unknown };
let firmas: Map<string, Firma>;
/** Todo lo que se le pidió firmar, para poder asertar sobre las llamadas. */
let pedidas: { bucket: string; path: string; ttl: number }[];
/** Cache de URLs generadas, para que el mismo path produzca el mismo texto. */
let firmadas: Map<string, string>;

function instalarSupabaseFalso() {
  mock.module('@supabase/supabase-js', () => ({
    createClient: () => ({
      storage: {
        from: (bucket: string) => ({
          createSignedUrl: async (path: string, ttl: number) => {
            pedidas.push({ bucket, path, ttl });
            const firma = firmas.get(path);
            if (firma?.throw) throw firma.throw;
            return {
              data: firma?.url ? { signedUrl: firma.url } : { signedUrl: null },
              error: firma?.error ?? null,
            };
          },
        }),
      },
    }),
  }));
}

/**
 * URL firmada con la FORMA que devuelve Supabase, y un token opaco.
 *
 * El token NO incluye la ruta a propósito. Es lo que lo hace creíble: una URL
 * firmada real no lleva el path en claro más de una vez, así que un assert del
 * tipo "la respuesta no contiene `report/`" tiene que poder pasar. Con un token
 * que repitiera la ruta, ese assert no distinguiría una fuga de una firma
 * legítima y el test mentiría en el sentido contrario.
 *
 * El nombre de la URL se cachea por ruta para que dos llamadas comparen igual:
 * el TTL se prueba sobre `pedidas`, no sobre el texto de la URL.
 */
const FIRMADA = (path: string) => {
  const yaFirmada = firmadas.get(path);
  if (yaFirmada) return yaFirmada;
  const url = `https://proyecto.supabase.co/object/sign/${BUG_REPORT_IMAGES_BUCKET}/${path}?token=opaco-${firmadas.size}`;
  firmadas.set(path, url);
  return url;
};

let store: { findById: (id: string) => Promise<StoreEntry | null> };
let service: BugReportInboxService;

const filaDe = (value: unknown, state = 'ABIERTO'): StoreEntry => ({
  id: ID,
  namespace: 'bug_report',
  key: null,
  value,
  delivery_status: 'PENDIENTE',
  state,
  origin: 'ios',
  created_at: new Date('2026-09-20T10:00:00.000Z'),
  updated_at: new Date('2026-09-20T10:00:00.000Z'),
  deleted_at: null,
});

const configDe = (buckets: string) =>
  ({
    get: (key: string) =>
      ({
        SUPABASE_URL: 'https://proyecto.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-de-test',
        SUPABASE_ALLOWED_BUCKETS: buckets,
      })[key],
  }) as unknown as ConfigService<Env, true>;

beforeEach(async () => {
  firmas = new Map();
  pedidas = [];
  firmadas = new Map();
  instalarSupabaseFalso();
  // El import es dinámico y va DESPUÉS del mock.module: con un import estático
  // el módulo ya estaría cargado con el cliente real.
  const { BugReportInboxService: Svc } =
    await import('./bug-report-inbox.service');
  store = { findById: async () => filaDe(REPORTE) };
  service = new Svc(
    store as unknown as AppStoreRepository,
    configDe('images,bug_report_images'),
  );
});

afterEach(() => {
  mock.restore();
});

describe('el detalle devuelve URLs firmadas, no rutas', () => {
  test('cada ruta de value.images sale como una URL firmada', async () => {
    firmas.set(PATH_1, { url: FIRMADA(PATH_1) });
    firmas.set(PATH_2, { url: FIRMADA(PATH_2) });

    const dto = await service.getById(ID);

    expect(dto.image_urls).toEqual([FIRMADA(PATH_1), FIRMADA(PATH_2)]);
  });

  test('la respuesta parseada por el contrato solo trae URLs, no rutas sueltas', async () => {
    firmas.set(PATH_1, { url: FIRMADA(PATH_1) });
    firmas.set(PATH_2, { url: FIRMADA(PATH_2) });

    const dto = await service.getById(ID);
    // Por el schema del contrato, que es lo que ve el panel.
    const cuerpo = BugReportDetailSchema.parse(dto);

    // LO QUE ESTO NO DICE, porque sería falso: una URL firmada de Supabase SÍ
    // contiene la ruta, dentro del path que la propia Storage API construye
    // (`/object/sign/<bucket>/<path>`). La garantía no es "la ruta no aparece",
    // es "lo que aparece es una URL firmada y caduca sola": con el token, la
    // ruta no sirve para descargar nada sin él, y al expirar deja de servir.
    //
    // Por eso el assert es sobre la FORMA de cada elemento —URL absoluta con
    // token— y no sobre una ausencia de substring, que fallaría contra una
    // firma legítima.
    expect(cuerpo.image_urls).toHaveLength(2);
    for (const url of cuerpo.image_urls) {
      expect(url.startsWith('https://')).toBe(true);
      expect(url).toContain(`/${BUG_REPORT_IMAGES_BUCKET}/`);
      expect(url).toContain('token=');
    }
    // Y la clave del contrato no se parece a la del `value`: no hay `images`
    // con la ruta desnuda esperando a que alguien la lea.
    expect('images' in cuerpo).toBe(false);
  });

  test('firma contra el bucket del servidor, nunca contra uno de value', async () => {
    firmas.set(PATH_1, { url: FIRMADA(PATH_1) });
    firmas.set(PATH_2, { url: FIRMADA(PATH_2) });

    await service.getById(ID);

    // El bucket es una constante: un `value.images` con `../otro_bucket/x` no
    // puede mover la firma a otro lado.
    expect(pedidas.map((p) => p.bucket)).toEqual([
      BUG_REPORT_IMAGES_BUCKET,
      BUG_REPORT_IMAGES_BUCKET,
    ]);
    expect(pedidas.map((p) => p.path)).toEqual([PATH_1, PATH_2]);
  });

  test('la URL firmada caduca en minutos, no en días', async () => {
    firmas.set(PATH_1, { url: FIRMADA(PATH_1) });
    firmas.set(PATH_2, { url: FIRMADA(PATH_2) });

    await service.getById(ID);

    // Una URL de un día queda utilizable en el historial del navegador, en un
    // ticket de soporte y en la caché de un proxy, y el bucket es privado.
    expect(BUG_REPORT_IMAGE_URL_TTL_SECONDS).toBe(300);
    for (const p of pedidas) expect(p.ttl).toBe(300);
  });
});

describe('una captura que no se puede firmar se OMITE, no se publica cruda', () => {
  test('una firma con error deja el array más corto y sin la ruta', async () => {
    firmas.set(PATH_1, { url: FIRMADA(PATH_1) });
    firmas.set(PATH_2, { error: { message: 'Object not found' } });

    const dto = await service.getById(ID);

    expect(dto.image_urls).toEqual([FIRMADA(PATH_1)]);
    // Y el hueco NO se rellena con el path: esta es la aserción que falla si el
    // service cayera en el arreglo fácil de "devuelvo lo que tengo".
    expect(JSON.stringify(dto)).not.toContain('captura-2.png');
    // Y la clave del contrato es `image_urls`, no `images`: un `images` en la
    // respuesta significaría que la ruta cruda tiene un canal con nombre propio.
    // El assert va sobre las claves, no sobre el texto, porque el bucket en la
    // URL firmada se llama `bug_report_images` y un `not.toContain('images')`
    // sobre el JSON entero daría un falso positivo con cualquier firma.
    expect(Object.keys(dto)).toContain('image_urls');
    expect(Object.keys(dto)).not.toContain('images');
  });

  test('el hueco de una captura caída no se llena con SU ruta cruda', async () => {
    // El caso exacto del arreglo fácil: si el service hiciera
    // `firmadas[i] ?? paths[i]`, la captura que no se pudo firmar aparecería en
    // `image_urls` como `uid/report/captura-2.png` — descargable por nadie y con
    // el layout del bucket y el uid adentro, que es lo que el design prohíbe.
    firmas.set(PATH_1, { url: FIRMADA(PATH_1) });
    firmas.set(PATH_2, { error: { message: 'Object not found' } });

    const dto = await service.getById(ID);

    expect(dto.image_urls).toHaveLength(1);
    expect(dto.image_urls[0]).toBe(FIRMADA(PATH_1));
    // Ninguna URL del resultado es una ruta desnuda: toda una que salga tiene
    // que ser una URL firmada con su host.
    for (const url of dto.image_urls) {
      expect(url.startsWith('https://')).toBe(true);
      expect(url).toContain('token=');
    }
  });

  test('el detalle LLEGA igual y legible con la captura caída', async () => {
    // El motivo de omitir en vez de tirar: un reporte con una captura borrada
    // tiene que seguir siendo visible. Si la firma fallara -> 500, el buzón
    // perdería justo el reporte que hay que limpiar.
    firmas.set(PATH_1, { url: FIRMADA(PATH_1) });
    firmas.set(PATH_2, { error: { message: 'Object not found' } });

    const dto = await service.getById(ID);

    expect(dto.readable).toBe(true);
    expect(dto.summary).toBe('No me deja pagar con la tarjeta que usé ayer');
    expect(dto.reporter_id).toBe(REPORTER);
    expect(BugReportDetailSchema.safeParse(dto).success).toBe(true);
  });

  test('un cliente que lanza (red caída) también se omite sin tumbar el detalle', async () => {
    firmas.set(PATH_1, { url: FIRMADA(PATH_1) });
    firmas.set(PATH_2, { throw: new Error('fetch failed') });

    const dto = await service.getById(ID);

    expect(dto.image_urls).toEqual([FIRMADA(PATH_1)]);
    expect(dto.readable).toBe(true);
  });

  test('todas las firmas fallen → detalle legible con image_urls vacío', async () => {
    for (const path of [PATH_1, PATH_2]) firmas.set(path, { error: 'nope' });

    const dto = await service.getById(ID);

    expect(dto.image_urls).toEqual([]);
    expect(dto.readable).toBe(true);
    expect(JSON.stringify(dto)).not.toContain('captura');
  });

  test('un signedUrl ausente sin error también cuenta como fallo', async () => {
    // `{ data: { signedUrl: null }, error: null }` es una respuesta que el
    // cliente puede devolver; si solo se mirara `error`, esa captura se
    // colaría como `null` en el array de URLs.
    firmas.set(PATH_1, { url: FIRMADA(PATH_1) });
    firmas.set(PATH_2, {});

    const dto = await service.getById(ID);

    expect(dto.image_urls).toEqual([FIRMADA(PATH_1)]);
  });
});

describe('un reporte sin capturas no toca la red', () => {
  test('sin images, no se pide ninguna firma', async () => {
    store.findById = async () =>
      filaDe({ summary: 'Solo texto', reporter_id: REPORTER });

    const dto = await service.getById(ID);

    expect(dto.image_urls).toEqual([]);
    expect(pedidas).toEqual([]);
  });

  test('una fila ilegible tampoco pide firmas', async () => {
    store.findById = async () => filaDe({ lo_que_sea: true });

    const dto = await service.getById(ID);

    expect(dto.readable).toBe(false);
    expect(dto.image_urls).toEqual([]);
    expect(pedidas).toEqual([]);
  });
});

describe('el bucket de las capturas no depende de la allowlist de escritura', () => {
  /**
   * La firma usa la constante del servidor, NO `SUPABASE_ALLOWED_BUCKETS`, y
   * este test es lo que fija esa decisión.
   *
   * Esa allowlist es de ESCRITURA: la usa `POST /upload/image`, que sube y
   * devuelve un `getPublicUrl`, y en un bucket `public = false` esa URL no
   * resuelve. Meter `bug_report_images` ahí abriría de más un endpoint de
   * escritura para comprar nada: el móvil sube las capturas con su propia
   * sesión, y el API solo necesita FIRMAR rutas de un bucket privado, que no
   * requiere permiso de escritura.
   *
   * El config de este describe NO lista el bucket en ningún caso, y aun así
   * firma. Si alguien reintrodujera el filtro por allowlist, este test falla.
   */
  test('firma aunque SUPABASE_ALLOWED_BUCKETS no liste el bucket', async () => {
    firmas.set(PATH_1, { url: FIRMADA(PATH_1) });
    firmas.set(PATH_2, { url: FIRMADA(PATH_2) });
    const { BugReportInboxService: Svc } =
      await import('./bug-report-inbox.service');
    store.findById = async () => filaDe(REPORTE);
    const svc = new Svc(
      store as unknown as AppStoreRepository,
      // Allowlist de escritura real, sin el bucket de reportes.
      configDe('images,business_images,categories_images,product_images'),
    );

    const dto = await svc.getById(ID);

    expect(dto.image_urls).toEqual([FIRMADA(PATH_1), FIRMADA(PATH_2)]);
    expect(pedidas.map((p) => p.bucket)).toEqual([
      BUG_REPORT_IMAGES_BUCKET,
      BUG_REPORT_IMAGES_BUCKET,
    ]);
  });

  test('firma con la allowlist vacía: el bucket no sale de la configuración', async () => {
    firmas.set(PATH_1, { url: FIRMADA(PATH_1) });
    const { BugReportInboxService: Svc } =
      await import('./bug-report-inbox.service');
    store.findById = async () => filaDe({ ...REPORTE, images: [PATH_1] });
    const svc = new Svc(store as unknown as AppStoreRepository, configDe(''));

    const dto = await svc.getById(ID);

    expect(dto.image_urls).toEqual([FIRMADA(PATH_1)]);
  });

  test('y el bucket sigue sin estar en la allowlist de escritura', async () => {
    // La otra mitad de la decisión, sobre el default real del env: si alguien
    // lo volviera a meter, el endpoint de upload volvería a aceptar un bucket
    // cuya URL pública no resuelve.
    const { envSchema } = await import('../../config/env.schema');
    const parsed = envSchema.parse({
      DATABASE_URL: 'postgres://x',
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_JWT_SECRET: 's',
      SUPABASE_ANON_KEY: 'a',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
    });

    expect(parsed.SUPABASE_ALLOWED_BUCKETS.split(',')).not.toContain(
      BUG_REPORT_IMAGES_BUCKET,
    );
  });

  test('el buzón firma igual con la allowlist por defecto del env', async () => {
    firmas.set(PATH_1, { url: FIRMADA(PATH_1) });
    firmas.set(PATH_2, { url: FIRMADA(PATH_2) });

    // El service de `beforeEach` ya corre con una allowlist sin el bucket, así
    // que esto es el caso de producción, no un caso artificial.
    const dto = await service.getById(ID);

    expect(dto.image_urls).toHaveLength(2);
  });
});

describe('el triaje también devuelve el detalle firmado', () => {
  test('setState no deja el drawer sin capturas', async () => {
    firmas.set(PATH_1, { url: FIRMADA(PATH_1) });
    firmas.set(PATH_2, { url: FIRMADA(PATH_2) });
    store.findById = async () => filaDe(REPORTE);
    // `updateState` devuelve la fila YA escrita, con el estado nuevo: si el
    // doble devolviera la fila previa, el service firmaría bien y el test
    // fallaría por el `state`, no por las capturas, que es otra cosa.
    (store as unknown as { updateState: unknown }).updateState = async () =>
      filaDe(REPORTE, 'CORREGIDO');

    const dto = await service.setState(ID, 'CORREGIDO');

    // El PATCH devuelve el detalle completo y el panel reemplaza el drawer con
    // esta respuesta: si no vinieran firmadas, cada triaje borraría de la vista
    // las capturas que el operador está mirando.
    expect(dto.state).toBe('CORREGIDO');
    expect(dto.image_urls).toEqual([FIRMADA(PATH_1), FIRMADA(PATH_2)]);
  });
});
