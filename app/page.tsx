'use client';

import {
    PromptInput,
    PromptInputBody,
    PromptInputButton,
    type PromptInputMessage,
    PromptInputModelSelect,
    PromptInputModelSelectContent,
    PromptInputModelSelectItem,
    PromptInputModelSelectTrigger,
    PromptInputModelSelectValue,
    PromptInputSubmit,
    PromptInputTextarea,
    PromptInputFooter,
    PromptInputTools,
} from '@/src/components/ai-elements/prompt-input';
import { MessageSquare, MicIcon, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useState, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import {
    Conversation,
    ConversationContent,
    ConversationEmptyState,
    ConversationScrollButton,
} from '@/src/components/ai-elements/conversation';
import { Message, MessageContent, MessageAvatar } from '@/src/components/ai-elements/message';
import { Response } from '@/src/components/ai-elements/response';
import { Loader } from '@/src/components/ai-elements/loader';
import {
    Tool,
    ToolContent,
    ToolHeader,
    ToolInput,
    ToolOutput,
} from '@/src/components/ai-elements/tool';
import {
    Reasoning,
    ReasoningContent,
    ReasoningTrigger,
} from '@/src/components/ai-elements/reasoning';

const models = [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', name: 'Claude Sonnet 4.5' },
];

// Generate default sessionId based on date
const getDefaultSessionId = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `session_${year}${month}${day}`;
};

