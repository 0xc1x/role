import InfoScreen from "@/core/ui/InfoScreen";
import { strings } from "@/core/i18n/strings";

export default function LandingHowItWorksScreen() {
	return (
		<InfoScreen
			title={strings.landing.howItWorks}
			body={strings.landing.howItWorksBody}
		/>
	);
}
