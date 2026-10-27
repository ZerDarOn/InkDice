export const PROJECT_LINKS = new Set([
  'https://github.com/ZerDarOn',
  'https://github.com/ZerDarOn/InkDice',
  'https://github.com/ZerDarOn/InkDice/issues/new/choose',
]);
export function isProjectLink(url) { return PROJECT_LINKS.has(url); }
