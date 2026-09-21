import LegalScreen from "@/src/core/ui/LegalScreen";
import { strings } from "@/src/core/i18n/strings";

export default function PrivacyScreen() {
	return (
		<LegalScreen
			title={strings.privacyScreen.title}
			updatedAt={strings.privacyScreen.updatedAt}
			sections={strings.privacyScreen.sections}
		/>
	);
}