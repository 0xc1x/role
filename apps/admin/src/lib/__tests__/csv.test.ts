import { describe, expect, it } from "bun:test";
import {
	CSV_BOM,
	type CsvColumn,
	csvFileName,
	escapeCsvValue,
	toCsv,
} from "../csv";

/** Quita el BOM para poder comparar contra el cuerpo del archivo. */
function body(csv: string): string {
	return csv.slice(CSV_BOM.length);
}

describe("escapeCsvValue", () => {
	it("entrecomilla y duplica las comillas", () => {
		// Sin duplicar, el parser lee `"Bar ""La Brewery"""` como el texto
		// `Bar "La` y descarta el resto de la fila.
		expect(escapeCsvValue('Panadería "La Ñata"')).toBe(
			'"Panadería ""La Ñata"""',
		);
	});

	it("entrecomilla las comas sin romper la columna", () => {
		expect(escapeCsvValue("Sushi, ramen y más")).toBe('"Sushi, ramen y más"');
	});

	it("entrecomilla los saltos de línea embebidos", () => {
		expect(escapeCsvValue("primera\nsegunda")).toBe('"primera\nsegunda"');
		expect(escapeCsvValue("primera\r\nsegunda")).toBe('"primera\r\nsegunda"');
	});

	it("deja intacto un valor que no necesita comillas", () => {
		expect(escapeCsvValue("Mascarilla")).toBe("Mascarilla");
		expect(escapeCsvValue(42)).toBe("42");
		expect(escapeCsvValue(-12.5)).toBe("-12.5");
		expect(escapeCsvValue(true)).toBe("true");
	});

	it("escribe vacío en vez de la palabra null o undefined", () => {
		// `null` y `undefined` son datos ausentes, no textos: escribirlos
		// convertiría una celda vacía en el valor "null" que el operador
		// después cuenta como negocio sin teléfono.
		expect(escapeCsvValue(null)).toBe("");
		expect(escapeCsvValue(undefined)).toBe("");
		expect(escapeCsvValue(Number.NaN)).toBe("");
		expect(escapeCsvValue(Number.POSITIVE_INFINITY)).toBe("");
	});

	it("serializa un Date como ISO, que sí ordena y sí compara", () => {
		expect(escapeCsvValue(new Date("2026-09-26T14:30:00.000Z"))).toBe(
			"2026-09-26T14:30:00.000Z",
		);
		expect(escapeCsvValue(new Date("no es fecha"))).toBe("");
	});
});

describe("escapeCsvValue · inyección de fórmulas", () => {
	it("neutraliza los cuatro disparadores de fórmula", () => {
		// Sin el apóstrofo inicial, Excel abre el archivo y CALCULA esto.
		expect(escapeCsvValue("=1+1")).toBe("'=1+1");
		expect(escapeCsvValue("+1+1")).toBe("'+1+1");
		expect(escapeCsvValue("-1+1")).toBe("'-1+1");
		expect(escapeCsvValue("@SUM(A1)")).toBe("'@SUM(A1)");
	});

	it("neutraliza también cuando el disparador viene precedido de espacio o tabulador", () => {
		// El espacio inicial es la variante que sobrevive a un filtro ingenuo.
		expect(escapeCsvValue('  =HYPERLINK("evil")')).toBe(
			'"\'  =HYPERLINK(""evil"")"',
		);
		// El tabulador no obliga a entrecomillar: no hay coma, ni comilla, ni
		// salto de línea en la celda. El apóstrofo basta.
		expect(escapeCsvValue("\t=1+1")).toBe("'\t=1+1");
	});

	it("no toca los números negativos, que son dinero y no fórmulas", () => {
		// El over-correcting clásico: anteponer apóstrofo a `-25.50` vuelve la
		// columna texto y la conciliación de pagos deja de sumar.
		expect(escapeCsvValue(-25.5)).toBe("-25.5");
	});

	it("no toca un texto que solo contiene el símbolo", () => {
		expect(escapeCsvValue("Cafetería@-Home")).toBe("Cafetería@-Home");
	});
});

describe("toCsv", () => {
	interface Row {
		name: string;
		amount: number;
		note: string | null;
	}
	const columns: CsvColumn<Row>[] = [
		{ label: "Negocio", value: (r) => r.name },
		{ label: "Importe", value: (r) => r.amount },
		{ label: "Nota", value: (r) => r.note },
	];
	const rows: Row[] = [
		{ name: "Panadería Ñ", amount: -12.5, note: null },
		{ name: 'Bar "El Ñoño"', amount: 3, note: "a, b\nc" },
	];

	it("antepone el BOM para que Excel abra los acentos", () => {
		// Sin este carácter, «ñ» se ve como «Ã±» en Excel: el dato sale
		// corrupto y no hay ningún aviso en ninguna parte.
		expect(toCsv(rows, columns).startsWith(CSV_BOM)).toBe(true);
		expect(toCsv(rows, columns).charCodeAt(0)).toBe(0xfeff);
	});

	it("escribe la cabecera con el texto de la etiqueta de cada columna", () => {
		expect(body(toCsv(rows, columns)).split("\n")[0]).toBe(
			"Negocio,Importe,Nota",
		);
	});

	it("respeta el orden del array de columnas, no el de las claves del objeto", () => {
		// El orden de `Object.keys(row)` depende de cómo lo construyó el mapper
		// de la API: el mismo archivo puede salir con las columnas reordenadas.
		const reversed: CsvColumn<Row>[] = [
			{ label: "Nota", value: (r) => r.note },
			{ label: "Negocio", value: (r) => r.name },
			{ label: "Importe", value: (r) => r.amount },
		];
		expect(body(toCsv(rows, reversed)).split("\n")[0]).toBe(
			"Nota,Negocio,Importe",
		);
	});

	it("emite una fila por registro, con celdas ausentes vacías", () => {
		expect(toCsv(rows, columns)).toBe(
			`${CSV_BOM}Negocio,Importe,Nota\n` +
				"Panadería Ñ,-12.5,\n" +
				'"Bar ""El Ñoño""",3,"a, b\nc"',
		);
	});

	it("iguala el número de celdas de todas las filas", () => {
		// Una fila con una celda de menos se corre un valor a la columna
		// vecina en la hoja: el error es invisible hasta que alguien suma.
		// Se mide sobre datos sin saltos de línea, porque un `\n` embebido
		// también corta la línea al dividirla a mano.
		const flat: Row[] = [
			{ name: "Panadería Ñ", amount: -12.5, note: null },
			{ name: 'Bar "El Ñoño"', amount: 3, note: "nota, con coma" },
		];
		const cells = (line: string) => line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
		for (const line of body(toCsv(flat, columns)).split("\n")) {
			expect(cells(line)).toHaveLength(3);
		}
	});

	it("devuelve solo la cabecera cuando no hay filas", () => {
		const csv = toCsv([], columns);
		expect(csv).toBe(`${CSV_BOM}Negocio,Importe,Nota`);
	});
});

describe("csvFileName", () => {
	it("estampa la fecha del día para no sobrescribir descargas previas", () => {
		expect(csvFileName("pagos", new Date(2026, 8, 26))).toBe(
			"pagos-2026-09-26.csv",
		);
	});

	it("rellena con cero mes y día para que la fecha ordene como texto", () => {
		expect(csvFileName("ordenes", new Date(2026, 0, 5))).toBe(
			"ordenes-2026-01-05.csv",
		);
	});
});
