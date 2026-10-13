import { DISCOUNT_SAVINGS_CLAIM } from "@0xc1x/role-commons";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { HeroBackground } from "@/components/hero-background";
import { BagIcon, HeartIcon, MapPinIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { randomOfferQueryOptions } from "@/lib/queries";
import { formatStat, numberFormat } from "@/lib/stats-format";
import { useStoreLink } from "@/lib/store-links";
import { useCountUp } from "@/lib/use-count-up";
import { usePlatformStats, type PlatformStatsResult } from "@/lib/use-config";

function formatPrice(value: number): string {
	return `$${numberFormat.format(Math.round(value))}`;
}

function formatTime(iso?: string | null): string {
	if (!iso) return "";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "";
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Cuando no hay resultado del servidor —el Hero renderizado suelto, como en los
 * tests de componente— el hook arranca en `loading`, que es exactamente lo que
 * ocurre hoy sin loader. No es un `api` inventado: `loading` es el estado real de
 * "todavía no hay respuesta".
 */
const EMPTY_STATS: PlatformStatsResult = { data: undefined, source: "loading" };

export function Hero({ statsDelServidor }: { statsDelServidor?: PlatformStatsResult }) {
	const stats = usePlatformStats(statsDelServidor ?? EMPTY_STATS);
	const storeLink = useStoreLink();
	const { data: offer } = useQuery(randomOfferQueryOptions);

	// El conteo corre en el cliente, pero el HTML SERVIDO lleva el valor final:
	// `useCountUp` arranca en el final y solo después anima, así que el primer
	// render del cliente coincide con lo que el crawler leyó. Si el SSR pintara
	// el arranque, Google leería "10+" donde la página dice "20+".
	//
	// `final` es el dato crudo de la API y `value` el que se muestra. Se
	// necesitan los dos porque el `aria-label` tiene que anunciar el FINAL: si
	// anunciara el valor animado, el lector de pantalla oiría "catorce" y se
	// quedaría ahí.
	const STATS = [
		{
			final: stats.data?.users,
			value: useCountUp(stats.data?.users),
			label: "usuarios rescatando",
		},
		{
			final: stats.data?.businesses,
			value: useCountUp(stats.data?.businesses),
			label: "comercios aliados",
		},
		{
			final: stats.data?.meals_saved,
			value: useCountUp(stats.data?.meals_saved),
			label: "comidas salvadas",
		},
	];

	const originalPrice = offer?.original_price ?? 120;
	const discountedPrice = offer?.discounted_price ?? 36;
	const discountPct = Math.round((1 - discountedPrice / originalPrice) * 100);

	return (
		<section
			data-hero
			className="relative min-h-[100vh] flex items-center overflow-hidden bg-role-dark-bg text-white"
		>
			{/* Background layers — canonical HeroBackground */}
			<HeroBackground />

			{/* Floating offer — mirrors mobile OfferCard (OfferCard.tsx:90) */}
			<div
				aria-hidden
				className="pointer-events-none absolute top-24 right-10 hidden w-80 items-end justify-end opacity-0 lg:flex animate-float-in"
				style={{ animationDelay: "300ms" }}
			>
				<div className="relative w-full animate-float-y">
					<div className="absolute inset-0 translate-y-3 rounded-xl bg-role-primary/20 blur-2xl" />
					<Card className="relative overflow-hidden rounded-xl border border-role-border/50 bg-white p-0 shadow-raised gap-0">
						<div className="relative h-40 w-full bg-role-muted">
							{offer?.image ? (
								<img
									src={offer.image}
									alt={offer.title}
									loading="eager"
									fetchPriority="high"
									decoding="async"
									width={320}
									height={160}
									className="h-full w-full object-cover"
								/>
							) : (
								<div className="flex h-full w-full items-center justify-center bg-role-border text-role-primary/60">
									<BagIcon className="h-9 w-9" />
								</div>
							)}
							{discountPct > 0 ? (
								<Badge
									variant="brand"
									className="absolute right-2 top-2 rounded-full px-2.5 py-1 text-xs font-bold"
								>
									-{discountPct}%
								</Badge>
							) : null}
							{offer && offer.stock > 0 && offer.stock <= 3 ? (
								<Badge
									variant="brand-deep"
									className="absolute bottom-2 left-2 rounded-full px-2.5 py-1 text-xs font-semibold"
								>
									¡Quedan {offer.stock}!
								</Badge>
							) : null}
							<div className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 shadow-sm">
								<HeartIcon className="h-4 w-4 text-role-muted-foreground" />
							</div>
						</div>
						<CardContent className="p-4">
							<div className="flex items-end gap-3">
								<div className="min-w-0 flex-[4] pr-2">
									<p className="line-clamp-2 text-[15px] font-bold leading-[19px] text-role-foreground">
										{offer?.title ?? "Bolsa sorpresa"}
									</p>
									<div className="mt-1.5 flex items-center gap-1">
										<MapPinIcon className="h-3 w-3 shrink-0 text-role-muted-foreground" />
										<span className="truncate text-xs text-role-muted-foreground">
											{offer?.business.name ?? "Comercios locales"}
											{offer?.location.zone ? ` · ${offer.location.zone}` : ""}
										</span>
									</div>
									<p className="mt-1 truncate text-xs text-role-muted-foreground">
										{offer?.pickup_end
											? `Recoge antes de las ${formatTime(offer.pickup_end)}`
											: "Recoge antes de las 17:00"}
									</p>
								</div>
								<div className="flex flex-[2] flex-col items-end">
									<p className="text-xs text-role-muted-foreground line-through">
										{formatPrice(originalPrice)}
									</p>
									<p className="text-xl font-extrabold leading-6 text-role-primary">
										{formatPrice(discountedPrice)}
									</p>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>

			{/* Main content */}
			<div className="relative mx-auto max-w-6xl px-6 py-25 lg:py-35 z-10">
				<div className="max-w-2xl space-y-8">
					{/* Badge */}
					{/* <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-1.5 text-sm font-medium backdrop-blur reveal">
						<span className="h-1.5 w-1.5 animate-pulse rounded-full bg-role-secondary" />
						Rescata comida deliciosa a precio increíble
					</p> */}

					{/* Display headline with editorial serif span */}
					<h1 className="max-w-2xl font-display text-3xl font-medium tracking-[-0.03em] sm:text-4xl md:text-5xl">
						<span className="editorial italic font-normal text-role-secondary">
							La comida que sobra no tiene que perderse.
						</span>
						<br />
						Cero desperdicio.
					</h1>

					{/* Subheadline */}
					<p className="max-w-lg text-lg leading-relaxed text-white/85 reveal reveal-delay-2">
						Rolé conecta comercios locales con excedente de comida y personas
						que quieren rescatar el excedente de restaurantes, panaderías y
						mercados; fresco, cercano y {DISCOUNT_SAVINGS_CLAIM}. Recoges el
						mismo día.
					</p>

					{/* CTAs */}
					<div className="flex flex-wrap items-center gap-4 reveal reveal-delay-3">
						<Button
							variant="brand"
							render={<a href={storeLink} aria-label="Consigue la app" />}
							className="rounded-full bg-white px-7 py-3 font-semibold text-role-primary shadow-dark-glow hover:bg-white hover:text-role-primary hover:-translate-y-0.5 hover:shadow-2xl active:scale-[0.98]"
						>
							Consigue la app
						</Button>
						<Button
							variant="brand-outline"
							render={<Link to="/for-business" />}
							className="rounded-full px-7 py-3 font-semibold"
						>
							Para negocios
						</Button>
					</div>

					{/* Stats with tabular nums.
					    `data-stats-source` = "api" | "loading" | "failed": cifras
					    reales, petición en curso, o fallo de la API. Sin ese
					    discriminador, el "—" de una API caída es indistinguible
					    de un dato ausente y la página publica un cero que nadie
					    puede auditar.

					    SIN `reveal`, y a propósito. Este bloque competía con el
					    conteo: `reveal-delay-4` son 400 ms de retardo más 800 ms de
					    transition contra los 1400 ms de `useCountUp`. Medido en
					    navegador real, el reveal tenía el bloque en opacity 0.43 a
					    los 960 ms mientras el número ya iba por `10+ → 13+`, así que
					    la animación no se veía: el ojo la capturaba cuando ya había
					    terminado. Las cifras son contenido, no decoración, y no
					    deben depender de una animación para poder leerse. */}
					<dl
						data-stats-source={stats.source}
						className="flex items-stretch"
					>
						{STATS.map((s, idx) => (
							<div key={s.label} className="flex items-stretch">
								<div
									className={`px-5 ${idx === 0 ? "pl-0" : ""} ${idx === STATS.length - 1 ? "pr-0" : ""}`}
								>
									<dt className="sr-only">
										{s.final === undefined
											? `${s.label}: sin datos de la plataforma`
											: `${formatStat(s.final)} ${s.label}`}
									</dt>
									<dd>
										{/*
											El número visible va `aria-hidden` y el valor REAL lo
											anuncia el `<dt>`. No al revés: `aria-label` sobre un
											`<p>` no es ARIA válido —el rol de un `<p>` no lo
											acepta— y el lector de pantalla no lo habría leído, así
											que el `sr-only` de al lado es el que de verdad nombra el
											dato. Con el número escondido, nadie oye un dígito a
											medio conteo.
										*/}
										<p
											className="font-heading text-2xl font-bold tabular-nums md:text-3xl"
											aria-hidden="true"
										>
											{formatStat(s.value)}
										</p>
										<p className="mt-1 text-sm text-white/70">{s.label}</p>
									</dd>
								</div>
								{idx < STATS.length - 1 ? (
									<Separator
										orientation="vertical"
										className="h-auto bg-white/10"
									/>
								) : null}
							</div>
						))}
					</dl>
				</div>
			</div>

			{/* Scroll indicator */}
			<div
				className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce reveal reveal-delay-6"
				aria-hidden
			>
				{/* biome-ignore lint/a11y/noSvgWithoutTitle: icono decorativo */}
				<svg
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="text-white/60"
				>
					<path d="M12 5v14M19 12l-7 7-7-7" />
				</svg>
			</div>
		</section>
	);
}
