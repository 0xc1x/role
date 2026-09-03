import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Section({
	id,
	children,
	className,
	tone = "paper",
}: {
	id?: string;
	children: ReactNode;
	className?: string;
	tone?: "paper" | "cream" | "forest";
}) {
	const tones = {
		paper: "bg-paper text-ink",
		cream: "bg-cream text-ink",
		forest: "bg-forest text-cream",
	} as const;

	return (
		<section
			id={id}
			className={cn(
				"scroll-mt-28 px-5 py-20 md:px-8 md:py-28",
				tones[tone],
				className,
			)}
		>
			<div className="mx-auto w-full max-w-6xl">{children}</div>
		</section>
	);
}

export function Eyebrow({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<p
			className={cn(
				"mb-4 text-xs font-semibold uppercase tracking-widest text-forest",
				className,
			)}
		>
			{children}
		</p>
	);
}
