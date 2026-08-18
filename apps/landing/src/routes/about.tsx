import { createFileRoute } from "@tanstack/react-router";

import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";

export const Route = createFileRoute("/about")({
	component: AboutPage,
});

function AboutPage() {
	return (
		<div className="min-h-screen">
			<Navbar />
			<main className="mx-auto max-w-3xl px-6 py-20">
				<h1 className="font-heading text-4xl font-bold">Sobre nosotros</h1>
				<div className="mt-8 space-y-6 text-lg leading-relaxed text-role-foreground">
					<p>
						Rolé nació con una idea simple: la comida deliciosa no debería
						terminar en la basura. Cada año, toneladas de comida perfectamente
						buena se desperdicia en comercios que no logran venderla a tiempo.
					</p>
					<p>
						Conectamos esos comercios con personas que quieren comer bien por
						menos. Los comercios recuperan valor de su excedente y los usuarios
						disfrutan comida de calidad con hasta 70% de descuento.
					</p>
					<h2 className="font-heading text-2xl font-bold">Nuestra misión</h2>
					<p>
						Reducir el desperdicio de alimentos mientras construimos comunidades
						más conscientes y solidarias. Cada bolsa rescatada es un pequeño
						triunfo contra el desperdicio.
					</p>
					<h2 className="font-heading text-2xl font-bold">Nuestro impacto</h2>
					<ul className="list-disc space-y-2 pl-6">
						<li>Más de 50 000 usuarios activos</li>
						<li>Más de 2 000 comercios aliados</li>
						<li>Más de 100 000 comidas salvadas del desperdicio</li>
					</ul>
				</div>
			</main>
			<Footer />
		</div>
	);
}
