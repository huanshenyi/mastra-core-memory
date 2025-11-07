'use server';

import { ListEventsCommand } from '@aws-sdk/client-bedrock-agentcore';
import { client } from '@/src/lib/agent-core-providers';

const MEMORY_ID = process.env.AGENTCORE_MEMORY_ID;

if (!MEMORY_ID) {
  throw new Error('AGENTCORE_MEMORY_ID environment variable is required');
}

export type SessionMessage = {
  eventId: string;
  timestamp: string;
  role?: 'USER' | 'ASSISTANT' | 'TOOL' | 'OTHER';
  content?: string;
};

export type GetSessionMessagesResult = {
  success: boolean;
  events?: SessionMessage[];
  nextToken?: string;
  error?: string;
};

export type GetSessionMessagesOptions = {
  includePayloads?: boolean;
  maxResults?: number;
  nextToken?: string;
};

/**
 * 指定されたユーザーとセッションのメッセージ履歴を取得するServer Action
 *
 * @param userId - ユーザーID（actorId）
 * @param sessionId - セッションID
 * @param options - オプション設定
 * @returns メッセージ履歴とページネーション情報
 */
export async function getSessionMessages(
  userId: string,
  sessionId: string,
  options?: GetSessionMessagesOptions
): Promise<GetSessionMessagesResult> {
  try {
    const command = new ListEventsCommand({
      memoryId: MEMORY_ID,
      actorId: userId,
      sessionId: sessionId,
      includePayloads: options?.includePayloads ?? true,
      maxResults: options?.maxResults && options.maxResults >= 1 && options.maxResults <= 100
        ? options.maxResults
        : 100,
      nextToken: options?.nextToken,
    });

    const response = await client.send(command);
    const eventList = response.events || [];

    // イベントをフォーマット（全てのペイロードを処理）
    const events: SessionMessage[] = [];

    eventList.forEach(event => {
      const eventId = event.eventId || '';
      const timestamp = event.eventTimestamp?.toISOString() || '';

      // ペイロードが含まれている場合、全ての会話データを抽出
      if (event.payload && event.payload.length > 0) {
        event.payload.slice().reverse().forEach((payload, payloadIndex) => {
          if (payload.conversational) {
            events.push({
              eventId: `${eventId}-${payloadIndex}`, // ユニークなIDを生成
              timestamp,
              role: payload.conversational.role as 'USER' | 'ASSISTANT' | 'TOOL' | 'OTHER',
              content: payload.conversational.content?.text,
            });
          }
        });
      }
    });

    return {
      success: true,
      events,
      nextToken: response.nextToken,
    };
  } catch (error) {
    console.error('セッションメッセージ取得エラー:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '不明なエラーが発生しました',
    };
  }
}
