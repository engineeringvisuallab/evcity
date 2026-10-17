import { bn, type VoiceId } from '../i18n';
import type { Subtitles } from '../ui/Subtitles';

/**
 * বাংলা ভয়েস। প্রতিটি লাইনের জন্য এই ক্রমে চেষ্টা করে:
 *   1. রেকর্ড করা ফাইল  public/assets/voice/bn/<id>.mp3   (সেরা মান - প্রকৃত বাংলা কণ্ঠ)
 *   2. ব্রাউজারের বাংলা TTS ভয়েস (bn-BD / bn-IN) - যদি ডিভাইসে থাকে
 *   3. শুধু বাংলা সাবটাইটেল
 * সাবটাইটেল সবসময় দেখানো হয়।
 */
export class VoiceManager {
  private muted = false;
  private ttsVoice: SpeechSynthesisVoice | null = null;
  private audio: HTMLAudioElement | null = null;
  private token = 0;
  private warned = false;

  constructor(private subtitles: Subtitles) {
    if ('speechSynthesis' in window) {
      const pick = () => {
        this.ttsVoice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('bn')) ?? null;
      };
      pick();
      speechSynthesis.addEventListener('voiceschanged', pick);
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.muted) this.stop();
  }

  async speak(id: VoiceId): Promise<void> {
    const text = bn.voice[id];
    this.stop();
    const my = ++this.token;
    const readTime = 2 + text.length * 0.07;

    if (this.muted) {
      this.subtitles.show(text, readTime);
      return;
    }

    // 1. recorded file
    const a = new Audio(`${import.meta.env.BASE_URL}assets/voice/bn/${id}.mp3`);
    try {
      await a.play();
      if (my !== this.token) {
        a.pause();
        return;
      }
      this.audio = a;
      this.subtitles.show(text, null);
      a.onended = () => {
        if (my === this.token) this.subtitles.hide();
      };
      return;
    } catch {
      /* no recorded file: fall through */
    }

    // 2. browser Bangla TTS
    if (this.ttsVoice && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text);
      u.voice = this.ttsVoice;
      u.lang = this.ttsVoice.lang;
      u.onend = () => {
        if (my === this.token) this.subtitles.hide();
      };
      this.subtitles.show(text, null);
      speechSynthesis.speak(u);
      return;
    }

    // 3. subtitles only
    if (!this.warned) {
      this.warned = true;
      console.warn('[VoiceManager] No Bangla voice: add public/assets/voice/bn/<id>.mp3 files. Showing subtitles only.');
    }
    this.subtitles.show(text, readTime);
  }


  /** Speak a dynamic Bengali line (used for Tour destinations and status messages). */
  async speakText(text: string): Promise<void> {
    this.stop();
    const my = ++this.token;
    const readTime = Math.max(2.5, 1.8 + text.length * 0.075);
    if (this.muted) {
      this.subtitles.show(text, readTime);
      return;
    }

    const voices = 'speechSynthesis' in window ? speechSynthesis.getVoices() : [];
    const voice = this.ttsVoice ?? voices.find((v) => v.lang.toLowerCase().startsWith('bn')) ?? null;
    if (voice && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = 0.94;
      utterance.pitch = 0.98;
      utterance.onend = () => { if (my === this.token) this.subtitles.hide(); };
      utterance.onerror = () => { if (my === this.token) this.subtitles.show(text, readTime); };
      this.subtitles.show(text, null);
      speechSynthesis.speak(utterance);
      return;
    }

    this.subtitles.show(text, readTime);
  }

  stop(): void {
    this.token++;
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    this.subtitles.hide();
  }
}
