import type { SegmentDto } from "@0xc1x/role-commons";
import { type FormEvent, useEffect, useState } from "react";
import {
	ResourceUpdateDrawer,
	useReportDrawerPending,
} from "@/components/resource/resource-drawer";
import { segmentDefaults } from "@/features/email/forms/email-defaults";
import {
	SegmentFields,
	type SegmentFormValues,
} from "@/features/email/forms/email-forms";
import {
	type useSegmentMutations,
	useSegmentUsers,
	type useSetSegmentUsers,
} from "@/features/email/queries/emails.queries";

/** Drawer de edición de segmento: campos + miembros estáticos. */
export function SegmentEditDrawer(props: {
	segment: SegmentDto;
	setUsers: ReturnType<typeof useSetSegmentUsers>;
	update: ReturnType<typeof useSegmentMutations>["update"];
	onClose: () => void;
}) {
	const members = useSegmentUsers(props.segment.id);
	const [values, setValues] = useState<SegmentFormValues>(() =>
		segmentDefaults(props.segment),
	);
	const FORM_ID = `edit-segment-${props.segment.id}`;

	useEffect(() => {
		if (members.data) {
			setValues((v) => ({ ...v, user_ids: [...members.data] }));
		}
	}, [members.data]);

	const save = async () => {
		const payload =
			values.type === "dynamic"
				? {
						name: values.name,
						description: values.description || null,
						type: "dynamic" as const,
						filters: JSON.parse(values.filtersJson || "{}"),
						category: values.category,
					}
				: {
						name: values.name,
						description: values.description || null,
						type: "static" as const,
						filters: null,
						category: values.category,
					};
		await props.update.mutateAsync({ id: props.segment.id, body: payload });
		if (values.type === "static") {
			await props.setUsers.mutateAsync({
				id: props.segment.id,
				user_ids: values.user_ids,
			});
		}
		props.onClose();
	};

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		void save();
	};

	return (
		<ResourceUpdateDrawer
			formId={FORM_ID}
			title={`Editar ${props.segment.name}`}
			description="Actualiza los datos del segmento"
			isOpen
			onClose={props.onClose}
			submitLabel="Guardar cambios"
			updatingLabel="Guardando"
		>
			{/* El reporte de "enviando" vive dentro del drawer: es el provider del
			    footer el que lo lee, y este componente queda fuera de él. */}
			<SegmentEditForm
				formId={FORM_ID}
				pending={props.update.isPending || props.setUsers.isPending}
				isLoadingMembers={members.isLoading}
				values={values}
				setValues={setValues}
				onSubmit={handleSubmit}
			/>
		</ResourceUpdateDrawer>
	);
}

function SegmentEditForm({
	formId,
	pending,
	isLoadingMembers,
	values,
	setValues,
	onSubmit,
}: {
	formId: string;
	pending: boolean;
	isLoadingMembers: boolean;
	values: SegmentFormValues;
	setValues: React.Dispatch<React.SetStateAction<SegmentFormValues>>;
	onSubmit: (e: FormEvent) => void;
}) {
	useReportDrawerPending(pending);

	return (
		<form id={formId} onSubmit={onSubmit} className="space-y-4">
			{isLoadingMembers ? (
				<p className="text-sm text-muted-foreground">Cargando miembros…</p>
			) : (
				<SegmentFields values={values} setValues={setValues} />
			)}
		</form>
	);
}
