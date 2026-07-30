// ─── Voice support for Visionsoft AI chat ────────────────────────────────────
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
    // exposed for tests / debugging
    _stripForSpeech: stripForSpeech,
    _pickVoice: pickVoice,
    _supported: supported,
  };
})();
