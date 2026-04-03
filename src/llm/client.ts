/**
 * LLM 客户端 — 槽位设计
 *
 * 测试阶段：调用本地代理 http://127.0.0.1:15721
 * 正式使用：作为接口暴露给 Agent 调用，Agent 连接项目中间层 LLM API
 *
 * agent-forge 不在内部管理 LLM 调用，仅提供统一接口
 */

import type { LLMConfig } from "../types/index.js";

// ── LLM 请求/响应类型 ──

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  max_tokens: number;
  temperature: number;
  stream?: boolean;
}

export interface LLMResponse {
  content: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

// ── LLM 客户端接口（可替换实现） ──

export interface ILLMClient {
  chat(messages: LLMMessage[], systemPrompt?: string): Promise<LLMResponse>;
}

/**
 * 默认 LLM 客户端实现
 * 通过 HTTP 调用本地代理或远程 API
 */
export class LLMClient implements ILLMClient {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async chat(messages: LLMMessage[], systemPrompt?: string): Promise<LLMResponse> {
    const allMessages: LLMMessage[] = [];
    if (systemPrompt) {
      allMessages.push({ role: "system", content: systemPrompt });
    }
    allMessages.push(...messages);

    const body: LLMRequest = {
      model: this.config.model,
      messages: allMessages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LLM 调用失败 [${response.status}]: ${text}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    return {
      content: data.choices[0]?.message?.content ?? "",
      usage: data.usage ? {
        input_tokens: data.usage.prompt_tokens,
        output_tokens: data.usage.completion_tokens,
      } : undefined,
    };
  }
}

/**
 * 创建 LLM 客户端
 * 支持注入自定义实现（用于测试或集成）
 */
export function createLLMClient(config: LLMConfig): ILLMClient {
  return new LLMClient(config);
}
