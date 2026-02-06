import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getChatUsers, getMessages, sendMessage as apiSendMessage, markMessageRead, listAdminUsers, ApiError, uploadChatAttachment, deleteChatMessage, sendHeartbeat } from '@/lib/api';
import { subscribeSessionExpired, subscribeSessionRestored } from '@/lib/session';

export interface User {
    id: string;
    name: string;
    avatar?: string;
    status: 'online' | 'offline' | 'busy' | 'away';
    lastSeen?: Date;
}

export interface Message {
    id: string;
    renderKey?: string;
    senderId: string;
    content: string;
    timestamp: Date;
    type: 'text' | 'image' | 'file';
    status: 'sent' | 'delivered' | 'read';
    attachmentUrl?: string | null;
    attachmentName?: string | null;
    attachmentMime?: string | null;
    isDeleted?: boolean;
}

export interface Conversation {
    id: string;
    participants: User[];
    lastMessage?: Message;
    unreadCount: number;
    isTyping?: boolean;
}

interface ChatContextType {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    chatAvailable: boolean;
    refreshUsers: () => Promise<void>;
    allUsers: User[];
    conversations: Conversation[];
    activeConversationId: string | null;
    setActiveConversationId: (id: string | null) => void;
    messages: Record<string, Message[]>;
    sendMessage: (content: string, type?: 'text' | 'image' | 'file') => void;
    sendAttachment: (file: File) => void;
    deleteMessage: (messageId: string) => void;
    startConversation: (userId: string) => void;
    currentUser: User | null;
    toggleChat: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Record<string, Message[]>>({});
    const [usersMap, setUsersMap] = useState<Record<string, User>>({});
    const [chatAvailable, setChatAvailable] = useState(true);
    const [isActive, setIsActive] = useState(() => {
        if (typeof document === "undefined") return true;
        return document.visibilityState === "visible" && (typeof navigator === "undefined" || navigator.onLine);
    });
    const [sessionPaused, setSessionPaused] = useState(false);
    const defaultAvatar = (name: string) => `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
    const currentUserId = user ? String(user.id) : null;
    const availabilityProbeRef = useRef<number>(0);
    const usersInFlightRef = useRef(false);
    const messagesInFlightRef = useRef(false);
    const heartbeatInFlightRef = useRef(false);

    const currentUser: User | null = user ? {
        id: String(user.id),
        name: user.full_name || user.username,
        status: 'online',
        avatar: `https://ui-avatars.com/api/?name=${user.full_name || user.username}&background=random`
    } : null;

    const mergeMessages = useCallback((
        existing: Record<string, Message[]>,
        incoming: Record<string, Message[]>
    ): Record<string, Message[]> => {
        const merged: Record<string, Message[]> = {};
        const keys = new Set([...Object.keys(existing), ...Object.keys(incoming)]);
        keys.forEach(key => {
            const existingList = existing[key] || [];
            const incomingList = incoming[key] || [];

            const byId = new Map<string, Message>();

            // Seed with incoming (server truth)
            incomingList.forEach(msg => byId.set(msg.id, msg));

            // Overlay existing non-temp to preserve renderKey when ids match
            // We do NOT preserve timestamp here, because server timestamp is the source of truth
            existingList.filter(m => !m.id.startsWith("temp-")).forEach(msg => {
                const prev = byId.get(msg.id);
                if (prev) {
                    byId.set(msg.id, { ...prev, renderKey: msg.renderKey || prev.renderKey });
                } else {
                    byId.set(msg.id, msg);
                }
            });

            // Reconcile temps against server messages; drop temp if matched
            const temps = existingList.filter(m => m.id.startsWith("temp-"));
            temps.forEach(temp => {
                let matchedId: string | null = null;
                for (const [id, message] of byId.entries()) {
                    if (!id.startsWith("temp-")
                        && message.senderId === temp.senderId
                        && message.type === temp.type
                        && (message.content === temp.content || message.attachmentName === temp.attachmentName)) {
                        // Match found! Use server message but keep renderKey to avoid flicker.
                        // Do NOT use temp.timestamp, use server message.timestamp
                        byId.set(id, { ...message, renderKey: temp.renderKey || temp.id });
                        matchedId = id;
                        break;
                    }
                }
                if (!matchedId) {
                    byId.set(temp.id, temp);
                }
            });

            merged[key] = Array.from(byId.values()).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        });
        return merged;
    }, []);

    const buildConversations = useCallback((
        allMessages: Record<string, Message[]>,
        userLookup: Record<string, User>
    ): Conversation[] => {
        const convs: Conversation[] = [];
        const onlineCutoff = Date.now() - 5 * 60 * 1000; // 5 minutes

        Object.keys(allMessages).forEach(otherId => {
            const userMsgs = allMessages[otherId];
            if (!userMsgs.length) return;
            const lastMsg = userMsgs[userMsgs.length - 1];
            const fallbackName = `User ${otherId}`;
            const online = lastMsg.timestamp.getTime() >= onlineCutoff;
            const user = userLookup[otherId]
                ? { ...userLookup[otherId], status: (online ? "online" : userLookup[otherId].status) as User["status"] }
                : {
                    id: otherId,
                    name: fallbackName,
                    status: (online ? "online" : "offline") as User["status"],
                    avatar: defaultAvatar(fallbackName)
                };

            const unread = userMsgs.filter(m => m.senderId !== currentUserId && m.status !== 'read' && !m.isDeleted).length;
            convs.push({
                id: otherId,
                participants: [user],
                lastMessage: lastMsg,
                unreadCount: unread
            });
        });

        return convs.sort((a, b) => {
            const timeA = a.lastMessage?.timestamp.getTime() || 0;
            const timeB = b.lastMessage?.timestamp.getTime() || 0;
            return timeB - timeA;
        });
    }, [currentUserId]);

    const fetchUsers = useCallback(async () => {
        if (!currentUser || !chatAvailable || !isActive || sessionPaused) return;
        if (usersInFlightRef.current) return;
        usersInFlightRef.current = true;
        try {
            try {
                const users = await getChatUsers();
                const map: Record<string, User> = {};
                users.forEach(u => {
                    const name = u.name || `User ${u.id}`;
                    map[String(u.id)] = {
                        id: String(u.id),
                        name,
                        status: (u.status as User["status"]) || "offline",
                        avatar: u.avatar_url || defaultAvatar(name)
                    };
                });
                if (Object.keys(map).length > 0) {
                    setUsersMap(map);
                    return;
                }
            } catch (error) {
                if (error instanceof ApiError) {
                    if (error.status === 401) {
                        // Session expired
                        return;
                    }
                    if (error.status !== 404) {
                        console.error("Failed to fetch chat users", error);
                        return;
                    }
                } else {
                    console.error("Failed to fetch chat users", error);
                    return;
                }
            }

            // Fallback to admin users list if chat-specific endpoint is unavailable
            try {
                const adminUsers = await listAdminUsers({ limit: 200, is_active: true });
                const map: Record<string, User> = {};
                adminUsers.items
                    .filter(u => String(u.id) !== currentUserId) // exclude self
                    .forEach(u => {
                        const name = u.full_name || u.username || `User ${u.id}`;
                        map[String(u.id)] = {
                            id: String(u.id),
                            name,
                            status: 'offline',
                            avatar: defaultAvatar(name)
                        };
                    });
                setUsersMap(map);
            } catch (error) {
                if (error instanceof ApiError && error.status === 401) return;
                console.error("Failed to fetch admin users for chat", error);
            }
        } finally {
            usersInFlightRef.current = false;
        }
    }, [chatAvailable, currentUser, currentUserId, isActive, sessionPaused]);

    // Fetch users and map them (poll every 30s to update status)
    useEffect(() => {
        fetchUsers();
        const interval = setInterval(fetchUsers, 30000);
        return () => clearInterval(interval);
    }, [fetchUsers]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const update = () => {
            const online = typeof navigator === "undefined" ? true : navigator.onLine;
            setIsActive(document.visibilityState === "visible" && online);
        };
        update();
        document.addEventListener("visibilitychange", update);
        window.addEventListener("online", update);
        window.addEventListener("offline", update);
        return () => {
            document.removeEventListener("visibilitychange", update);
            window.removeEventListener("online", update);
            window.removeEventListener("offline", update);
        };
    }, []);

    useEffect(() => {
        const unsubscribeExpired = subscribeSessionExpired(() => setSessionPaused(true));
        const unsubscribeRestored = subscribeSessionRestored(() => setSessionPaused(false));
        return () => {
            unsubscribeExpired();
            unsubscribeRestored();
        };
    }, []);

    // Reset chat availability when the signed-in user changes and probe if it was disabled
    useEffect(() => {
        setChatAvailable(true);
        availabilityProbeRef.current = 0;
    }, [currentUserId]);

    // Self-heal: if chat was disabled (404) in another session, periodically probe and re-enable when available
    useEffect(() => {
        if (!currentUserId || chatAvailable || !isActive || sessionPaused) return;
        const now = Date.now();
        if (now - availabilityProbeRef.current < 10000) return; // at most once per 10s
        availabilityProbeRef.current = now;
        getMessages()
            .then(() => setChatAvailable(true))
            .catch(() => { /* still unavailable, stay quiet */ });
    }, [chatAvailable, currentUserId]);

    // Poll for messages
    useEffect(() => {
        if (!currentUserId || !chatAvailable || !isActive || sessionPaused) return;

        const fetchMessages = async () => {
            if (messagesInFlightRef.current) return;
            messagesInFlightRef.current = true;
            try {
                const apiMessages = await getMessages();

                // Group messages by conversation (other user id)
                const incomingMessages: Record<string, Message[]> = {};

                apiMessages.forEach(msg => {
                    const senderId = String(msg.sender_id);
                    const recipientId = String(msg.recipient_id);

                    const otherId = senderId === currentUserId ? recipientId : senderId;
                    if (!incomingMessages[otherId]) incomingMessages[otherId] = [];

                    const messageType = (msg.type as Message["type"]) || "text";
                    incomingMessages[otherId].push({
                        id: String(msg.id),
                        renderKey: String(msg.id),
                        senderId,
                        content: msg.content,
                        timestamp: new Date(msg.timestamp),
                        type: messageType,
                        status: msg.is_read ? 'read' : 'delivered',
                        attachmentUrl: msg.attachment_url ?? null,
                        attachmentName: msg.attachment_name ?? null,
                        attachmentMime: msg.attachment_mime ?? null,
                        isDeleted: Boolean(msg.is_deleted)
                    });
                });

                setMessages(prev => {
                    const merged = mergeMessages(prev, incomingMessages);
                    setConversations(buildConversations(merged, usersMap));
                    return merged;
                });

            } catch (error) {
                if (error instanceof ApiError) {
                    if (error.status === 404) {
                        console.warn("Chat endpoints not available; disabling chat UI.");
                        setChatAvailable(false);
                        setIsOpen(false);
                        return;
                    }
                    if (error.status === 401) {
                        // Session expired, stop polling silently
                        return;
                    }
                }
                console.error("Failed to fetch messages", error);
            } finally {
                messagesInFlightRef.current = false;
            }
        };

        fetchMessages();
        const intervalMs = isOpen ? 3000 : 15000;
        const interval = setInterval(fetchMessages, intervalMs);
        return () => clearInterval(interval);
    }, [currentUserId, usersMap, chatAvailable, setIsOpen, mergeMessages, buildConversations, isOpen, isActive, sessionPaused]);

    // Heartbeat loop
    useEffect(() => {
        if (!currentUserId || !chatAvailable || !isActive || sessionPaused) return;
        const beat = async () => {
            if (heartbeatInFlightRef.current) return;
            heartbeatInFlightRef.current = true;
            try {
                await sendHeartbeat();
            } catch (error) {
                console.error(error);
            } finally {
                heartbeatInFlightRef.current = false;
            }
        };
        beat(); // initial
        const interval = setInterval(beat, 30000); // every 30s
        return () => clearInterval(interval);
    }, [currentUserId, chatAvailable, isActive, sessionPaused]);

    const toggleChat = useCallback(() => {
        setIsOpen(prev => !prev);
    }, []);

    const startConversation = useCallback((userId: string) => {
        const user = usersMap[userId];
        if (!user) return;

        setConversations(prev => {
            if (prev.find(c => c.id === userId)) return prev;
            return [
                {
                    id: user.id,
                    participants: [user],
                    unreadCount: 0
                },
                ...prev
            ];
        });
        setActiveConversationId(userId);
        setIsOpen(true);
    }, [usersMap]);

    const sendMessage = useCallback(async (content: string, type: 'text' | 'image' | 'file' = 'text') => {
        if (!activeConversationId || !currentUserId || !currentUser || !chatAvailable) return;

        try {
            // Optimistic update
            const tempId = `temp-${Date.now()}`;
            const newMessage: Message = {
                id: tempId,
                renderKey: tempId,
                senderId: currentUserId,
                content,
                timestamp: new Date(),
                type,
                status: 'sent'
            };

            setMessages(prev => ({
                ...prev,
                [activeConversationId]: [...(prev[activeConversationId] || []), newMessage]
            }));

            // API Call
            await apiSendMessage({
                recipient_id: Number(activeConversationId),
                content,
                type
            });

            // The polling will pick up the real message and replace the optimistic one eventually
            // For a smoother experience, we could replace it here with the response, but polling is simple and robust
        } catch (error) {
            console.error("Failed to send message", error);
            // TODO: Show error state
        }
    }, [activeConversationId, currentUserId, currentUser, chatAvailable]);

    const sendAttachment = useCallback(async (file: File) => {
        if (!activeConversationId || !currentUserId || !currentUser || !chatAvailable) return;

        const optimisticType: Message["type"] = file.type.startsWith("image/") ? "image" : "file";
        const tempId = `temp-${Date.now()}`;

        const optimistic: Message = {
            id: tempId,
            renderKey: tempId,
            senderId: currentUserId,
            content: file.name,
            timestamp: new Date(),
            type: optimisticType,
            status: "sent",
            attachmentUrl: null,
            attachmentName: file.name,
            attachmentMime: file.type || undefined
        };

        setMessages(prev => ({
            ...prev,
            [activeConversationId]: [...(prev[activeConversationId] || []), optimistic]
        }));

        try {
            const uploaded = await uploadChatAttachment(Number(activeConversationId), file);
            const parsed: Message = {
                id: String(uploaded.id),
                senderId: String(uploaded.sender_id),
                content: uploaded.content,
                timestamp: new Date(uploaded.timestamp),
                type: (uploaded.type as Message["type"]) || optimisticType,
                status: uploaded.is_read ? "read" : "delivered",
                attachmentUrl: uploaded.attachment_url ?? null,
                attachmentName: uploaded.attachment_name ?? null,
                attachmentMime: uploaded.attachment_mime ?? null
            };

            setMessages(prev => {
                const existing = prev[activeConversationId] || [];
                const filtered = existing.filter(msg => msg.id !== tempId);
                return {
                    ...prev,
                    [activeConversationId]: [...filtered, parsed]
                };
            });
        } catch (error) {
            console.error("Failed to send attachment", error);
            // Remove optimistic message on failure
            setMessages(prev => {
                const existing = prev[activeConversationId] || [];
                return {
                    ...prev,
                    [activeConversationId]: existing.filter(msg => msg.id !== tempId)
                };
            });
        }
    }, [activeConversationId, currentUserId, currentUser, chatAvailable]);

    const deleteMessageById = useCallback(async (messageId: string) => {
        if (!activeConversationId || !currentUserId) return;
        if (messageId.startsWith("temp-")) return; // cannot delete optimistic-only

        setMessages(prev => {
            const updated = { ...prev };
            const msgs = updated[activeConversationId]?.map(m =>
                m.id === messageId ? { ...m, isDeleted: true, attachmentUrl: null, attachmentName: null, attachmentMime: null } : m
            );
            if (msgs) updated[activeConversationId] = msgs;
            return updated;
        });

        try {
            await deleteChatMessage(Number(messageId));
        } catch (error) {
            console.error("Failed to delete message", error);
            // revert if failed
            setMessages(prev => {
                const updated = { ...prev };
                const msgs = updated[activeConversationId]?.map(m =>
                    m.id === messageId ? { ...m, isDeleted: false } : m
                );
                if (msgs) updated[activeConversationId] = msgs;
                return updated;
            });
        }
    }, [activeConversationId, currentUserId]);

    // Mark as read when opening conversation
    useEffect(() => {
        if (activeConversationId && messages[activeConversationId]) {
            const unreadMessages = messages[activeConversationId].filter(m => m.senderId !== currentUserId && m.status !== 'read');
            unreadMessages.forEach(msg => {
                // We need the real ID, so skip temp ones
                if (!msg.id.startsWith('temp-')) {
                    markMessageRead(Number(msg.id)).catch(console.error);
                }
            });
        }
    }, [activeConversationId, messages, currentUserId]);

    return (
        <ChatContext.Provider value={{
            isOpen,
            setIsOpen,
            chatAvailable,
            refreshUsers: fetchUsers,
            allUsers: Object.values(usersMap).filter(u => u.id !== currentUserId || false),
            conversations,
            activeConversationId,
            setActiveConversationId,
            messages,
            sendMessage,
            sendAttachment,
            deleteMessage: deleteMessageById,
            startConversation,
            currentUser,
            toggleChat
        }}>
            {children}
        </ChatContext.Provider>
    );
}

export function useChat() {
    const context = useContext(ChatContext);
    if (context === undefined) {
        throw new Error('useChat must be used within a ChatProvider');
    }
    return context;
}
