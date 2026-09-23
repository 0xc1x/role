import InfoScreen from "@/src/core/ui/InfoScreen";
import { strings } from "@/src/core/i18n/strings";

export default function LandingHowItWorksScreen() {
	return (
		<InfoScreen
			title={strings.landing.howItWorks}
			body={strings.landing.howItWorksBody}
		/>
	);
}
