# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Next.js 15 + Mastra + AWS AgentCore Memoryを使用した、メモリ機能付き会話型AIアプリケーション。

**技術スタック:**
- **フレームワーク**: Next.js 15.4.7 (App Router) + React 19 + TypeScript 5.8
- **AI/ML**:
  - Mastra Framework (`@mastra/core`, `@mastra/memory`, `@mastra/ai-sdk`)
  - Vercel AI SDK v5 (`ai`, `@ai-sdk/react`)
  - AWS Bedrock (Claude Sonnet 4.5)
  - AWS AgentCore (`@aws-sdk/client-bedrock-agentcore`)
- **データベース**: LibSQL (ローカルファイル `mastra.db`)
- **UI**: Tailwind CSS + shadcn/ui + Radix UI + カスタムAI Elements (30+コンポーネント)

**言語**: UI、ドキュメント、エージェント指示はすべて日本語

## 開発コマンド

```bash
# 開発サーバー起動 (Turbopack)
npm run dev

# 本番ビルド
npm run build

# 本番サーバー起動
npm run start

# Linting
npm run lint
```

**開発サーバー**: http://localhost:3000
- `/` - 本番用会話UI (実際のAPI統合)
- `/sample` - サンプル/デモUI (モックデータ)

## 環境変数

`.env.local`に以下を設定:

```bash
# AWS認証 (ローカル開発用)
IS_LOCAL=TRUE
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_SESSION_TOKEN=your_session_token  # 必要に応じて

# AgentCore Memory ID (必須)
AGENTCORE_MEMORY_ID=your_memory_id
```

**重要**: 本番環境では`IS_LOCAL=FALSE`にしてIAMロールを使用

## 重要な設定

### next.config.ts

```typescript
serverExternalPackages: ['@mastra/*']
```

**この設定は必須**: Mastraパッケージがサーバーコンポーネントで正しく動作するために必要

### Path Alias

```typescript
import { ... } from '@/src/...'  // プロジェクトルートから
```

## アーキテクチャ

### 1. チャットフロー

```
ユーザー入力 (app/page.tsx)
  ↓ AI SDK useChat hook
POST /api/chat (app/api/chat/route.ts)
  ↓ RuntimeContext作成 (userId, sessionId, model)
mastra.getAgent("conversationAgent").stream()
  ↓ エージェントが4つのメモリツールを使用可能
AWS AgentCore Memory操作
  ↓ ストリーミングレスポンス
toAISdkFormat() + createUIMessageStream()
  ↓
クライアントで受信 (ツール実行の可視化含む)
```

### 2. RuntimeContextパターン (重要!)

**問題**: ユーザーごとにメモリをスコープ化する必要があるが、エージェント定義時にハードコードできない

**解決策**: RuntimeContextでリクエストごとにユーザー情報を渡す

**クライアント側** (`app/page.tsx`):
```typescript
sendMessage(
  { role: 'user', parts: [{ type: 'text', text: message }] },
  {
    body: {
      data: {
        userId: 'user_001',      // ユーザーID
        sessionId: 'session_20250106',  // 会話セッションID
        model: 'claude-sonnet-4-5'      // モデル選択
      }
    }
  }
)
```

**サーバー側** (`app/api/chat/route.ts`):
```typescript
const { messages, data } = await req.json();
const runtimeContext = new RuntimeContext();
for (const [key, value] of Object.entries(data)) {
  runtimeContext.set(key, value);
}

const stream = await mastra.getAgent("conversationAgent").stream(messages, {
  runtimeContext
});
```

**ツール側** (`src/mastra/tools/index.ts`):
```typescript
execute: async ({ context, runtimeContext }) => {
  const actorId = runtimeContext.get('userId') || context.actorId;
  const sessionId = runtimeContext.get('sessionId') || getDefaultSessionId();
  // actorIdとsessionIdを使ってユーザー固有の操作を実行
}
```

### 3. 二重メモリシステム

**短期メモリ (会話履歴)**:
- **ツール**: `create-memory-event`, `list-memory-events`
- **ストレージ**: AWS AgentCore Events
- **用途**: 直近の会話の文脈を保持
- **スコープ**: `actorId` (ユーザー) + `sessionId` (会話スレッド)

**長期メモリ (抽出された事実)**:
- **ツール**: `search-memory` (セマンティック検索), `list-memory-records`
- **ストレージ**: AWS AgentCore Memory Records (ベクトル埋め込み)
- **用途**: ユーザーの好み、事実、要約を永続化
- **スコープ**: Namespace `/facts/{actorId}`
- **特徴**: AgentCoreが会話から自動的に事実を抽出 (非同期、1分以上の遅延)

**使い分け**:
- 「今日何を話した?」→ 短期メモリ (`list-memory-events`)
- 「私の好きな飲み物は?」→ 長期メモリ (`search-memory`)

### 4. メモリツール

**4つのカスタムツール** (`src/mastra/tools/index.ts`):

1. `create-memory-event` - 会話イベントを保存
2. `search-memory` - 自然言語でメモリを検索 (ベクトル類似度)
3. `list-memory-records` - すべてのメモリレコードを一覧
4. `list-memory-events` - 会話履歴を時系列で取得

**重要**: すべてのツールで`actorId`は`runtimeContext.get('userId')`から取得

### 5. エージェント設定

