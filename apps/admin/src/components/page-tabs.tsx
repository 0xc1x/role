import { useRef } from "react";
import { Button } from "@/components/ui/button";

/** Ids derivados del valor de la pestaña: `PageTabs` y `TabPanel` deben coincidir. */
export const tabId = (tab: string) => `tab-${tab}`;
export const panelId = (tab: string) => `panel-${tab}`;

/**
 * Panel de una pestaña. Los `aria-controls` de `PageTabs` apuntan aquí: sin el
 * `id` y el `role` correspondientes, un lector de pantalla anuncia pestañas que
 * no controlan nada. Las inactivas se ocultan (no se desmontan) para que el
 * `aria-controls` de cada pestaña resuelva siempre a un panel real y para no
 * perder lo que el operador ya escribió en otra pestaña.
 */
export function TabPanel<T extends string>({
	tab,
	active,
	children,
	className,
}: {
	tab: T;
	active: boolean;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			role="tabpanel"
			id={panelId(tab)}
			aria-labelledby={tabId(tab)}
			hidden={!active}
			className={className}
		>
			{children}
		</div>
	);
}

/** Grupo de pestañas con semántica tablist + navegación por flechas. */
export function PageTabs<T extends string>(props: {
	tabs: readonly T[];
	labels: Record<T, string>;
	value: T;
	onChange: (tab: T) => void;
}) {
	const refs = useRef(new Map<T, HTMLButtonElement>());

	const focusTab = (tab: T) => {
		props.onChange(tab);
		refs.current.get(tab)?.focus();
	};

	const onKeyDown = (e: React.KeyboardEvent, tab: T) => {
		const i = props.tabs.indexOf(tab);
		if (e.key === "ArrowRight") {
			e.preventDefault();
			focusTab(props.tabs[(i + 1) % props.tabs.length] as T);
		} else if (e.key === "ArrowLeft") {
			e.preventDefault();
			focusTab(
				props.tabs[(i - 1 + props.tabs.length) % props.tabs.length] as T,
			);
		} else if (e.key === "Home") {
			e.preventDefault();
			focusTab(props.tabs[0] as T);
		} else if (e.key === "End") {
			e.preventDefault();
			focusTab(props.tabs[props.tabs.length - 1] as T);
		}
	};

	return (
		<div
			role="tablist"
			aria-label="Secciones"
			aria-orientation="horizontal"
			className="flex gap-2"
		>
			{props.tabs.map((t) => {
				const selected = t === props.value;
				return (
					<Button
						key={t}
						id={tabId(t)}
						ref={(el) => {
							if (el) refs.current.set(t, el);
							else refs.current.delete(t);
						}}
						role="tab"
						aria-selected={selected}
						aria-controls={panelId(t)}
						tabIndex={selected ? 0 : -1}
						variant={selected ? "default" : "ghost"}
						size="sm"
						onClick={() => props.onChange(t)}
						onKeyDown={(e) => onKeyDown(e, t)}
					>
						{props.labels[t]}
					</Button>
				);
			})}
		</div>
	);
}
