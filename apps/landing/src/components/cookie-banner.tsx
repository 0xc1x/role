import { Cookie, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const STORAGE_KEY = "role-cookie-consent";

export function CookieBanner() {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		let stored = "accepted";
		try {
			stored = window.localStorage.getItem(STORAGE_KEY) ?? "accepted";
		} catch {
			// storage no disponible (SSR/privacidad): mostrar el banner
			stored = "";
		}
		if (stored !== "accepted") {
			setVisible(true);
		}
	}, []);

	function accept() {
		try {
			window.localStorage.setItem(STORAGE_KEY, "accepted");
		} catch {
			// si falla, simplemente ocultamos
		}
		setVisible(false);
	}

	if (!visible) {
		return null;
	}

	return (
		<Card
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
								onClick={accept}
								aria-label="Cerrar aviso"
								className="rounded-lg text-role-muted-foreground hover:bg-role-muted hover:text-role-muted-foreground"
							>
								<X className="h-4 w-4" />
							</Button>
						</div>
						<p className="mt-1.5 text-xs leading-relaxed text-role-muted-foreground">
							Usamos cookies mínimas para garantizar tu sesión y recordar tus
							preferencias. Conoce nuestra{" "}
							<a
								href="/privacy"
								className="font-semibold text-role-primary underline hover:text-role-primary-hover"
							>
								política de privacidad
							</a>
							.
						</p>
						<div className="mt-3.5 flex items-center gap-2">
							<Button
								onClick={accept}
								className="rounded-full bg-role-primary px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-role-primary-hover active:scale-[0.97]"
							>
								Aceptar y continuar
							</Button>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
