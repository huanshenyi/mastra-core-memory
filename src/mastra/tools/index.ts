import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  CreateEventCommand,
  RetrieveMemoryRecordsCommand,
  ListMemoryRecordsCommand,
  ListEventsCommand,
} from '@aws-sdk/client-bedrock-agentcore';
import { client } from '../../lib/agent-core-providers';

const MEMORY_ID = process.env.AGENTCORE_MEMORY_ID;

if (!MEMORY_ID) {
  throw new Error('AGENTCORE_MEMORY_ID environment variable is required');
}

/**
 * 会話イベントを短期メモリに保存するツール
 */
export const createMemoryEventTool = createTool({
  id: 'create-memory-event',
  description: '会話の内容を短期メモリ（イベント）として保存します。ユーザーとの会話履歴を記録する際に使用します。',
  inputSchema: z.object({
    actorId: z.string().describe('ユーザーの識別子（例: user_123）'),
    sessionId: z.string().optional().describe('セッションID。省略時は現在の日時から自動生成されます'),
    userMessage: z.string().describe('ユーザーが送信したメッセージ'),
    assistantMessage: z.string().optional().describe('アシスタントの応答メッセージ（オプション）'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    eventId: z.string().optional(),
    timestamp: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context, runtimeContext }) => {
    try {
      // runtimeContext から userId と sessionId を取得（context の値をフォールバックとして使用）
      const actorId = runtimeContext.get('userId') as string || context.actorId;
      const sessionId = runtimeContext.get('sessionId') as string || context.sessionId || `session_${new Date().toISOString().split('T')[0].replace(/-/g, '')}`;

      // ペイロードの構築
      const payload = [];

      // ユーザーメッセージ
      payload.push({
        conversational: {
          content: { text: context.userMessage },
          role: 'USER' as const,
        },
      });

      // アシスタントメッセージ（存在する場合）
      if (context.assistantMessage) {
        payload.push({
          conversational: {
            content: { text: context.assistantMessage },
            role: 'ASSISTANT' as const,
          },
        });
      }

      const command = new CreateEventCommand({
        memoryId: MEMORY_ID,
        actorId,
        sessionId,
        eventTimestamp: new Date(),
        payload,
      });

      const response = await client.send(command);

      return {
        success: true,
        eventId: response.event?.eventId,
        timestamp: response.event?.eventTimestamp?.toISOString(),
      };
    } catch (error) {
      console.error('メモリイベント作成エラー:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '不明なエラーが発生しました',
      };
    }
  },
});

/**
 * セマンティック検索で長期メモリを取得するツール
 */
export const searchMemoryTool = createTool({
  id: 'search-memory',
  description: '自然言語クエリを使用して長期メモリをセマンティック検索します。過去の会話から抽出された事実や情報を取得する際に使用します。',
  inputSchema: z.object({
    actorId: z.string().describe('ユーザーの識別子（例: user_123）'),
    query: z.string().describe('検索クエリ（自然言語で記述）'),
    namespace: z.string().optional().describe('検索対象のnamespace。省略時は /facts/{actorId} が使用されます'),
    topK: z.number().min(1).max(100).optional().default(5).describe('取得する最大件数（1-100、デフォルト: 5）'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    records: z.array(z.object({
      memoryRecordId: z.string(),
      content: z.string(),
      relevanceScore: z.number(),
      timestamp: z.string(),
    })).optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context, runtimeContext }) => {
    try {
      // runtimeContext から userId を取得（context の値をフォールバックとして使用）
      const actorId = runtimeContext.get('userId') as string || context.actorId;
      const namespace = context.namespace || `/facts/${actorId}`;

      const command = new RetrieveMemoryRecordsCommand({
        memoryId: MEMORY_ID,
        namespace,
        searchCriteria: {
          searchQuery: context.query,
          topK: context.topK || 5,
        },
      });

      const response = await client.send(command);
      const memoryRecordSummaries = response.memoryRecordSummaries || [];

      const records = memoryRecordSummaries.map(record => ({
        memoryRecordId: record.memoryRecordId || '',
        content: typeof record.content === 'object' && 'text' in record.content
          ? record.content.text || ''
          : String(record.content || ''),
        relevanceScore: record.score || 0,
        timestamp: record.createdAt?.toISOString() || '',
      }));

      return {
        success: true,
        records,
      };
    } catch (error) {
      console.error('メモリ検索エラー:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '不明なエラーが発生しました',
      };
    }
  },
});

/**
 * 特定namespace内の全メモリレコードを取得するツール
 */
export const listMemoryRecordsTool = createTool({
  id: 'list-memory-records',
  description: '特定のnamespace内に保存されている全ての長期メモリレコードを一覧取得します。検索クエリを使わず、全件を取得したい場合に使用します。',
  inputSchema: z.object({
    actorId: z.string().describe('ユーザーの識別子（例: user_123）'),
    namespace: z.string().optional().describe('取得対象のnamespace。省略時は /facts/{actorId} が使用されます'),
    maxResults: z.number().min(1).max(100).optional().default(50).describe('取得する最大件数（1-100、デフォルト: 50）'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    records: z.array(z.object({
      id: z.string(),
      content: z.string(),
      createdAt: z.string(),
    })).optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context, runtimeContext }) => {
    try {
      // runtimeContext から userId を取得（context の値をフォールバックとして使用）
      const actorId = runtimeContext.get('userId') as string || context.actorId;
      const namespace = context.namespace || `/facts/${actorId}`;

      const command = new ListMemoryRecordsCommand({
        memoryId: MEMORY_ID,
        namespace,
        maxResults: context.maxResults || 50,
      });

      const response = await client.send(command);
      const memoryRecords = response.memoryRecordSummaries || [];

      const records = memoryRecords.map(record => ({
        id: record.memoryRecordId || '',
        content: typeof record.content === 'object' && 'text' in record.content
          ? record.content.text || ''
          : String(record.content || ''),
        createdAt: record.createdAt?.toISOString() || '',
      }));

      return {
        success: true,
        records,
      };
    } catch (error) {
      console.error('メモリレコード一覧取得エラー:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '不明なエラーが発生しました',
      };
    }
  },
});

/**
 * 会話イベント履歴を取得するツール
 */
export const listMemoryEventsTool = createTool({
  id: 'list-memory-events',
  description: '特定のセッションの会話履歴（イベント）を時系列で取得します。過去の対話内容を確認したい場合に使用します。',
  inputSchema: z.object({
    actorId: z.string().describe('ユーザーの識別子（例: user_123）'),
    sessionId: z.string().describe('セッションID（例: session_20240101）'),
    includePayloads: z.boolean().optional().default(true).describe('イベントのペイロード（会話内容）を含めるかどうか（デフォルト: true）'),
    maxResults: z.number().min(1).max(100).optional().default(20).describe('取得する最大件数（1-100、デフォルト: 20）'),
    nextToken: z.string().optional().describe('ページネーション用トークン（次のページを取得する場合に使用）'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    events: z.array(z.object({
      eventId: z.string(),
      timestamp: z.string(),
      role: z.string().optional(),
      content: z.string().optional(),
    })).optional(),
    nextToken: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context, runtimeContext }) => {
    try {
      // runtimeContext から userId と sessionId を取得（context の値をフォールバックとして使用）
      const actorId = runtimeContext.get('userId') as string || context.actorId;
      const sessionId = runtimeContext.get('sessionId') as string || context.sessionId;

      const command = new ListEventsCommand({
        memoryId: MEMORY_ID,
        actorId,
        sessionId,
        includePayloads: context.includePayloads ?? true,
        maxResults: context.maxResults || 20,
        nextToken: context.nextToken,
      });

      const response = await client.send(command);
      const eventList = response.events || [];

      // イベントをフォーマット
      const events = eventList.map(event => {
        const formatted: {
          eventId: string;
          timestamp: string;
          role?: string;
          content?: string;
        } = {
          eventId: event.eventId || '',
          timestamp: event.eventTimestamp?.toISOString() || '',
        };

        // ペイロードが含まれている場合、最初の会話データを抽出
        if (event.payload && event.payload.length > 0) {
          const firstPayload = event.payload[0];
          if (firstPayload.conversational) {
            formatted.role = firstPayload.conversational.role || '';
            if (firstPayload.conversational.content?.text) {
              formatted.content = firstPayload.conversational.content.text;
            }
          }
        }

        return formatted;
      });

      return {
        success: true,
        events,
        nextToken: response.nextToken,
      };
    } catch (error) {
      console.error('メモリイベント一覧取得エラー:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '不明なエラーが発生しました',
      };
    }
  },
});
