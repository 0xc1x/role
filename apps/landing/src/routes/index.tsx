import { createFileRoute } from "@tanstack/react-router";

import { Contact } from "@/components/contact";
import { Cta } from "@/components/cta";
import { Faq } from "@/components/faq";
import { Features } from "@/components/features";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { Navbar } from "@/components/navbar";
import { Testimonials } from "@/components/testimonials";
import {
	appConfigQueryOptions,
	platformStatsQueryOptions,
	randomOfferQueryOptions,
} from "@/lib/queries";

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title: "Rolé — rescata comida excedente cerca de ti" },
			{ name: "description", content: "Descubre ofertas de comida excedente de negocios locales, salva comida buena de terminar en la basura y ahorra en tu día a día." },
		],
	}),
	// SSR: config + stats reales se resuelven en el server para SEO.
	loader: ({ context }) =>
		Promise.all([
			context.queryClient
				.ensureQueryData(platformStatsQueryOptions)
				.catch(() => undefined),
			context.queryClient
				.ensureQueryData(appConfigQueryOptions)
				.catch(() => undefined),
			context.queryClient
				.ensureQueryData(randomOfferQueryOptions)
				.catch(() => undefined),
		]),
	component: LandingPage,
});

function LandingPage() {
	return (
		<main id="main" className="min-h-screen">
			<Navbar />
			<Hero />
			<Features />
			<HowItWorks />
			<Testimonials />
			<Faq />
			<Contact />
			<Cta />
			<Footer />
		</main>
	);
}
