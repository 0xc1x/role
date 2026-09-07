import { useIsMutating } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
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

export function ResourceCreateDrawer({
	formId,
	mutationKey,
	title,
	description,
	triggerLabel,
	submitLabel,
	creatingLabel,
	children,
}: {
	formId: string;
	mutationKey: readonly unknown[];
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
	const isMutating = useIsMutating({ mutationKey }) > 0;

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

				<DrawerBody>
					{isOpen && (
						<div key={resetKey}>
							{children({ formId, onSuccess: () => setIsOpen(false) })}
						</div>
					)}
				</DrawerBody>

				<DrawerFooter>
					<Button type="submit" form={formId} disabled={isMutating}>
						{isMutating ? (
							<>
								<Spinner /> {creatingLabel}
							</>
						) : (
							submitLabel
						)}
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

export function ResourceUpdateDrawer({
	formId,
	mutationKey,
	title,
	description,
	isOpen,
	onClose,
	submitLabel,
	updatingLabel,
	children,
}: {
	formId: string;
	mutationKey: readonly unknown[];
	title: string;
	description: string;
	isOpen: boolean;
	onClose: () => void;
	submitLabel: string;
	updatingLabel: string;
	children: React.ReactNode;
}) {
	const isMutating = useIsMutating({ mutationKey }) > 0;

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

				<DrawerBody>{children}</DrawerBody>

				<DrawerFooter>
					<Button type="submit" form={formId} disabled={isMutating}>
						{isMutating ? (
							<>
								<Spinner /> {updatingLabel}
							</>
						) : (
							submitLabel
						)}
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
