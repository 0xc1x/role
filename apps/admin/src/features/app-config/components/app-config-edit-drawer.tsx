import type { AppConfigDto } from "@0xc1x/role-commons";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { ResourceUpdateDrawer } from "@/components/resource/resource-drawer";
import { Button } from "@/components/ui/button";
import { AppConfigForm } from "../forms/app-config.form";
import { appConfigKeys } from "../queries/app-config.keys";

interface AppConfigEditDrawerProps {
	config: AppConfigDto;
}

export function AppConfigEditDrawer({ config }: AppConfigEditDrawerProps) {
	const [isOpen, setIsOpen] = useState(false);
	const FORM_ID = `edit-app-config-drawer-form-${config.key}`;

	return (
		<>
			<Button variant="ghost" size="icon" onClick={() => setIsOpen(true)}>
				<Pencil className="size-4" />
				<span className="sr-only">Editar {config.label}</span>
			</Button>
			{isOpen && (
				<ResourceUpdateDrawer
					formId={FORM_ID}
					mutationKey={appConfigKeys.all}
					title={config.key}
					description={config.label}
					isOpen
					onClose={() => setIsOpen(false)}
					submitLabel="Guardar cambios"
					updatingLabel="Guardando"
				>
					<AppConfigForm
						formId={FORM_ID}
						config={config}
						onSuccess={() => setIsOpen(false)}
					/>
				</ResourceUpdateDrawer>
			)}
		</>
	);
}
