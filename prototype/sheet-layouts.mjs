// Keep the original field IDs and page ownership while upgrading the workbook layout.
export function prepareSheetMarkup() {
  document.querySelector('#attunementCounter strong').innerHTML='<b id="attunementCount">0</b><i>/</i><b id="attunementLimit">3</b>';
  const featOption = document.querySelector('#libraryKind option[value="feat"]');
  featOption.textContent = '专长';
  featOption.insertAdjacentHTML('afterend','<option value="fighting_style">战斗风格</option>');
  const defenses = document.getElementById('defensesSenses').closest('label');
  const split = document.createElement('div'); split.className = 'defenses-grid';
  split.innerHTML = ['resistances:抗性','immunities:免疫','senses:感官'].map(pair => { const [id,title]=pair.split(':'); return `<label class="combat-senses-field"><span>${title}</span><textarea id="${id}" name="${id}" rows="2" maxlength="1000"></textarea></label>`; }).join('');
  defenses.before(split);
  defenses.querySelector('span').textContent = '旧版合并记录（请核对后分填）'; defenses.id = 'legacyDefenses';
  const effects = document.createElement('div'); effects.id='effectSummary'; effects.className='effect-summary'; effects.setAttribute('role','status');
  document.querySelector('.class-progression-panel').append(effects);
  const grants=document.createElement('details'); grants.className='runtime-panel skill-grants-panel';
  grants.innerHTML='<summary>熟练与专精选择 <span id="skillGrantStatus"></span></summary><div id="skillGrantChoices"></div>';
  document.querySelector('.class-progression-panel').append(grants);
  const advancement=document.createElement('details'); advancement.className='runtime-panel advancement-panel';
  advancement.innerHTML='<summary>属性提升与专长来源 <span id="advancementStatus"></span></summary><div id="advancementChoices"></div>';
  document.querySelector('.class-progression-panel').append(advancement);
  const runtime=document.createElement('details'); runtime.className='runtime-panel'; runtime.innerHTML='<summary>资源与休息</summary><div id="runtimeControls"></div>';
  document.querySelector('.class-progression-panel').after(runtime);
  document.querySelector('.spell-book-context').insertAdjacentHTML('afterend','<div id="spellCapacitySummary" class="effect-summary" role="status"></div>');
  const background = document.createElement('div'); background.id='backgroundAutomation'; background.className='background-automation';
  document.getElementById('backgroundFeature').closest('label').after(background);
  const subclass = document.getElementById('subclass');
  subclass.placeholder = '输入或选择子职业';
  subclass.dataset.suggestKind = 'subclass';
  subclass.removeAttribute('list');
  const combo = document.createElement('div'); combo.className = 'subclass-combo';
  subclass.before(combo); combo.append(subclass);
  combo.insertAdjacentHTML('beforeend','<button type="button" data-subclass-dropdown aria-label="展开初始职业的子职业列表" title="选择子职业">⌄</button>');
  document.getElementById('profileClass').insertAdjacentHTML('afterend','<button type="button" class="level-reset-button" data-reset-level title="重置为初始职业1级" aria-label="重置职业等级">重置</button>');
  const resetDialog = document.createElement('dialog');
  resetDialog.id='levelResetDialog'; resetDialog.className='level-reset-dialog';
  resetDialog.setAttribute('aria-labelledby','levelResetTitle');
  resetDialog.innerHTML='<h2 id="levelResetTitle">重置为初始职业 1 级？</h2><p>移除兼职、经验归零，重算生命、法术位与职业资源。未解锁的子职业会清空，不再符合等级的能力停止自动加成。</p><p>种族、装备、法术记录和能力原文保留；重置后可立即撤销。</p><footer><button type="button" data-reset-cancel autofocus>取消</button><button type="button" data-reset-confirm>确认重置</button></footer>';
  document.getElementById('characterForm').append(resetDialog);
  const proficiency = document.createElement('div'); proficiency.id='proficiencyChoices'; proficiency.className='proficiency-choices';
  document.getElementById('armorTraining').closest('label').after(proficiency);
  const tools=document.createElement('details'); tools.className='runtime-panel proficiency-grants-panel';
  tools.innerHTML='<summary>工具与语言：职业、背景及专长</summary><div id="proficiencyGrantChoices"></div>';
  document.querySelector('.class-progression-panel').append(tools);
  const page = document.querySelector('[data-page-panel="inventory"]');
  const book = document.createElement('section'); book.className='inventory-book';
  book.innerHTML='<section class="sheet-section inventory-inspector"><div class="section-heading"><h2>物品书</h2></div><div id="inventoryInspector"></div></section><div class="inventory-index" id="inventoryIndex"></div>';
  const oldColumns = page.querySelector('.inventory-columns'); oldColumns.before(book);
  const index = book.querySelector('#inventoryIndex');
  while(oldColumns.firstElementChild) index.append(oldColumns.firstElementChild);
  oldColumns.remove();
  index.append(document.getElementById('inventoryContainerList').closest('section'));
  prepareSummaryLayout();
}

function prepareSummaryLayout() {
  const career = document.getElementById('rulesHeading').closest('section');
  const combat = document.getElementById('combatHeading').closest('section');
  const oldCombatColumn = combat.parentElement;
  const overview = document.createElement('div');
  overview.className = 'summary-overview';
  overview.innerHTML = '<div class="summary-overview-fields"></div><aside class="summary-portrait-column"><div id="summaryPortraitDock" aria-label="人物立绘"></div></aside>';
  career.before(overview);
  const abilities = document.getElementById('abilitiesHeading').closest('section');
  abilities.classList.add('summary-abilities');
  const combatRow = document.createElement('div');
  combatRow.className = 'summary-combat-row';
  combatRow.append(abilities, combat);
  overview.firstElementChild.append(combatRow, career);
  career.classList.add('summary-career');
  combat.classList.add('summary-combat');
  if (!oldCombatColumn.children.length) oldCombatColumn.remove();

  // These are the original controls: moving them preserves IDs, values and handlers.
  const choices = document.createElement('div');
  choices.className = 'summary-options';
  const training = document.createElement('div');
  training.className = 'summary-options-column summary-training-column';
  for (const panel of [...career.querySelectorAll('.runtime-panel')]) {
    if (panel.matches('.skill-grants-panel, .proficiency-grants-panel')) training.append(panel);
    else if (panel.matches('.advancement-panel')) choices.append(panel);
    else {
      panel.classList.add('summary-rest-panel');
      overview.querySelector('.summary-portrait-column').append(panel);
    }
  }
  document.getElementById('skillsHeading').closest('section').after(training);
  overview.firstElementChild.append(choices);
  const fields = career.querySelector('.summary-header-grid');
  for (const id of ['classId', 'level', 'subclass', 'rulesetDisplay', 'experience', 'size']) {
    fields.append(document.getElementById(id).closest('label'));
  }
}
