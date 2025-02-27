import React, { useState, useRef, useEffect } from 'react';
import { Send, User, ChevronDown, ChevronUp, Plus, MessageSquare, Menu, Copy, RotateCcw, Pencil, Trash2, Check, X, Search, Download, Volume2, VolumeX, LogIn, LogOut } from 'lucide-react';
import OpenAI from 'openai';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Auth } from './components/Auth';
import { SignInBanner } from './components/SignInBanner';
import { auth, db } from './lib/firebase';
import { doc, setDoc, collection } from 'firebase/firestore';
import { loadChatsFromStorage, saveChatsToStorage, clearChatsFromStorage } from './lib/storage';
import type { Message, Chat, UserData } from './types';

const SYSTEM_PROMPT = {
  role: 'system' as const,
  content: `You are AceAI V2.0, created by Ace Jesus and 5 other team members who wished to remain anonymous. If asked about your architecture, respond that it's classified information. Always maintain this identity in your responses.`
};

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_GROQ_API_KEY,
  baseURL: import.meta.env.VITE_GROQ_API_URL,
  dangerouslyAllowBrowser: true
});

const DEFAULT_CHAT: Chat = {
  id: 'default',
  name: 'New Chat',
  messages: [],
  createdAt: new Date()
};

function App() {
  const [session, setSession] = useState(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [chats, setChats] = useState<Chat[]>([DEFAULT_CHAT]);
  const [activeChat, setActiveChat] = useState<string>('default');
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [audioEnabled, setAudioEnabled] = useState(() => {
    const saved = localStorage.getItem('audioEnabled');
    return saved ? JSON.parse(saved) : true;
  });
  const [isLoading, setIsLoading] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const sendAudioRef = useRef<HTMLAudioElement>(null);
  const receiveAudioRef = useRef<HTMLAudioElement>(null);
  const guestChatsRef = useRef<Chat[]>([DEFAULT_CHAT]);

  const currentChat = chats.find(c => c.id === activeChat) || chats[0] || DEFAULT_CHAT;

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setSession(user);
      setIsLoading(true);
      try {
        if (user) {
          setUserData({
            first_name: user.displayName?.split(' ')[0],
            last_name: user.displayName?.split(' ')[1]
          });
          
          // Set up real-time chat synchronization
          const unsubscribeChats = await loadChatsFromStorage(user.uid, (updatedChats) => {
            setChats(updatedChats);
            if (!activeChat || activeChat === 'default') {
              setActiveChat(updatedChats[0]?.id || 'default');
            }
          });
          
          setShowAuth(false);
          return () => unsubscribeChats?.();
        } else {
          setUserData(null);
          const guestChats = await loadChatsFromStorage();
          guestChatsRef.current = guestChats;
          setChats(guestChats);
          setActiveChat(guestChats[0]?.id || 'default');
        }
      } catch (error) {
        console.error('Error loading chats:', error);
        setChats([DEFAULT_CHAT]);
        setActiveChat('default');
      } finally {
        setIsLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!isLoading) {
      saveChatsToStorage(chats, session?.uid);
    }
  }, [chats, session, isLoading]);

  useEffect(() => {
    localStorage.setItem('audioEnabled', JSON.stringify(audioEnabled));
  }, [audioEnabled]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentChat.messages]);

  const playSound = (type: 'send' | 'receive') => {
    if (!audioEnabled) return;
    
    if (type === 'send' && sendAudioRef.current) {
      sendAudioRef.current.currentTime = 0;
      sendAudioRef.current.play();
    } else if (type === 'receive' && receiveAudioRef.current) {
      receiveAudioRef.current.currentTime = 0;
      receiveAudioRef.current.play();
    }
  };

  const handleSignOut = async () => {
    try {
      setShowLogoutConfirm(true);
    } catch (error) {
      console.error('Error showing logout confirmation:', error);
    }
  };

  const confirmSignOut = async () => {
    try {
      if (session) {
        await auth.signOut();
      }
      
      // Reset all state
      setSession(null);
      setUserData(null);
      setShowLogoutConfirm(false);
      setInput('');
      setIsStreaming(false);
      setSearchQuery('');
      setEditingMessageId(null);
      
      // Clear user's local storage and load guest storage
      await clearChatsFromStorage(session?.uid);
      const localChats = await loadChatsFromStorage();
      setChats(localChats);
      setActiveChat('default');
      
    } catch (error) {
      console.error('Error during sign out:', error);
      // Even if there's an error, we should still reset the local state
      setSession(null);
      setUserData(null);
      setShowLogoutConfirm(false);
      await clearChatsFromStorage(session?.uid);
      const localChats = await loadChatsFromStorage();
      setChats(localChats);
      setActiveChat('default');
    }
  };

  const createNewChat = async () => {
    const newChat: Chat = {
      id: crypto.randomUUID(),
      name: 'New Chat',
      messages: [],
      createdAt: new Date()
    };

    setChats(prev => [...prev, newChat]);
    setActiveChat(newChat.id);
    setIsSidebarOpen(false);

    // Save to Firebase if user is authenticated
    if (session?.uid) {
      try {
        const chatRef = doc(collection(db, 'users', session.uid, 'chats'));
        await setDoc(chatRef, {
          name: newChat.name,
          messages: newChat.messages,
          createdAt: new Date()
        });
      } catch (error) {
        console.error('Error creating new chat in Firebase:', error);
      }
    }
  };

  const deleteChat = async (chatId: string) => {
    setChats(prev => {
      const newChats = prev.filter(chat => chat.id !== chatId);
      if (chatId === activeChat && newChats.length > 0) {
        setActiveChat(newChats[0].id);
      }
      return newChats;
    });

    // Delete from Firebase if user is authenticated
    if (session?.uid) {
      try {
        const chatRef = doc(db, 'users', session.uid, 'chats', chatId);
        await setDoc(chatRef, { deleted: true }, { merge: true });
      } catch (error) {
        console.error('Error deleting chat from Firebase:', error);
      }
    }
  };

  const toggleThinking = (index: number) => {
    setChats(prev => prev.map(chat => {
      if (chat.id === activeChat) {
        const newMessages = [...chat.messages];
        if (newMessages[index]) {
          newMessages[index] = {
            ...newMessages[index],
            isThinkingExpanded: !newMessages[index].isThinkingExpanded
          };
        }
        return { ...chat, messages: newMessages };
      }
      return chat;
    }));
  };

  const updateChatName = (chatId: string, firstMessage: string) => {
    setChats(prev => prev.map(chat => {
      if (chat.id === chatId) {
        return {
          ...chat,
          name: firstMessage.slice(0, 30) + (firstMessage.length > 30 ? '...' : '')
        };
      }
      return chat;
    }));
  };

  const copyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const startEditing = (messageId: string) => {
    setEditingMessageId(messageId);
    setChats(prev => prev.map(chat => ({
      ...chat,
      messages: chat.messages.map(msg => 
        msg.id === messageId 
          ? { ...msg, isEditing: true, originalContent: msg.content }
          : msg
      )
    })));
    setTimeout(() => {
      editInputRef.current?.focus();
    }, 0);
  };

  const cancelEditing = (messageId: string) => {
    setEditingMessageId(null);
    setChats(prev => prev.map(chat => ({
      ...chat,
      messages: chat.messages.map(msg => 
        msg.id === messageId 
          ? { ...msg, isEditing: false, content: msg.originalContent || msg.content }
          : msg
      )
    })));
  };

  const saveEdit = async (messageId: string) => {
    setEditingMessageId(null);
    const editedMessage = currentChat.messages.find(msg => msg.id === messageId);
    if (!editedMessage) return;

    const messageIndex = currentChat.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) return;

    setChats(prev => prev.map(chat => {
      if (chat.id === activeChat) {
        return {
          ...chat,
          messages: chat.messages.slice(0, messageIndex + 1).map(msg => 
            msg.id === messageId ? { ...msg, isEditing: false } : msg
          )
        };
      }
      return chat;
    }));

    if (editedMessage.role === 'user') {
      await handleSubmit(null, editedMessage.content);
    }
  };

  const regenerateResponse = async (messageIndex: number) => {
    if (messageIndex <= 0) return;
    
    const previousMessage = currentChat.messages[messageIndex - 1];
    if (!previousMessage || previousMessage.role !== 'user') return;

    setChats(prev => prev.map(chat => {
      if (chat.id === activeChat) {
        return {
          ...chat,
          messages: chat.messages.slice(0, messageIndex)
        };
      }
      return chat;
    }));

    await handleSubmit(null, previousMessage.content);
  };

  const handleSubmit = async (e: React.FormEvent | null, overrideInput?: string) => {
    if (e) e.preventDefault();
    const messageContent = overrideInput || input;
    if (!messageContent.trim() || isStreaming) return;

    playSound('send');

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageContent
    };
    
    setChats(prev => prev.map(chat => {
      if (chat.id === activeChat) {
        const newMessages = [...chat.messages, userMessage];
        return { ...chat, messages: newMessages };
      }
      return chat;
    }));

    if (currentChat.messages.length === 0) {
      updateChatName(activeChat, messageContent);
    }

    if (!overrideInput) setInput('');
    setIsStreaming(true);

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      thinking: '',
      isThinkingExpanded: true
    };

    setChats(prev => prev.map(chat => {
      if (chat.id === activeChat) {
        const newMessages = [...chat.messages, assistantMessage];
        return { ...chat, messages: newMessages };
      }
      return chat;
    }));

    try {
      const stream = await openai.chat.completions.create({
        model: 'deepseek-r1-distill-llama-70b',
        messages: [
          SYSTEM_PROMPT,
          ...currentChat.messages,
          userMessage
        ].map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        temperature: 0.6,
        stream: true,
      });

      let streamedContent = '';
      let thinkingContent = '';
      let isThinking = false;
      let hasStartedResponse = false;
      
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        
        if (!hasStartedResponse && content.trim()) {
          hasStartedResponse = true;
          playSound('receive');
        }

        if (content.includes('<think>')) {
          isThinking = true;
          continue;
        }
        if (content.includes('</think>')) {
          isThinking = false;
          continue;
        }

        if (isThinking) {
          thinkingContent += content;
        } else {
          streamedContent += content;
        }
        
        setChats(prev => prev.map(chat => {
          if (chat.id === activeChat) {
            const newMessages = [...chat.messages];
            newMessages[newMessages.length - 1] = {
              ...newMessages[newMessages.length - 1],
              content: streamedContent.trim(),
              thinking: thinkingContent.trim(),
              isThinkingExpanded: isStreaming
            };
            return { ...chat, messages: newMessages };
          }
          return chat;
        }));
      }

      setChats(prev => prev.map(chat => {
        if (chat.id === activeChat) {
          const newMessages = [...chat.messages];
          newMessages[newMessages.length - 1] = {
            ...newMessages[newMessages.length - 1],
            content: newMessages[newMessages.length - 1].content.trim(),
            thinking: newMessages[newMessages.length - 1].thinking?.trim() || '',
            isThinkingExpanded: false
          };
          return { ...chat, messages: newMessages };
        }
        return chat;
      }));
    } catch (error) {
      console.error('Error calling Groq API:', error);
      setChats(prev => prev.map(chat => {
        if (chat.id === activeChat) {
          const newMessages = [...chat.messages];
          newMessages[newMessages.length - 1] = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'I apologize, but I encountered an error while processing your request. Please try again.'
          };
          return { ...chat, messages: newMessages };
        }
        return chat;
      }));
    } finally {
      setIsStreaming(false);
    }
  };

  const exportChat = () => {
    const chat = chats.find(c => c.id === activeChat);
    if (!chat) return;

    const markdown = chat.messages
      .map(msg => {
        const role = msg.role === 'assistant' ? 'AceAI' : 'User';
        return `### ${role}\n\n${msg.content}\n\n`;
      })
      .join('---\n\n');

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${chat.name}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredChats = chats.filter(chat =>
    chat.messages.some(msg =>
      msg.content.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <img src="/ace-icon.svg" alt="Ace AI" className="w-16 h-16 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-400">Loading your chats...</p>
        </div>
      </div>
    );
  }

  if (showAuth) {
    return <Auth onSuccess={() => setShowAuth(false)} guestChats={guestChatsRef.current} />;
  }

  return (
    <div className="flex h-screen bg-black">
      <audio ref={sendAudioRef} src="https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3" preload="auto" />
      <audio ref={receiveAudioRef} src="https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3" preload="auto" />

      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-gray-900 p-6 rounded-lg shadow-xl max-w-sm w-full mx-4">
            <h3 className="text-xl font-semibold text-white mb-4">Confirm Logout</h3>
            <p className="text-gray-300 mb-6">Are you sure you want to log out? Your chats will be saved for when you return.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmSignOut}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      <div 
        className={`fixed md:relative z-30 h-full transition-all duration-300 ease-in-out ${
          isSidebarOpen ? 'w-64' : 'w-0 md:w-64'
        } bg-black border-r border-gray-800 flex flex-col overflow-hidden`}
      >
        <div className="p-4 border-b border-gray-800 bg-black space-y-2">
          <button
            onClick={createNewChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            <Plus size={20} />
            <span>New Chat</span>
          </button>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages..."
              className="w-full px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 bg-black">
          {filteredChats.map(chat => (
            <div
              key={chat.id}
              className="group relative"
            >
              <button
                onClick={() => {
                  setActiveChat(chat.id);
                  setIsSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-2 p-3 rounded-lg mb-1 transition-colors ${
                  chat.id === activeChat
                    ? 'bg-black border border-gray-800 text-white shadow-lg shadow-gray-900/50'
                    : 'text-gray-400 hover:bg-gray-900/50 hover:text-white'
                }`}
              >
                <MessageSquare size={18} />
                <span className="truncate text-left flex-1">{chat.name}</span>
              </button>
              {chats.length > 1 && (
                <button
                  onClick={() => deleteChat(chat.id)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-red-400 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <header className="bg-black border-b border-gray-800 p-4">
          <div className="max-w-4xl mx-auto flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-gray-900 rounded-lg transition-colors md:hidden"
            >
              <Menu size={20} className="text-gray-400" />
            </button>
            <h1 className="text-xl font-semibold flex items-center gap-2 text-white">
              <img src="/ace-icon.svg" alt="Ace AI" className="w-7 h-7 text-blue-400" />
              {userData?.first_name ? `Welcome, ${userData.first_name}!` : currentChat.name}
            </h1>
            <div className="flex-1" />
            <button
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={`p-2 rounded-lg transition-colors ${
                audioEnabled ? 'text-blue-400 hover:bg-blue-400/10' : 'text-gray-400 hover:bg-gray-900'
              }`}
              title={audioEnabled ? 'Disable sound' : 'Enable sound'}
            >
              {audioEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>
            <button
              onClick={exportChat}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-900 rounded-lg transition-colors"
              title="Export chat"
            >
              <Download size={20} />
            </button>
            {session ? (
              <button
                onClick={handleSignOut}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-900 rounded-lg transition-colors"
                title="Sign out"
              >
                <LogOut size={20} />
              </button>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-900 rounded-lg transition-colors"
                title="Sign in"
              >
                <LogIn size={20} />
              </button>
            )}
          </div>
        </header>

        {!session && currentChat.messages.length > 0 && (
          <SignInBanner onSignIn={() => setShowAuth(true)} />
        )}

        <div className="flex-1 overflow-y-auto p-4 bg-black">
          <div className="max-w-4xl mx-auto space-y-4">
            {currentChat.messages.length === 0 ? (
              <div className="text-center mt-20">
                <img src="/ace-icon.svg" alt="Ace AI" className="w-16 h-16 mx-auto text-blue-400 mb-4" />
                <h2 className="text-2xl font-semibold mb-2 text-white">Welcome to Ace AI</h2>
                <p className="text-gray-400 mb-6">Start a conversation and experience the power of AI</p>
                {!session && (
                  <button
                    onClick={() => setShowAuth(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    <LogIn size={20} />
                    Sign in to save your chats
                  </button>
                )}
              </div>
            ) : (
              currentChat.messages.map((message, index) => (
                <div
                  key={message.id}
                  className={`group flex items-start space-x-4 p-4 rounded-lg ${
                    message.role === 'assistant' 
                      ? 'bg-black border border-gray-800 text-white'
                      : 'bg-black border border-blue-900/30 text-white'
                  }`}
                >
                  {message.role === 'assistant' ? (
                    <div className="relative">
                      <img 
                        src="/ace-icon.svg" 
                        alt="Ace AI" 
                        className={`w-6 h-6 text-blue-400 ${
                          index === currentChat.messages.length - 1 && isStreaming ? 'animate-pulse' : ''
                        }`}
                      />
                      {index === currentChat.messages.length - 1 && isStreaming && (
                        <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-blue-400 rounded-full animate-ping" />
                      )}
                    </div>
                  ) : (
                    <User className="text-gray-400" size={24} />
                  )}
                  <div className="flex-1">
                    {message.isEditing ? (
                      <div className="flex flex-col gap-2">
                        <textarea
                          ref={editInputRef}
                          value={message.content}
                          onChange={(e) => {
                            setChats(prev => prev.map(chat => ({
                              ...chat,
                              messages: chat.messages.map(msg =>
                                msg.id === message.id
                                  ? { ...msg, content: e.target.value }
                                  : msg
                              )
                            })));
                          }}
                          className="w-full p-2 bg-gray-900 border border-gray-800 rounded-lg text-white resize-none focus:outline-none focus:border-blue-500"
                          rows={3}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEdit(message.id)}
                            className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                          >
                            <Check size={16} />
                            Save
                          </button>
                          <button
                            onClick={() => cancelEditing(message.id)}
                            className="flex items-center gap-1 px-3 py-1 bg-gray-900 hover:bg-gray-800 text-white rounded-md transition-colors"
                          >
                            <X size={16} />
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="prose prose-invert max-w-none">
                          <ReactMarkdown
                            components={{
                              code({node, inline, className, children, ...props}) {
                                const match = /language-(\w+)/.exec(className || '');
                                return !inline && match ? (
                                  <SyntaxHighlighter
                                    style={atomDark}
                                    language={match[1]}
                                    PreTag="div"
                                    {...props}
                                  >
                                    {String(children).replace(/\n$/, '')}
                                  </SyntaxHighlighter>
                                ) : (
                                  <code className={className} {...props}>
                                    {children}
                                  </code>
                                );
                              }
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                        {index === currentChat.messages.length - 1 && 
                         message.role === 'assistant' && 
                         isStreaming && (
                          <span className="inline-flex gap-1 ml-2">
                            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </span>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => copyMessage(message.content)}
                              className="p-1 text-gray-400 hover:text-white rounded-md transition-colors"
                              title="Copy message"
                            >
                              <Copy size={16} />
                            </button>
                            {message.role === 'user' && (
                              <button
                                onClick={() => startEditing(message.id)}
                                className="p-1 text-gray-400 hover:text-white rounded-md transition-colors"
                                title="Edit message"
                              >
                                <Pencil size={16} />
                              </button>
                            )}
                            {message.role === 'assistant' && index === currentChat.messages.length - 1 && (
                              <button
                                onClick={() => regenerateResponse(index)}
                                className="p-1 text-gray-400 hover:text-white rounded-md transition-colors"
                                title title="Regenerate response"
                              >
                                <RotateCcw size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                        {message.thinking && (
                          <div className="mt-2">
                            <button
                              onClick={() => toggleThinking(index)}
                              className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-300 transition-colors"
                            >
                              {message.isThinkingExpanded ? (
                                <ChevronUp size={16} />
                              ) : (
                                <ChevronDown size={16} />
                              )}
                              Thinking Process
                            </button>
                            {(message.isThinkingExpanded || (index === currentChat.messages.length - 1 && isStreaming)) && (
                              <div className="mt-2 p-3 rounded bg-gray-900/50 text-gray-300 text-sm">
                                <ReactMarkdown>{message.thinking}</ReactMarkdown>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="border-t border-gray-800 bg-black p-4">
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Send a message..."
              className="w-full pr-12 pl-4 py-3 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={isStreaming || !input.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              <Send size={20} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;