# Rolé — estado al cerrar la rama de anuncios

La rama `feat/anuncios` está mergeada en `main` local: 38 commits, 8 tareas, todas revisadas.

## Verificación de los tres merges

```
typecheck raíz   6/6 tasks
commons          344 pass / 0 fail
apps/api         1897 pass / 0 fail / 50 errors de fondo (sin TEST_DATABASE_URL)
apps/admin        641 pass / 0 fail
role-landing       118 pass / 0 fail
apps/mobile        697 pass / 0 fail
```

Las dos migraciones aplicadas, con `md5` del archivo igual al `md5(statements[1])` del ledger:

| migración | md5 |
| --- | --- |
| `20261004022647_announcements` | `7f17bb5d5712246a4d17c70e1b167eb1` |
| `20261005020520_announcement_acknowledgements_user_index` | `7ffa4bb21d69f088e7bdc3d9cc30faa3` |

## Las dos invariantes del feature

**La elegibilidad vive entera en la policy de RLS.** Ni el API ni el cliente filtran, y hay un
test que lo muerde: `apps/api/src/modules/announcements/announcements.repository.spec.ts:210`
exige cero métodos de filtro y que `active` / `start_at` / `end_at` / `audience` no aparezcan en
ninguna llamada que no sea `from` o `select`.

**Un `required` vuelve hasta que la persona lo entienda.** El acknowledgement escribe una fila que
no se puede deshacer —la tabla no tiene policy de UPDATE ni de DELETE—, así que cerrar el modal no
lo saca de la cola: solo "Entendido" lo hace.

## Fallos que aparecieron y cómo se resolvieron

Ninguno era del código; todos venían de algo que una tarea anterior había dejado así:

- **`queryKey` sin usuario** heredaba avisos de la persona anterior en un cierre de sesión
  involuntario, porque la entrada sobrevivía `gcTime: 30 min`. Para un `required` eso lo dejaba
  **invisible**, que es la falla inversa de la regla.
- **El `select` derivado del esquema**dragaría `user_ids`/`business_ids` si alguien los sumara al
  contrato. SeKeeping_: derivar es lo correcto, porque una allowlist escrita a mano **descartaría
  el campo nuevo en silencio** — `z.object()` de Zod 4 hace strip de unknown keys. El gate
  pertenece a commons, no a la capa que consulta.
- **El `source` del banner nunca podía ser `"failed"`** en el HTML servido: la página recalculaba
  desde un observer nuevo, y sobre una query erroreada eso arranca en `pending`. El mecanismo real
  está en `QueryObserver#createResult` (`queryObserver.js:248`), no en `retry` como se suponía.
- **`Promise<void>` no impedía cruzar los callbacks.** `tsc --strict`: `(id) => Promise<void>`
  asignable a `(id) => void` **sin error**. Lo que lo impedía era la divergencia `string` vs
  `string[]`. El docblock prometía una garantía que no existía.
- **El seq scan de los acks**: la PK es `(announcement_id, user_id)` con anuncios como columna
  líder, y la policy filtra por `user_id`. Sin índice por `user_id`, la consulta de ids ya entendidos
  era un seq scan de **toda** la tabla de acks, en cada arranque. Con la tabla vacía era inofensivo,
  y esa era la trampa: el costo crece sin que nadie toque código.
- **`offer.stock` podía pasar 2^31 al contrato y moría en la base** — un 500 donde el mismo valor
  en el borde debía haber producido un 400. Causa: `z.number().int()` de Zod 4 es *entero seguro*
  (hasta 2^53−1), no int4. Todo lo que el schema valida sale de un int4, así que la cota va en el
  schema y no en el punto de uso.

## Lo que quedó abierto, con su razón

1. **`TimestamptzSchema` acepta fechas que no son fechas.** `start_at: "hola"` da 400 con *"La
   fecha de fin debe ser posterior"*, porque `NaN >= NaN` es `false`. **No se acotó**: hacerlo
   estricto puede rechazar valores que PostgREST sí devuelve, y eso rompe lecturas en producción.
   Necesita su propia investigación sobre qué formatos emite la base. Rama:
   `fix/int4-bound-and-timestamptz`.
2. **`routeTree.gen.ts` va a perder un bloque** en la próxima regeneración: el
   `@tanstack/router-generator@1.167.27` instalado no emite el `declare module
   '@tanstack/react-start'`, y `package.json` pide `^1.132.0`. No se disparó en esta rama —el
   bloque sigue en `admin:535` y `landing:214`— pero es una bomba con reloj. **Una línea.**
3. **`refetchOnWindowFocus`** en el default. El peor caso medido es acotado: si el `required`
   escondido vuelve a ser cabeza con la misma identidad, React reutiliza el nodo y `hidden`
   sobrevive.
4. **TOCTOU en `update`**: `findById` se lee fuera de la transacción.
5. **El mapper del panel reconoce el 400 por texto**, no por código. Declarado como trade.
6. **Descartes locales de `info` por audiencia, no por persona.** Declarado en
   `domain/announcement.ts:42`; el estado que sí es por persona —el acknowledgement— vive en el
   servidor.
7. **La policy de INSERT de acks no ata el acknowledgement a un aviso visible.** Oráculo de
   existencia por escritura, sin fuga. La migración está sellada: tocar eso es migración nueva.

## Dos cosas que costaron tiempo y conviene no repetir

- **Una herramienta ausente devuelve un vacío indistinguible de un limpio.** `diff` no existe acá
  y `grep -P` con `\x{}` falla bajo este locale. Correr un control antes de concluir.
- **Un test que grepea fuente no detecta la falla que su nombre promete.** El test decía "junto al
  stack y no dentro de él" y pasaba 9/9 con el componente *dentro* del stack. La cobertura real
  costó 5 mocks y una receta que ya estaba en el repo.

## Dónde está el registro

`.superpowers/` es scratch, ignorado por git. El tarball de esta sesión quedó en
`/home/leonardo/role-backups/sdd-anuncios-20261004-2209.tgz`.
