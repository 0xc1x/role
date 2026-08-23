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
	self.registration.showNotification(title, {
		body: payload.notification?.body ?? "",
		tag: payload.messageId,
		data: payload.data,
	});
});
