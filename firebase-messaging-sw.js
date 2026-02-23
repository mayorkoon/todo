// ── Firebase Service Worker for background push notifications ──
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey:            "AIzaSyDA8wZBHVMXhwb6Y7G5x3W_7bYQV6NSip8",
  authDomain:        "to-do-app-9f1b5.firebaseapp.com",
  projectId:         "to-do-app-9f1b5",
  storageBucket:     "to-do-app-9f1b5.firebasestorage.app",
  messagingSenderId: "98044565116",
  appId:             "1:98044565116:web:1e742abec84c2f77ba5bf9"
});

const messaging = firebase.messaging();

// Handle background notifications (when app tab is not in focus)
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification;
  self.registration.showNotification(title, {
    body,
    icon:  "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag:   "todo-reminder",
    requireInteraction: true   // keeps notification visible until dismissed
  });
});