const ConversationAgentPage = () => {
    const [text, setText] = useState<string>('');
    const [model, setModel] = useState<string>(models[1].id);
    const [useMicrophone, setUseMicrophone] = useState<boolean>(false);
    const [userId, setUserId] = useState<string>('user_001');
    const [sessionId, setSessionId] = useState<string>(getDefaultSessionId());
    const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

    const { messages, status, sendMessage, setMessages } = useChat({
        transport: new DefaultChatTransport({
            api: '/api/chat',
        }),
    });

    // Fetch existing messages when userId or sessionId changes
    useEffect(() => {
        // Clear messages when session changes
        // Note: Full message persistence from Mastra memory requires
        // additional type conversion between Mastra and AI SDK formats
        setMessages([]);
        setIsLoadingHistory(false);
    }, [userId, sessionId, setMessages]);

    const handleSubmit = async (message: PromptInputMessage) => {
        const hasText = Boolean(message.text);

        if (!hasText) {
            return;
        }

        if (!userId || !sessionId) {
            alert('userIdとsessionIdを入力してください');
            return;
        }

        // Send message with text and additional data (AI SDK v5 format)
        sendMessage(
            {
                role: 'user',
                parts: [{ type: 'text' as const, text: message.text! }],
            },
            {
                body: {
                    data: {
                        userId: userId,
                        sessionId: sessionId,
                        model: model,
                    },
                },
            },
        );
        setText('');
    };

    return (
        <div className="max-w-5xl mx-auto p-6 relative size-full">
            <div className="flex flex-col h-full gap-4">
                {/* Header */}
                <div className="flex items-center gap-3 pb-3 border-b">
                    <div className="flex items-center gap-2">
                        <Sparkles className="size-6 text-purple-500" />
                    </div>
                    <div className="flex-1">
                        <h1 className="text-2xl font-bold">会話エージェント</h1>
                        <p className="text-sm text-muted-foreground">
                            メモリツールを使用した会話型AIエージェント（AWS AgentCore統合）
                        </p>
                    </div>
                </div>

                {/* User ID and Session ID Inputs */}
                <div className="flex gap-4 p-4 bg-muted/30 rounded-lg border">
                    <div className="flex-1">
                        <label htmlFor="userId" className="text-sm font-medium mb-1.5 block">
                            User ID
                        </label>
                        <Input
                            id="userId"
                            value={userId}
                            onChange={(e) => setUserId(e.target.value)}
                            placeholder="例: user_001"
                            className="w-full"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            AgentCoreのactorIdとして使用されます
                        </p>
                    </div>
                    <div className="flex-1">
                        <label htmlFor="sessionId" className="text-sm font-medium mb-1.5 block">
                            Session ID
                        </label>
                        <Input
                            id="sessionId"
                            value={sessionId}
                            onChange={(e) => setSessionId(e.target.value)}
                            placeholder="例: session_20250106"
                            className="w-full"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            会話スレッドを識別します（変更で履歴読み込み）
                        </p>
                    </div>
                </div>

                {/* Chat Conversation */}
                <div className="rounded-lg border h-[500px]">
                    <Conversation className="relative w-full h-full">
                        <ConversationContent>
                            {isLoadingHistory ? (
                                <div className="flex items-center justify-center h-full">
                                    <Loader />
                                    <span className="ml-2 text-sm text-muted-foreground">
                                        会話履歴を読み込み中...
                                    </span>
                                </div>
                            ) : messages.length === 0 ? (
                                <ConversationEmptyState
                                    icon={<MessageSquare className="size-12" />}
                                    title="メッセージがありません"
                                    description="メッセージを入力して会話を開始してください。エージェントはメモリツールを使って過去の会話を記憶します。"
                                />
                            ) : (
                                messages.map((message) => {
                                    // Separate tool parts from text/reasoning parts
                                    const toolParts = message.parts.filter((part) =>
                                        part.type.startsWith('tool-')
                                    );
                                    const contentParts = message.parts.filter(
                                        (part) => part.type === 'text' || part.type === 'reasoning'
                                    );

                                    return (
                                        <Message from={message.role} key={message.id}>
                                            <div className={`flex flex-col gap-2 w-full max-w-[80%] ${message.role === 'user' && 'items-end'}`}>
                                                {/* Render tools */}
                                                {toolParts.map((part, i) => {
                                                    // Type guard for tool parts
                                                    const partWithTool = part as unknown as {
                                                        type: string;
                                                        state?: string;
                                                        input?: unknown;
                                                        output?: unknown;
                                                        errorText?: string;
                                                    };

                                                    if (
                                                        'state' in partWithTool &&
                                                        'input' in partWithTool &&
                                                        partWithTool.type.startsWith('tool-')
                                                    ) {
                                                        return (
                                                            <Tool
                                                                key={`${message.id}-tool-${i}`}
                                                                defaultOpen={
                                                                    partWithTool.state === 'output-available' ||
                                                                    partWithTool.state === 'output-error'
                                                                }
                                                            >
                                                                <ToolHeader
                                                                    type={partWithTool.type as `tool-${string}`}
                                                                    state={partWithTool.state as 'input-streaming' | 'input-available' | 'output-available' | 'output-error'}
                                                                />
                                                                <ToolContent>
                                                                    <ToolInput input={partWithTool.input} />
                                                                    {partWithTool.state === 'output-available' &&
                                                                        'output' in partWithTool && (
                                                                            <ToolOutput
                                                                                output={JSON.stringify(partWithTool.output, null, 2)}
                                                                                errorText={undefined}
                                                                            />
                                                                        )}
                                                                    {partWithTool.state === 'output-error' &&
                                                                        'errorText' in partWithTool && (
                                                                            <ToolOutput
                                                                                output={undefined}
                                                                                errorText={partWithTool.errorText}
                                                                            />
                                                                        )}
                                                                </ToolContent>
                                                            </Tool>
                                                        );
                                                    }
                                                    return null;
                                                })}

                                                {/* Render message content */}
                                                {contentParts.length > 0 && (
                                                    <MessageContent>
                                                        {contentParts.map((part, i) => {
                                                            switch (part.type) {
                                                                case 'text':
                                                                    return (
                                                                        <Response key={`${message.id}-${i}`}>
                                                                            {part.text}
                                                                        </Response>
                                                                    );
                                                                case 'reasoning':
                                                                    return (
                                                                        <Reasoning
                                                                            key={`${message.id}-${i}`}
                                                                            className="w-full"
                                                                            isStreaming={
                                                                                status === 'streaming' &&
                                                                                i === contentParts.length - 1 &&
                                                                                message.id === messages.at(-1)?.id
                                                                            }
                                                                        >
                                                                            <ReasoningTrigger />
                                                                            <ReasoningContent>{part.text}</ReasoningContent>
                                                                        </Reasoning>
                                                                    );
                                                                default:
                                                                    return null;
                                                            }
                                                        })}
                                                    </MessageContent>
                                                )}
                                            </div>
                                            <MessageAvatar
                                                src={
                                                    message.role === 'user'
                                                        ? 'https://github.com/shadcn.png'
                                                        : 'https://github.com/vercel.png'
                                                }
                                                name={message.role === 'user' ? 'ユーザー' : '会話エージェント'}
                                            />
                                        </Message>
                                    );
                                })
                            )}
                            {status === 'submitted' && <Loader />}
                        </ConversationContent>
                        <ConversationScrollButton />
                    </Conversation>
                </div>

                {/* Prompt Input */}
                <PromptInput
                    onSubmit={handleSubmit}
                    className="border rounded-lg"
                >
                    <PromptInputBody>
                        <PromptInputTextarea
                            onChange={(e) => setText(e.target.value)}
                            value={text}
                            placeholder="メッセージを入力してください..."
                        />
                    </PromptInputBody>
                    <PromptInputFooter>
                        <PromptInputTools>
                            <PromptInputButton
                                onClick={() => setUseMicrophone(!useMicrophone)}
                                variant={useMicrophone ? 'default' : 'ghost'}
                            >
                                <MicIcon size={16} />
                                <span className="sr-only">マイク</span>
                            </PromptInputButton>
                            <PromptInputModelSelect
                                onValueChange={(value) => {
                                    setModel(value);
                                }}
                                value={model}
                            >
                                <PromptInputModelSelectTrigger>
                                    <PromptInputModelSelectValue />
                                </PromptInputModelSelectTrigger>
                                <PromptInputModelSelectContent>
                                    {models.map((model) => (
                                        <PromptInputModelSelectItem key={model.id} value={model.id}>
                                            {model.name}
                                        </PromptInputModelSelectItem>
                                    ))}
                                </PromptInputModelSelectContent>
                            </PromptInputModelSelect>
                        </PromptInputTools>
                        <PromptInputSubmit disabled={!text && !status} status={status} />
                    </PromptInputFooter>
                </PromptInput>
            </div>
        </div>
    );
};

export default ConversationAgentPage;
