import { HeroBackground } from "@/components/hero-background";
import { ShieldIcon } from "@/components/icons";

export function LegalHero({
	eyebrow,
	titlePrefix,
	titleAccent,
	description,
	updatedDate,
}: {
	eyebrow: string;
	titlePrefix: string;
	titleAccent: string;
	description: string;
	updatedDate: string | null;
}) {
	return (
		<section
			data-hero
			className="relative overflow-hidden bg-role-dark-bg px-6 pt-36 pb-16 text-white md:pt-44 md:pb-20"
		>
			<HeroBackground />
			<div className="relative mx-auto max-w-6xl">
				<div className="max-w-3xl">
					<div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 backdrop-blur-sm reveal">
						<ShieldIcon className="h-3.5 w-3.5 text-white/80" />
						<span className="text-xs font-semibold tracking-widest text-white/80 uppercase">
							{eyebrow}
						</span>
					</div>
					<h1 className="mt-6 font-display text-4xl font-medium tracking-[-0.03em] text-white sm:text-5xl md:text-[52px]">
						{titlePrefix}{" "}
						<span className="font-display italic font-normal text-role-secondary">
							{titleAccent}
						</span>
					</h1>
					<p className="mt-4 max-w-xl text-lg leading-relaxed text-white/70 reveal reveal-delay-1">
						{description}
					</p>
					{updatedDate ? (
						<div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white/80 backdrop-blur-sm reveal reveal-delay-2">
							<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
							Última actualización: {updatedDate}
						</div>
					) : null}
				</div>
			</div>
		</section>
	);
}
