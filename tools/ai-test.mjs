// Shared by the browser preview and the desktop protocol. Never logs credentials.
export async function testAiConnection(body, request = fetch) {
  const apiKey = String(body?.apiKey ?? '').trim();
  const safeMessage = value => { const message=String(value);return (apiKey?message.split(apiKey).join('[密钥已隐藏]'):message).slice(0,300); };
  try {
    const baseUrl = new URL(String(body.baseUrl ?? ''));
    if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password) throw new Error('API 地址无效。');
    const model = String(body.model ?? '').trim();
    if (!model || !apiKey) throw new Error('模型名称和 API 密钥不能为空。');
    const normalizedPath = baseUrl.pathname.replace(/\/+$/, '');
    if (!normalizedPath.endsWith('/chat/completions')) baseUrl.pathname = `${normalizedPath}/chat/completions`;
    const upstream = await request(baseUrl, {
      method: 'POST',
      redirect: 'error',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], max_tokens: 3, temperature: 0 }),
      signal: AbortSignal.timeout(15000),
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return { status: 422, ok: false, message: safeMessage(payload?.error?.message ?? `上游返回 HTTP ${upstream.status}`) };
    if (typeof payload?.choices?.[0]?.message?.content !== 'string' || !payload.choices[0].message.content.trim()) return { status: 422, ok: false, message: '服务已响应，但没有返回兼容的非空聊天内容。' };
    return { status: 200, ok: true, message: '连接成功，已收到兼容响应。' };
  } catch (error) {
    return { status: 400, ok: false, message: error?.name === 'TimeoutError' ? '连接测试超时（15 秒）。' : safeMessage(error?.message ?? error) };
  }
}
