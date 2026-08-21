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

export const Route = createFileRoute("/")({
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
