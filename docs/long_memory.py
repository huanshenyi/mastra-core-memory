from bedrock_agentcore.memory.integrations.strands.config import RetrievalConfig
from bedrock_agentcore.memory import MemoryClient
from bedrock_agentcore.memory.integrations.strands.config import AgentCoreMemoryConfig
from bedrock_agentcore.memory.integrations.strands.session_manager import AgentCoreMemorySessionManager
from strands import Agent
from datetime import datetime

client = MemoryClient(region_name="us-east-1")

# Create comprehensive memory with all built-in strategies
comprehensive_memory = client.create_memory_and_wait(
    name="ComprehensiveAgentMemory",
    description="Full-featured memory with all built-in strategies",
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

# Configure with multiple namespace retrieval
config = AgentCoreMemoryConfig(
    # memory_id=comprehensive_memory.get('id'),
    memory_id="ComprehensiveAgentMemory-kHDvs4HY49",
    session_id=f"session_{datetime.now().strftime('%Y%m%d%H')}",
    # actor_id=f"user_{datetime.now().strftime('%Y%m%d%H%M%S')}",
    actor_id="test_user_123",
    retrieval_config={
        "/preferences/{actorId}": RetrievalConfig(
            top_k=5,
            relevance_score=0.7
        ),
        "/facts/{actorId}": RetrievalConfig(
            top_k=10,
            relevance_score=0.3
        ),
        "/summaries/{actorId}/{sessionId}": RetrievalConfig(
            top_k=5,
            relevance_score=0.5
        )
    }
)

session_manager = AgentCoreMemorySessionManager(config, region_name='us-east-1')
agent = Agent(
    system_prompt="あなたは親切なアシスタントです。ユーザーについて知っている全ての情報を使って、役立つ回答を提供してください。",
    session_manager=session_manager
)

print("session_id", datetime.now().strftime('%Y%m%d%H')) # session_2025110417

print("=" * 80)
print("Long Memory Test - セッション1: ユーザー情報と好みの確立")
print("=" * 80)
# セッション1: ユーザーの基本情報と好みを含む会話
# 期待される動作：
# - userPreferenceMemoryStrategy: 寿司・ラーメン好き、コーヒー苦手、紅茶好き、読書・プログラミングが趣味
# - semanticMemoryStrategy: 東京在住、田中太郎、朝6時起床、ソフトウェアエンジニア、Python使用
# - summaryMemoryStrategy: セッション全体を「自己紹介と日常習慣の共有」として要約

response1 = agent("こんにちは。私は東京に住んでいる田中太郎です。")
print(f"\n👤 ユーザー: こんにちは。私は東京に住んでいる田中太郎です。")
print(f"🤖 アシスタント: {response1}")

response2 = agent("私は朝6時に起きて、毎朝ジョギングをする習慣があります。")
print(f"\n👤 ユーザー: 私は朝6時に起きて、毎朝ジョギングをする習慣があります。")
print(f"🤖 アシスタント: {response2}")

response3 = agent("好きな食べ物は寿司とラーメンです。特にマグロの寿司が大好きです。")
print(f"\n👤 ユーザー: 好きな食べ物は寿司とラーメンです。特にマグロの寿司が大好きです。")
print(f"🤖 アシスタント: {response3}")

response4 = agent("コーヒーは苦手で、紅茶の方が好きです。")
print(f"\n👤 ユーザー: コーヒーは苦手で、紅茶の方が好きです。")
print(f"🤖 アシスタント: {response4}")

response5 = agent("趣味は読書とプログラミングで、週末はよく本屋に行きます。")
print(f"\n👤 ユーザー: 趣味は読書とプログラミングで、週末はよく本屋に行きます。")
print(f"🤖 アシスタント: {response5}")

response6 = agent("仕事はソフトウェアエンジニアをしていて、Pythonをよく使います。")
print(f"\n👤 ユーザー: 仕事はソフトウェアエンジニアをしていて、Pythonをよく使います。")
print(f"🤖 アシスタント: {response6}")

print("\n" + "=" * 80)
print("セッション2: 記憶を活用した相談（好みと事実を活用）")
print("=" * 80)
# セッション2: 具体的な相談
# 期待される動作：過去の好みや事実を基に適切な提案をする

response7 = agent("今日のランチは何を食べればいいですか？")
print(f"\n👤 ユーザー: 今日のランチは何を食べればいいですか？")
print(f"🤖 アシスタント: {response7}")
print("   → 期待: 寿司やラーメンを提案")

response8 = agent("明日の朝の飲み物でおすすめはありますか？")
print(f"\n👤 ユーザー: 明日の朝の飲み物でおすすめはありますか？")
print(f"🤖 アシスタント: {response8}")
print("   → 期待: 紅茶を提案（コーヒーは避ける）")

response9 = agent("週末に何をすればいいですか？")
print(f"\n👤 ユーザー: 週末に何をすればいいですか？")
print(f"🤖 アシスタント: {response9}")
print("   → 期待: 本屋に行くことや、プログラミングプロジェクトを提案")

response10 = agent("Pythonで効率的に学習するための本を教えてください。")
print(f"\n👤 ユーザー: Pythonで効率的に学習するための本を教えてください。")
print(f"🤖 アシスタント: {response10}")
print("   → 期待: Python使用の事実を踏まえた提案")

print("\n" + "=" * 80)
print("セッション3: 長期記憶のテスト")
print("=" * 80)
# セッション3: 長期記憶の検証
# 期待される動作：過去のセッションの情報を正確に思い出す

response11 = agent("私の名前を覚えていますか？")
print(f"\n👤 ユーザー: 私の名前を覚えていますか？")
print(f"🤖 アシスタント: {response11}")
print("   → 期待: 田中太郎と回答")

response12 = agent("私はどこに住んでいましたか？")
print(f"\n👤 ユーザー: 私はどこに住んでいましたか？")
print(f"🤖 アシスタント: {response12}")
print("   → 期待: 東京と回答")

response13 = agent("私の好きな寿司のネタは何でしたか？")
print(f"\n👤 ユーザー: 私の好きな寿司のネタは何でしたか？")
print(f"🤖 アシスタント: {response13}")
print("   → 期待: マグロと回答")

response14 = agent("私の朝の習慣を教えてください。")
print(f"\n👤 ユーザー: 私の朝の習慣を教えてください。")
print(f"🤖 アシスタント: {response14}")
print("   → 期待: 朝6時起床、ジョギングと回答")

print("\n" + "=" * 80)
print("Long Memory Test 完了")
print("=" * 80)