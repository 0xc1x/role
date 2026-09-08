import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { HeroBackground } from "@/components/hero-background";
import { BagIcon, HeartIcon, MapPinIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { randomOfferQueryOptions } from "@/lib/queries";
import { usePlatformStats } from "@/lib/use-config";

const numberFormat = new Intl.NumberFormat("es-EC");

function formatStat(value: number | undefined): string {
	if (value === undefined) return "—";
	return `${numberFormat.format(value)}+`;
}

function formatPrice(value: number): string {
	return `$${numberFormat.format(Math.round(value))}`;
}

function formatTime(iso?: string | null): string {
	if (!iso) return "";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "";
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function Hero() {
	const stats = usePlatformStats();
	const { data: offer } = useQuery(randomOfferQueryOptions);

	const STATS = [
		{ value: formatStat(stats?.users), label: "usuarios rescatando" },
		{ value: formatStat(stats?.businesses), label: "comercios aliados" },
		{ value: formatStat(stats?.meals_saved), label: "comidas salvadas" },
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
									loading="lazy"
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
						mercados; fresco, cercano y a un tercio del precio. Recoges el mismo
						día.
					</p>

					{/* CTAs */}
					<div className="flex flex-wrap items-center gap-4 reveal reveal-delay-3">
						<Button
							variant="brand"
							render={<a href="role://" />}
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

					{/* Stats with tabular nums */}
					<dl className="flex items-stretch reveal reveal-delay-4">
						{STATS.map((s, idx) => (
							<div key={s.label} className="flex items-stretch">
								<div
									className={`px-5 ${idx === 0 ? "pl-0" : ""} ${idx === STATS.length - 1 ? "pr-0" : ""}`}
								>
									<dt className="sr-only">{s.label}</dt>
									<dd className="font-heading text-2xl font-bold tabular-nums md:text-3xl">
										{s.value}
									</dd>
									<dd className="mt-1 text-sm text-white/70">{s.label}</dd>
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
