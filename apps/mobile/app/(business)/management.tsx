import { useAuthStore } from "@/src/features/auth/store";
import { ErrorState } from "@/src/core/ui";
import { NoBusinessPrompt } from "@/src/features/business/components/NoBusinessPrompt";
import {
	GestionContent,
	GestionContentSkeleton,
} from "@/src/features/business/components/management/GestionContent";
import { useBusinesses } from "@/src/features/business/hooks";

export default function GestionScreen() {
	const profile = useAuthStore((s) => s.profile);
	const {
		data: businesses,
		isLoading,
		isError: businessesError,
		error: businessesErrorValue,
		refetch: refetchBusinesses,
	} = useBusinesses(profile?.id ?? "");
	const business = businesses?.[0];

	if (isLoading) return <GestionContentSkeleton />;

	// Un fallo de red o de RLS NO es "todavía no tienes negocio": mostrar el
	// prompt de alta ahí invita a crear un negocio duplicado.
	if (businessesError) {
		return (
			<ErrorState
				error={businessesErrorValue}
				onRetry={() => void refetchBusinesses()}
			/>
		);
	}

	if (!business) {
		return <NoBusinessPrompt />;
	}

	return <GestionContent businessId={business.id} />;
}
