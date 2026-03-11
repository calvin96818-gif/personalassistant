import { ChangeDetectionStrategy, Component, inject, ViewChild, ElementRef, AfterViewChecked, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from './chat.service';
import { MatIconModule } from '@angular/material/icon';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements AfterViewChecked {
  private chatService = inject(ChatService);
  
  messages = this.chatService.messages;
  isLoading = this.chatService.isLoading;
  
  newMessage = signal('');
  
  @ViewChild('scrollContainer') private scrollContainer!: ElementRef;

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    try {
      this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
    } catch {
      // Ignore errors if container is not ready
    }
  }

  async sendMessage() {
    const text = this.newMessage().trim();
    if (!text || this.isLoading()) return;
    
    this.newMessage.set('');
    await this.chatService.sendMessage(text);
  }

  handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  clearHistory() {
    if (confirm('確定要清除所有對話記錄嗎？')) {
      this.chatService.clearHistory();
    }
  }
}
