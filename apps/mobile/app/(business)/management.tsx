import { useAuthStore } from "@/src/features/auth/store";
import { NoBusinessPrompt } from "@/src/features/business/components/NoBusinessPrompt";
import { GestionContent, GestionContentSkeleton } from "@/src/features/business/components/management/GestionContent";
import { useBusinesses } from "@/src/features/business/hooks";

export default function GestionScreen() {
	const profile = useAuthStore((s) => s.profile);
	const { data: businesses, isLoading } = useBusinesses(profile?.id ?? "");
	const business = businesses?.[0];

	if (isLoading) return <GestionContentSkeleton />;

	if (!business) {
		return <NoBusinessPrompt />;
	}

	return <GestionContent businessId={business.id} />;
}
