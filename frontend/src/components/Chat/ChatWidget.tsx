import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { MessageCircle, X, Send, Paperclip, Image as ImageIcon, Smile, MoreVertical, Phone, Video, Search, ChevronLeft, Check, CheckCheck, Trash2 } from 'lucide-react';
import { useChat } from '@/context/ChatContext';

export function ChatWidget() {
    const { isOpen, toggleChat, conversations, activeConversationId, chatAvailable } = useChat();
    const unreadTotal = conversations.reduce((acc, curr) => acc + curr.unreadCount, 0);
    const [isBouncing, setIsBouncing] = useState(false);
    const prevUnreadRef = useRef(unreadTotal);

    // Cute dance on new unread messages
    useEffect(() => {
        if (unreadTotal > prevUnreadRef.current) {
            setIsBouncing(true);
            const timer = setTimeout(() => setIsBouncing(false), 700);
            return () => clearTimeout(timer);
        }
        prevUnreadRef.current = unreadTotal;
    }, [unreadTotal]);

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <ChatWindow />
                )}
            </AnimatePresence>

            <motion.button
                className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg focus:outline-none focus:ring-4 focus:ring-indigo-300 dark:focus:ring-indigo-900 transition ${chatAvailable ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-gray-400 cursor-not-allowed'
                    }`}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={chatAvailable ? toggleChat : undefined}
                initial={{ scale: 0, opacity: 0 }}
                animate={{
                    scale: isBouncing ? [1, 1.12, 0.96, 1.05, 1] : 1,
                    opacity: 1,
                    rotate: isBouncing ? [0, -6, 6, -6, 0] : 0
                }}
                transition={{
                    scale: isBouncing ? { duration: 0.7, ease: "easeInOut" } : { type: "spring", stiffness: 260, damping: 20 },
                    opacity: { duration: 0.3 },
                    rotate: { duration: 0.7, ease: "easeInOut" }
                }}
            >
                <AnimatePresence mode="wait">
                    {isOpen ? (
                        <motion.div
                            key="close"
                            initial={{ rotate: -90, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            exit={{ rotate: 90, opacity: 0 }}
                        >
                            <X size={24} />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="open"
                            initial={{ rotate: 90, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            exit={{ rotate: -90, opacity: 0 }}
                        >
                            <MessageCircle size={24} />
                        </motion.div>
                    )}
                </AnimatePresence>

                {!isOpen && unreadTotal > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white ring-2 ring-white">
                        {unreadTotal}
                    </span>
                )}
            </motion.button>
        </>
    );
}

function ChatWindow() {
    const { activeConversationId, setActiveConversationId, conversations, messages, sendMessage, sendAttachment, deleteMessage, currentUser, setIsOpen, allUsers, startConversation, refreshUsers, chatAvailable } = useChat();
    const [inputValue, setInputValue] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [conversationFilter, setConversationFilter] = useState('');
    const [newChatQuery, setNewChatQuery] = useState('');
    const [isNewChatOpen, setIsNewChatOpen] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const emojiPickerRef = useRef<HTMLDivElement>(null);
    const emojiButtonRef = useRef<HTMLButtonElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const activeConversation = conversations.find(c => c.id === activeConversationId);
    const activeMessages = activeConversationId ? messages[activeConversationId] || [] : [];
    const meId = currentUser?.id ? String(currentUser.id) : null;
    const otherParticipant = activeConversation?.participants?.[0];
    const participantAvatar = otherParticipant?.avatar
        ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(otherParticipant?.name || "User")}&background=random`;

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [activeMessages, activeConversationId]);

    useEffect(() => {
        if (!showEmojiPicker) return;

        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                emojiPickerRef.current &&
                !emojiPickerRef.current.contains(target) &&
                !emojiButtonRef.current?.contains(target)
            ) {
                setShowEmojiPicker(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setShowEmojiPicker(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [showEmojiPicker]);

    const handleSend = () => {
        if (inputValue.trim()) {
            sendMessage(inputValue);
            setInputValue('');
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const emojiOptions = ["😀", "😁", "😂", "😊", "😍", "😘", "😎", "🤩", "😇", "👍", "🙏", "👏", "🎉", "🔥", "💯", "🥳", "🤝", "🤗"];

    const handleEmojiSelect = (emoji: string) => {
        setInputValue(prev => prev + emoji);
        setShowEmojiPicker(false);
    };

    const handleAttachmentClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            sendAttachment(file);
        }
        // Allow re-selecting the same file
        event.target.value = "";
    };

    return (
        <motion.div
            className="fixed bottom-24 right-6 z-40 flex h-[600px] w-[380px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
            {/* Header */}
            <div className="flex h-16 items-center justify-between border-b border-gray-100 bg-white px-4 dark:border-gray-800 dark:bg-gray-900">
                {activeConversationId ? (
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setActiveConversationId(null)}
                            className="mr-1 rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                            <ChevronLeft size={20} className="text-gray-500" />
                        </button>
                        <div className="relative">
                            <img
                                src={participantAvatar}
                                alt={otherParticipant?.name}
                                className="h-10 w-10 rounded-full object-cover"
                            />
                            <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white dark:border-gray-900 ${otherParticipant?.status === 'online' ? 'bg-green-500' :
                                otherParticipant?.status === 'busy' ? 'bg-red-500' : 'bg-gray-400'
                                }`} />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                                {otherParticipant?.name}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {otherParticipant?.status === 'online' ? 'Active now' : 'Offline'}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                            <MessageCircle size={20} />
                        </div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Messages</h2>
                    </div>
                )}

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsOpen(false)}
                        className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                        title="Close chat"
                    >
                        <X size={18} />
                    </button>
                    <button className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
                        <MoreVertical size={18} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden bg-gray-50 dark:bg-black/20">
                {activeConversationId ? (
                    <div className="flex h-full flex-col">
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700">
                            {activeMessages.map((msg, idx) => {
                                const isMe = meId !== null && msg.senderId === meId;
                                const showAvatar = !isMe && (idx === 0 || activeMessages[idx - 1].senderId !== msg.senderId);

                                return (
                                    <motion.div
                                        key={msg.renderKey || msg.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div className={`flex max-w-[80%] gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                            {!isMe && (
                                                <div className="w-8 flex-shrink-0">
                                                    {showAvatar && (
                                                        <motion.img
                                                            initial={{ scale: 0 }}
                                                            animate={{ scale: 1 }}
                                                            src={participantAvatar}
                                                            alt="Avatar"
                                                            className="h-8 w-8 rounded-full"
                                                        />
                                                    )}
                                                </div>
                                            )}

                                            <motion.div
                                                initial={{ scale: 0, borderRadius: "50%" }}
                                                animate={{
                                                    scale: 1,
                                                    borderRadius: isMe ? "16px 0px 16px 16px" : "0px 16px 16px 16px"
                                                }}
                                                style={{ originX: isMe ? 1 : 0, originY: 1 }}
                                                transition={{
                                                    type: "spring",
                                                    stiffness: 350,
                                                    damping: 25,
                                                    mass: 0.8
                                                }}
                                                className={`group relative px-4 py-2 shadow-sm ${isMe
                                                    ? 'bg-indigo-600 text-white'
                                                    : 'bg-white text-gray-900 dark:bg-gray-800 dark:text-white'
                                                    }`}
                                            >
                                                <div className="flex items-start gap-2">
                                                    <div className="flex-1">
                                                        {msg.isDeleted ? (
                                                            <p className="text-sm italic text-gray-300 dark:text-gray-500">Message deleted</p>
                                                        ) : msg.type === "image" && msg.attachmentUrl ? (
                                                            <a
                                                                href={msg.attachmentUrl}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="block overflow-hidden rounded-xl ring-1 ring-indigo-100 transition hover:brightness-105 dark:ring-gray-700"
                                                            >
                                                                <img
                                                                    src={msg.attachmentUrl}
                                                                    alt={msg.attachmentName || msg.content}
                                                                    className="max-h-64 rounded-xl object-cover"
                                                                />
                                                            </a>
                                                        ) : msg.type === "file" && msg.attachmentUrl ? (
                                                            <a
                                                                href={msg.attachmentUrl}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className={`flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-800 transition hover:bg-gray-200 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 ${isMe ? "bg-indigo-500/10 text-white hover:bg-indigo-500/20" : ""}`}
                                                            >
                                                                <Paperclip size={16} />
                                                                <span className="truncate">{msg.attachmentName || msg.content}</span>
                                                            </a>
                                                        ) : (
                                                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                                        )}
                                                        <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${isMe ? 'text-indigo-200' : 'text-gray-400'}`}>
                                                            <span>{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                            {isMe && (
                                                                <span>
                                                                    {msg.status === 'read' ? <CheckCheck size={12} /> : <Check size={12} />}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {isMe && !msg.isDeleted && !msg.id.startsWith("temp-") && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setConfirmDeleteId(msg.id)}
                                                            className="opacity-0 transition-opacity group-hover:opacity-100 text-indigo-100 hover:text-white"
                                                            title="Delete message"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </motion.div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="border-t border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 relative">
                            {!chatAvailable && (
                                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/80 text-sm font-medium text-gray-600 dark:bg-gray-900/80 dark:text-gray-300">
                                    Chat offline. Try again later.
                                </div>
                            )}
                            <div className="relative flex items-end gap-2 rounded-xl bg-gray-50 p-2 dark:bg-gray-800/50">
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileChange}
                                    accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                                    className="hidden"
                                />
                                <button
                                    type="button"
                                    onClick={handleAttachmentClick}
                                    className="rounded-full p-2 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                                    title="Attach a file"
                                    disabled={!chatAvailable}
                                >
                                    <Paperclip size={20} />
                                </button>
                                <textarea
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Type a message..."
                                    className="max-h-32 min-h-[40px] w-full resize-none bg-transparent py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none dark:text-white"
                                    rows={1}
                                    disabled={!chatAvailable}
                                />
                                <div className="relative">
                                    <button
                                        type="button"
                                        ref={emojiButtonRef}
                                        onClick={() => setShowEmojiPicker(prev => !prev)}
                                        className="rounded-full p-2 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                                        title="Insert emoji"
                                        disabled={!chatAvailable}
                                    >
                                        <Smile size={20} />
                                    </button>
                                    {showEmojiPicker && (
                                        <div
                                            ref={emojiPickerRef}
                                            className="absolute bottom-11 right-0 z-10 grid w-56 grid-cols-6 gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800"
                                        >
                                            {emojiOptions.map(emoji => (
                                                <button
                                                    key={emoji}
                                                    type="button"
                                                    onClick={() => handleEmojiSelect(emoji)}
                                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-xl hover:bg-gray-100 dark:hover:bg-gray-700"
                                                >
                                                    {emoji}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <motion.button
                                    whileTap={{ scale: 0.9 }}
                                    onClick={handleSend}
                                    disabled={!inputValue.trim() || !chatAvailable}
                                    className={`rounded-full p-2 transition-colors ${inputValue.trim()
                                        ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-700'
                                        : 'bg-gray-200 text-gray-400 dark:bg-gray-700'
                                        }`}
                                >
                                    <Send size={18} />
                                </motion.button>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Conversation List */
                    <div className="h-full overflow-y-auto p-2">
                        <div className="mb-3 flex items-center gap-2 px-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                <input
                                    type="text"
                                    value={conversationFilter}
                                    onChange={(e) => setConversationFilter(e.target.value)}
                                    placeholder="Search conversations..."
                                    className="w-full rounded-xl bg-gray-100 py-2 pl-9 pr-4 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:bg-gray-800 dark:text-white"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setNewChatQuery('');
                                    refreshUsers();
                                    setIsNewChatOpen(true);
                                }}
                                className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700"
                            >
                                New chat
                            </button>
                        </div>

                        <div className="space-y-1">
                            {conversations
                                .filter(conv => {
                                    if (!conversationFilter.trim()) return true;
                                    const name = conv.participants[0]?.name?.toLowerCase() || "";
                                    return name.includes(conversationFilter.toLowerCase());
                                })
                                .map((conv) => {
                                    const participant = conv.participants[0];
                                    const participantName = participant?.name ?? `User ${conv.id}`;
                                    const participantAvatar = participant?.avatar ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(participantName)}&background=random`;
                                    const participantStatus = participant?.status ?? "offline";
                                    const lastMessage = conv.lastMessage;
                                    const previewText = lastMessage
                                        ? lastMessage.type === "text"
                                            ? (lastMessage.isDeleted ? "Message deleted" : lastMessage.content)
                                            : lastMessage.type === "image"
                                                ? (lastMessage.isDeleted ? "Message deleted" : "Sent an image")
                                                : (lastMessage.isDeleted ? "Message deleted" : "Sent a file")
                                        : "";
                                    const previewPrefix = lastMessage && lastMessage.senderId === currentUser?.id ? "You: " : "";
                                    const lastMessageTime = lastMessage
                                        ? lastMessage.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                        : null;

                                    return (
                                        <motion.button
                                            key={conv.id}
                                            onClick={() => setActiveConversationId(conv.id)}
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors hover:bg-white hover:shadow-sm dark:hover:bg-gray-800"
                                        >
                                            <div className="relative">
                                                <img
                                                    src={participantAvatar}
                                                    alt={participantName}
                                                    className="h-12 w-12 rounded-full object-cover"
                                                />
                                                {participantStatus === 'online' && (
                                                    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-gray-50 bg-green-500 dark:border-gray-900" />
                                                )}
                                            </div>
                                            <div className="flex-1 overflow-hidden">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="truncate font-semibold text-gray-900 dark:text-white">
                                                        {participantName}
                                                    </h4>
                                                    {lastMessageTime && (
                                                        <span className="text-[10px] text-gray-400">
                                                            {lastMessageTime}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                                                        {previewPrefix}{previewText}
                                                    </p>
                                                    {conv.unreadCount > 0 && (
                                                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
                                                            {conv.unreadCount}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.button>
                                    );
                                })}
                        </div>
                    </div>
                )}
            </div>

            {/* Delete confirmation */}
            <AnimatePresence>
                {confirmDeleteId && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-80 rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/5"
                        >
                            <div className="mb-3 text-sm text-gray-600 dark:text-gray-300">
                                Delete this message? This will remove it for everyone and show a deleted marker.
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        deleteMessage(confirmDeleteId);
                                        setConfirmDeleteId(null);
                                    }}
                                    className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-rose-700"
                                >
                                    Delete
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {isNewChatOpen && (
                    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-96 max-w-full rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/5"
                        >
                            <div className="mb-3">
                                <input
                                    autoFocus
                                    type="text"
                                    value={newChatQuery}
                                    onChange={(e) => setNewChatQuery(e.target.value)}
                                    placeholder="Search people to message..."
                                    className="w-full rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:bg-gray-800 dark:text-white"
                                />
                            </div>
                            <div className="max-h-64 overflow-y-auto space-y-1">
                                {allUsers
                                    .filter(u => u.id !== currentUser?.id)
                                    .filter(u => u.name.toLowerCase().includes(newChatQuery.toLowerCase()))
                                    .slice(0, 12)
                                    .map(u => (
                                        <button
                                            key={u.id}
                                            onClick={() => {
                                                startConversation(u.id);
                                                setIsNewChatOpen(false);
                                                setNewChatQuery('');
                                            }}
                                            className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                                        >
                                            <img
                                                src={u.avatar}
                                                alt={u.name}
                                                className="h-9 w-9 rounded-full object-cover"
                                            />
                                            <div className="flex-1">
                                                <div className="text-sm font-medium text-gray-900 dark:text-white">{u.name}</div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">Tap to start a chat</div>
                                            </div>
                                        </button>
                                    ))}
                                {allUsers.filter(u => u.name.toLowerCase().includes(newChatQuery.toLowerCase())).length === 0 && (
                                    <div className="py-3 text-center text-xs text-gray-500 dark:text-gray-400">No matches</div>
                                )}
                            </div>
                            <div className="mt-3 flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsNewChatOpen(false);
                                        setNewChatQuery('');
                                    }}
                                    className="rounded-full px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                                >
                                    Close
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
