# Implementation Guide — Add Voice (Mic) + Multi-Language to the Support Chatbot

**Hand this whole file to the Claude/agent working inside the Posetra project.**

## Goal

Add **voice input (microphone)**, **spoken replies**, and a **multi-language selector** to the existing Hermis support-page chatbot that lives inside the Posetra project. This is **100% front-end** — no backend, no new dependencies, no API keys, no cost. It uses the browser's built-in Web Speech APIs (`SpeechRecognition` + `speechSynthesis`).

When done, the user can:
- Tap a 🎤 mic, speak (in many languages), and have it transcribed + sent automatically.
- Hear the bot's reply spoken aloud (only when they used the mic).
- Pick a language (Dubai/UAE + India + others) or leave it on Auto-detect.
- Mute/unmute spoken replies with a 🔊 toggle.

Because the transcribed text is fed into the **existing** chat send function, voice "raise a ticket" and multi-language replies work automatically — the AI/ticket logic does not change.

---

## Before you start — find these in the existing support page

The support page already has a working **text** chat. Locate these (names may differ in Posetra — adapt accordingly):

| What we reference here | What it is | Typical name |
|---|---|---|
| The chat send function | Sends the text in the input box to the chat backend | `sendMessage()` |
| The append-message function | Adds a bubble to the chat | `appendMessage(role, text)` |
| The text input element id | The box the user types in | `chatInput` |
| The messages container id | The scrolling message list | `chatMessages` |
| The input row container | The `<div>` holding the input + send button | class `chat-input-area` |
| The chat panel header | The top bar with the title/close button | class `ai-header` |
| The frontend JS file | Where `sendMessage` lives | `script.js` |
| The HTML file | The chat markup | `index.html` |
| The CSS file | Styles | `styles.css` |

**If the IDs/names differ**, change them in the code below to match the Posetra support page. The three integration points that MUST match the existing code are: the send function (`sendMessage`), the append function (`appendMessage`), and the input element id (`chatInput`).

---

## Step 1 — Create `public/voice.js`

Create a new file `public/voice.js` (same folder as the existing `script.js`) with this exact content:

