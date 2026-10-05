import { describe, expect, test } from 'bun:test';
import { createClient } from '@supabase/supabase-js';

/**
 * POR QUÉ UN ARCHIVO QUE NO PROBABA NADA DE NUESTRO
 *
 * `listEligible` decide si la lectura es `authenticated` o `anon` según haya
 * token, y lo hace pasando el token en `global.headers` de supabase-js. Eso
 * funciona por una garantía de la librería: en `fetchWithAuth`, el header que
 * trae el llamador se respeta y SOLO si falta el cliente pone su fallback
 * (`if (!headers.has('Authorization'))`), que es la anon key.
 *
 * La garantía es lo único que separa "la policy filtra para el usuario" de "la
 * policy filtra para un anónimo". Si una versión de supabase-js invirtiera esa
 * precedencia, TODA lectura autenticada se degradaría a `anon` en silencio: no
 * habría error, ni warning, ni diferencia visible — y el `required` que alguien
 * dirige a un usuario volvería a no llegarle, o el `consumers` de un negocio
 * se le filtraría a cualquiera.
 *
 * El spec del repository mockea `createClient`, y `mock.restore()` no deshace un
 * `mock.module`, así que la garantía del cliente real no se puede medir ahí. Por
 * eso vive acá, sin mocks: cliente real de la versión instalada, `fetch` falso,
 * y lo que se asserta es el header que sale por la red.
 */

const URL = 'https://proyecto.supabase.co';
const ANON_KEY = 'anon-key-de-prueba';
const TOKEN = 'Bearer jwt-del-usuario';

/** Los headers con los que salió la request, tal como los ve la red. */
async function authorizationDeSalida(
  token: string | undefined,
): Promise<string | undefined> {
  let saliente: Headers | undefined;

  const cliente = createClient(URL, ANON_KEY, {
    global: {
      headers: token ? { Authorization: token } : {},
      fetch: async (_url: string, init?: RequestInit) => {
        saliente = new Headers(init?.headers);
        return new Response('[]', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await cliente.from('announcements').select('id').limit(1);

  // `Headers` normaliza los nombres a minúscula, y es la forma en la que llega
  // al servidor: por eso se lee en minúscula y no como `Authorization`.
  return saliente?.get('authorization') ?? undefined;
}

describe('la precedencia del header Authorization en supabase-js', () => {
  test('con token del llamador, sale ESE token y no la anon key', async () => {
    expect(await authorizationDeSalida(TOKEN)).toBe(TOKEN);
  });

  test('sin token del llamador, sale la anon key como bearer', async () => {
    // Es lo que hace que el banner del landing sea anónimo: sin token, la
    // request llega como `anon` y la policy resuelve a ese caso.
    expect(await authorizationDeSalida(undefined)).toBe(`Bearer ${ANON_KEY}`);
  });

  test('el token del llamador no queda mezclado con la anon key', async () => {
    // La api key viaja igual, como `apikey`: no se reemplaza, se agrega. Si
    // alguna vez se sustituyeran, la request dejaría de ser del usuario.
    const authorization = await authorizationDeSalida(TOKEN);

    expect(authorization).toBe(TOKEN);
    expect(authorization).not.toContain(ANON_KEY);
  });
});
