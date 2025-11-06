import { PinoLogger } from '@mastra/loggers';
import { Mastra } from '@mastra/core/mastra';
import { conversationAgent } from './agents';

export const mastra = new Mastra({
  agents: { conversationAgent },
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
});
