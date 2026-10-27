import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSettings, profileSignature, savedAiProfile, validateAiProfile } from "../prototype/settings.mjs";

test("settings accept D&D and CoC rule engine identifiers", () => {
  assert.equal(normalizeSettings({ defaultRuleset: "dnd5e-2014" }).defaultRuleset, "dnd5e-2014");
  assert.equal(normalizeSettings({ defaultRuleset: "coc-7e" }).defaultRuleset, "coc-7e");
  assert.equal(normalizeSettings({ defaultRuleset: "unknown" }).defaultRuleset, "dnd5r-2024");
});

test("AI profile validation rejects unsafe or incomplete inputs", () => {
  assert.ok(validateAiProfile({ name: "", baseUrl: "file:///tmp", model: "", apiKey: "" }).length >= 3);
  assert.deepEqual(validateAiProfile({ name: "本地模型", baseUrl: "http://127.0.0.1:11434/v1", model: "test", apiKey: "local" }), []);
});

test("saved AI profile never contains the API key", () => {
  const input = { name: "服务", baseUrl: "https://example.com/v1/", model: "model", apiKey: "secret" };
  const saved = savedAiProfile(input, "2026-10-25T00:00:00.000Z");
  assert.equal(saved.baseUrl, "https://example.com/v1");
  assert.equal("apiKey" in saved, false);
  assert.equal(profileSignature(input).includes("secret"), true);
});
