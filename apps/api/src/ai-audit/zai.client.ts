import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';

interface ZaiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ZaiChatRequest {
  model: string;
  messages: ZaiMessage[];
  temperature?: number;
  max_tokens?: number;
}

interface ZaiChatResponse {
  id: string;
  choices: Array<{
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

@Injectable()
export class ZaiClient {
  private readonly logger = new Logger(ZaiClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor() {
    this.baseUrl = process.env.ZAI_BASE_URL ?? 'https://api.z.ai/api/paas/v4';
    this.apiKey = process.env.ZAI_API_KEY!;
    this.model = process.env.ZAI_MODEL ?? 'glm-5.1';

    if (!this.apiKey) {
      throw new Error('ZAI_API_KEY 環境變數未設定');
    }
  }

  async chat(
    messages: ZaiMessage[],
    options: { temperature?: number; maxTokens?: number } = {},
  ): Promise<string> {
    const body: ZaiChatRequest = {
      model: this.model,
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 2048,
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': 'en-US,en',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Z.ai API 錯誤 ${response.status}: ${error}`);
      throw new InternalServerErrorException('AI 審核服務暫時無法使用');
    }

    const data = (await response.json()) as ZaiChatResponse;
    return data.choices[0]?.message?.content ?? '';
  }

  async jsonChat<T>(
    systemPrompt: string,
    userPrompt: string,
    options: { temperature?: number } = {},
  ): Promise<T> {
    const content = await this.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { ...options, maxTokens: 4096 },
    );

    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) ??
      content.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) {
      this.logger.error('Z.ai 回應無法解析為 JSON', content);
      throw new InternalServerErrorException('AI 審核結果格式錯誤');
    }

    return JSON.parse(jsonMatch[1]) as T;
  }
}
