import LegalScreen from "@/core/ui/LegalScreen";
import { strings } from "@/core/i18n/strings";

export default function TermsScreen() {
	return (
		<LegalScreen
			title={strings.termsScreen.title}
			updatedAt={strings.termsScreen.updatedAt}
			sections={strings.termsScreen.sections}
		/>
	);
}