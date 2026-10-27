const STORAGE_KEY = "inkdice.mvp.workspace.v1";

export function loadWorkspace(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY));
    if (!parsed || !Array.isArray(parsed.characters)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveWorkspace(workspace, storage = globalThis.localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(workspace));
}

export function clearWorkspace(storage = globalThis.localStorage) {
  storage.removeItem(STORAGE_KEY);
}

export { STORAGE_KEY };
