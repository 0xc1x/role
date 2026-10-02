import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

/**
 * El error de la sección de reportes, y no el del root.
 *
 * POR QUÉ ESTA SECCIÓN Y NO LAS OTRAS TRECE. Ninguna ruta del panel define
 * `errorComponent` —es lo que dicen sus doc-comments, y es la razón por la que
 * todas quitaron el `loader`—. Ese "ninguna" era correcto mientras el único error
 * posible fuera de una consulta, porque un fallo de red entra por la rama
 * `isError` del componente y ahí tiene su "Reintentar". Dejó de ser suficiente
 * acá por una razón concreta y medida: hay un `value` de la fila que el panel no
 * controla y que se renderiza directamente, así que un render puede throwar y ese
 * throw sube hasta el `CatchBoundary` del ROOT, que reemplaza el documento
 * entero. Medido: `SIDEBAR_VIVA: false`, `BODY: "Something went wrong!…"`.
 *
 * O sea, este componente no arregla ese bug —lo arregla la guarda de
 * `lib/dates.ts`, que evita el RangeError—; acota lo que venga después. Un
 * campo que se suma al DTO sin label, un `undefined` en un `.map`, un enum
 * nuevo: cualquier throw de render futuro muere acá, dentro de la sección, con
 * la barra lateral viva y un botón para salir. Ese es el margen que deja una
 * defensa y el que no deja ninguna.
 *
 * `reset` y no un `Link` de reintento: `reset` vuelve a montar el componente de la
 * ruta, que es lo que un error de render necesita —volver a intentar el render—
 * y no a cambiar de sección.
 *
 * VIVE ACÁ Y NO EN EL ARCHIVO DE RUTA, y es por una razón que el build avisa:
 * `export` desde un archivo de ruta rompe el code-splitting de esa ruta ("These
 * exports … will not be code-split and will increase your bundle size"). Es además
 * la misma razón por la que los badges y las columnas viven en `tables/cells/`:
 * el archivo de ruta configura la ruta, no define lo que se pinta.
 */
export function ReportesError({
	error,
	reset,
}: {
	error: Error;
	reset: () => void;
}) {
	// `error.message` puede ser cualquier cosa, incluso una cadena vacía, y el
	// panel es un back office: un acceso que reventara por leer un mensaje vacío
	// sería el mismo bug que vino a tapar. Se muestra solo si hay algo que
	// mostrar.
	const detalle = error?.message?.trim();
	return (
		<div className="px-6 py-4">
			<header className="flex items-center">
				<h1 className="font-bold text-xl">Reportes</h1>
			</header>
			<div className="mt-4 space-y-4">
				<p className="text-destructive text-sm">
					No se pudo mostrar el buzón de reportes. El resto del panel sigue
					funcionando.
				</p>
				{detalle ? (
					<p className="text-muted-foreground text-sm break-words">{detalle}</p>
				) : null}
				<div className="flex flex-wrap gap-2">
					<Button variant="outline" onClick={() => reset()}>
						Reintentar
					</Button>
					<Button variant="ghost" render={<Link to="/home" />}>
						Ir al inicio
					</Button>
				</div>
			</div>
		</div>
	);
}
