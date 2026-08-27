const fileInput = document.querySelector('#fileInput');
const chatArea = document.querySelector('#chatArea');
const myName = document.querySelector('#myName');
const identityControl = document.querySelector('#identityControl');
const title = document.querySelector('#chatTitle');
const meta = document.querySelector('#chatMeta');
const avatar = document.querySelector('#avatar');
let objectUrls = [];

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
    // iPhone exports sometimes insert invisible direction / zero-width markers
    // around timestamps and attachment markers. Remove them before matching.
    const parseLine = line.replace(/[\uFEFF\u200B-\u200F\u202A-\u202E\u2060]/g, '');
    const match = parseLine.match(androidMessageStart) || parseLine.match(iphoneMessageStart);
    if (match) {
      current = { date: match[1], time: match[2].replace(/\s+/g, ' '), sender: match[3].trim(), text: match[4] };
      messages.push(current);
    } else if (timestampStart.test(parseLine)) {
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

function normaliseFileName(name) {
  return name.replace(/\\/g, '/').split('/').pop().trim().toLowerCase();
}

function attachmentFrom(text) {
  const cleanText = text.replace(/[\u200e\u200f\u202a-\u202e]/g, '');
  const marker = cleanText.match(/\\?<attached:\s*(.+?)>/i);
  const androidMarker = cleanText.match(/^(.+?)\s+\((?:file|image|video|audio|document) attached\)$/i);
  const name = marker?.[1] || androidMarker?.[1];
  return name ? { name: name.trim(), caption: cleanText.replace(marker?.[0] || androidMarker?.[0] || '', '').trim() } : null;
}

function mediaType(name) {
  const extension = name.split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(extension)) return 'image';
  if (['mp4', 'mov', 'webm', '3gp'].includes(extension)) return 'video';
  if (['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus'].includes(extension)) return 'audio';
  return 'document';
}

function mediaMimeType(name) {
  const extension = name.split('.').pop().toLowerCase();
  const types = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg' };
  return types[extension] || 'application/octet-stream';
}

function mediaMarkup(attachment, media) {
  const label = escapeHtml(attachment.name);
  if (!media) return `<p class="media-missing">Attachment: ${label}</p>`;
  if (media.kind === 'image') return `<img class="chat-media" src="${media.url}" alt="${label}" loading="lazy" />`;
  if (media.kind === 'video') return `<video class="chat-media" src="${media.url}" controls></video>`;
  if (media.kind === 'audio') return `<audio class="chat-audio" src="${media.url}" controls></audio>`;
  return `<a class="document-link" href="${media.url}" download="${label}"><span class="attachment-name">${label}</span></a>`;
}

function display(messages, media = new Map()) {
  const ownName = myName.value;
  let previousDate = '';
  chatArea.innerHTML = messages.map(message => {
    const divider = message.date !== previousDate ? `<div class="date-divider"><span>${escapeHtml(message.date)}</span></div>` : '';
    previousDate = message.date;
    const sent = message.sender === ownName;
    const attachment = attachmentFrom(message.text);
    const body = attachment ? attachment.caption : message.text;
    const file = attachment && media.get(normaliseFileName(attachment.name));
    return `${divider}<article class="message-row ${sent ? 'sent' : 'received'}"><div class="message"><span class="sender">${escapeHtml(message.sender)}</span>${attachment ? mediaMarkup(attachment, file) : ''}${body ? `<span class="message-text">${escapeHtml(body)}</span>` : ''}<time class="message-time">${escapeHtml(message.time)}</time></div></article>`;
  }).join('');
  chatArea.scrollTop = chatArea.scrollHeight;
}

async function mediaFromZip(zip, messages) {
  const needed = new Set(messages.map(message => attachmentFrom(message.text)?.name).filter(Boolean).map(normaliseFileName));
  const entries = Object.values(zip.files);
  const media = new Map();
  for (const name of needed) {
    const entry = entries.find(item => !item.dir && normaliseFileName(item.name) === name);
    if (!entry) continue;
    const rawBlob = await entry.async('blob');
    const blob = rawBlob.slice(0, rawBlob.size, mediaMimeType(name));
    const url = URL.createObjectURL(blob);
    objectUrls.push(url);
    media.set(name, { url, kind: mediaType(name) });
  }
  return media;
}

async function importFile(file) {
  objectUrls.forEach(URL.revokeObjectURL);
  objectUrls = [];
  if (!/\.zip$/i.test(file.name)) return { messages: parseChat(await file.text()), media: new Map() };
  if (!window.JSZip) throw new Error('The ZIP reader could not be loaded. Check your internet connection and try again.');
  const zip = await JSZip.loadAsync(file);
  const textFiles = Object.values(zip.files).filter(entry => !entry.dir && /\.txt$/i.test(entry.name));
  const candidates = await Promise.all(textFiles.map(async entry => ({ messages: parseChat(await entry.async('string')) })));
  const best = candidates.sort((a, b) => b.messages.length - a.messages.length)[0];
  if (!best) return { messages: [], media: new Map() };
  return { messages: best.messages, media: await mediaFromZip(zip, best.messages) };
}

fileInput.addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  chatArea.innerHTML = '<div class="empty-state"><div class="empty-orbit">…</div><h3>Opening your archive</h3><p>Reading messages and matching media files.</p></div>';
  let result;
  try { result = await importFile(file); } catch (error) {
    chatArea.innerHTML = `<div class="empty-state"><div class="empty-orbit">!</div><h3>Could not open that file</h3><p>${escapeHtml(error.message)}</p></div>`;
    return;
  }
  const { messages, media } = result;
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
  display(messages, media);
  myName.onchange = () => display(messages, media);
});

document.querySelector('#themeButton').addEventListener('click', () => {
  document.body.classList.toggle('dark');
  document.querySelector('#themeButton').textContent = document.body.classList.contains('dark') ? '☀' : '☾';
});
