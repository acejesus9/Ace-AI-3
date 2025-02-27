export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  isThinkingExpanded?: boolean;
  isEditing?: boolean;
  originalContent?: string;
}

export interface Chat {
  id: string;
  name: string;
  messages: Message[];
  createdAt: Date;
}

export interface UserData {
  first_name?: string;
  last_name?: string;
}