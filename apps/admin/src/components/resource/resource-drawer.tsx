import { Plus } from "lucide-react";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
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
 * Estado de envío del drawer, reportado por el form que tiene la mutación.
 *
 * Antes se derivaba de `useIsMutating({ mutationKey })`, que es un contador
 * GLOBAL de la clave `["businesses"]`: la mutación de una fila deshabilitaba el
 * "Guardar" de todas las demás, sin explicación. Durante una sesión de
 * verificación en lote el submit moría en drawers que nadie estaba tocando. El
 * drawer ya no conoce la clave: solo escucha al form que vive dentro de él.
 */
const DrawerPendingContext = createContext<{
	pending: boolean;
	setPending: (pending: boolean) => void;
}>({ pending: false, setPending: () => undefined });

/**
 * Lo llama el form dueño de la mutación con SU `isPending`. Al desmontarse
 * (el drawer se cerró) deja el estado limpio, así el siguiente submit no nace
 * deshabilitado.
 */
export function useReportDrawerPending(pending: boolean) {
	const { setPending } = useContext(DrawerPendingContext);
	useEffect(() => {
		setPending(pending);
		return () => setPending(false);
	}, [pending, setPending]);
}

function DrawerSubmitButton({
	formId,
	pendingLabel,
	submitLabel,
}: {
	formId: string;
	pendingLabel: string;
	submitLabel: string;
}) {
	const { pending } = useContext(DrawerPendingContext);

	return (
		<Button type="submit" form={formId} disabled={pending}>
			{pending ? (
				<>
					<Spinner /> {pendingLabel}
				</>
			) : (
				submitLabel
			)}
		</Button>
	);
}

function DrawerPendingProvider({ children }: { children: ReactNode }) {
	const [pending, setPending] = useState(false);
	// The context value must keep its identity across renders: rebuilt inline it
	// would redraw `DrawerSubmitButton` and every form reporting its mutation on
	// every render of this provider, even when `pending` never changed.
	const value = useMemo(() => ({ pending, setPending }), [pending]);
	return (
		<DrawerPendingContext.Provider value={value}>
			{children}
		</DrawerPendingContext.Provider>
	);
}

export function ResourceCreateDrawer({
	formId,
	title,
	description,
	triggerLabel,
	submitLabel,
	creatingLabel,
	children,
}: {
	formId: string;
	title: string;
	description: string;
	triggerLabel: string;
	submitLabel: string;
	creatingLabel: string;
	children: (props: {
		formId: string;
		onSuccess: () => void;
	}) => React.ReactNode;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const [resetKey, setResetKey] = useState(0);

	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => {
				setIsOpen(open);
				if (!open) setResetKey((k) => k + 1);
			}}
			swipeDirection="right"
		>
			<DrawerTrigger render={<Button />}>
				<Plus />
				{triggerLabel}
			</DrawerTrigger>

			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>{title}</DrawerTitle>
					<DrawerDescription>{description}</DrawerDescription>
				</DrawerHeader>

				{/* El provider no renderiza DOM: envuelve cuerpo y footer para que
				    el form y su botón compartan el mismo estado de envío. */}
				<DrawerPendingProvider>
					<DrawerBody>
						{isOpen && (
							<div key={resetKey}>
								{children({ formId, onSuccess: () => setIsOpen(false) })}
							</div>
						)}
					</DrawerBody>

					<DrawerFooter>
						<DrawerSubmitButton
							formId={formId}
							pendingLabel={creatingLabel}
							submitLabel={submitLabel}
						/>
						<DrawerClose
							render={<Button variant="outline" className="w-full" />}
						>
							Cancelar
						</DrawerClose>
					</DrawerFooter>
				</DrawerPendingProvider>
			</DrawerContent>
		</Drawer>
	);
}

export function ResourceUpdateDrawer({
	formId,
	title,
	description,
	isOpen,
	onClose,
	submitLabel,
	updatingLabel,
	children,
}: {
	formId: string;
	title: string;
	description: string;
	isOpen: boolean;
	onClose: () => void;
	submitLabel: string;
	updatingLabel: string;
	children: React.ReactNode;
}) {
	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => !open && onClose()}
			swipeDirection="right"
		>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>{title}</DrawerTitle>
					<DrawerDescription>{description}</DrawerDescription>
				</DrawerHeader>

				<DrawerPendingProvider>
					<DrawerBody>{children}</DrawerBody>

					<DrawerFooter>
						<DrawerSubmitButton
							formId={formId}
							pendingLabel={updatingLabel}
							submitLabel={submitLabel}
						/>
						<DrawerClose
							render={<Button variant="outline" className="w-full" />}
						>
							Cancelar
						</DrawerClose>
					</DrawerFooter>
				</DrawerPendingProvider>
			</DrawerContent>
		</Drawer>
	);
}
