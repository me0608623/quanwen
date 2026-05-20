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
  response_format?: { type: 'json_object' | 'text' };
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
    options: { temperature?: number; maxTokens?: number; jsonMode?: boolean } = {},
  ): Promise<string> {
    const body: ZaiChatRequest = {
      model: this.model,
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 2048,
    };
    if (options.jsonMode) {
      body.response_format = { type: 'json_object' };
    }

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
    const content = data.choices[0]?.message?.content ?? '';
    const finishReason = data.choices[0]?.finish_reason ?? 'unknown';
    // length finish_reason 表示輸出被截斷（reasoning 吃光 token），需要呼叫端注意
    if (finishReason === 'length') {
      this.logger.warn(
        `Z.ai output truncated (finish_reason=length). Consider raising maxTokens. ` +
        `usage=${JSON.stringify(data.usage)}`,
      );
    }
    return content;
  }

  async jsonChat<T>(
    systemPrompt: string,
    userPrompt: string,
    options: { temperature?: number; maxTokens?: number } = {},
  ): Promise<T> {
    // 強化 system prompt 確保 LLM 回 JSON 而不是 markdown
    const enforcedSystem =
      `${systemPrompt}\n\n` +
      '⚠️ 重要：你的回應**必須**是合法 JSON，直接以 { 開頭、以 } 結尾，' +
      '不可包含 markdown code fence、解釋文字或其他內容。';

    const content = await this.chat(
      [
        { role: 'system', content: enforcedSystem },
        { role: 'user', content: userPrompt },
      ],
      // GLM-5.1 reasoning 會吃 token，需要 8000+
      { ...options, maxTokens: options.maxTokens ?? 8000, jsonMode: true },
    );

    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) ??
      content.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) {
      this.logger.error('Z.ai 回應無法解析為 JSON', content.slice(0, 500));
      throw new InternalServerErrorException('AI 審核結果格式錯誤');
    }

    return JSON.parse(jsonMatch[1]) as T;
  }
}
