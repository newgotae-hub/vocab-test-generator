
// Dark Mode Toggle
const themeToggle = document.getElementById('themeBtn');
const body = document.body;

// Check for saved theme preference
const savedTheme = localStorage.getItem('theme');
if (savedTheme) {
    body.classList.add(savedTheme);
}

themeToggle.addEventListener('click', () => {
    if (body.classList.contains('dark-mode')) {
        body.classList.remove('dark-mode');
        localStorage.setItem('theme', '');
    } else {
        body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark-mode');
    }
});

// --- Firebase Guestbook (Client-side) ---

const firebaseConfig = {
  apiKey: "AIzaSyBeCMc0eagcEBpG5RdCahMOBCJvMv1VcnU",
  authDomain: "vocab-guestbook.firebaseapp.com",
  projectId: "vocab-guestbook",
  storageBucket: "vocab-guestbook.appspot.com",
  messagingSenderId: "366553283789",
  appId: "1:366553283789:web:b48b01745a7cbbb47c7d84",
  measurementId: "G-KCFNMN0E96"
};

// Initialize Firebase using the compat libraries
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const messageList = document.getElementById('message-list');
const messageInput = document.getElementById('message-input');
const submitMessage = document.getElementById('submit-message');

// Listen for real-time updates from Firestore
db.collection("messages").orderBy("timestamp", "desc").onSnapshot((snapshot) => {
    messageList.innerHTML = ''; // Clear the list
    snapshot.forEach((doc) => {
        const message = doc.data();
        const listItem = document.createElement('li');
        listItem.textContent = message.text;
        messageList.appendChild(listItem);
    });
});

// Handle message submission
submitMessage.addEventListener('click', async () => {
    const messageText = messageInput.value.trim();
    if (!messageText) return;

    submitMessage.disabled = true;
    submitMessage.textContent = 'Submitting...';

    try {
        await db.collection("messages").add({
            text: messageText,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        messageInput.value = '';
    } catch (error) {
        alert('Error submitting message. Check console for details.');
        console.error("Error adding document: ", error);
    } finally {
        submitMessage.disabled = false;
        submitMessage.textContent = 'Submit';
    }
});
