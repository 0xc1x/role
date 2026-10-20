import { describe, expect, test } from 'bun:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { liveMembership, ownerMembership } from './business-membership';
import { PROMISE_CASES, promiseAnswers } from '../../test/session-promise';

/**
 * EL LADO DE TYPESCRIPT DE LA PROMESA DEL §5.2
 * ═══════════════════════════════════════════════
 *
 * ─── QUÉ MIDE ESTE ARCHIVO ──────────────────────────────────────────────────
 *
 * Que el módulo de membresía NO reescribe la combinación de «vencida», y que
 * la respuesta que la promesa tiene que dar en TypeScript es la que dice el
 * oráculo de `test/session-promise.ts`.
 *
 * ─── POR QUÉ UN ARCHIVO PROPIO Y NO UNA ASERCIÓN DENTRO DE OTRO ──────────────
 *
 * Porque este archivo no necesita una base, y una prueba que no necesita una
 * base no debería esperar a que haya una. El guard de este lado es una
 * lectura de TEXTO: el SQL que el módulo genera. Se puede hacer sin base, en
 * milisegundos, y por eso vive solo.
 *
 * El otro lado —el de SQL— vive en `security/business-members.rls.db.spec.ts`,
 * contra el espejo que replayea `supabase/migrations/`, y compara las DOS
 * respuestas: la que da la función de la base y la que da el oráculo. Este
 * archivo es la mitad que no necesita base; el otro es la que sí.
 *
 * ─── POR QUÉ EL GUARD ES DE TEXTO Y NO DE COMPORTAMIENTO ────────────────────
 *
 * Porque es lo que se puede afirmar SIN base, y porque afirma algo que el
 * comportamiento no puede afirmar: que la regla no está escrita dos veces.
 *
 * Una prueba de comportamiento —«con TTL y sin sello, la fila no entra»—
 * pasa igual si la regla está escrita en TypeScript o si la API pregunta a la
 * base. Esa es la diferencia entre un invariante y una casualidad, y por eso
 * el guard de texto existe: es el que dice que la API DELEGA.
 *
 * Y el guard de texto sólo funciona si mira lo que de verdad se ejecuta. Por
 * eso no mira el código fuente del módulo —que un refactor puede dejar
 * mintiendo— sino el SQL que Drizzle genera, que es lo que viaja a la base.
 */
describe('la promesa de sesión, del lado de TypeScript', () => {
  const dialect = new PgDialect();
  const USER = '11111111-1111-1111-1111-111111111111';

  /**
   * The SQL that Drizzle actually sends, for the two predicates of the module.
   *
   * `PgDialect.sqlToQuery` is the same renderer the driver uses, so what is
   * asserted here is the text that reaches Postgres —not a paraphrase of it.
   */
  const rendered = {
    live: dialect.sqlToQuery(liveMembership(USER)).sql,
    owner: dialect.sqlToQuery(ownerMembership(USER)).sql,
  };

  test('el módulo de membresía no reescribe la combinación', () => {
    for (const [name, sql] of Object.entries(rendered)) {
      // La regla se PREGUNTA, no se escribe.
      expect(
        sql,
        `${name}: el predicado tiene que NOMBRAR la función de la base, no ` +
          'repetir la combinación. La diferencia es la diferencia entre una ' +
          'regla y dos reglas que pueden apartarse.',
      ).toContain('public.business_member_session_inside_promise(');

      // Y se pregunta UNA vez.
      expect(
        sql.match(/public\.business_member_session_inside_promise\(/g) ?? [],
        `${name}: la promesa se pregunta una sola vez. Dos llamadas son dos ` +
          'preguntas, y dos preguntas pueden tener dos respuestas.',
      ).toHaveLength(1);

      // La ARITMÉTICA no está en TypeScript: la cuenta es de la base.
      expect(
        sql,
        `${name}: la aritmética de la expiración es de la base ` +
          '(`business_member_session_expires_at`) y no de este módulo.',
      ).not.toContain('business_member_session_expires_at');

      // Ni la cuenta en crudo, ni el reloj, ni la mitad del TTL apagado.
      expect(
        sql,
        `${name}: el módulo no calcula la cuenta de la expiración.`,
      ).not.toContain('interval');
      expect(
        sql,
        `${name}: el módulo no compara contra el reloj: la comparación es de ` +
          'la base, que es donde vive el `now()` de la promesa.',
      ).not.toContain('now()');
      expect(
        sql,
        `${name}: la mitad del TTL apagado es parte de la combinación, y la ` +
          'combinación está en la base. Escribirla acá es volver a copiarla.',
      ).not.toMatch(/session_ttl_hours"\s*=\s*0/);
    }
  });

  test('la promesa en TypeScript tiene las cuatro mitades', () => {
    // El reloj del proceso. Cada caso se define RELATIVAMENTE a su propio
    // «ahora», así que el reloj no tiene que ser el de la base: lo que se
    // compara son las RESPUESTAS, no las fechas.
    const answers = promiseAnswers(new Date());

    for (const aCase of PROMISE_CASES) {
      expect(
        answers[aCase.name],
        `«${aCase.name}»: la promesa tiene que responder ${aCase.expected}. ` +
          'Si contesta otra cosa, la API y la base van a discrepar sobre quién ' +
          'tiene una sesión viva, y una de las dos se va a equivocar sin que ' +
          'nadie lo note.',
      ).toBe(aCase.expected);
    }
  });
});
