/* Service worker de Firebase Cloud Messaging (web push en la PWA).
 * La config la genera `scripts/generate-firebase-config.mjs` desde .env
 * (gitignored) — las keys no viven en el repo. */
importScripts("/firebase-config.js");

importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp(self.FIREBASE_CONFIG);

const messaging = firebase.messaging();

// Mensajes recibidos con la app cerrada o en background.
messaging.onBackgroundMessage((payload) => {
	const title = payload.notification?.title ?? "Rolé";
	const data = payload.data ?? {};
	self.registration.showNotification(title, {
		body: payload.notification?.body ?? "",
		icon: data.icon ?? "/icons/Icon-192.png",
		badge: data.badge ?? "/icons/Icon-72.png",
		image: data.image,
		tag: data.tag ?? payload.messageId ?? data.type,
		renotify: false,
		requireInteraction: false,
		data,
	});
});

// Click en la notificación: abre/focaliza la app con el link del push.
self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const link = event.notification.data?.link ?? '/';
	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
			for (const client of clients) {
				if (client.url.includes(self.location.origin) && 'focus' in client) {
					client.navigate(link).catch(() => {});
					return client.focus();
				}
			}
			return self.clients.openWindow(link);
		}),
	);
});
