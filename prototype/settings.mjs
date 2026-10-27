import { RULE_ENGINES } from "./content.mjs";

export const DEFAULT_SETTINGS = Object.freeze({
  defaultRuleset: "dnd5r-2024",
  aiProfile: null,
});

export function normalizeSettings(raw = {}) {
  const defaultRuleset = RULE_ENGINES[raw.defaultRuleset] ? raw.defaultRuleset : DEFAULT_SETTINGS.defaultRuleset;
  const profile = raw.aiProfile && typeof raw.aiProfile === "object" ? {
    name: String(raw.aiProfile.name ?? "默认服务").slice(0, 60),
    baseUrl: String(raw.aiProfile.baseUrl ?? "").slice(0, 500),
    model: String(raw.aiProfile.model ?? "").slice(0, 120),
    testedAt: String(raw.aiProfile.testedAt ?? ""),
  } : null;
  return { defaultRuleset, aiProfile: profile };
}

export function validateAiProfile(profile) {
  const errors = [];
  let url;
  try {
    url = new URL(profile.baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) errors.push("API 地址必须使用 HTTP 或 HTTPS。");
    if (url.username || url.password) errors.push("API 地址不能包含用户名或密码。");
  } catch {
    errors.push("请输入完整的 API 地址，例如 https://example.com/v1。");
  }
  if (!String(profile.name ?? "").trim()) errors.push("请填写配置名称。");
  if (!String(profile.model ?? "").trim()) errors.push("请填写模型名称。");
  if (!String(profile.apiKey ?? "").trim()) errors.push("请输入 API 密钥后再测试连接。");
  return errors;
}

export function profileSignature(profile) {
  return JSON.stringify([
    String(profile.name ?? "").trim(),
    String(profile.baseUrl ?? "").trim().replace(/\/+$/, ""),
    String(profile.model ?? "").trim(),
    String(profile.apiKey ?? ""),
  ]);
}

export function savedAiProfile(profile, testedAt = new Date().toISOString()) {
  return {
    name: String(profile.name).trim(),
    baseUrl: String(profile.baseUrl).trim().replace(/\/+$/, ""),
    model: String(profile.model).trim(),
    testedAt,
  };
}
