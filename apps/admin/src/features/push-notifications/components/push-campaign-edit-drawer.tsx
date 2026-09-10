import type { CampaignDto, SegmentDto } from "@0xc1x/role-commons";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerBody,
	DrawerClose,
	DrawerContent,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import {
	type CampaignFormValues,
	campaignDefaults,
} from "@/features/email/forms/campaign-forms";
import type { useCampaignMutations } from "@/features/email/queries/emails.queries";
import { PushCampaignFields } from "@/features/push-notifications/components/push-campaign-fields";

export function PushCampaignEditDrawer(props: {
	campaign: CampaignDto;
	templates: Array<{ id: string; name: string; title: string; body: string }>;
	segments: SegmentDto[];
	mutations: ReturnType<typeof useCampaignMutations>;
	onClose: () => void;
}) {
	// El padre renderiza con key={campaign.id}: cada campaña monta un estado
	// fresco y no se necesita sincronización por efecto.
	const c = props.campaign;
	const [values, setValues] = useState<CampaignFormValues>(() =>
		campaignDefaults(c),
	);

	const save = async () => {
		try {
			await props.mutations.update.mutateAsync({
				id: c.id,
				body: {
					name: values.name,
					channel: c.channel,
					template_id: values.template_id || null,
					category: values.category,
					segment_ids: values.segment_ids,
					include_user_ids: values.include_user_ids,
					exclude_user_ids: values.exclude_user_ids,
					scheduled_at: values.scheduled_at || null,
				},
			});
			props.onClose();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Error inesperado");
		}
	};

	return (
		<Drawer open onOpenChange={(o) => !o && props.onClose()}>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>Editar {c.name}</DrawerTitle>
				</DrawerHeader>
				<DrawerBody>
					<PushCampaignFields
						values={values}
						setValues={setValues}
						templates={props.templates}
						segments={props.segments}
					/>
				</DrawerBody>
				<DrawerFooter>
					<Button
						type="button"
						onClick={save}
						disabled={props.mutations.update.isPending}
					>
						{props.mutations.update.isPending ? <Spinner /> : null} Guardar
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
