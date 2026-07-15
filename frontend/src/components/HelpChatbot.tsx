import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircleQuestion, X, Send } from 'lucide-react';
import { getStoredRole } from '../utils/session';
import {
    knowledgeBase,
    mainMenu,
    adminMenu,
    findKnowledgeEntry,
    type KBEntry,
    type HelpMenuOption,
} from './helpContent';
import './HelpChatbot.css';

interface ChatMessage {
    id: number;
    from: 'bot' | 'user';
    text: string;
    options?: HelpMenuOption[];
}

const HelpChatbot: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const bodyRef = useRef<HTMLDivElement>(null);
    const idRef = useRef(0);
    const role = getStoredRole();
    const isAdmin = role === 'Admin' || role === 'Manager';

    const addMsg = useCallback((from: 'bot' | 'user', text: string, options?: HelpMenuOption[]) => {
        idRef.current += 1;
        setMessages(prev => [...prev, { id: idRef.current, from, text, options }]);
    }, []);

    // Hide manager/admin follow-up links from Employees so they aren't pointed
    // at tools they can't use. "menu" is always allowed.
    const visibleOptions = useCallback(
        (options?: HelpMenuOption[]): HelpMenuOption[] =>
            (options || []).filter((opt) => opt.key === 'menu' || isAdmin || !knowledgeBase[opt.key]?.adminOnly),
        [isAdmin],
    );

    const answerWith = useCallback((entry: KBEntry) => {
        addMsg('bot', entry.answer, visibleOptions(entry.followUp));
    }, [addMsg, visibleOptions]);

    const showMenu = useCallback(() => {
        const opts: HelpMenuOption[] = [...mainMenu, ...(isAdmin ? adminMenu : [])];
        addMsg('bot', 'How can I help you today? Choose a topic or type your question:', opts);
    }, [addMsg, isAdmin]);

    useEffect(() => {
        if (open && messages.length === 0) {
            addMsg('bot', 'Hi there! I am the Web Forx Time Tracker assistant. I can help with tracking time, leave & PTO, timesheets and approvals, reports, security (2FA), and — for managers and admins — team, employment types, compliance, and payroll.');
            setTimeout(() => showMenu(), 300);
        }
    }, [open, messages.length, addMsg, showMenu]);

    useEffect(() => {
        if (bodyRef.current) {
            bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
        }
    }, [messages]);

    const handleOption = (key: string) => {
        if (key === 'menu') {
            addMsg('user', 'Back to main menu');
            showMenu();
            return;
        }

        const entry = knowledgeBase[key];
        if (!entry) {
            return;
        }

        addMsg('user', key.replace(/_/g, ' '));

        if (entry.adminOnly && !isAdmin) {
            addMsg('bot', 'That area is available to Managers and Admins. If you think you need access, contact your Admin.', [{ label: 'Main menu', key: 'menu' }]);
            return;
        }

        answerWith(entry);
    };

    const handleTextSearch = () => {
        const q = input.trim();
        if (!q) return;
        addMsg('user', q);
        setInput('');

        const entry = findKnowledgeEntry(q, { includeAdminOnly: isAdmin });
        if (entry) {
            answerWith(entry);
            return;
        }

        addMsg('bot', 'I could not find an exact match for that yet. Try one of these topics, or ask about a specific page like Timer, Timeline, Leave & PTO, Reports, Two-Factor, Team, Access Diagnostics, Employment types, or Compliance.', [
            ...mainMenu,
            ...(isAdmin ? adminMenu : []),
        ]);
    };

    return (
        <>
            <button className="chatbot-fab" onClick={() => setOpen(prev => !prev)} aria-label="Help chatbot">
                {open ? <X size={24} /> : <MessageCircleQuestion size={24} />}
                {!open && <span className="badge">?</span>}
            </button>

            {open && (
                <div className="chatbot-panel" role="dialog" aria-label="Help chatbot">
                    <div className="chatbot-header">
                        <div>
                            <h3>Help Assistant</h3>
                            <p>Ask me anything about the app</p>
                        </div>
                        <button onClick={() => setOpen(false)} aria-label="Close chatbot"><X size={16} /></button>
                    </div>

                    <div className="chatbot-body" ref={bodyRef}>
                        {messages.map(msg => (
                            <React.Fragment key={msg.id}>
                                <div className={`chat-msg ${msg.from}`}>
                                    {msg.text.split('\n').map((line, i) => (
                                        <React.Fragment key={i}>{line}<br /></React.Fragment>
                                    ))}
                                </div>
                                {msg.options && (
                                    <div className="chat-options">
                                        {msg.options.map(opt => (
                                            <button key={opt.key} className="chat-option-btn" onClick={() => handleOption(opt.key)}>
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </React.Fragment>
                        ))}
                    </div>

                    <div className="chatbot-input">
                        <input
                            type="text"
                            placeholder="Type your question..."
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleTextSearch(); }}
                        />
                        <button onClick={handleTextSearch} aria-label="Send"><Send size={16} /></button>
                    </div>
                </div>
            )}
        </>
    );
};

export default HelpChatbot;
