console.log('Script loaded. Version: 2');
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

// Guestbook feature
const messageInput = document.getElementById('message-input');
const submitMessage = document.getElementById('submit-message');
const messageList = document.getElementById('message-list');

submitMessage.addEventListener('click', () => {
    const message = messageInput.value;
    if (message) {
        const listItem = document.createElement('li');
        listItem.textContent = message;
        messageList.appendChild(listItem);
        messageInput.value = '';
    }
});
