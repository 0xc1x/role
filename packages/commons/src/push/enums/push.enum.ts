export const PUSH_NOTIFICATION_TYPES = ['announcement', 'promo', 'system'] as const;
export type PushNotificationType = (typeof PUSH_NOTIFICATION_TYPES)[number];

/** Estado agregado de un envío manual registrado en el historial. */
export const PUSH_SEND_STATUSES = ['sent', 'partial', 'failed'] as const;
export type PushSendStatus = (typeof PUSH_SEND_STATUSES)[number];
