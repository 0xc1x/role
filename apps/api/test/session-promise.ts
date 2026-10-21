/**
 * LA PROMESA DEL §5.2, EN TYPESCRIPT, Y LA MATRIZ DE SUS CASOS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ─── QUÉ ES ESTE ARCHIVO Y POR QUÉ NO ES CÓDIGO DE PRODUCCIÓN ───────────────
 *
 * Es el ORÁCULO de la promesa, y vive en `test/` y no en `src/` a propósito.
 *
 * Antes de esta tarea, la combinación de «vencida» —TTL apagado **o** (sello
 * presente **y** la fecha compartida no pasó)— estaba escrita en dos
 * lugares: en SQL y en TypeScript (`src/database/business-membership.ts`).
 * Dos lugares que se apartan sin que nada lo note es exactamente lo que el
 * §5.2 no quiere: «la que autoriza y la que explica nunca se contradicen».
 *
 * La tarea que corta esa copia no puede comprobarse con el texto de las dos
 * mitades, porque después de la tarea no hay texto en TypeScript que
 * comparar. Lo que queda es una COMPARACIÓN DE COMPORTAMIENTO, y para
 * comparar hace falta un lado que no dependa de la base: un oráculo.
 *
 * Por eso este oráculo existe, y por eso no llama a ninguna función de la
 * base. Si llamara a `business_member_session_expires_at`, cambiar la
 * definición de «vencida» en SQL cambiaría los DOS lados y la comparación
 * seguiría dando «de acuerdo»: sería un espejo de una sola cara. Calculando
 * la cuenta aquí, en TypeScript, el oráculo es INDEPENDIENTE de la base, y
 * por eso un cambio en SQL aparece como una discrepancia.
 *
 * ─── LO QUE ESTE ARCHIVO NO ES ──────────────────────────────────────────────
 *
 * No es una segunda implementación de la regla. La regla vive en
 * `public.business_member_session_inside_promise`, y el código de
 * producción no la reescribe en ninguna parte. Acá está la RESPUESTA que
 * la regla tiene que dar, escrita como un valor esperado, que es otra cosa:
 * un valor esperado no es una implementación, es una afirmación.
 *
 * ─── LA MATRIZ ──────────────────────────────────────────────────────────────
 *
 * Son los casos que el §5.2 menciona y que una implementación puede
 * confundir. Los tres que más importan:
 *
 *   - **el TTL apagado manda** (modo «equipo propio» del §9.2): con sello o
 *     sin él, la sesión no vence, y por eso la fila no necesita sello;
 *   - **con TTL puesto hace falta sello**: sin sello, la sesión está vencida
 *     por definición, y nadie tiene que haber expirado nada;
 *   - **el borde**: una sesión que vence JUSTO ahora sigue viva. La
 *     comparación es `>=`, no `>`, y una promesa que se cumple «hasta el
 *     último instante» se cumple en ese instante.
 *
 * El último caso es el que separa una implementación correcta de una que
 * funciona: `expires_at >= now()` y `expires_at > now()` se portan igual en
 * los siete casos restantes y se portan distinto en ése. Por eso está, y por
 * eso el sello del caso se calcula con la misma aritmética que usa la base
 * (`now() - ttl horas`), no con un número redondo de horas.
 *
 * ─── LA HORA, Y POR QUÉ CADA LADO USA LA SUYA ───────────────────────────────
 *
 * La base compara contra `now()`, que es la hora de la transacción. El
 * oráculo compara contra el reloj del proceso. Los dos relojes no son el
 * mismo, y no hace falta que lo sean: cada caso se define RELATIVAMENTE a
 * su propio «ahora» (un sello de N horas antes), así que cada lado decide
 * sobre su propio instante y los dos lados tienen que coincidir en la
 * respuesta, no en la fecha.
 *
 * El caso del borde es el único donde eso no basta —porque «justo ahora» es
 * justo ahora— y aun así funciona: el sello del oráculo es
 * `now - ttl horas` y el de la base es `now() - ttl horas`, así que en los
 * dos lados el vencimiento cae EXACTAMENTE en su propio ahora, y los dos
 * lados responden lo mismo.
 */

