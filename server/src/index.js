import dotenv from 'dotenv';
import OpenAI from 'openai';
import { createApp } from './app.js';
import { createChatOrchestrator } from './orchestrator.js';
import { searchProducts } from './productSearch.js';
import { searchShopifyCatalog } from './shopifyCatalog.js';
import { searchWithFallback } from './productSearch.js';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: new URL('../../.env', import.meta.url) });

const port = Number(process.env.PORT) || 3001;
const model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

async function complete(request) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OpenAI API key is not configured');
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
  const completion = await openai.chat.completions.create({
    model,
    messages: request.messages,
    tools: request.tools,
    tool_choice: request.toolChoice,
    temperature: 0.7,
  });
  return completion.choices[0]?.message?.tool_calls?.[0] || null;
}

const chat = createChatOrchestrator({
  complete,
  search: (intent) => searchWithFallback(intent, {
    shopifySearch: searchShopifyCatalog,
    tavilySearch: searchProducts,
  }),
});
createApp({ chat, filePath: fileURLToPath(new URL('../data/conversations.json', import.meta.url)) }).listen(port, () => {
  console.log(`小柠后端运行在 http://localhost:${port}`);
});
