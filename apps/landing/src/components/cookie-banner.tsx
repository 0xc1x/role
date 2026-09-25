import { Link } from "@tanstack/react-router";
import { Cookie, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const STORAGE_KEY = "role-cookie-consent";
const GOOGLE_FONTS_ID = "role-google-fonts";
const GOOGLE_FONTS_HREF =
	"https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";

function loadGoogleFonts(): void {
	if (document.getElementById(GOOGLE_FONTS_ID)) return;
	const link = document.createElement("link");
	link.id = GOOGLE_FONTS_ID;
	link.rel = "stylesheet";
	link.href = GOOGLE_FONTS_HREF;
	document.head.appendChild(link);
}

export function CookieBanner() {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		let stored: string | null = null;
		try {
			stored = window.localStorage.getItem(STORAGE_KEY);
		} catch {
			// storage no disponible (SSR/privacidad): mostrar el banner
			stored = null;
		}
		if (stored === "accepted") {
			loadGoogleFonts();
		}
		if (stored !== "accepted" && stored !== "rejected") {
			setVisible(true);
		}
	}, []);

	useEffect(() => {
		if (!visible) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setVisible(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [visible]);

	function accept() {
		try {
			window.localStorage.setItem(STORAGE_KEY, "accepted");
		} catch {
			// si falla, simplemente ocultamos
		}
		loadGoogleFonts();
		setVisible(false);
	}

	function reject() {
		try {
			window.localStorage.setItem(STORAGE_KEY, "rejected");
		} catch {
			// si falla, simplemente ocultamos
		}
		setVisible(false);
	}

	// Cerrar sin aceptar: solo esta sesión, sin persistir consentimiento.
	function dismiss() {
		setVisible(false);
	}

	if (!visible) {
		return null;
	}

	return (
		<Card
			role="region"
			aria-label="Aviso de cookies"
			className="fixed inset-x-0 bottom-0 z-[60] gap-0 rounded-none border-t border-role-border bg-white/95 p-0 shadow-card-hover backdrop-blur-xl md:bottom-6 md:left-auto md:right-6 md:w-[26rem] md:rounded-3xl md:border"
		>
			<CardContent className="p-5">
				<div className="flex items-start gap-4">
					<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-role-primary-soft text-role-primary shadow-inner">
						<Cookie className="h-5 w-5" />
					</span>
					<div className="flex-1">
						<div className="flex items-center justify-between">
							<p className="font-heading text-sm font-bold text-role-foreground">
								Privacidad y cookies
							</p>
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={dismiss}
								aria-label="Cerrar aviso sin aceptar"
								className="rounded-lg text-role-muted-foreground hover:bg-role-muted hover:text-role-muted-foreground"
							>
								<X className="h-4 w-4" />
							</Button>
						</div>
						<p className="mt-1.5 text-xs leading-relaxed text-role-muted-foreground">
							Usamos almacenamiento local para recordar tu elección. Las fuentes
							de Google se cargan solo si aceptas. Conoce nuestra{" "}
							<Link
								to="/privacy"
								className="font-semibold text-role-primary underline hover:text-role-primary-hover"
							>
								política de privacidad
							</Link>
							.
						</p>
						<div className="mt-3.5 flex flex-wrap items-center gap-2">
							<Button
								onClick={accept}
								className="rounded-full bg-role-primary px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-role-primary-hover active:scale-[0.97]"
							>
								Aceptar y continuar
							</Button>
							<Button
								onClick={reject}
								variant="outline"
								className="rounded-full px-5 py-2 text-xs"
							>
								Rechazar
							</Button>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