/** One case of the §5.2 promise, with the answer both sides have to give. */
export interface PromiseCase {
  /** What the case is, in the spec's voice. */
  readonly name: string;
  /** `session_ttl_hours`. Zero is the «equipo propio» mode of §9.2. */
  readonly ttlHours: number;
  /**
   * Hours from "now" to the seal. Negative is in the past, zero is now, and
   * `null` is NO SEAL AT ALL — which is a different case, not a distant one.
   */
  readonly sealedOffsetHours: number | null;
  /** The answer the promise has to give. */
  readonly expected: boolean;
}

/**
 * Every case of the promise, and the answer it has to give.
 *
 * The order is the order of the rule: the TTL apagado first (it short
 * circuits everything), then the TTL puesto with a seal, then the TTL puesto
 * without one. The border case is last because it is the one that needs the
 * arithmetic to be exact.
 */
export const PROMISE_CASES: readonly PromiseCase[] = [
  {
    name: 'el TTL apagado manda, con sello',
    ttlHours: 0,
    sealedOffsetHours: -24,
    expected: true,
  },
  {
    name: 'el TTL apagado manda, sin sello',
    ttlHours: 0,
    sealedOffsetHours: null,
    expected: true,
  },
  {
    name: 'con TTL y con sello vigente',
    ttlHours: 24,
    sealedOffsetHours: 0,
    expected: true,
  },
  {
    name: 'con TTL y con sello en el futuro',
    ttlHours: 24,
    sealedOffsetHours: 1,
    expected: true,
  },
  {
    name: 'con TTL y con sello vencido',
    ttlHours: 24,
    sealedOffsetHours: -25,
    expected: false,
  },
  {
    name: 'con TTL y sin sello',
    ttlHours: 24,
    sealedOffsetHours: null,
    expected: false,
  },
  {
    name: 'la fecha compartida vence justo ahora',
    ttlHours: 24,
    sealedOffsetHours: -24,
    expected: true,
  },
];

/** The seal of a case, relative to `now`. `null` means no seal at all. */
export function sealedAtOf(aCase: PromiseCase, now: Date): Date | null {
  if (aCase.sealedOffsetHours === null) return null;
  return new Date(now.getTime() + aCase.sealedOffsetHours * 3_600_000);
}

/**
 * THE ORACLE: is this session inside the §5.2 promise?
 *
 * The two halves, in the order the rule states them:
 *
 *   1. the TTL is off → inside, with or without a seal;
 *   2. the TTL is on → there has to be a seal, and the shared date has to
 *      not have passed yet.
 *
 * The comparison is `>=`: a session that expires exactly now is still
 * inside, and the case «la fecha compartida vence justo ahora» exists to
 * say so.
 *
 * This function reads NO row and calls NO function of the database. That is
 * the whole point of it: an oracle that leaned on the base would move with
 * the base, and a comparison between two things that move together proves
 * nothing.
 */
export function insidePromise(
  ttlHours: number,
  sealedAt: Date | null,
  now: Date,
): boolean {
  if (ttlHours === 0) return true;
  if (sealedAt === null) return false;
  return sealedAt.getTime() + ttlHours * 3_600_000 >= now.getTime();
}

/**
 * The oracle's answer for every case of the matrix.
 *
 * The key is the case's name, so a diff shows WHICH case moved and not only
 * that «the answers are not equal».
 */
export function promiseAnswers(now: Date): Record<string, boolean> {
  return Object.fromEntries(
    PROMISE_CASES.map((aCase) => [
      aCase.name,
      insidePromise(aCase.ttlHours, sealedAtOf(aCase, now), now),
    ]),
  );
}
