importScripts(
  "https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js",
);

const firebaseConfig = {
  apiKey: "AIzaSyBHxNXQTuK70i5glqReDyMdrEKbkRUBVVM",
  authDomain: "lover-link.firebaseapp.com",
  projectId: "lover-link",
  storageBucket: "lover-link.firebasestorage.app",
  messagingSenderId: "604913825184",
  appId: "1:604913825184:web:b877caec7b5544eb8f20c5",
  measurementId: "G-V4Q9EFJ80F",
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log("Received background message:", payload);

  const notificationTitle = payload.notification?.title || "New Notification";
  const notificationOptions = {
    body: payload.notification?.body || "",
    icon: "/logo.svg",
    badge: "/logo.svg",
    data: payload.data,
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data;
  let url = "/app";

  // Navigate based on notification type (matches backend payload structure)
  if (data?.type === "new_message" && data.chatId) {
    url = `/app/chat/${data.chatId}`;
  } else if (data?.type === "incoming_call" || data?.type === "missed_call") {
    url = "/app/calls";
  }

  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientsList) => {
      const existingClient = clientsList.find((client) =>
        client.url.includes(url.split("/app")[1]),
      );
      if (existingClient) {
        return existingClient.focus();
      } else if (clients.openWindow) {
        return clients.openWindow(url);
      }
    }),
  );
});