```js
// ─── Voice support for the support chat ──────────────────────────────────────
// All client-side, using the browser's built-in Web Speech APIs:
//   • SpeechRecognition  → microphone → text (tap-to-talk)
//   • speechSynthesis     → bot reply spoken aloud
// The transcribed text is fed into the existing sendMessage(), so voice
// "raise a ticket" and multi-language replies work with no backend changes.

(function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis || null;

  let recognition = null;
  let listening = false;
  let voiceReplyEnabled = true;   // speak bot replies (only when the user used the mic)
  let pendingVoiceTurn = false;   // set when the current message came from the mic

  function supported() { return !!SR; }

  // The language to recognise/speak. Defaults to the browser language ("Auto"),
  // or a specific language if the user picked one from the dropdown.
  function currentLang() {
    const sel = document.getElementById('voiceLang');
    const v = sel ? sel.value : 'auto';
    return (!v || v === 'auto') ? (navigator.language || 'en-US') : v;
  }

  function setMicState(state) {
    const btn = document.getElementById('micBtn');
    if (!btn) return;
    btn.classList.remove('listening', 'processing');
    if (state) btn.classList.add(state);
  }

  function botNote(msg) {
    if (typeof window.appendMessage === 'function') window.appendMessage('bot', msg);
  }

  // ── Speech-to-text (mic) ────────────────────────────────────────────────────
  function toggleListening() {
    if (!supported()) {
      botNote('🎤 Voice input is not supported in this browser. Please use Chrome or Edge, or type your message.');
      return;
    }
    if (listening) { stopListening(); return; }
    startListening();
  }

  function startListening() {
    recognition = new SR();
    recognition.lang = currentLang();
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    listening = true;
    setMicState('listening');

    recognition.onresult = (e) => {
      const transcript = (e.results[0][0].transcript || '').trim();
      stopListening();
      if (!transcript) return;
      const input = document.getElementById('chatInput');
      if (input) input.value = transcript;
      pendingVoiceTurn = true;          // mark this send as a voice turn → speak the reply
      if (typeof window.sendMessage === 'function') window.sendMessage();
    };

    recognition.onerror = (e) => {
      listening = false;
      setMicState(null);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        botNote('🎤 Please allow microphone access in your browser to use voice.');
      } else if (e.error === 'no-speech') {
        botNote("🎤 I didn't catch that. Tap the mic and try again.");
      }
    };

    recognition.onend = () => { listening = false; setMicState(null); };

    try { recognition.start(); }
    catch (_) { listening = false; setMicState(null); }
  }

  function stopListening() {
    listening = false;
    setMicState(null);
    if (recognition) { try { recognition.stop(); } catch (_) {} }
  }

  // ── Text-to-speech (bot speaks) ─────────────────────────────────────────────
  function stripForSpeech(text) {
    return String(text || '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // markdown links → label
      .replace(/[*_`#>|]/g, ' ')               // markdown symbols
      .replace(/\s+/g, ' ')
      .trim();
  }

  function pickVoice(lang) {
    if (!synth) return null;
    const voices = synth.getVoices() || [];
    const want = String(lang || '').toLowerCase();
    const base = want.split('-')[0];
    return voices.find((v) => v.lang && v.lang.toLowerCase() === want)
        || voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(base))
        || null;
  }

  // Whether the last message was sent via the mic (consumed once).
  function consumeVoiceTurn() {
    const was = pendingVoiceTurn;
    pendingVoiceTurn = false;
    return was;
  }

  // Speak a bot reply (called by sendMessage only when the turn was voice).
  function speak(text) {
    if (!voiceReplyEnabled || !synth || !text) return;
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(stripForSpeech(text));
      const lang = currentLang();
      u.lang = lang;
      const v = pickVoice(lang);
      if (v) u.voice = v;
      synth.speak(u);
    } catch (_) {}
  }

  function toggleSpeaker() {
    voiceReplyEnabled = !voiceReplyEnabled;
    const btn = document.getElementById('speakerBtn');
    if (btn) {
      btn.textContent = voiceReplyEnabled ? '🔊' : '🔇';
      btn.classList.toggle('muted', !voiceReplyEnabled);
      btn.title = voiceReplyEnabled ? 'Voice replies: on' : 'Voice replies: off';
    }
    if (!voiceReplyEnabled && synth) synth.cancel();
  }

  function init() {
    if (!supported()) {
      const mic = document.getElementById('micBtn');
      if (mic) mic.style.display = 'none';
      const lang = document.getElementById('voiceLang');
      if (lang) lang.style.display = 'none';
    }
    // Some browsers populate the voice list asynchronously.
    if (synth) { try { synth.getVoices(); synth.onvoiceschanged = () => synth.getVoices(); } catch (_) {} }
  }

  document.addEventListener('DOMContentLoaded', init);

  window.VoiceUI = {
    toggleListening,
    toggleSpeaker,
    consumeVoiceTurn,
    speak,
    init,
    _stripForSpeech: stripForSpeech,
    _pickVoice: pickVoice,
    _supported: supported,
  };
})();
```

---

## Step 2 — Edit `public/index.html`

### 2a. Load `voice.js` BEFORE the main chat script

Find where the chat script is loaded (e.g. `<script src="script.js"></script>`) and add `voice.js` just before it:

```html
  <script src="voice.js"></script>
  <script src="script.js"></script>
```

### 2b. Add the 🔊 speaker toggle to the chat header

Find the chat panel header (class `ai-header`) and its close button. Wrap the close button and a new speaker button in an actions div. Example — adapt to the existing close button:

```html
      <div class="ai-header-actions">
        <button id="speakerBtn" class="speaker-btn" onclick="VoiceUI.toggleSpeaker()" title="Voice replies: on" aria-label="Toggle voice replies">🔊</button>
        <button onclick="closeAIPanel()" aria-label="Close chat">✕</button>
      </div>
