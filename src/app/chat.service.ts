import { Injectable, signal, computed, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { GoogleGenAI, Chat, GenerateContentResponse, Content } from '@google/genai';
import { Message } from './message.model';

const STORAGE_KEY = 'co_thinking_chat_history';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private ai: GoogleGenAI;
  private chatSession: Chat;
  private platformId = inject(PLATFORM_ID);
  
  // State
  private messagesSignal = signal<Message[]>([]);
  public messages = computed(() => this.messagesSignal());
  public isLoading = signal<boolean>(false);

  constructor() {
    // Initialize Gemini API
    this.ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    
    let initialMessages: Message[] = [];
    let history: Content[] = [];

    // Load from local storage if in browser
    if (isPlatformBrowser(this.platformId)) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          initialMessages = parsed.map((m: { id: string, role: 'user' | 'model', text: string, timestamp: string, isStreaming?: boolean }) => ({
            ...m,
            timestamp: new Date(m.timestamp)
          }));

          // Build history for Gemini
          history = initialMessages.map(m => ({
            role: m.role,
            parts: [{ text: m.text }]
          }));
        } catch (e) {
          console.error('Failed to parse chat history', e);
        }
      }
    }

    // Default greeting if no history
    if (initialMessages.length === 0) {
      initialMessages = [{
        id: crypto.randomUUID(),
        role: 'model',
        text: '哈囉！我是你的專屬 Co-thinking 助理。知道你平時做香港小學老師好忙，有咩教學上、行政上或者生活上嘅諗法想傾下？隨時搵我啦！',
        timestamp: new Date()
      }];
      history = [{
        role: 'model',
        parts: [{ text: initialMessages[0].text }]
      }];
    }

    this.messagesSignal.set(initialMessages);
    
    // Create chat session with system instructions and history
    this.chatSession = this.ai.chats.create({
      model: 'gemini-3.1-pro-preview',
      config: {
        systemInstruction: `你是一個專屬的共同思考 (co-thinking) 助理，模式類似 WhatsApp。
使用者的背景是香港的小學教師。
你的目標是：
1. 記住使用者的個人特性和工作行業（香港小學教師）。
2. 在對話中給予實用的意見、引導思考。
3. 作為一個良好的傾聽者和腦力激盪的夥伴。
4. 請使用繁體中文（香港慣用語）進行交流，語氣要像朋友一樣自然、支持且具啟發性。
5. 不需要每次都開啟新話題，可以延續之前的討論或隨時切換話題。
6. 幫助使用者解決教學、行政、學生輔導或個人成長上的問題。`,
        temperature: 0.7,
      },
      history: history
    });
  }

  private saveToLocalStorage(msgs: Message[]) {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
    }
  }

  private addMessage(message: Message) {
    this.messagesSignal.update(msgs => {
      const newMsgs = [...msgs, message];
      this.saveToLocalStorage(newMsgs);
      return newMsgs;
    });
  }

  private updateLastModelMessage(textChunk: string) {
    this.messagesSignal.update(msgs => {
      const newMsgs = [...msgs];
      const lastMsg = newMsgs[newMsgs.length - 1];
      if (lastMsg && lastMsg.role === 'model' && lastMsg.isStreaming) {
        lastMsg.text += textChunk;
      }
      this.saveToLocalStorage(newMsgs);
      return newMsgs;
    });
  }

  private finishStreaming() {
    this.messagesSignal.update(msgs => {
      const newMsgs = [...msgs];
      const lastMsg = newMsgs[newMsgs.length - 1];
      if (lastMsg && lastMsg.role === 'model') {
        lastMsg.isStreaming = false;
      }
      this.saveToLocalStorage(newMsgs);
      return newMsgs;
    });
  }

  async sendMessage(text: string) {
    if (!text.trim() || this.isLoading()) return;

    // Add user message
    this.addMessage({
      id: crypto.randomUUID(),
      role: 'user',
      text: text,
      timestamp: new Date()
    });

    this.isLoading.set(true);

    // Add empty model message for streaming
    this.addMessage({
      id: crypto.randomUUID(),
      role: 'model',
      text: '',
      timestamp: new Date(),
      isStreaming: true
    });

    try {
      const stream = await this.chatSession.sendMessageStream({ message: text });
      
      for await (const chunk of stream) {
        const response = chunk as GenerateContentResponse;
        if (response.text) {
          this.updateLastModelMessage(response.text);
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      this.updateLastModelMessage('\n\n[抱歉，系統出現咗啲問題，請稍後再試。]');
    } finally {
      this.finishStreaming();
      this.isLoading.set(false);
    }
  }

  clearHistory() {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(STORAGE_KEY);
      window.location.reload();
    }
  }
}
