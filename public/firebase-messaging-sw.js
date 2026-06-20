importScripts(
  "https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js",
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
