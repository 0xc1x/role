/**
 * Cómo se formatea y desde dónde arranca el número de stats del hero.
 *
 * Vive acá, y no en `hero.tsx`, por dos razones concretas:
 *
 *  · `useCountUp` tiene que formatear el valor interpolado en cada frame. Si el
 *    formateador se quedara en el componente, el hook tendría el suyo y los dos
 *    podrían divergir en el separador —`18.847` con punto de un lado y `18,847`
 *    con coma del otro.
 *  · `countUpFrom` es la política —qué parte del número se anima— y no se
 *    teste observing un componente. Puro, se verifica en una línea.
 */

/** Ecuador: el separador de miles es el punto, no la coma. */
export const numberFormat = new Intl.NumberFormat("es-EC");

/**
 * El string que ve el servidor, el crawler y el usuario sin JS.
 *
 * `undefined` NO es `0`: es la señal de que la API no respondió, y por eso
 * devuelve `"—"` y no `"0+"`. El `data-stats-source` del hero distingue los dos
 * casos; el texto tiene que hacerlo también.
 */
export function formatStat(value: number | undefined): string {
	if (value === undefined) return "—";
	return `${numberFormat.format(value)}+`;
}

/**
 * Desde dónde arranca el conteo para terminar en `real`.
 *
 * POR QUÉ NO DESDE CERO. Con miles de usuarios, `0 → 18.847` en 1.2 s son cinco
 * dígitos girando: se lee como un glitch, no como una animación, y miente —
 * esa cifra ya existía antes de que abrieras la página. Y en el rango de dos
 * dígitos un salto grande se lee justo como lo que es: un número que llega.
 *
 * LA REGLA. Con una o dos cifras no hay nada "de arriba" que preservar y el
 * rango es chico, así que se animate el número entero con un salto proporcional.
 * Desde tres cifras para arriba solo se mueven los DOS últimos dígitos; los de
 * orden superior quedan fijos, y con ellos el invariante que hace que esto no
 * produzca layout shift: el string tiene siempre igual cantidad de caracteres.
 *
 * `real = 100` no se anima. Arrancar en `99` significa perder un dígito a mitad
 * de camino y hacer crecer el bloque de stats un carácter en el frame exacto en
 * que el número debería estar terminando. No animar es el fallo feo; medirse es
 * el feo.
 */
export function countUpFrom(real: number): number {
	if (!Number.isFinite(real) || real <= 0) return 0;

	const rounded = Math.round(real);

	// El piso: el menor número con la misma cantidad de cifras que el final. Es
	// lo que impide el layout shift, y hace falta en LOS DOS RAMOS. Con
	// `Math.floor(real * 0.5)` solo, un 14 arrancaba en 7 y el conteo pasaba de
	// "7+" a "14+" — el bloque crecía un carácter en pleno frame final.
	const sameDigitsFloor = 10 ** (String(rounded).length - 1);

	// De una a dos cifras no hay nada "de arriba" que preservar, así que el
	// recorrido se lleva casi desde abajo: el 10%. MEDIDO: con un arranque a la
	// mitad (`20 → 10`) la animación mostraba DOS valores distintos, 19 y 20 — un
	// parpadeo, no un conteo. Con dieciocho pasos se lee. El "casi" viene del
	// piso de abajo: arrancar en 0 hace que el ojo lea "0+ usuarios" medio
	// segundo antes de que el número lo corrija.
	//
	// Desde tres cifras la regla es la otra y no se toca: solo se mueven los dos
	// últimos dígitos, para que un número de miles no recorra cinco posiciones.
	const candidate = rounded < 100 ? Math.floor(rounded * 0.1) : rounded - 99;

	return Math.max(sameDigitsFloor, candidate);
}
