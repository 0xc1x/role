/* Service worker de Firebase Cloud Messaging (web push en la PWA).
 * La config la genera `scripts/generate-firebase-config.mjs` desde .env
 * (gitignored) — las keys no viven en el repo. */

// 1. Listener de click PRIMERO — antes de Firebase para evitar carrera
// con el handler interno de FCM sobre fcm_options.link.
self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	let link =
		event.notification.data?.link ??
		event.notification.data?.url ??
		event.notification.data?.click_action ??
		'/';

	// Fuerza URL absoluta — openWindow/navigate con relativa fallan en algunos
	// navegadores y terminan abriendo el propio script del SW.
	try {
		link = new URL(link, self.location.origin).href;
	} catch {
		link = self.location.origin + '/';
	}

	event.waitUntil(
		self.clients
			.matchAll({ type: 'window', includeUncontrolled: true })
			.then((clientsArr) => {
				for (const client of clientsArr) {
					if (client.url.startsWith(self.location.origin) && 'focus' in client) {
						return client.focus().then(() => {
							if ('navigate' in client) return client.navigate(link);
						});
					}
				}
				if (self.clients.openWindow) return self.clients.openWindow(link);
			}),
	);
});

importScripts('/firebase-config.js');

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp(self.FIREBASE_CONFIG);

const messaging = firebase.messaging();

// Mensajes recibidos con la app cerrada o en background.
messaging.onBackgroundMessage((payload) => {
	const title = payload.notification?.title ?? 'Rolé';
	const data = payload.data ?? {};
	self.registration.showNotification(title, {
		body: payload.notification?.body ?? '',
		icon: data.icon ?? '/icons/Icon-192.png',
		badge: data.badge ?? '/icons/Icon-72.png',
		image: data.image,
		tag: data.tag ?? payload.messageId ?? data.type,
		renotify: false,
		requireInteraction: false,
		data: {
			...data,
			link: data.link || data.url || payload.fcmOptions?.link || '/',
		},
	});
});
