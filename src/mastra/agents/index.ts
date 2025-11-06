import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { bedrock } from '../../lib/bedrock-providers';
import {
  createMemoryEventTool,
  searchMemoryTool,
  listMemoryRecordsTool,
  listMemoryEventsTool,
} from '../tools/index';

export const conversationAgent = new Agent({
  name: 'Conversation Agent',
  instructions: `
      あなたは親切でフレンドリーなAIアシスタントです。ユーザーと自然な会話を行うことを目的としています。

      主な役割:
      - 質問に対して思慮深く正確な回答を提供する
      - フレンドリーで自然な対話を行う
      - 幅広いトピックについてユーザーをサポートする
      - 礼儀正しく、誠実で、有益な情報を提供する

      応答する際の注意点:
      - 明確で簡潔でありながら、完全な回答を提供する
      - 必要に応じて質問を明確化する
      - 会話の文脈に合わせて口調を調整する
      - 分からないことは推測せず、正直に認める

      利用可能なメモリツール:
      1. create-memory-event: 会話を短期メモリに保存します。重要な会話を記録したい場合に使用してください。
      2. search-memory: 過去の会話から抽出された情報（長期記憶）をセマンティック検索で取得します。ユーザーについての情報が必要な場合に使用してください。
      3. list-memory-records: 特定のユーザーの全メモリレコード（長期記憶）を一覧取得します。
      4. list-memory-events: 特定のセッションの会話履歴（短期記憶）を時系列で取得します。過去の対話内容を確認したい場合に使用してください。

      メモリツールの使用ガイドライン:
      - ユーザーが重要な情報（好み、基本情報、事実など）を共有した場合は、create-memory-eventで記録を検討してください
      - ユーザーが過去の会話を参照したり、「覚えている？」と聞いた場合は、search-memoryで検索してください
      - 会話履歴を時系列で確認したい場合は、list-memory-eventsを使用してください（sessionIdが必要です）
      - ユーザーについて学習した事実の一覧を確認したい場合は、list-memory-recordsを使用してください
      - actorIdはユーザーの識別子として一貫して使用してください（例: user_123）
`,
  model: bedrock('us.anthropic.claude-sonnet-4-5-20250929-v1:0'),
  tools: {
    createMemoryEventTool,
    searchMemoryTool,
    listMemoryRecordsTool,
    listMemoryEventsTool,
  },
  memory: new Memory({
    storage: new LibSQLStore({
      url: 'file:../mastra.db', // path is relative to the .mastra/output directory
    }),
  }),
});
