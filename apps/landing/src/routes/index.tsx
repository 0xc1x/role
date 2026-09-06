import { createFileRoute } from "@tanstack/react-router";

import { Contact } from "@/components/contact";
import { Cta } from "@/components/cta";
import { FAQ_ITEMS, Faq } from "@/components/faq";
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
import { pageHead } from "@/lib/seo";

const FAQ_JSON_LD = {
	"@context": "https://schema.org",
	"@type": "FAQPage",
	mainEntity: FAQ_ITEMS.map((item) => ({
		"@type": "Question",
		name: item.q,
		acceptedAnswer: { "@type": "Answer", text: item.a },
	})),
};

export const Route = createFileRoute("/")({
	head: () => ({
		...pageHead(
			"/",
			"Rolé — rescata comida excedente cerca de ti",
			"Descubre ofertas de comida excedente de negocios locales, salva comida buena de terminar en la basura y ahorra en tu día a día.",
		),
		scripts: [
			{ type: "application/ld+json", children: JSON.stringify(FAQ_JSON_LD) },
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
