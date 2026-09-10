import { Pencil, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerBody,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";

/**
 * Drawer genérico crear/editar con estado local del formulario.
 * A diferencia de `ResourceCreateDrawer`/`ResourceUpdateDrawer` (form con
 * `formId` propio), aquí el caller renderiza campos sueltos y declara el
 * mapeo `toPayload`; `onSubmit` recibe SIEMPRE el payload mapeado.
 */
export function FormDrawer<TValues, TPayload, Row>(props: {
	title: string;
	description?: string;
	createLabel: string;
	submitLabel?: string;
	row?: Row;
	defaults: (row?: Row) => TValues;
	fields: (ctx: {
		values: TValues;
		setValues: (v: TValues) => void;
	}) => ReactNode;
	toPayload: (values: TValues) => TPayload;
	onSubmit: (payload: TPayload, row?: Row) => Promise<unknown>;
	isPending?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [resetKey, setResetKey] = useState(0);
	const [values, setValues] = useState<TValues>(() =>
		props.defaults(props.row),
	);

	const submit = async () => {
		try {
			await props.onSubmit(props.toPayload(values), props.row);
			setOpen(false);
			setValues(props.defaults(undefined));
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Error inesperado");
		}
	};

	return (
		<Drawer
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (!o) setResetKey((k) => k + 1);
			}}
			swipeDirection="right"
		>
			<DrawerTrigger
				render={
					<Button
						size={props.row ? "icon" : undefined}
						variant={props.row ? "ghost" : undefined}
					/>
				}
			>
				{props.row ? <Pencil className="size-4" /> : <Plus />}{" "}
				{props.row ? null : props.createLabel}
			</DrawerTrigger>
			<DrawerContent key={resetKey}>
				<DrawerHeader>
					<DrawerTitle>{props.title}</DrawerTitle>
					{props.description && (
						<DrawerDescription>{props.description}</DrawerDescription>
					)}
				</DrawerHeader>
				<DrawerBody>
					{open ? props.fields({ values, setValues }) : null}
				</DrawerBody>
				<DrawerFooter>
					<Button type="button" onClick={submit} disabled={props.isPending}>
						{props.isPending ? <Spinner /> : null}{" "}
						{props.submitLabel ?? "Guardar"}
					</Button>
					<DrawerClose>
						<Button variant="outline" className="w-full">
							Cancelar
						</Button>
					</DrawerClose>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}
