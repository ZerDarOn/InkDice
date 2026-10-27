const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// The index navigates only. All mutations live in the facing spell-book page.
export function renderSpellIndexRow(spell, index, selectedId) {
  const name = spell.name || '未命名法术';
  const rank = Number(spell.level) === 0 ? '戏法' : `${spell.level} 环`;
  const prepared = spell.prepared ? '已备' : '未备';
  return `<button type="button" class="spell-ledger-row${spell.id === selectedId ? ' is-selected' : ''}" data-select-spell="${escape(spell.id)}" ${spell.id === selectedId ? 'aria-current="true"' : ''} aria-label="查看第 ${index + 1} 项：${escape(name)}，${escape(rank)}，${prepared}"><span>${index + 1}</span><span class="spell-index-rank">${escape(rank)}</span><span class="spell-index-name">${escape(name)}</span><span class="spell-index-prepared">${prepared}</span></button>`;
}
