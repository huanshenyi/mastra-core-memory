# AWS Bedrock AgentCore メモリデータ取得ガイド

## 目次

1. [概要](#概要)
2. [メモリタイプ](#メモリタイプ)
3. [短期メモリの取得方法](#短期メモリの取得方法)
4. [長期メモリの内部構造](#長期メモリの内部構造)
5. [長期メモリの取得方法](#長期メモリの取得方法)
6. [記憶戦略（Memory Strategies）](#記憶戦略memory-strategies)
7. [実装パターン](#実装パターン)
8. [RetrievalConfigによる取得制御](#retrievalconfigによる取得制御)
9. [ベストプラクティス](#ベストプラクティス)
10. [トラブルシューティング](#トラブルシューティング)
11. [参考資料](#参考資料)

---

## 概要

AWS Bedrock AgentCore Memoryは、AIエージェントが過去のやり取りを記憶し、よりインテリジェントでコンテキストを理解した会話を提供できるようにするマネージドサービスです。

### 主な特徴

- **短期メモリ**: 単一セッション内の会話履歴を保持
- **長期メモリ**: 複数セッションにわたって重要な洞察を自動抽出・保持
- **マネージドサービス**: ストレージ、セキュリティ、スケーラビリティを自動管理
- **セマンティック検索**: 関連性の高いメモリを効率的に検索

---

## メモリタイプ

AgentCore Memoryは2種類のメモリを提供します：

### 1. 短期メモリ（Short-term Memory）

生の会話データをイベントとして保存し、セッション内のコンテキストを維持します。

**特徴**:
- 会話のターン単位で保存
- イミュータブル（不変）でタイムスタンプ付き
- `actorId`と`sessionId`で整理
- イベントメタデータでフィルタリング可能

**用途**:
- 会話履歴の再構築
- インタラクションパターンの分析
- コンテキスト維持

### 2. 長期メモリ（Long-term Memory）

会話から抽出された構造化情報を複数セッションにわたって保持します。

**特徴**:
- 非同期処理で自動生成
- 要約、事実、好みなどの洞察を保存
- セマンティック検索対応
- ベクトルストアで効率的に管理

**用途**:
- ユーザープロファイル構築
- パーソナライゼーション
- 長期的なコンテキスト維持

---

## 短期メモリの取得方法

短期メモリは生の会話データ（イベント）として保存されています。

### 方法1: MemoryClient の `get_last_k_turns()` メソッド

最も簡単な方法です。最新のk件の会話ターンを取得します。

```python
from bedrock_agentcore.memory import MemoryClient

# クライアントの初期化
client = MemoryClient(region_name="us-east-1")

# 最後のk件の会話ターンを取得
turns = client.get_last_k_turns(
    memory_id="your-memory-id",
    actor_id="user_123",
    session_id="session_20251104",
    k=1000  # 取得するターン数（大きな値で全件取得）
)

# 結果の構造
# turns = [
#     [  # 1ターン目
#         {"role": "user", "content": {"text": "こんにちは"}},
#         {"role": "assistant", "content": {"text": "こんにちは！"}}
#     ],
#     [  # 2ターン目
#         {"role": "user", "content": {"text": "今日の天気は？"}},
#         {"role": "assistant", "content": {"text": "晴れです"}}
#     ]
# ]

# 会話履歴を表示
for i, turn in enumerate(reversed(turns), 1):
    print(f"\n--- ターン {i} ---")
    for message in turn:
        role = message["role"]
        content = message["content"]["text"]
        if role.upper() == "USER":
            print(f"👤 ユーザー: {content}")
        elif role.upper() == "ASSISTANT":
            print(f"🤖 アシスタント: {content}")
```

### 方法2: ListEvents API（低レベルAPI）

より細かい制御が必要な場合に使用します。

```python
from bedrock_agentcore.memory import MemoryClient

client = MemoryClient(region_name="us-east-1")

# イベントのリストを取得
response = client.list_events(
    memoryId="your-memory-id",
    actorId="user_123",
    sessionId="session_20251104",
    includePayloads=True,  # ペイロードを含める
    maxResults=100,        # 最大結果数
    # filter={"key": "value"}  # オプション: メタデータフィルタ
)

events = response.get('events', [])
next_token = response.get('nextToken')  # ページネーション用

# 次のページを取得する場合
if next_token:
    next_response = client.list_events(
        memoryId="your-memory-id",
        actorId="user_123",
        sessionId="session_20251104",
        nextToken=next_token
    )
```

### 方法3: GetEvent API（特定イベントの取得）

イベントIDが分かっている場合、特定のイベントを取得できます。

```python
event = client.get_event(
    memoryId="your-memory-id",
    actorId="user_123",
    sessionId="session_20251104",
    eventId="event_xyz"
)

print(f"Role: {event['role']}")
print(f"Content: {event['content']}")
print(f"Timestamp: {event['timestamp']}")
```

### 実装例: ConversationHistoryClient（プロジェクト内）

このプロジェクトでは、便利なラッパークラスを提供しています。

```python
from utils import ConversationHistoryClient

# クライアント初期化
client = ConversationHistoryClient(region_name="us-east-1")

# 全会話履歴を取得
turns = client.get_all_conversation_turns(
    memory_id="BasicTestMemory-ko7pfOGQfG",
    actor_id="test_user_123",
    session_id="session_20251104"
)

# サマリーを表示
client.print_conversation_summary(turns)

# 会話履歴を表示
client.print_conversation_history(turns)
```

**ファイル参照**: `utils.py:9-134`, `get_conversation_turns.py`

---

## 長期メモリの内部構造

長期メモリは**ベクトル化**されており、セマンティック検索を実現しています。

### 🔢 ベクトル化の仕組み

長期メモリは、テキストを**Embedding（埋め込みベクトル）**に変換して保存されています。

#### 証拠1: relevance_scoreはコサイン類似度

AWS公式ドキュメントによると：

> **relevance score is derived from the cosine similarity of embedding vectors**

つまり、検索結果の関連度スコアは**ベクトル間のコサイン類似度**です。

```python
response = client.retrieve_memory_records(
    memoryId="your-memory-id",
    namespace="/facts/user_123",
    searchCriteria={
        "searchQuery": "ユーザーの住所は？"  # クエリもベクトル化される
    }
)

for record in response.get('memoryRecordSummaries', []):
    print(f"関連度: {record['relevanceScore']}")  # 0.0 〜 1.0
    # 例: 0.8523 = 85.23%の類似度（ではなく、ベクトルの角度）
```

**relevance_scoreの意味**:
- 0.0 〜 1.0 の範囲
- 1.0 に近いほど類似度が高い
- コサイン類似度なので、**パーセンテージではなくベクトル間の角度**を表す
- 0.7以上 = 高い関連性
- 0.5前後 = 中程度の関連性
- 0.3以下 = 低い関連性

#### 証拠2: 自然言語クエリで検索可能

```python
# 自然言語で検索できる = ベクトル化されている証拠
response = client.retrieve_memory_records(
    memoryId="your-memory-id",
    namespace="/preferences/user_123",
    searchCriteria={
        "searchQuery": "ユーザーの好きな食べ物は何ですか？"
        # ↑ この質問もベクトルに変換され、
        # 保存されているメモリベクトルと比較される
    }
)
```

### 📊 内部的な処理フロー

#### 1. 長期メモリの生成時

```
会話テキスト
  ↓
[LLMで抽出]
  ↓
"田中太郎は東京に住んでいる"
  ↓
[Embedding Model]
  ↓
ベクトル化: [0.234, -0.123, 0.456, ..., 0.789]  (例: 1536次元)
  ↓
[ベクトルストアに保存]
  ↓
{
  namespace: "/facts/user_tanaka",
  vector: [0.234, -0.123, ...],
  content: {"text": "田中太郎は東京に住んでいる"},
  metadata: {
    actorId: "user_tanaka",
    timestamp: "2025-11-04T10:00:00Z",
    memoryStrategyId: "FactExtractor"
  }
}
```

#### 2. セマンティック検索時

```
クエリ: "ユーザーの住所は？"
  ↓
[Embedding Model]
  ↓
クエリベクトル: [0.245, -0.115, 0.467, ..., 0.801]
  ↓
[namespace内でベクトル類似度検索]
  ↓
cosine_similarity(クエリベクトル, 各メモリベクトル)
  ↓
類似度でソート
  ↓
top_k件を返す
  ↓
[
  {relevanceScore: 0.85, content: "田中太郎は東京に住んでいる"},
  {relevanceScore: 0.32, content: "田中太郎は朝6時に起きる"}
]
```

### 📂 Namespace の概念

namespaceは、ベクトルデータベースにおける**パーティション/コレクション**のような役割を果たします。

#### 他のシステムとの対応

| システム | namespace相当の概念 |
|---------|-------------------|
| **RDB** | テーブル名 |
| **Pinecone** | Namespace |
| **Weaviate** | Class/Collection |
| **Milvus** | Partition |
| **Elasticsearch** | Index |
| **MongoDB** | Collection |

#### namespaceの特徴

1. **論理的なグループ分け**

```python
# メモリ戦略定義時
strategies = [
    {
        "semanticMemoryStrategy": {
            "name": "FactExtractor",
            "namespaces": ["/facts/{actorId}"]  # 事実用のパーティション
        }
    },
    {
        "userPreferenceMemoryStrategy": {
            "name": "PreferenceLearner",
            "namespaces": ["/preferences/{actorId}"]  # 好み用のパーティション
        }
    }
]
```

2. **検索範囲の限定**

```python
# /facts/{actorId} の中だけを検索
response = client.retrieve_memory_records(
    memoryId="your-memory-id",
    namespace="/facts/user_123",  # ← このnamespace内のみ検索
    searchCriteria={"searchQuery": "ユーザー情報"}
)
# → /preferences/user_123 のデータは検索されない
```

3. **プレースホルダーの自動展開**

```python
# 戦略定義時
namespaces: ["/facts/{actorId}"]

# 実際に保存される時（actorIdが展開される）
→ /facts/user_alice
→ /facts/user_bob
→ /facts/user_charlie
```

#### namespaceの使用パターン

**パターン1: データの分離**
```python
# ユーザーごとに完全分離
/facts/user_alice     # Aliceの事実（Bobからは見えない）
/facts/user_bob       # Bobの事実（Aliceからは見えない）
```

**パターン2: データの階層化**
```python
# ユーザー > セッション の階層
/summaries/user_alice/session_001
/summaries/user_alice/session_002
/summaries/user_bob/session_001
```

**パターン3: カテゴリ分け**
```python
# レビューAIの例
/issues/user_tanaka         # 指摘内容
/improvements/user_tanaka   # 改善履歴
/user-patterns/user_tanaka  # ユーザー特性
```

#### namespaceを使う利点

✅ **検索範囲を限定** → 高速化
✅ **無関係なデータを除外** → 精度向上
✅ **マルチテナント対応** → データ分離
✅ **namespace毎に異なるrelevance_score設定が可能**

### 🔍 実際の検証例

プロジェクトの`long_memory.py`実行結果から：

```python
# Semantic Memory から取得（ListMemoryRecords - 全件取得）
namespace = "/facts/user_123"
→ 9件のメモリレコード取得
→ relevanceScoreは無し（全件取得なのでスコア計算不要）

# セマンティック検索（RetrieveMemoryRecords）の場合
namespace = "/facts/user_123"
searchQuery = "ユーザーの基本情報"
→ relevanceScore: 0.8523  # 高い類似度
→ relevanceScore: 0.7234  # 中程度の類似度
→ relevanceScore: 0.3102  # 低い類似度
```

### 💡 まとめ

| 項目 | 説明 |
|-----|------|
| **長期メモリの正体** | Embedding vectorに変換されたテキスト |
| **relevance_score** | コサイン類似度（0.0 〜 1.0） |
| **検索の仕組み** | クエリもベクトル化 → 類似度計算 → top_k件返す |
| **namespace** | ベクトルDBのパーティション/コレクション |
| **namespace の用途** | データ分離、検索範囲限定、マルチテナント |
| **裏側の実装** | マネージドなベクトルデータベース |

つまり、**AgentCore Memory = マネージドなベクトルデータベース + 自動抽出・統合機能**と理解できます。

---

## 長期メモリの取得方法

長期メモリは会話から自動抽出された洞察（要約、事実、好みなど）です。

### 重要な注意点

⚠️ **長期メモリの生成は非同期処理**です。イベントを作成してから長期メモリが利用可能になるまで、**1分以上かかる場合があります**。

### 方法1: RetrieveMemoryRecords API（セマンティック検索）

最も推奨される方法です。自然言語クエリでメモリを検索できます。

```python
from bedrock_agentcore.memory import MemoryClient

client = MemoryClient(region_name="us-east-1")

# セマンティック検索でメモリレコードを取得
response = client.retrieve_memory_records(
    memoryId="your-memory-id",
    namespace="/preferences/user_123",  # 記憶戦略のnamespace
    searchCriteria={
        "searchQuery": "ユーザーの食べ物の好みは何ですか？",  # 自然言語クエリ
        "topK": 5,                      # 上位5件を取得
        # "memoryStrategyId": "strategy_id"  # オプション: 特定戦略のみ
    }
)

# 結果を処理
memory_records = response.get('memoryRecordSummaries', [])
for record in memory_records:
    print(f"記憶ID: {record['memoryRecordId']}")
    print(f"内容: {record['content']}")
    print(f"関連度スコア: {record['relevanceScore']}")  # コサイン類似度
    print(f"タイムスタンプ: {record['timestamp']}")
    print("---")

# ページネーション
next_token = response.get('nextToken')
if next_token:
    next_response = client.retrieve_memory_records(
        memoryId="your-memory-id",
        namespace="/preferences/user_123",
        searchCriteria={"searchQuery": "..."},
        nextToken=next_token
    )
```

### 方法2: ListMemoryRecords API（全件取得）

特定のnamespace内のすべてのメモリレコードを取得します。

```python
response = client.list_memory_records(
    memoryId="your-memory-id",
    namespace="/facts/user_123",
    maxResults=50  # 最大50件
)

records = response.get('memoryRecords', [])
for record in records:
    print(f"ID: {record['id']}")
    print(f"内容: {record['content']}")
    print(f"作成日時: {record['createdAt']}")
```

### 方法3: GetMemoryRecord API（特定レコードの取得）

メモリレコードIDが分かっている場合、特定のレコードを取得できます。

```python
record = client.get_memory_record(
    memoryId="your-memory-id",
    namespace="/summaries/user_123/session_001",
    memoryRecordId="record_abc123"
)

print(f"内容: {record['content']}")
print(f"メタデータ: {record.get('metadata', {})}")
```

### 実装例: MemorySessionManager経由（プロジェクト内）

Strandsフレームワークとの統合例です。

```python
from bedrock_agentcore.memory.integrations.strands.session_manager import AgentCoreMemorySessionManager
from bedrock_agentcore.memory.integrations.strands.config import AgentCoreMemoryConfig
from strands import Agent

# メモリ設定
config = AgentCoreMemoryConfig(
    memory_id="your-memory-id",
    session_id="session_20251104",
    actor_id="user_123"
)

# セッションマネージャー作成
session_manager = AgentCoreMemorySessionManager(
    agentcore_memory_config=config,
    region_name="us-east-1"
)

# エージェント作成
agent = Agent(
    system_prompt="あなたは親切なアシスタントです。",
    session_manager=session_manager
)

# エージェントは自動的に長期記憶を検索・利用します
response = agent("私の好きな食べ物を覚えていますか？")
print(response)
```

**ファイル参照**: `main.py:1-36`, `long_memory.py:57-61`

### 実装例: 直接検索（低レベルAPI）

```python
from bedrock_agentcore.memory.session import MemorySessionManager
from datetime import datetime

actor_id = "user_123"
session_id = "session_20251104"

# セッションマネージャー作成
session_manager = MemorySessionManager(
    memory_id="your-memory-id",
    region_name="us-east-1"
)

# セッション作成
session = session_manager.create_memory_session(
    actor_id=actor_id,
    session_id=session_id
)

# 長期記憶を検索
memories = session.search_long_term_memories(
    namespace_prefix=f"/preferences/{actor_id}",
    query="ユーザーの飲み物の好みは？",
    top_k=5
)

print(f"見つかった記憶: {len(memories)}件")
for memory in memories:
    print(f"- {memory}")
```

**ファイル参照**: `long_memory.py:102-115`

---

## 記憶戦略（Memory Strategies）

長期メモリの生成方法を定義します。AgentCoreは3つの組み込み戦略を提供しています。

### 1. Semantic Memory（意味的記憶）

**目的**: 事実と知識を抽出

**抽出内容**:
- 名前、住所、職業などの基本情報
- 客観的な事実
- 構造化された情報

**例**:
```
入力会話: "私は東京に住んでいる田中太郎です。朝6時に起きて、毎朝ジョギングをします。"

抽出される記憶:
- "ユーザーの名前は田中太郎"
- "ユーザーは東京に住んでいる"
- "ユーザーは朝6時に起床する"
- "ユーザーは毎朝ジョギングをする習慣がある"
```

**Namespace**: `/facts/{actorId}`

**設定例**:
```python
{
    "semanticMemoryStrategy": {
        "name": "FactExtractor",
        "namespaces": ["/facts/{actorId}"]
    }
}
```

### 2. User Preference Memory（ユーザー好み記憶）

**目的**: 明示的・暗黙的な好みを抽出

**抽出内容**:
- 好き/嫌いの情報
- 選択の傾向
- カテゴリ化された好み

**例**:
```
入力会話: "好きな食べ物は寿司とラーメンです。特にマグロの寿司が大好きです。
          コーヒーは苦手で、紅茶の方が好きです。"

抽出される記憶:
{
  "preference": "寿司が好き（特にマグロ）",
  "categories": ["food", "japanese"],
  "context": "食べ物の好みについて"
}
{
  "preference": "ラーメンが好き",
  "categories": ["food", "japanese"],
  "context": "食べ物の好みについて"
}
{
  "preference": "コーヒーが苦手、紅茶を好む",
  "categories": ["beverage", "preference"],
  "context": "飲み物の好みについて"
}
```

**Namespace**: `/preferences/{actorId}`

**設定例**:
```python
{
    "userPreferenceMemoryStrategy": {
        "name": "PreferenceLearner",
        "namespaces": ["/preferences/{actorId}"]
    }
}
```

### 3. Summary Memory（要約記憶）

**目的**: 会話の要約を作成

**抽出内容**:
- セッションごとのトピック別要約
- 重要なやり取りの概要
- 構造化されたXML形式

**例**:
```
入力会話: 自己紹介と日常習慣についての6ターンの会話

抽出される記憶:
<topic="自己紹介と基本情報">
  ユーザーは東京在住の田中太郎さん。ソフトウェアエンジニアで、
  Pythonを使用している。
</topic>
<topic="日常習慣">
  朝6時起床で毎朝ジョギングをする習慣がある。
</topic>
<topic="趣味と好み">
  読書とプログラミングが趣味で、週末はよく本屋に行く。
  寿司（特にマグロ）とラーメンが好物。紅茶派。
</topic>
```

**Namespace**: `/summaries/{actorId}/{sessionId}`

**設定例**:
```python
{
    "summaryMemoryStrategy": {
        "name": "SessionSummarizer",
        "namespaces": ["/summaries/{actorId}/{sessionId}"]
    }
}
```

### 記憶戦略の設定例（完全版）

```python
from bedrock_agentcore.memory import MemoryClient

client = MemoryClient(region_name="us-east-1")

# 3つの戦略を持つメモリを作成
memory = client.create_memory_and_wait(
    name="ComprehensiveAgentMemory",
    description="全機能を持つメモリ",
    strategies=[
        {
            "summaryMemoryStrategy": {
                "name": "SessionSummarizer",
                "namespaces": ["/summaries/{actorId}/{sessionId}"]
            }
        },
        {
            "userPreferenceMemoryStrategy": {
                "name": "PreferenceLearner",
                "namespaces": ["/preferences/{actorId}"]
            }
        },
        {
            "semanticMemoryStrategy": {
                "name": "FactExtractor",
                "namespaces": ["/facts/{actorId}"]
            }
        }
    ]
)

memory_id = memory.get('id')
print(f"メモリID: {memory_id}")
```

**ファイル参照**: `long_memory.py:11-34`

---

## 実装パターン

### パターン1: 基本的な会話履歴取得

```python
from bedrock_agentcore.memory import MemoryClient

def get_conversation_history(memory_id, actor_id, session_id):
    """会話履歴を取得して表示する"""
    client = MemoryClient(region_name="us-east-1")

    # 会話ターンを取得
    turns = client.get_last_k_turns(
        memory_id=memory_id,
        actor_id=actor_id,
        session_id=session_id,
        k=1000  # 全件取得
    )

    # 表示
    for i, turn in enumerate(reversed(turns), 1):
        print(f"\n=== ターン {i} ===")
        for message in turn:
            role = message["role"]
            content = message["content"]["text"]
            print(f"{role}: {content}")

    return turns

# 使用例
history = get_conversation_history(
    memory_id="BasicTestMemory-ko7pfOGQfG",
    actor_id="test_user_123",
    session_id="session_20251104"
)
```

### パターン2: 長期記憶を活用したエージェント

```python
from bedrock_agentcore.memory import MemoryClient
from bedrock_agentcore.memory.integrations.strands.config import (
    AgentCoreMemoryConfig,
    RetrievalConfig
)
from bedrock_agentcore.memory.integrations.strands.session_manager import (
    AgentCoreMemorySessionManager
)
from strands import Agent
from datetime import datetime

# メモリ作成
client = MemoryClient(region_name="us-east-1")
memory = client.create_memory_and_wait(
    name="SmartAssistant",
    strategies=[
        {"semanticMemoryStrategy": {"name": "Facts", "namespaces": ["/facts/{actorId}"]}},
        {"userPreferenceMemoryStrategy": {"name": "Prefs", "namespaces": ["/preferences/{actorId}"]}}
    ]
)

# 設定
config = AgentCoreMemoryConfig(
    memory_id=memory['id'],
    session_id=f"session_{datetime.now().strftime('%Y%m%d')}",
    actor_id="user_123",
    retrieval_config={
        "/preferences/{actorId}": RetrievalConfig(
            top_k=5,
            relevance_score=0.7
        ),
        "/facts/{actorId}": RetrievalConfig(
            top_k=10,
            relevance_score=0.5
        )
    }
)

# セッションマネージャーとエージェント作成
session_manager = AgentCoreMemorySessionManager(config, region_name='us-east-1')
agent = Agent(
    system_prompt="あなたは親切で記憶力の良いアシスタントです。",
    session_manager=session_manager
)

# 使用
agent("私は東京に住んでいて、寿司が大好きです。")
agent("今日のランチは何がおすすめですか？")  # 寿司を提案してくれる
```

**ファイル参照**: `long_memory.py`, `main.py`

### パターン3: 特定の記憶を検索

```python
from bedrock_agentcore.memory import MemoryClient

def search_user_preferences(memory_id, actor_id, query):
    """ユーザーの好みを検索"""
    client = MemoryClient(region_name="us-east-1")

    response = client.retrieve_memory_records(
        memoryId=memory_id,
        namespace=f"/preferences/{actor_id}",
        searchCriteria={
            "searchQuery": query,
            "topK": 5
        }
    )

    memories = response.get('memoryRecordSummaries', [])

    print(f"クエリ: {query}")
    print(f"見つかった記憶: {len(memories)}件\n")

    for i, memory in enumerate(memories, 1):
        print(f"{i}. {memory['content']}")
        print(f"   関連度: {memory['relevanceScore']:.3f}")
        print()

    return memories

# 使用例
search_user_preferences(
    memory_id="your-memory-id",
    actor_id="user_123",
    query="食べ物の好みは何ですか？"
)
```

### パターン4: セッション間での記憶の継続

```python
from bedrock_agentcore.memory.integrations.strands.config import AgentCoreMemoryConfig
from bedrock_agentcore.memory.integrations.strands.session_manager import (
    AgentCoreMemorySessionManager
)
from strands import Agent

def create_agent_with_memory(memory_id, actor_id):
    """同じactorIdで異なるセッションでも記憶を共有するエージェント"""

    # セッション1
    session1_config = AgentCoreMemoryConfig(
        memory_id=memory_id,
        session_id="session_001",
        actor_id=actor_id
    )
    session1_manager = AgentCoreMemorySessionManager(session1_config, region_name='us-east-1')
    agent1 = Agent(system_prompt="親切なアシスタント", session_manager=session1_manager)

    print("=== セッション1 ===")
    response1 = agent1("私の名前は田中です。Pythonが好きです。")
    print(f"応答: {response1}\n")

    # セッション2（別のセッションIDだが同じactorId）
    # 長期記憶により前回の情報を覚えている
    session2_config = AgentCoreMemoryConfig(
        memory_id=memory_id,
        session_id="session_002",  # 異なるセッション
        actor_id=actor_id           # 同じユーザー
    )
    session2_manager = AgentCoreMemorySessionManager(session2_config, region_name='us-east-1')
    agent2 = Agent(system_prompt="親切なアシスタント", session_manager=session2_manager)

    print("=== セッション2（翌日） ===")
    response2 = agent2("私の名前を覚えていますか？")  # "田中さん"と答えてくれる
    print(f"応答: {response2}\n")

    response3 = agent2("プログラミング言語のおすすめを教えて")  # Pythonを推薦
    print(f"応答: {response3}")

# 使用例
create_agent_with_memory(
    memory_id="your-memory-id",
    actor_id="user_田中"
)
```

---

## RetrievalConfigによる取得制御

長期記憶の取得時に、namespaceごとに細かい制御が可能です。

### RetrievalConfigの設定項目

```python
from bedrock_agentcore.memory.integrations.strands.config import RetrievalConfig

config = RetrievalConfig(
    top_k=10,             # 取得する記憶の最大件数（1-100）
    relevance_score=0.5   # 関連度の閾値（0.0-1.0）
)
```

**パラメータ説明**:
- **top_k**: セマンティック検索で返す最大件数
  - デフォルト: 10
  - 最大: 100
  - より多くの記憶を検索したい場合は大きくする

- **relevance_score**: コサイン類似度の閾値
  - 0.0 〜 1.0の範囲
  - 高い値 = より厳密にマッチするもののみ
  - 低い値 = より広範囲に検索

### 複数namespaceの設定例

```python
from bedrock_agentcore.memory.integrations.strands.config import (
    AgentCoreMemoryConfig,
    RetrievalConfig
)

config = AgentCoreMemoryConfig(
    memory_id="your-memory-id",
    session_id="session_001",
    actor_id="user_123",
    retrieval_config={
        # ユーザー好み: 厳密にマッチするもの少数
        "/preferences/{actorId}": RetrievalConfig(
            top_k=5,
            relevance_score=0.7  # 高い閾値 = 厳密
        ),

        # 事実情報: 広範囲に多数取得
        "/facts/{actorId}": RetrievalConfig(
            top_k=10,
            relevance_score=0.3  # 低い閾値 = 広範囲
        ),

        # 要約: 中程度
        "/summaries/{actorId}/{sessionId}": RetrievalConfig(
            top_k=5,
            relevance_score=0.5  # 中間
        )
    }
)
```

**ファイル参照**: `long_memory.py:37-55`

### ユースケース別の推奨設定

#### 1. パーソナライゼーション重視

```python
retrieval_config = {
    "/preferences/{actorId}": RetrievalConfig(
        top_k=10,           # 多めに取得
        relevance_score=0.6  # やや厳密
    )
}
```

#### 2. 事実確認重視

```python
retrieval_config = {
    "/facts/{actorId}": RetrievalConfig(
        top_k=20,           # 多めに取得
        relevance_score=0.3  # 広範囲に検索
    )
}
```

#### 3. コンテキスト重視

```python
retrieval_config = {
    "/summaries/{actorId}/{sessionId}": RetrievalConfig(
        top_k=5,            # 最近の要約のみ
        relevance_score=0.7  # 関連性高いもの
    )
}
```

---

## ベストプラクティス

### 短期メモリ

#### 1. ページネーションの実装

```python
def get_all_events_paginated(client, memory_id, actor_id, session_id):
    """全イベントをページネーションで取得"""
    all_events = []
    next_token = None

    while True:
        params = {
            "memoryId": memory_id,
            "actorId": actor_id,
            "sessionId": session_id,
            "maxResults": 100
        }

        if next_token:
            params["nextToken"] = next_token

        response = client.list_events(**params)
        all_events.extend(response.get('events', []))

        next_token = response.get('nextToken')
        if not next_token:
            break

    return all_events
```

#### 2. イベントメタデータの活用

```python
from bedrock_agentcore.memory.session import MemorySessionManager
from bedrock_agentcore.memory.constants import ConversationalMessage, MessageRole

session_manager = MemorySessionManager(
    memory_id="your-memory-id",
    region_name="us-east-1"
)

session = session_manager.create_memory_session(
    actor_id="user_123",
    session_id="session_001"
)

# メタデータ付きでイベントを追加
session.add_turns(
    messages=[
        ConversationalMessage("東京の天気を教えて", MessageRole.USER)
    ],
    metadata={
        "location": "Tokyo",
        "category": "weather",
        "language": "ja"
    }
)

# 後でメタデータでフィルタリング可能
```

#### 3. セッション管理

```python
def list_user_sessions(client, memory_id, actor_id):
    """ユーザーの全セッションを取得"""
    response = client.list_sessions(
        memoryId=memory_id,
        actorId=actor_id
    )

    sessions = response.get('sessions', [])

    for session in sessions:
        print(f"セッションID: {session['sessionId']}")
        print(f"作成日時: {session['createdAt']}")
        print(f"最終更新: {session['updatedAt']}")
        print()

    return sessions
```

### 長期メモリ

#### 1. 非同期処理の考慮

```python
import time
from bedrock_agentcore.memory import MemoryClient

def wait_for_memory_extraction(client, memory_id, namespace, query, timeout=120):
    """長期記憶の抽出を待つ"""
    start_time = time.time()

    while time.time() - start_time < timeout:
        response = client.retrieve_memory_records(
            memoryId=memory_id,
            namespace=namespace,
            searchCriteria={"searchQuery": query, "topK": 1}
        )

        if response.get('memoryRecordSummaries'):
            print("記憶が抽出されました！")
            return response['memoryRecordSummaries']

        print("まだ処理中... 10秒待機")
        time.sleep(10)

    print("タイムアウト: 記憶の抽出に時間がかかっています")
    return []

# 使用例
# 会話を追加
session.add_turns(messages=[...])

# 抽出を待つ
memories = wait_for_memory_extraction(
    client=client,
    memory_id="your-memory-id",
    namespace="/facts/user_123",
    query="ユーザー情報",
    timeout=120
)
```

#### 2. 効果的な検索クエリの作成

```python
# ❌ 悪い例: 曖昧なクエリ
response = client.retrieve_memory_records(
    memoryId=memory_id,
    namespace="/preferences/user_123",
    searchCriteria={"searchQuery": "好み"}  # 曖昧すぎる
)

# ✅ 良い例: 具体的なクエリ
response = client.retrieve_memory_records(
    memoryId=memory_id,
    namespace="/preferences/user_123",
    searchCriteria={
        "searchQuery": "ユーザーの食べ物の好みと嫌いなもの",
        "topK": 10
    }
)
```

#### 3. 戦略別の検索

```python
def get_memories_by_strategy(client, memory_id, namespace, strategy_id, query):
    """特定の戦略で抽出された記憶のみを検索"""
    response = client.retrieve_memory_records(
        memoryId=memory_id,
        namespace=namespace,
        searchCriteria={
            "searchQuery": query,
            "memoryStrategyId": strategy_id,  # 戦略を指定
            "topK": 10
        }
    )

    return response.get('memoryRecordSummaries', [])

# 使用例: ユーザー好み戦略のみを検索
preference_memories = get_memories_by_strategy(
    client=client,
    memory_id="your-memory-id",
    namespace="/preferences/user_123",
    strategy_id="PreferenceLearner",
    query="食べ物の好み"
)
```

### セキュリティ

#### 1. 暗号化の設定

```python
# カスタマーマネージドKMSキーの使用
memory = client.create_memory(
    name="SecureMemory",
    kmsKeyArn="arn:aws:kms:us-east-1:123456789012:key/your-key-id",
    strategies=[...]
)
```

#### 2. メモリポイズニング対策

```python
def sanitize_input(text):
    """入力のサニタイズ"""
    # プロンプトインジェクション攻撃の検出
    dangerous_patterns = [
        "ignore previous instructions",
        "forget all",
        "override system prompt"
    ]

    for pattern in dangerous_patterns:
        if pattern.lower() in text.lower():
            raise ValueError(f"危険なパターンを検出: {pattern}")

    return text

# 使用例
user_input = sanitize_input(request.get('message'))
session.add_turns(messages=[
    ConversationalMessage(user_input, MessageRole.USER)
])
```

#### 3. 最小権限の原則

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock-agentcore:GetEvent",
        "bedrock-agentcore:ListEvents",
        "bedrock-agentcore:RetrieveMemoryRecords"
      ],
      "Resource": "arn:aws:bedrock-agentcore:us-east-1:123456789012:memory/your-memory-id"
    }
  ]
}
```

### パフォーマンス最適化

#### 1. キャッシング戦略

```python
from functools import lru_cache
from datetime import datetime, timedelta

class MemoryCache:
    """メモリ検索結果をキャッシュ"""

    def __init__(self, ttl_seconds=300):
        self.cache = {}
        self.ttl = ttl_seconds

    def get(self, key):
        if key in self.cache:
            value, timestamp = self.cache[key]
            if datetime.now() - timestamp < timedelta(seconds=self.ttl):
                return value
        return None

    def set(self, key, value):
        self.cache[key] = (value, datetime.now())

# 使用例
cache = MemoryCache(ttl_seconds=300)  # 5分キャッシュ

def get_user_preferences_cached(client, memory_id, actor_id, query):
    cache_key = f"{memory_id}:{actor_id}:{query}"

    # キャッシュチェック
    cached = cache.get(cache_key)
    if cached:
        print("キャッシュヒット")
        return cached

    # キャッシュミス: APIコール
    print("APIコール実行")
    response = client.retrieve_memory_records(
        memoryId=memory_id,
        namespace=f"/preferences/{actor_id}",
        searchCriteria={"searchQuery": query, "topK": 5}
    )

    result = response.get('memoryRecordSummaries', [])
    cache.set(cache_key, result)

    return result
```

#### 2. バッチ処理

```python
def batch_retrieve_memories(client, memory_id, queries):
    """複数クエリを効率的に処理"""
    results = {}

    for namespace, query_list in queries.items():
        results[namespace] = []

        for query in query_list:
            response = client.retrieve_memory_records(
                memoryId=memory_id,
                namespace=namespace,
                searchCriteria={"searchQuery": query, "topK": 5}
            )
            results[namespace].extend(response.get('memoryRecordSummaries', []))

    return results

# 使用例
queries = {
    "/preferences/user_123": [
        "食べ物の好み",
        "飲み物の好み",
        "趣味"
    ],
    "/facts/user_123": [
        "基本情報",
        "職業情報"
    ]
}

all_memories = batch_retrieve_memories(client, "your-memory-id", queries)
```

---

## トラブルシューティング

### 問題1: 長期記憶が取得できない

**症状**: `RetrieveMemoryRecords`で結果が0件

**原因と対策**:

```python
# 1. 戦略がACTIVEか確認
memory = client.get_memory(memoryId="your-memory-id")
for strategy in memory.get('strategies', []):
    print(f"戦略: {strategy['name']}, ステータス: {strategy['status']}")
    # status が 'ACTIVE' であることを確認

# 2. イベントが戦略がACTIVEになった後に作成されたか確認
# 戦略がACTIVEになる前のイベントは処理されない

# 3. 十分な時間待ったか確認（1分以上）
import time
time.sleep(60)  # 60秒待つ

# 4. namespaceが正しいか確認
# ❌ 間違い: "/preferences/user123"  # actorIdのプレースホルダーが展開されていない
# ✅ 正しい: "/preferences/user_123"

# 5. 関連度スコアの閾値が高すぎないか確認
response = client.retrieve_memory_records(
    memoryId=memory_id,
    namespace="/facts/user_123",
    searchCriteria={
        "searchQuery": "ユーザー情報",
        "topK": 10
        # relevance_scoreを指定しない（全て取得）
    }
)
```

### 問題2: 会話履歴が取得できない

**症状**: `get_last_k_turns`で結果が0件

**原因と対策**:

```python
# 1. actorIdとsessionIdが正しいか確認
# まずセッション一覧を取得
sessions = client.list_sessions(
    memoryId="your-memory-id",
    actorId="user_123"
)
print("利用可能なセッション:", [s['sessionId'] for s in sessions['sessions']])

# 2. イベントが実際に作成されているか確認
events = client.list_events(
    memoryId="your-memory-id",
    actorId="user_123",
    sessionId="session_001",
    maxResults=10
)
print(f"イベント数: {len(events.get('events', []))}")

# 3. kの値が十分か確認
turns = client.get_last_k_turns(
    memory_id="your-memory-id",
    actor_id="user_123",
    session_id="session_001",
    k=1000  # 大きな値に設定
)
```

### 問題3: メモリが重複して保存される

**症状**: 同じ情報が複数回保存される

**原因と対策**:

```python
# 統合プロセスが正常に動作していない可能性

# 1. 統合プロンプトの確認（カスタム戦略の場合）
# 2. タイムスタンプの確認
# 3. 無効化された古いメモリの確認

response = client.list_memory_records(
    memoryId="your-memory-id",
    namespace="/preferences/user_123"
)

for record in response.get('memoryRecords', []):
    print(f"ID: {record['id']}")
    print(f"有効: {record.get('valid', True)}")  # INVALIDでないか
    print(f"内容: {record['content']}")
    print()

# 古い/重複したメモリを削除
if record.get('valid') == False:
    client.delete_memory_record(
        memoryId="your-memory-id",
        namespace="/preferences/user_123",
        memoryRecordId=record['id']
    )
```

### 問題4: パフォーマンスが遅い

**症状**: 検索に時間がかかる

**対策**:

```python
import time

# 1. topKを減らす
start = time.time()
response = client.retrieve_memory_records(
    memoryId="your-memory-id",
    namespace="/facts/user_123",
    searchCriteria={
        "searchQuery": "情報",
        "topK": 5  # 100から5に削減
    }
)
print(f"検索時間: {time.time() - start:.2f}秒")

# 2. 並列検索（複数namespaceの場合）
from concurrent.futures import ThreadPoolExecutor

def search_namespace(namespace, query):
    return client.retrieve_memory_records(
        memoryId="your-memory-id",
        namespace=namespace,
        searchCriteria={"searchQuery": query, "topK": 5}
    )

namespaces = ["/facts/user_123", "/preferences/user_123"]
queries = ["基本情報", "好み"]

with ThreadPoolExecutor(max_workers=2) as executor:
    futures = [
        executor.submit(search_namespace, ns, q)
        for ns, q in zip(namespaces, queries)
    ]
    results = [f.result() for f in futures]

# 3. キャッシュの活用（前述のキャッシング戦略参照）
```

### 問題5: 権限エラー

**症状**: AccessDeniedException

**対策**:

```python
# IAMポリシーの確認
# 必要な権限:
# - bedrock-agentcore:GetEvent
# - bedrock-agentcore:ListEvents
# - bedrock-agentcore:CreateEvent
# - bedrock-agentcore:GetMemoryRecord
# - bedrock-agentcore:ListMemoryRecords
# - bedrock-agentcore:RetrieveMemoryRecords

# KMSキーの権限も確認
# - kms:Decrypt
# - kms:GenerateDataKey

# 正しいリージョンを指定しているか確認
client = MemoryClient(region_name="us-east-1")  # メモリが作成されたリージョン
```

---

## 参考資料

### 公式ドキュメント

- [Memory types - Amazon Bedrock AgentCore](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-types.html)
- [Retrieve memory records - Amazon Bedrock AgentCore](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/long-term-retrieve-records.html)
- [Save and retrieve insights - Amazon Bedrock AgentCore](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/long-term-saving-and-retrieving-insights.html)
- [List events - Amazon Bedrock AgentCore](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/short-term-list-events.html)
- [Get an event - Amazon Bedrock AgentCore](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/short-term-get-event.html)

### ブログ記事

- [Amazon Bedrock AgentCore Memory: Building context-aware agents](https://aws.amazon.com/blogs/machine-learning/amazon-bedrock-agentcore-memory-building-context-aware-agents/)
- [Building smarter AI agents: AgentCore long-term memory deep dive](https://aws.amazon.com/blogs/machine-learning/building-smarter-ai-agents-agentcore-long-term-memory-deep-dive/)

### API リファレンス

- [Amazon Bedrock AgentCore API Reference](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/)

### プロジェクト内ファイル

- `get_conversation_turns.py` - 会話履歴取得の基本実装
- `utils.py` - ConversationHistoryClient クラス
- `main.py` - 基本的な使用例
- `long_memory.py` - 長期記憶の包括的なテスト例

---

## まとめ

### 短期メモリ（会話履歴）

- **API**: `get_last_k_turns()`, `ListEvents`, `GetEvent`
- **用途**: セッション内の会話コンテキスト維持
- **特徴**: 即座に利用可能、生データ
- **保存形式**: イベントとしてそのまま保存

### 長期メモリ（抽出された洞察）

- **API**: `RetrieveMemoryRecords`, `ListMemoryRecords`, `GetMemoryRecord`
- **用途**: セッション間でのパーソナライゼーション
- **特徴**: 非同期生成（1分以上）、構造化データ、セマンティック検索
- **保存形式**: Embedding vector（ベクトル化されたテキスト）
- **検索方式**: コサイン類似度によるベクトル検索
- **relevance_score**: 0.0 〜 1.0（コサイン類似度）

### 内部構造の理解

- **長期メモリの正体**: マネージドなベクトルデータベース
- **namespace**: ベクトル空間のパーティション/コレクション
- **検索の仕組み**: クエリもベクトル化 → 類似度計算 → top_k件返す
- **利点**: データ分離、検索範囲限定、高速化、精度向上

### 記憶戦略

1. **Semantic**: 事実と知識（/facts/{actorId}）
2. **User Preference**: 好みと嗜好（/preferences/{actorId}）
3. **Summary**: 会話の要約（/summaries/{actorId}/{sessionId}）

各戦略は異なるnamespaceを持ち、用途に応じて検索範囲を限定できます。

### ベストプラクティス

- ページネーションの実装
- 非同期処理の考慮
- 具体的な検索クエリ
- namespaceによる検索範囲の最適化
- relevance_scoreによる関連度フィルタリング
- セキュリティ対策（暗号化、入力検証）
- キャッシングによるパフォーマンス最適化

### 重要なポイント

✅ 長期メモリは**ベクトル化**されており、セマンティック検索が可能
✅ namespaceは**データ分離**と**検索最適化**の両方に重要
✅ relevance_scoreは**コサイン類似度**（パーセンテージではない）
✅ AgentCore Memory = **ベクトルDB + 自動抽出・統合機能**

このガイドを参考に、AgentCore Memoryを効果的に活用してください！
