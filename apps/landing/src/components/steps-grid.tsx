export type StepItem = {
	n: string;
	title: string;
	body: string;
};

/** Grilla de 3 pasos con conector: usada en inicio y para negocios. */
export function StepsGrid({ steps }: { steps: StepItem[] }) {
	return (
		<ol className="mt-14 grid gap-6 md:grid-cols-3">
			{steps.map((s, i) => (
				<li key={s.n} className={`relative reveal reveal-delay-${i + 1}`}>
					{i < steps.length - 1 ? (
						<span
							className="pointer-events-none absolute left-[4.5rem] right-[-0.75rem] top-6 hidden h-px bg-line md:block"
							aria-hidden="true"
						/>
					) : null}
					<p className="font-display text-4xl font-medium text-forest/60">
						{s.n}
					</p>
					<h3 className="mt-4 font-display text-xl font-medium tracking-tight">
						{s.title}
					</h3>
					<p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.body}</p>
				</li>
			))}
		</ol>
	);
}
