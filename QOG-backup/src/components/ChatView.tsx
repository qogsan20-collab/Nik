import React, { useState, useEffect, useRef } from 'react';
import '../styles/ChatView.css';
import { Share2, Send, Mic, RefreshCw, Check, Image, Paperclip } from 'lucide-react';
import ReflectionModal from './ReflectionModal';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.setOptions({
  breaks: true
});

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown> | null;
}

interface Task {
  id: string;
  name: string;
  category: string;
  messages: Message[];
  iterations: number;
  duration: number;
}

interface ChatViewProps {
  currentTask: Task | null;
  onSendMessage: (message: string) => void;
  onCompleteTask: () => void;
  isLoading: boolean;
  formatTime: (timeInSeconds: number) => string;
  onQuickStart: () => void;
  onShowDashboard: () => void;
  onInsightsRefresh: () => void;
  userId: string;
  onImproveMessage: (messageId: string, feedback: string) => void;
}

const ChatView: React.FC<ChatViewProps> = ({ 
  currentTask, 
  onSendMessage, 
  onCompleteTask, 
  isLoading,
  formatTime,
  onQuickStart,
  onShowDashboard,
  onInsightsRefresh,
  userId,
  onImproveMessage
}) => {
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showReflection, setShowReflection] = useState(false);
  const [selectedModel, setSelectedModel] = useState('Gemini 2.5 Pro');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentTask?.messages]);

  const handleSend = () => {
    if (message.trim() !== '' && !isLoading) {
      const messageToSend = message.trim();
      setMessage(''); // Clear input immediately
      onSendMessage(messageToSend);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toSanitizedHtml = (rawText: string): string => {
    const parsed = marked.parse(rawText);
    const html = typeof parsed === 'string' ? parsed : '';
    return DOMPurify.sanitize(html);
  };

  const renderMessage = (msg: Message) => {
    const isUser = msg.role === 'user';
    const metadata = (msg.metadata ?? {}) as Record<string, unknown>;
    const metadataKind = typeof metadata['kind'] === 'string' ? (metadata['kind'] as string) : null;
    const feedback = typeof metadata['feedback'] === 'string' ? (metadata['feedback'] as string) : null;

    const rawContent = isUser && metadataKind === 'improve_feedback' && feedback
      ? feedback
      : msg.content;
    const sanitizedHtml = toSanitizedHtml(rawContent ?? '');

    return (
      <div key={msg.id} className={`message ${isUser ? 'user-message' : 'ai-message'}`}>
        <div
          className="message-content formatted-text"
          dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />
        <div className="message-footer">
          <span className="message-time">
            {new Date(msg.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
          {!isUser && (
            <button
              className="improve-btn"
              onClick={() => {
                if (isLoading) return;
                const feedbackInput = window.prompt('Share feedback to improve this response:');
                if (feedbackInput && feedbackInput.trim()) {
                  onImproveMessage(msg.id, feedbackInput.trim());
                }
              }}
              disabled={isLoading}
            >
              Improve
            </button>
          )}
        </div>
      </div>
    );
  };

  if (!currentTask) {
    return (
      <div className="chat-view chat-view--empty">
        <div className="no-task-container">
          <img
            src="/assets/qog-logo.png"
            alt="QOG Logo"
            className="welcome-logo"
          />
          <h2>Welcome to QOG Chatbot</h2>
          <p>Create a new task to get started with your AI assistant.</p>
          <div className="welcome-features">
            <div className="feature">
              <h3>🤖 AI-Powered</h3>
              <p>Powered by Gemini 2.0 for intelligent responses</p>
            </div>
            <div className="feature">
              <h3>📊 Track Progress</h3>
              <p>Monitor iterations and time spent on tasks</p>
            </div>
            <div className="feature">
              <h3>📁 Organize</h3>
              <p>Manage multiple tasks with categories</p>
            </div>
          </div>
          <div style={{ marginTop: 24 }}>
            <button className="done-btn" onClick={onQuickStart} disabled={isLoading}>Start Chat</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-view">
      <header className="chat-header">
        <div className="model-selector">
          <select 
            className="model-dropdown"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            <option>GPT 5</option>
            <option>Claude 4</option>
            <option>Grok</option>
            <option>Gemini 2.5 Pro</option>
            <option>Gemini 2.5 Flash</option>
          </select>
        </div>
        <h1>{currentTask.category} {'>'} {currentTask.name}</h1>
        <div className="header-actions">
          <button className="action-btn" onClick={onQuickStart}>New Task +</button>
          <button className="action-btn">Templatize +</button>
          <button className="action-btn"><Share2 size={16} /> Share</button>
        </div>
      </header>
      
      <div className="chat-body">
        {currentTask.messages.length === 0 ? (
          <div className="empty-chat">
            <p>Start a conversation by typing your message below.</p>
          </div>
        ) : (
          <div className="messages-container">
            {currentTask.messages.map((msg) => renderMessage(msg))}
            {isLoading && (
              <div className="message ai-message loading-message">
                <div className="loading-content">
                  <div className="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span className="loading-text">AI is typing...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      
      <footer className="chat-footer">
        <button 
          className="done-btn" 
          onClick={() => setShowReflection(true)}
          disabled={isLoading}
        >
          <Check size={16} /> Start reflection
        </button>
        <div className="chat-stats">
          <button className="stats-btn">
            <RefreshCw size={16} /> {currentTask.iterations} Iterations
          </button>
          <span className="time-display">{formatTime(currentTask.duration)}</span>
        </div>
        <div className="chat-input-container">
          <div className="input-icons">
            <button className="icon-btn"><Image size={16} /></button>
            <button className="icon-btn"><Paperclip size={16} /></button>
            <button className="icon-btn"><Mic size={16} /></button>
          </div>
          <textarea 
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="What's the task at hand?" 
            disabled={isLoading}
            className="message-input"
          />
          <button 
            className="send-btn" 
            onClick={handleSend}
            disabled={isLoading || !message.trim()}
          >
            <Send size={16} />
          </button>
        </div>
      </footer>

      {showReflection && currentTask && (
        <ReflectionModal 
          taskId={currentTask.id}
          taskName={currentTask.name}
          taskCategory={currentTask.category}
          iterations={currentTask.iterations}
          duration={currentTask.duration}
          userId={userId}
          onClose={() => setShowReflection(false)}
          onSaved={() => { 
            setShowReflection(false);
            onCompleteTask();
            onInsightsRefresh();
            onShowDashboard();
          }}
        />
      )}
    </div>
  );
};

export default ChatView;
