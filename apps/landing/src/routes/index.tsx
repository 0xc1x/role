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
import { FAQ_ITEMS } from "@/lib/faq";
import { appConfigQueryOptions, randomOfferQueryOptions } from "@/lib/queries";
import { pageHead } from "@/lib/seo";
import { ensurePlatformStats } from "@/lib/use-config";

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
	component: LandingPage,
	// SSR: config + stats reales se resuelven en el server para SEO. Ningún
	// fallo rompe el render; el loader solo deja constancia de si las stats
	// salieron de la API (`source`) para que el markup lo exponga.
	loader: ({ context }) =>
		Promise.all([
			ensurePlatformStats(context.queryClient),
			context.queryClient
				.ensureQueryData(appConfigQueryOptions)
				.catch(() => undefined),
			context.queryClient
				.ensureQueryData(randomOfferQueryOptions)
				.catch(() => undefined),
		]),
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
});

function LandingPage() {
	return (
		<div className="min-h-screen">
			<Navbar />
			<main id="main">
				<Hero />
				<Features />
				<HowItWorks />
				<Testimonials />
				<Faq />
				<Contact />
				<Cta />
			</main>
			<Footer />
		</div>
	);
}