**Conversation Agent** (`src/mastra/agents/index.ts`):
- **モデル**: AWS Bedrock `us.anthropic.claude-sonnet-4-5-20250929-v1:0`
- **メモリ**: LibSQLバックエンド (`../mastra.db`)
- **指示**: 日本語対応、メモリツールの積極的使用を促す
- **ツール**: 4つのメモリツール

## ディレクトリ構造

```
/
├── app/
│   ├── api/chat/route.ts        # メインAPIエンドポイント (重要!)
│   ├── page.tsx                 # 本番用会話UI
│   ├── sample/page.tsx          # サンプルUI (モックデータ)
│   └── layout.tsx               # ルートレイアウト
│
├── src/
│   ├── mastra/
│   │   ├── index.ts            # Mastraインスタンス
│   │   ├── agents/index.ts     # エージェント定義
│   │   └── tools/index.ts      # メモリツール定義 (重要!)
│   │
│   ├── components/ai-elements/  # カスタムAI UIコンポーネント (30+)
│   │   ├── conversation.tsx    # チャットコンテナ
│   │   ├── message.tsx         # メッセージ表示 (flexレイアウト重要)
│   │   ├── prompt-input.tsx    # 入力欄 (添付ファイル対応)
│   │   ├── tool.tsx            # ツール実行の可視化
│   │   ├── reasoning.tsx       # 思考過程の表示
│   │   └── response.tsx        # AIレスポンスレンダラー
│   │
│   └── lib/
│       ├── bedrock-providers.ts      # AWS Bedrockクライアント設定
│       └── agent-core-providers.ts   # AgentCoreクライアント設定
│
├── components/ui/               # shadcn/uiコンポーネント
│
└── docs/
    ├── memory-retrieval-guide.md   # 詳細なAgentCoreガイド (1500+行)
    └── get-long-memory-rest.md     # Memory API例
```

## 重要なパターン

### AI Elements複合コンポーネント

AI Elementsは複合コンポーネント設計 (Radix UIパターン):

```tsx
<Conversation>
  <ConversationContent>
    {messages.map(message => (
      <Message from={message.role}>
        <div className="flex flex-col gap-2 flex-1">
          <MessageContent>
            <Response>{content}</Response>
          </MessageContent>
        </div>
        <MessageAvatar src={avatar} name={name} />
      </Message>
    ))}
  </ConversationContent>
  <ConversationScrollButton />
</Conversation>
```

**重要な構造**:
- `Message`コンポーネントは`flex`コンテナ
- `from="user"` → `justify-end` (右寄せ)
- `from="assistant"` → `flex-row-reverse justify-start` (左寄せ)
- **wrapper divには`flex-1`が必須** (flexアイテムとして正しく動作するため)

### ストリーミングレスポンス

```typescript
// API Route
const stream = await agent.stream(messages, { runtimeContext });
const aiSdkStream = toAISdkFormat(stream);
const uiStream = createUIMessageStream(aiSdkStream);
return uiStream.toDataStreamResponse();

// Client
const { messages, sendMessage } = useChat({
  transport: new DefaultChatTransport({ api: '/api/chat' })
});
```

### ツール実行の可視化

AI SDKのツールパートを検出して表示:

```tsx
const toolParts = message.parts.filter(part => part.type.startsWith('tool-'));
{toolParts.map(part => (
  <Tool defaultOpen={part.state === 'output-available'}>
    <ToolHeader type={part.type} state={part.state} />
    <ToolContent>
      <ToolInput input={part.input} />
      <ToolOutput output={part.output} errorText={part.errorText} />
    </ToolContent>
  </Tool>
))}
```

## 開発時の注意点

### Messageコンポーネントのレイアウト

Messageコンポーネント内の構造:
- **必ず`flex-1`をwrapper divに追加**
- `w-full max-w-[80%]`のような幅制限は削除 (MessageContentが処理)
- 条件付き`items-end`は不要 (Messageが処理)

正しい構造:
```tsx
<Message from={role}>
  <div className="flex flex-col gap-2 flex-1">
    {/* コンテンツ */}
  </div>
  <MessageAvatar ... />
</Message>
```

### AWS認証

2つのモード:
1. **ローカル開発**: `IS_LOCAL=TRUE` + アクセスキー
2. **本番**: `IS_LOCAL=FALSE` + IAMロール

認証情報の取得は`src/lib/agent-core-providers.ts`で実装

### メモリデータベース

現在は`mastra.db` (LibSQLローカルファイル)を使用。本番環境では外部データベースへの移行が必要。

## トラブルシューティング

### "Cannot find module '@mastra/...'"

→ `next.config.ts`に`serverExternalPackages: ['@mastra/*']`があるか確認

### メモリツールが動作しない

→ 環境変数`AGENTCORE_MEMORY_ID`が設定されているか確認
→ AWS認証情報が正しいか確認
→ RuntimeContextに`userId`が含まれているか確認

### アバターが正しく配置されない

→ Messageコンポーネントのwrapper divに`flex-1`があるか確認
→ 余分な幅制限クラス(`w-full`, `max-w-[80%]`)がwrapper divにないか確認

## 参考ドキュメント

- **Memory Retrieval Guide**: `docs/memory-retrieval-guide.md` (非常に詳細なAgentCoreガイド)
- **Mastra Documentation**: https://mastra.ai/docs
- **AI SDK Documentation**: https://sdk.vercel.ai/docs
- **AWS Bedrock AgentCore**: AWS公式ドキュメント
