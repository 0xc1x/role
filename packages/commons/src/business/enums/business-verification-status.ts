export const BUSINESS_VERIFICATION_STATUSES = ['pending', 'approved', 'rejected'] as const;

export type BusinessVerificationStatus = (typeof BUSINESS_VERIFICATION_STATUSES)[number];

export const BusinessVerificationStatus = {
	PENDING: 'pending',
	APPROVED: 'approved',
	REJECTED: 'rejected',
} as const satisfies Record<string, BusinessVerificationStatus>;