```

(If the header has no close button, just place the `speakerBtn` somewhere visible in the header.)

### 2c. Add the language dropdown + mic button to the input row

Find the input row (class `chat-input-area`) that contains the text input and send button. Add the language `<select>` and the mic `<button>` BEFORE the text input:

```html
      <select id="voiceLang" class="voice-lang" title="Choose speech language" aria-label="Speech language">
        <option value="auto">🌐 Auto-detect</option>
        <optgroup label="Dubai / UAE">
          <option value="ar-AE">العربية (Arabic)</option>
          <option value="en-US">English</option>
          <option value="ur-PK">اردو (Urdu)</option>
          <option value="fa-IR">فارسی (Persian)</option>
          <option value="fil-PH">Filipino (Tagalog)</option>
          <option value="ru-RU">Русский (Russian)</option>
          <option value="hi-IN">हिन्दी (Hindi)</option>
        </optgroup>
        <optgroup label="India">
          <option value="hi-IN">हिन्दी (Hindi)</option>
          <option value="te-IN">తెలుగు (Telugu)</option>
          <option value="ml-IN">മലയാളം (Malayalam)</option>
          <option value="ta-IN">தமிழ் (Tamil)</option>
          <option value="kn-IN">ಕನ್ನಡ (Kannada)</option>
          <option value="mr-IN">मराठी (Marathi)</option>
          <option value="gu-IN">ગુજરાતી (Gujarati)</option>
          <option value="bn-IN">বাংলা (Bengali)</option>
          <option value="pa-IN">ਪੰਜਾਬੀ (Punjabi)</option>
        </optgroup>
        <optgroup label="Other">
          <option value="en-GB">English (UK)</option>
          <option value="es-ES">Español (Spanish)</option>
          <option value="fr-FR">Français (French)</option>
          <option value="de-DE">Deutsch (German)</option>
          <option value="zh-CN">中文 (Chinese)</option>
        </optgroup>
      </select>
      <button id="micBtn" class="mic-btn" onclick="VoiceUI.toggleListening()" title="Tap to talk" aria-label="Speak">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" aria-hidden="true">
          <path d="M12 14.5a3 3 0 0 0 3-3v-6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z"/>
          <path d="M19 11.5a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.93V21H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-2.57a7 7 0 0 0 6-6.93z"/>
        </svg>
      </button>
```

The final input row order should be: **[language select] [mic button] [text input] [send button]**.

---

## Step 3 — Edit `public/script.js` (the chat send function)

Make **two small additions** inside the existing `sendMessage()` function.

### 3a. Near the TOP of `sendMessage`, after reading the user's text

Right after the code that reads the input value (e.g. `const userText = input.value.trim();`), add:

```js
  // Did this message come from the mic? If so, we'll speak the reply aloud.
  const wasVoice = (window.VoiceUI && typeof VoiceUI.consumeVoiceTurn === 'function')
    ? VoiceUI.consumeVoiceTurn()
    : false;
```

### 3b. Right AFTER the bot's reply is appended to the chat

Find the line that adds the bot reply bubble (e.g. `appendMessage('bot', reply);`) and add immediately after it:

```js
  // Speak the reply aloud only when the user asked by voice.
  if (wasVoice && window.VoiceUI && typeof VoiceUI.speak === 'function') {
    VoiceUI.speak(reply);
  }
```

> `reply` is whatever variable holds the bot's reply text in the existing code. If it's named differently (e.g. `data.reply`), use that.

**That's the only JS change.** The mic feeds text into `sendMessage` exactly as if the user typed it, so all existing chat/ticket/order logic runs unchanged.

---

## Step 4 — Add CSS to `public/styles.css`

Append this block (adjust the purple `#6d28d9` to match the support page's theme color if different):

