import { LoadingView } from "@/core/ui";
import { useAuthStore } from "@/features/auth/store";
import { NoBusinessPrompt } from "@/features/business/components/NoBusinessPrompt";
import { GestionContent } from "@/features/business/components/management/GestionContent";
import { useBusinesses } from "@/features/business/hooks";

export default function GestionScreen() {
	const profile = useAuthStore((s) => s.profile);
	const { data: businesses, isLoading } = useBusinesses(profile?.id ?? "");
	const business = businesses?.[0];

	if (isLoading) return <LoadingView />;

	if (!business) {
		return <NoBusinessPrompt />;
	}

	return <GestionContent businessId={business.id} />;
}
