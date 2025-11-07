import type { UIMessage } from 'ai';
import type { SessionMessage } from '@/app/actions';

/**
 * SessionMessage[]をAI SDKのUIMessage[]形式に変換
 *
 * @param sessionMessages - AgentCoreから取得したセッションメッセージ
 * @returns AI SDKのUIMessage配列
 */
export function convertSessionMessagesToUIMessages(
  sessionMessages: SessionMessage[]
): UIMessage[] {
  return sessionMessages
    .slice()                      // 元の配列を変更しないようコピー
    .reverse()                    // 新しい順 → 古い順に変換
    .filter((msg) => msg.content) // contentが存在するもののみ
    .map((msg) => {
      // roleを小文字に変換（'USER' → 'user', 'ASSISTANT' → 'assistant'）
      let role: 'user' | 'assistant' = 'user';
      if (msg.role === 'ASSISTANT') {
        role = 'assistant';
      } else if (msg.role === 'USER') {
        role = 'user';
      }

      return {
        id: msg.eventId,
        role,
        parts: [
          {
            type: 'text' as const,
            text: msg.content || '',
          },
        ],
      } as UIMessage;
    });
}
