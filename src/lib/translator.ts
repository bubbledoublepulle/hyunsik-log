/** DeepSeek API Key 在 localStorage 中的存储键（单条编辑与批量编辑共用） */
export const DEEPSEEK_KEY_STORAGE = "hsik_deepseek_key";

const SYSTEM_PROMPT = `你是一位专业的韩翻中翻译助手，擅长翻译韩国偶像团体的社交媒体公告、社交平台动态、youtube视频标题

【翻译规则】
1. 所有韩文内容必须完整翻译成中文，不允许遗漏任何文字
2. 保留所有话题标签（#xxx），标签内的韩文可翻译为中文后保留原标签
3. 保留所有@提及和表情符号
4. 保留英文部分（如艺人英文名、节目英文名），主要翻译的艺人为韩国男团BTOB，翻译的成员名字以BTOB成员汉字名为准
5. 节目名称、电台名称等专有名词保留原名，可在括号内加注中文
6. 时间、日期、数字照原文保留
7. 保持原文的换行和分段格式
8."현식시"统一翻译成"炫植时"、"꼬옥"统一翻译成"紧紧拥抱"

【输出要求】
- 只返回翻译后的纯文本
- 不要解释、不要添加"翻译如下"等前缀
- 不要遗漏任何一行内容`;

/**
 * 调用 DeepSeek 将文本翻译为中文。
 * 成功返回译文；失败（网络错误 / 接口报错 / 返回与原文相同）返回空串，
 * 由调用方决定如何提示，绝不拿原文冒充译文。
 */
export async function translateToChinese(text: string, apiKey: string): Promise<string> {
  const maxRetries = 2;
  let attempts = 0;
  let translated = "";

  while (attempts <= maxRetries && !translated) {
    try {
      const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: text },
          ],
          temperature: 0.1,
        }),
      });
      const data = await resp.json();
      const raw: string | undefined = data.choices?.[0]?.message?.content;
      if (raw) {
        const trimmed = raw.trim();
        // 返回了内容且和原文不一样，才算翻译成功
        if (trimmed && trimmed !== text) {
          translated = trimmed;
        }
      }
    } catch {
      // 网络错误，继续重试
    }
    attempts++;
    if (!translated && attempts <= maxRetries) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return translated;
}
