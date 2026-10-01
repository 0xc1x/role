import { strings } from "@/src/core/i18n/strings";
import { buildControllerIdentity } from "@/src/core/i18n/operator-identity";
import LegalScreen from "@/src/core/ui/LegalScreen";
import { useConfigValue } from "@/src/features/config";

export default function PrivacyScreen() {
	const controllerIdentity = useConfigValue(
		"legal.controller_identity",
		"el operador de Rolé (identidad legal pendiente de publicación)",
	);
	const companyName = useConfigValue(
		"legal.company_name",
		"Operador de Rolé (pendiente)",
	);
	const ruc = useConfigValue("legal.ruc", "");
	const address = useConfigValue(
		"legal.address",
		"Quito, Ecuador (pendiente de confirmación)",
	);
	const contactEmail = useConfigValue(
		"privacy.contact_email",
		strings.privacyScreen.contactEmail,
	);
	const identity = buildControllerIdentity({
		companyName,
		ruc,
		address,
		controllerIdentity,
	});
	const sections = strings.privacyScreen.sections.map((section) => ({
		...section,
		content: section.content
			.replace("{controllerIdentity}", identity)
			.replace("{contactEmail}", contactEmail),
	}));

	return (
		<LegalScreen
			title={strings.privacyScreen.title}
			updatedAt={strings.privacyScreen.updatedAt}
			sections={sections}
		/>
	);
}