```css
/* ─── Voice controls ─────────────────────────────────────────────────────────── */
.ai-header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
.ai-header-actions button {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.85);
  font-size: 16px;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  transition: color 0.15s, background 0.15s;
}
.ai-header-actions button:hover {
  color: white;
  background: rgba(255, 255, 255, 0.12);
}
.speaker-btn.muted { opacity: 0.5; }

/* Language selector — shows full language names */
.voice-lang {
  flex-shrink: 0;
  width: 116px;
  max-width: 38%;
  border: 1px solid #ddd;
  border-radius: 14px;
  background: #f5f6f8;
  color: #4c1d95;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 6px;
  height: 40px;
  cursor: pointer;
  outline: none;
  text-overflow: ellipsis;
}
.voice-lang:focus { border-color: #6d28d9; }
.voice-lang optgroup { color: #1a1a1a; font-weight: 700; }
.voice-lang option { color: #1a1a1a; font-weight: 500; }

/* Mic button — distinct from send, with a listening pulse */
.chat-input-area button.mic-btn {
  background: #ede9fe;
  color: #6d28d9;
  font-size: 16px;
}
.chat-input-area button.mic-btn:hover:not(:disabled) {
  background: #ddd6fe;
}
.chat-input-area button.mic-btn.listening {
  background: #ef4444;
  color: white;
  animation: micPulse 1.1s ease-in-out infinite;
}
@keyframes micPulse {
  0%   { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55); }
  70%  { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}
```

> If the existing input-row buttons aren't styled by `.chat-input-area button`, give `#micBtn` whatever round-button styling the send button uses, plus the `.listening` rule above.

---

## Step 5 — How it works (for reviewers)

```
User taps 🎤 → SpeechRecognition (browser) → text → put in #chatInput → sendMessage()
   → existing chat backend → bot reply → if the turn was voice: speechSynthesis speaks it
```

- **No backend changes.** Voice text enters the exact same `sendMessage()` path as typed text.
- **Multi-language:** `recognition.lang` is set from the dropdown (or the browser language on "Auto"). The bot already replies in the user's language; `speak()` uses the same language code to choose a matching voice.
- **Speak only on voice turns:** `consumeVoiceTurn()` returns true only when the message came from the mic, so typed messages stay silent.

---

## Step 6 — Test checklist (use Chrome or Edge)

1. Open the support page, open the chat. You should see the 🌐 language dropdown, 🎤 mic button, and 🔊 toggle in the header.
2. Tap 🎤 → browser asks for microphone permission → click **Allow**. The mic pulses red.
3. Say *"what is the last sales order"* → it transcribes, sends, shows the answer, and **speaks it aloud**.
4. Tap 🎤 and say *"raise a ticket"* → the existing ticket flow opens — by voice.
5. Pick **العربية (Arabic)** from the dropdown, tap 🎤, speak Arabic → it recognizes and replies/speaks in Arabic.
6. Tap 🔊 in the header → spoken replies mute/unmute.
7. Type a message (no mic) → bot replies in text only (no speech). Correct.

---

## Important caveats (tell the user)

- **Use Chrome or Edge.** Firefox does not support the browser `SpeechRecognition` API — there the mic button auto-hides and users just type. Safari support is partial (recent versions).
- **HTTPS or localhost required.** The mic only works on `https://` pages or `http://localhost`. On a deployed site it must be served over HTTPS.
- **Internet required.** Chrome processes speech in the cloud, so the device must be online.
- **Language auto-detect is approximate.** The free browser engine recognizes the *browser's* language best. For a different spoken language, the user should pick it from the 🌐 dropdown. Flawless any-language auto-detect would require a paid server-side speech service (e.g. Whisper) — out of scope for this front-end-only version.
- **Microphone permission:** if a user blocked it, they re-enable via the icon at the left of the address bar → Site settings → Microphone → Allow → reload.

---

## Summary of files changed

| File | Change |
|---|---|
| `public/voice.js` | **New** — all voice logic (Step 1) |
| `public/index.html` | Load `voice.js`; add 🔊 toggle, 🌐 language select, 🎤 mic button (Step 2) |
| `public/script.js` | Two lines in `sendMessage`: capture `wasVoice`, speak the reply (Step 3) |
| `public/styles.css` | Voice control styles (Step 4) |

No backend files, no `package.json`, no environment variables, no new dependencies.
