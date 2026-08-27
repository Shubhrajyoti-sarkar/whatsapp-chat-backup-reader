const fileInput = document.querySelector('#fileInput');
const chatArea = document.querySelector('#chatArea');
const myName = document.querySelector('#myName');
const identityControl = document.querySelector('#identityControl');
const title = document.querySelector('#chatTitle');
const meta = document.querySelector('#chatMeta');
const avatar = document.querySelector('#avatar');

// Android: 17/02/2024, 5:40 pm - Name: Message
// iPhone:  [09/12/2024, 21:22:57] Name: Message
// Both forms occur in WhatsApp exports. Times may be 12- or 24-hour and may include seconds.
const androidMessageStart = /^(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm|AM|PM|a\.m\.|p\.m\.)?)\s+-\s+([^:]+):\s?(.*)$/;
const iphoneMessageStart = /^\[(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}),\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm|AM|PM|a\.m\.|p\.m\.)?)\]\s+([^:]+):\s?(.*)$/;
const timestampStart = /^(?:\[)?\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4},?/;

function parseChat(text) {
  const messages = [];
  let current;
  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach(line => {
    const match = line.match(androidMessageStart) || line.match(iphoneMessageStart);
    if (match) {
      current = { date: match[1], time: match[2].replace(/\s+/g, ' '), sender: match[3].trim(), text: match[4] };
      messages.push(current);
    } else if (timestampStart.test(line)) {
      // Ignore WhatsApp's date-stamped system notices instead of appending them to a message.
      current = null;
    } else if (current && line.trim()) {
      current.text += `\n${line}`;
    }
  });
  return messages;
}

function escapeHtml(value) {
  const element = document.createElement('div');
  element.textContent = value;
  return element.innerHTML;
}

function display(messages) {
  const ownName = myName.value;
  let previousDate = '';
  chatArea.innerHTML = messages.map(message => {
    const divider = message.date !== previousDate ? `<div class="date-divider"><span>${escapeHtml(message.date)}</span></div>` : '';
    previousDate = message.date;
    const sent = message.sender === ownName;
    return `${divider}<article class="message-row ${sent ? 'sent' : 'received'}"><div class="message"><span class="sender">${escapeHtml(message.sender)}</span><span class="message-text">${escapeHtml(message.text)}</span><time class="message-time">${escapeHtml(message.time)}</time></div></article>`;
  }).join('');
  chatArea.scrollTop = chatArea.scrollHeight;
}

fileInput.addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  const messages = parseChat(await file.text());
  if (!messages.length) {
    chatArea.innerHTML = '<div class="empty-state"><div class="empty-orbit">!</div><h3>No messages found</h3><p>Use a WhatsApp exported text file with dates, times, names, and messages.</p></div>';
    return;
  }
  const names = [...new Set(messages.map(item => item.sender))];
  myName.innerHTML = names.map(name => `<option>${escapeHtml(name)}</option>`).join('');
  identityControl.hidden = false;
  title.textContent = names.length === 2 ? names.join(' & ') : 'Group conversation';
  meta.textContent = `${messages.length} messages · ${names.length} participant${names.length === 1 ? '' : 's'}`;
  avatar.textContent = names.length === 2 ? '♡' : '✦';
  display(messages);
  myName.onchange = () => display(messages);
});

document.querySelector('#themeButton').addEventListener('click', () => {
  document.body.classList.toggle('dark');
  document.querySelector('#themeButton').textContent = document.body.classList.contains('dark') ? '☀' : '☾';
});
