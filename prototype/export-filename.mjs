// Keep both export formats on the same character-name/player-name convention.
function filenamePart(value, fallback) {
  return String(value ?? '').trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 80).replace(/[. ]+$/g, '') || fallback;
}
export function characterExportBasename(character) {
  return `${filenamePart(character.name, '未命名角色')}-${filenamePart(character.player, '未填写玩家')}`;
}
