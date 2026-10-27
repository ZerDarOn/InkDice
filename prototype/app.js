import { ABILITIES, ARMORS, CLASSES, RULE_ENGINES, RULESETS, SKILLS } from "./content.mjs";
import {isCoc,COC_PAGES,deriveCoc,validateCoc} from './coc/model.mjs';
import {createCocView} from './coc/view.mjs';
import {cocLibraryRequest,COC_KINDS} from './coc/library.mjs';
import { backgroundAbilityOptions, characterEffects, effectiveProficiencies, PROFICIENCY_OPTIONS } from './effects.mjs';
import { characterExportBasename } from './export-filename.mjs';
import { appendImportedFeatures, switchSpeciesFeatures, syncSpeciesFeatures, speciesContext } from './feature-import.mjs';
import { prepareSheetMarkup } from './sheet-layouts.mjs';
import { setupFeaturePanels, refreshFeaturePanels } from './feature-panels.mjs';
import { resetCharacterLevel } from './level-reset.mjs';
import { ATTUNEMENT_LIMIT, EQUIPMENT_SLOTS, buildTrace, createCharacter, deriveMvpCharacter, exportDocument, getAttunedEquipment, importDocument, normalizeCharacter, normalizeWeapon, orderSpellsForBook, signed, validateCharacter } from "./model.mjs";
import { normalizeSettings, profileSignature, savedAiProfile, validateAiProfile } from "./settings.mjs";
import { loadWorkspace, saveWorkspace } from "./store.mjs";
import { WEAPON_CATALOG_5R } from "./weapon-catalog-5r.mjs";
import { catalogSpellRanks, curioPatchFromEntry, itemPatchFromEntry, mergeCatalogFields, spellPatchFromEntry, spellRankConflict, suggestionSearchParams, weaponPatchFromEntry } from "./suggestions.mjs";
import { characterClasses, entryEligibility, multiclassIssues, spellClassNames, spellProgression, syncCharacterSlots, totalLevel } from "./character-rules.mjs";
import { renderSpellIndexRow } from './spell-index.mjs';
import { weaponCalculation, resourceDefinitions, spellCapacity, completeRest, castSpell, spendHitDie, loadSummary } from './automation.mjs';
import { mergeCreatureEntry } from './suggestions.mjs';
import { hitDiceState, hitDiceRecovery, syncHitDice, setHitDiceAllocation } from './hit-dice.mjs';
import { skillChoiceLabel } from './skill-grants.mjs';
import { advancementSlots, featChoiceKey } from './advancement.mjs';
import { startingEquipmentPlan,applyStartingEquipment,undoStartingEquipment } from './starting-equipment.mjs';
import { catalogUnitWeight } from './suggestions.mjs';
import { featureFillEffects, normalizeFillEffects } from './fill-effects.mjs';
import { renderFillEffectEditor, EFFECT_MODES } from './fill-effect-editor.mjs';
import { assistantTasks, assistantAiStatus, assistantGeometry } from './assistant-state.mjs';
import { EXPERIENCE_THRESHOLDS, experienceProgress, experienceHint } from './experience.mjs';
import {installDicePanel} from './dice-view.mjs';
import {installPackManager} from './pack-manager.mjs';
import {extendedLibraryRequest} from './content-packs.mjs';
import {installAiChat} from './ai-chat-view.mjs';
import {installAbout} from './about.mjs';

prepareSheetMarkup();
const elements = Object.fromEntries([...document.querySelectorAll("[id]")].map((element) => [element.id, element]));
elements.speciesImportSources=document.createElement('div');
elements.speciesImportSources.className='species-import-sources';
elements.speciesImportStatus.after(elements.speciesImportSources);
elements.subrace.dataset.suggestKind='species';
elements.speciesHistory=document.createElement('details');
elements.speciesHistory.className='species-feature-history';
elements.speciesImportSources.after(elements.speciesHistory);
const AI_SESSION_KEY = "inkdice.ai.session-key.v1";
const SIDEBAR_STATE_KEY = "inkdice.sidebar-collapsed.v1";
const ASSISTANT_POSITION_KEY = "inkdice.assistant-position.v1";
const ABILITY_ABBREVIATIONS = { str: "Str", dex: "Dex", con: "Con", int: "Int", wis: "Wis", cha: "Cha" };
const ATTUNEMENT_FIELDS = new Set(EQUIPMENT_SLOTS.map(({ attunementField }) => attunementField));
const CURIO_SLOTS = "全头 头部 头发 面部 颈部 身体 肩膀 胸前 背后 腰部 胯间 左脚 右脚 双脚 左腿 右腿 双腿 左手 右手 双手 左臂 右臂 双臂 全身".split(" ");
const CHARACTER_PAGES = [
  { id: "character", label: "人物" },
  { id: "summary", label: "主要情况" },
  { id: "spells", label: "施法" },
  { id: "creatures", label: "部署生物" },
  { id: "inventory", label: "背包" },
];
const initialCharacter = createCharacter({
  name: "烬羽",
  classId: "bard",
  level: 5,
  abilities: { str: 8, dex: 16, con: 14, int: 10, wis: 12, cha: 18 },
  armorId: "studdedLeather",
  skills: { performance: 2, persuasion: 1, perception: 1, stealth: 1 },
  background: "远行艺人",
  personality: "总会先听完别人的故事，再决定是否相信对方。",
  ideal: "自由。道路不该只通向别人替我选择的终点。",
  bond: "随身保存着旧剧团唯一留下的节目单。",
  flaw: "一旦有人质疑我的技艺，我很难及时收手。",
  notes: "用于验证 MVP 派生值与导入导出的示例人物。",
});

const loaded = loadWorkspace();
let workspace = loaded ? {
  ...loaded,
  characters: loaded.characters.map((character) => normalizeCharacter(character)),
  settings: normalizeSettings(loaded.settings),
} : { activeId: initialCharacter.id, characters: [initialCharacter], theme: "dark", settings: normalizeSettings() };
let activeCharacter = null;
let selectedTrace = "armorClass";
let saveTimer = null;
let toastTimer = null;
let verifiedAiSignature = null;
let activePage = "character";
let activeSpellId = null;
let activeInventoryId = null;
let lastResourceOperation = null;
let expandedCharacterId = workspace.activeId ?? null;
let createWizardStep = 1;
let pendingDeleteId = null;
let lastDeletedCharacter = null;
let libraryOffset = 0;
let selectedLibraryId = null;
let librarySearchTimer = null;
let libraryRequestId = 0;
let libraryBooks = [];
let suggestionState = null;
let suggestionTimer = null;
let suggestionRequestId = 0;
const spellRankCache = new Map();
let spellRankStatusRequestId = 0;
let suppressSuggestionFocus = false;
let knowledgeRequestId = 0;
let knowledgeTimer = null;
let assistantPosition = null;
let assistantDrag = null;
let assistantRefreshQueued=false;
let assistantContextKey='';
let assistantLibraryRequest=0;
let suppressOrbClick = false;
let rulebookRuleset = null;
let rulebookKind = "";
let rulebookRequestId = 0;
let rulebookDetailRequestId = 0;
let rulebookSearchTimer = null;
const classCatalog = new Map();
const cocRoot=document.createElement('div');cocRoot.id='cocWorkspace';cocRoot.className='coc-workspace';cocRoot.hidden=true;elements.characterForm.after(cocRoot);
const cocView=createCocView(cocRoot,{changed:()=>{markDirty();renderCharacterList();elements.characterTitle.textContent=activeCharacter.name||'新调查员';},portrait:async file=>{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8000000)throw Error('请选择8MB以内PNG、JPEG或WebP');return resizePortrait(file);},toast:showToast});
const characterPages=c=>isCoc(c)?COC_PAGES:CHARACTER_PAGES;
const dndLibraryKinds=elements.libraryKind.innerHTML;
const dndTraceOptions=elements.assistantTraceSelect.innerHTML;
const diceView=installDicePanel(()=>activeCharacter);
const aiChat=installAiChat({getCharacter:()=>activeCharacter,getProfile:()=>({...workspace.settings.aiProfile,apiKey:sessionStorage.getItem(AI_SESSION_KEY)||''}),readLibrary:libraryGet,openSettings:()=>{toggleAssistant(false);openSettings();}});
installPackManager({getRuleset:()=>libraryRuleset(),toast:showToast,changed:()=>{
  aiChat.invalidate();
  closeSuggestions();suggestionRequestId++;libraryRequestId++;knowledgeRequestId++;rulebookRequestId++;rulebookDetailRequestId++;spellRankCache.clear();
  elements.assistantKnowledgeResults.textContent='资料包状态已更新，请重新查询。';
  if(rulebookRuleset)openRulebook(rulebookRuleset);
  if(isCoc(activeCharacter))cocRoot.querySelectorAll('.coc-options').forEach(el=>el.hidden=true);
  refreshAssistantLibrary();
}});

function initializeOptions() {
  elements.classId.innerHTML = Object.entries(CLASSES).map(([id, item]) => `<option value="${id}">${item.name}</option>`).join("");
  elements.armorId.innerHTML = Object.entries(ARMORS).map(([id, item]) => `<option value="${id}">${item.name} · 基础 ${item.base}</option>`).join("");
  elements.abilityGrid.innerHTML = Object.entries(ABILITIES).map(([id, label]) => `
    <label class="ability-field" for="ability-${id}">
      <span>${label}</span>
      <input id="ability-${id}" data-ability="${id}" type="number" min="1" max="30" step="1" inputmode="numeric" aria-describedby="ability-${id}-meta" />
      <small id="ability-${id}-meta"><strong data-ability-mod="${id}">+0</strong><span data-ability-save="${id}" aria-label="${label}豁免">豁免 +0</span><em data-ability-error="${id}"></em></small>
    </label>`).join("");
  elements.skillGrid.innerHTML = Object.entries(SKILLS).map(([id, item]) => `
    <button class="skill-row" type="button" data-skill="${id}" aria-pressed="false">
      <span class="skill-rank" aria-hidden="true"></span>
      <span class="skill-name"><strong>${item.name}</strong><small>${ABILITIES[item.ability]}</small></span>
      <span class="skill-value" data-skill-value="${id}">+0</span>
      <span class="skill-state">未熟练</span>
    </button>`).join("");
  elements.ruleEngineOptions.innerHTML = Object.entries(RULE_ENGINES).filter(([id, engine]) => engine.status === "installed" && RULESETS[id]).map(([id, engine]) => `
    <button class="engine-option" type="button" data-open-rulebook="${id}" aria-expanded="false" aria-controls="rulebookReader">
      <span class="engine-cover-mark" aria-hidden="true">${id === "coc-7e" ? "C" : id === "dnd5r-2024" ? "R" : "E"}</span>
      <span><strong>${engine.name}</strong><small>${RULESETS[id].fullName}</small></span>
      <em>打开查看</em>
    </button>`).join("");
  elements.createSystemOptions.innerHTML = Object.entries(RULE_ENGINES).map(([id, engine]) => {
    const available = engine.status === "installed" && Boolean(RULESETS[id]);
    return `<label class="create-system-option${available ? "" : " is-unavailable"}">
      <input type="radio" name="createRuleset" value="${id}" ${available ? "" : "disabled"} />
      <span><strong>${engine.name}</strong><small>${engine.detail}</small></span>
      <em>${available ? "可创建" : "等待规则插件"}</em>
    </label>`;
  }).join("");
}

function bindEvents() {
  let resetOwnerId = null;
  document.querySelector('[data-reset-level]').addEventListener('click', async () => {
    resetOwnerId = activeCharacter.id;
    await loadClassCatalog();
    if (activeCharacter.id !== resetOwnerId) return;
    if (!classCatalog.has(activeCharacter.ruleset)) return showToast('职业资料未载入，暂不能核对子职业；请稍后重试。');
    closeSuggestions(); elements.levelResetDialog.showModal();
  });
  elements.levelResetDialog.querySelector('[data-reset-cancel]').addEventListener('click', () => elements.levelResetDialog.close());
  elements.levelResetDialog.querySelector('[data-reset-confirm]').addEventListener('click', () => {
    if (activeCharacter.id !== resetOwnerId) return elements.levelResetDialog.close();
    const owner = activeCharacter, before = structuredClone(owner);
    Object.assign(owner, resetCharacterLevel(owner, classCatalog.get(owner.ruleset)));
    lastResourceOperation = null;
    elements.levelResetDialog.close();
    hydrateForm(); markDirty(); render();
    const signature = c => JSON.stringify({...c, updatedAt:''});
    const after = signature(owner);
    showToast('已回到初始职业1级；旧能力原文保留，未解锁效果已停用。', {label:'撤销重置',duration:12000,action:()=>{
      if (!workspace.characters.includes(owner) || signature(owner) !== after) return showToast('人物已有后续修改，未覆盖新数据；无法直接撤销重置。');
      Object.assign(owner,before);
      if (activeCharacter === owner) {hydrateForm();render();}
      markDirty();
    }});
  });
  elements.characterForm.addEventListener('pointerdown', event => {
    if (event.target.closest('[data-subclass-dropdown]')) event.preventDefault();
  });
  window.addEventListener('beforeunload', () => {
    if (saveTimer && activeCharacter) { clearTimeout(saveTimer); saveTimer = null; persist(false); }
  });
  elements.characterForm.addEventListener('change', async (event) => {
    const input = event.target;
    if (!input.dataset.creaturePortrait) return;
    const owner = activeCharacter;
    const creature = owner.deployedCreatures.find(c => c.id === input.dataset.creaturePortrait);
    const file = input.files?.[0];
    if (!file || !creature) return;
    try {
      if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 8_000_000) throw new Error('请选择8MB以内的PNG、JPEG或WebP图片');
      const portrait = await resizePortrait(file);
      if (portrait.length > 1_800_000) throw new Error('图片压缩后仍过大');
      if (owner !== activeCharacter || !owner.deployedCreatures.includes(creature)) return;
      creature.portrait = portrait; markDirty(); renderCollections(deriveMvpCharacter(activeCharacter));
    } catch(error) { showToast(error.message); }
  });
  elements.addMulticlass.addEventListener("click", () => {
    if (totalLevel(activeCharacter) >= 20) return showToast("总等级已达20，请先调整现有职业等级。");
    const owned = characterClasses(activeCharacter).map((c) => c.classId);
    const classId = Object.keys(CLASSES).find((id) => !owned.includes(id));
    if (!classId) return;
    activeCharacter.multiclasses.push({ classId, level: 1, subclass: "" });
    syncCharacterSlots(activeCharacter); markDirty(); render();
  });
  elements.fillClassFeatures.addEventListener("click", fillAvailableClassFeatures);
  elements.fillSpeciesFeatures.addEventListener("click", () => fillAvailableFeatures('species'));
  elements.spellcastingClass.addEventListener("change", () => {
    activeCharacter.spellcastingClassId = elements.spellcastingClass.value;
    closeSuggestions(); markDirty(); render();
  });
  elements.characterForm.addEventListener("input", handleFormInput);
  elements.characterForm.addEventListener("change", handleFormInput);
  elements.characterForm.addEventListener("focusin", handleSuggestionFocus);
  elements.characterForm.addEventListener("input", handleSuggestionInput);
  elements.characterForm.addEventListener("keydown", handleSuggestionKeydown);
  elements.characterForm.addEventListener("focusout", (event) => setTimeout(() => {
    if (suggestionState?.input === event.target && document.activeElement !== event.target
      && !elements.suggestionPopover.contains(document.activeElement)) closeSuggestions();
  }, 120));
  elements.suggestionPopover.addEventListener("pointerdown", (event) => event.preventDefault());
  elements.suggestionPopover.addEventListener("click", (event) => {
    if (event.target.closest('[data-suggestion-more]')) return loadMoreSuggestions();
    const option = event.target.closest("[data-suggestion-index]");
    if (option) selectSuggestion(Number(option.dataset.suggestionIndex));
  });
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest("#suggestionPopover, [data-suggest-kind]")) closeSuggestions();
  });
  document.addEventListener("scroll", positionSuggestions, true);
  window.addEventListener("resize", positionSuggestions);
  document.querySelector(".profile-pane").addEventListener("input", handleFormInput);
  document.querySelector(".profile-pane").addEventListener("change", handleFormInput);
  elements.skillGrid.addEventListener("click", handleSkillClick);
  elements.characterList.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-character]");
    if (deleteButton) {
      openDeleteCharacter(deleteButton.dataset.deleteCharacter);
      return;
    }
    const pageButton = event.target.closest("[data-character-page]");
    if (pageButton) {
      if (pageButton.dataset.characterOwner !== activeCharacter.id) selectCharacter(pageButton.dataset.characterOwner);
      selectCharacterPage(pageButton.dataset.characterPage);
      return;
    }
    const button = event.target.closest("[data-character-id]");
    if (button) {
      const id = button.dataset.characterId;
      if (id === activeCharacter.id) {
        expandedCharacterId = expandedCharacterId === id ? null : id;
        renderCharacterList();
      } else {
        expandedCharacterId = id;
        selectCharacter(id);
      }
    }
  });
  document.querySelectorAll("[data-trace]").forEach((button) => button.addEventListener("click", () => {
    selectedTrace = button.dataset.trace;
    selectPanel("rules");
    toggleAssistant(true);
    renderAssistant();
  }));
  document.querySelectorAll(".assistant-tabs button").forEach((button) => {button.tabIndex=button.classList.contains('is-active')?0:-1;button.addEventListener("click", () => selectPanel(button.dataset.panel));});
  elements.assistantOrb.addEventListener("click", (event) => {
    if (suppressOrbClick) { event.preventDefault(); suppressOrbClick = false; return; }
    toggleAssistant(elements.assistantPopover.hidden);
  });
  elements.assistantOrb.addEventListener("pointerdown", startAssistantDrag);
  elements.assistantOrb.addEventListener("pointermove", moveAssistantDrag);
  elements.assistantOrb.addEventListener("pointerup", endAssistantDrag);
  elements.assistantOrb.addEventListener("pointercancel", endAssistantDrag);
  elements.assistantOrb.addEventListener("keydown", (event) => {
    if (!event.altKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") return setAssistantPosition(innerWidth - 82, innerHeight - 82, true);
    setAssistantPosition(assistantPosition.x + (event.key === "ArrowRight" ? 24 : event.key === "ArrowLeft" ? -24 : 0), assistantPosition.y + (event.key === "ArrowDown" ? 24 : event.key === "ArrowUp" ? -24 : 0), true);
  });
  elements.assistantReposition.addEventListener("click", cycleAssistantCorner);
  elements.assistantClose.addEventListener('click',()=>{toggleAssistant(false);elements.assistantOrb.focus();});
  elements.assistantTraceSelect.addEventListener('change',()=>{selectedTrace=elements.assistantTraceSelect.value;refreshAssistant();});
  elements.assistantAiSettings.addEventListener('click',()=>{toggleAssistant(false);openSettings();});
  elements.assistantLibraryRetry.addEventListener('click',refreshAssistantLibrary);
  elements.adviceTab.textContent='待办';
  elements.adviceCard.addEventListener('click',event=>{const button=event.target.closest('[data-assistant-target]');if(button) focusField(button.dataset.assistantTarget);});
  document.querySelector('.assistant-tabs').addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const tabs=[...document.querySelectorAll('.assistant-tabs button')],index=tabs.indexOf(document.activeElement);
    if(index<0) return;event.preventDefault();
    const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
    selectPanel(tabs[next].dataset.panel);tabs[next].focus();
  });
  elements.assistantKnowledgeQuery.addEventListener("input", queueKnowledgeSearch);
  elements.assistantKnowledgeResults.addEventListener("click", (event) => {
    const entry = event.target.closest("[data-knowledge-entry]");
    if (!entry) return;
    toggleAssistant(false);
    openLibrary().then(() => loadLibraryEntry(entry.dataset.knowledgeEntry));
  });
  window.addEventListener("resize", () => { if (assistantPosition) setAssistantPosition(assistantPosition.x, assistantPosition.y, true); });
  document.addEventListener("pointerdown", (event) => {
    if (!elements.assistantPopover.hidden && !event.target.closest(".assistant-float") && !event.target.closest("[data-trace]")) toggleAssistant(false);
  });
  elements.newCharacter.addEventListener("click", openCreateCharacter);
  elements.sidebarToggle.addEventListener("click", () => applySidebarState(!document.querySelector(".app-shell").classList.contains("is-sidebar-collapsed"), true));
  elements.createNext.addEventListener("click", () => setCreateWizardStep(2));
  elements.createBack.addEventListener("click", () => setCreateWizardStep(1));
  elements.createCancel.addEventListener("click", closeCreateCharacter);
  elements.createCancelTop.addEventListener("click", closeCreateCharacter);
  elements.createCharacterDialog.addEventListener("click", (event) => { if (event.target === elements.createCharacterDialog) closeCreateCharacter(); });
  elements.createCharacterWizard.addEventListener("submit", createNewCharacter);
  elements.createSystemOptions.addEventListener('change', renderCreateSelection);
  elements.addSpell.addEventListener("click", () => addCollectionRecord("spells"));
  elements.addCreature.addEventListener("click", () => addCollectionRecord("deployedCreatures"));
  elements.addInventoryItem.addEventListener("click", () => addCollectionRecord("inventory", { section: "quick" }));
  elements.addSelfItem.addEventListener("click", () => addCollectionRecord("inventory", { section: "self" }));
  elements.addContainerItem.addEventListener("click", () => addCollectionRecord("inventory", { section: "container" }));
  elements.addLedgerEntry.addEventListener("click", () => addCollectionRecord("ledger"));
  elements.characterForm.addEventListener("click", handleCollectionClick);
  elements.confirmDeleteCharacter.addEventListener("click", confirmDeleteCharacter);
  elements.saveButton.addEventListener("click", () => persist(true));
  elements.importButton.addEventListener("click", () => elements.importFile.click());
  elements.importFile.addEventListener("change", importCharacterFile);
  elements.exportButton.addEventListener("click", exportCharacterFile);
  elements.closeExport.addEventListener('click', () => elements.exportDialog.close());
  elements.exportExcel.addEventListener('click', exportExcelFile);
  elements.exportJson.addEventListener('click', exportJsonFile);
  elements.printButton.addEventListener("click", () => window.print());
  elements.themeToggle.addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true));
  elements.portraitUpload.addEventListener("click", () => elements.portraitFile.click());
  elements.portraitFile.addEventListener("change", importPortrait);
  elements.portraitClear.addEventListener("click", clearPortrait);
  elements.settingsButton.addEventListener("click", openSettings);
  elements.libraryButton.addEventListener("click", openLibrary);
  elements.libraryClose.addEventListener("click", () => elements.libraryDialog.close());
  elements.libraryDialog.addEventListener("click", (event) => { if (event.target === elements.libraryDialog) elements.libraryDialog.close(); });
  elements.libraryQuery.addEventListener("input", () => {
    clearTimeout(librarySearchTimer);
    librarySearchTimer = setTimeout(() => { libraryOffset = 0; loadLibraryResults(); }, 180);
  });
  elements.libraryKind.addEventListener("change", () => { libraryOffset = 0; loadLibraryResults(); });
  elements.libraryRank.addEventListener("change", () => { libraryOffset = 0; loadLibraryResults(); });
  elements.librarySourceGroup.addEventListener('change',()=>{libraryOffset=0;renderLibraryBooks();loadLibraryResults();});
  elements.libraryBook.addEventListener('change',()=>{libraryOffset=0;loadLibraryResults();});
  elements.libraryResetFilters.addEventListener('click',()=>{
    for(const key of ['libraryQuery','libraryKind','libraryRank','librarySourceGroup','libraryBook'])elements[key].value='';
    libraryOffset=0;renderLibraryBooks();loadLibraryResults();
  });
  elements.libraryPrevious.addEventListener("click", () => { libraryOffset = Math.max(0, libraryOffset - 30); loadLibraryResults(); });
  elements.libraryNext.addEventListener("click", () => { libraryOffset += 30; loadLibraryResults(); });
  elements.libraryResults.addEventListener("click", (event) => {
    const button = event.target.closest("[data-library-id]");
    if (button) loadLibraryEntry(button.dataset.libraryId);
  });
  elements.settingsDialog.addEventListener("click", (event) => { if (event.target === elements.settingsDialog) elements.settingsDialog.close(); });
  elements.settingsDialog.addEventListener("close", () => closeRulebook(false));
  elements.ruleEngineOptions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-rulebook]");
    if (button) openRulebook(button.dataset.openRulebook);
  });
  elements.rulebookClose.addEventListener("click", () => closeRulebook());
  elements.rulebookKinds.addEventListener("click", (event) => {
    const button = event.target.closest("[data-rulebook-kind]");
    if (!button) return;
    rulebookKind = button.dataset.rulebookKind;
    elements.rulebookKinds.querySelectorAll("[data-rulebook-kind]").forEach((item) => item.setAttribute("aria-pressed", item === button ? "true" : "false"));
    loadRulebookResults();
  });
  elements.rulebookQuery.addEventListener("input", () => {
    clearTimeout(rulebookSearchTimer);
    rulebookSearchTimer = setTimeout(loadRulebookResults, 180);
  });
  elements.rulebookResults.addEventListener("click", (event) => {
    const button = event.target.closest("[data-rulebook-entry]");
    if (button) loadRulebookEntry(button.dataset.rulebookEntry);
  });
  elements.spellSlotAutoFill.addEventListener("click", () => {
    if (!syncCharacterSlots(activeCharacter, { preserveSpent: false })) return;
    markDirty();
    renderCollections(deriveMvpCharacter(activeCharacter));
    showToast("已按职业组合重算法术位并补满；契约法术位单独记录。");
  });
  [elements.aiProfileName, elements.aiBaseUrl, elements.aiModel, elements.aiApiKey].forEach((input) => input.addEventListener("input", invalidateAiTest));
  elements.testAiConnection.addEventListener("click", testAiConnection);
  elements.saveAiSettings.addEventListener("click", saveAiSettings);
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); persist(true); }
    if (event.key === "Escape" && !elements.assistantPopover.hidden) toggleAssistant(false);
  });
}

const LIBRARY_KIND_NAMES = { spell: "法术", spell_progression: "施法进度", class: "职业", class_feature: "职业能力", feature_option: "能力选项", background: "背景", weapon: "武器", armor: "护甲", curio: "奇物", item: "普通物品", tool: "工具", weapon_mastery: "武器精通", species: "种族/物种", species_trait: "种族特性", feat: "专长/战斗风格", creature: "魔宠/部署生物", bastion: "据点设施", reference: "规则与资料正文", magic_item: "其他魔法物品/神器" };
const formatLibraryValue = (value) => Array.isArray(value) ? value.join("、") : typeof value === "object" ? Object.entries(value).map(([key, item]) => `${key}：${item}`).join("；") : value;
Object.assign(LIBRARY_KIND_NAMES, { feat: '专长', fighting_style: '战斗风格', species_feature:'种族特性' });
const libraryKindName=(kind,ruleset=libraryRuleset()) => (ruleset==='coc-7e'?COC_KINDS:LIBRARY_KIND_NAMES)[kind] || kind;
const libraryRuleset = () => isCoc(activeCharacter)?'coc-7e':activeCharacter?.ruleset === "dnd5r-2024" ? "dnd5r-2024" : "dnd5e-2014";
const libraryEdition = () => RULESETS[libraryRuleset()].shortName;

initializeOptions();
bindEvents();
setupFeaturePanels(elements.characterForm, elements.suggestionPopover, closeSuggestions);
selectCharacter(workspace.activeId ?? workspace.characters[0]?.id);
applyTheme(workspace.theme ?? "dark");
applySidebarState(loadSidebarState());
initializeAssistantPosition();
installAbout();

async function libraryGet(path) { return extendedLibraryRequest(path,baseLibraryGet); }
async function baseLibraryGet(path) {
  if(new URL(path,location.href).searchParams.get('ruleset')==='coc-7e')return cocLibraryRequest(path);
  const response = await fetch(path, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `读取失败（HTTP ${response.status}）`);
  return data;
}

function suggestionKind(input) {
  return input?.matches?.("input[data-suggest-kind]") ? input.dataset.suggestKind : null;
}

function spellRankForSuggestion(input) {
  if (input?.dataset.suggestKind !== "spell") return null;
  const spell = activeCharacter.spells.find((item) => item.id === input.dataset.recordId);
  const rank = Number(spell?.level);
  return spell && Number.isInteger(rank) && rank >= 0 && rank <= 9 ? rank : null;
}

function spellSourceClass(spell) {
  const casters = spellProgression(activeCharacter).classes.filter((c) => c.kind !== "none");
  return spell?.castingClassId || (casters.some((c) => c.classId === activeCharacter.spellcastingClassId) ? activeCharacter.spellcastingClassId : casters[0]?.classId || "other");
}
function suggestionCharacterContext() {
  const c = activeCharacter;
  return { ruleset: c.ruleset, classId: c.classId, level: c.level, subclass: c.subclass, multiclasses: c.multiclasses,
    abilities: characterEffects(c).abilities, species: c.species, speciesEntryId:c.speciesEntryId, subrace: c.subrace, armorTraining: c.armorTraining,
    speciesReferences: Object.fromEntries(c.featureEntries.filter(f=>f.catalogEntry?.ruleset===c.ruleset && f.catalogEntry?.payload?.规则关联?.species===c.species)
      .map(f=>[f.catalogEntry.payload.规则关联.sourceChoice||f.catalogEntry.payload.规则关联.speciesOption,f.catalogEntry.payload.来源参考条目])
      .concat([...document.querySelectorAll('[data-species-import-source]')].filter(el=>el.value).map(el=>[el.dataset.speciesImportSource,el.value]))),
    spells: c.spells.some((s) => s.name.trim()) ? [{ name: "已有法术" }] : [],
    featureEntries: c.featureEntries.filter((f) => /战斗风格|武技训练|战斗学徒|超魔|魔能学徒|魔能导师|[链刃书符]之魔契/.test(f.name)).map((f) => ({ name: f.name })) };
}
function suggestionContextOptions(input) {
  const spell = activeCharacter.spells.find((s) => s.id === input.dataset.recordId);
  const feature = activeCharacter.featureEntries.find((f) => f.id === input.dataset.featureId);
  return { castingClassId: spellSourceClass(spell), featureKind: feature?.kind || "" };
}

function handleSuggestionFocus(event) {
  const input = event.target;
  if (!suggestionKind(input) || suppressSuggestionFocus) return;
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", "suggestionPopover");
  input.autocomplete = "off";
  queueSuggestions(input);
}

function handleSuggestionInput(event) {
  if (suggestionKind(event.target) && !event.isComposing) queueSuggestions(event.target);
}

function handleSuggestionKeydown(event) {
  if (event.target.dataset.suggestKind === 'subclass' && event.key === 'ArrowDown' && (!suggestionState || elements.suggestionPopover.hidden)) {
    event.preventDefault(); queueSuggestions(event.target,{all:true}); return;
  }
  if (!suggestionState || event.target !== suggestionState.input || elements.suggestionPopover.hidden) return;
  const length = suggestionState.results.length;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    if (!length) return;
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    suggestionState.activeIndex = suggestionState.activeIndex < 0 && step < 0
      ? length - 1 : (suggestionState.activeIndex + step + length) % length;
    renderSuggestionOptions();
  } else if (event.key === "Enter" && suggestionState.activeIndex >= 0) {
    event.preventDefault();
    selectSuggestion(suggestionState.activeIndex);
  } else if (event.key === "Escape") {
    event.preventDefault();
    closeSuggestions();
  }
}

function queueSuggestions(input, {all = false} = {}) {
  input.setAttribute('role','combobox');
  input.setAttribute('aria-autocomplete','list');
  input.setAttribute('aria-controls','suggestionPopover');
  input.autocomplete='off';
  clearTimeout(suggestionTimer);
  const requestId = ++suggestionRequestId;
  suggestionState = { input, query: all ? '' : input.value, kind: input.dataset.suggestKind, rank: spellRankForSuggestion(input), characterId: activeCharacter.id, ruleset: libraryRuleset(),
    context: suggestionCharacterContext(), contextOptions: suggestionContextOptions(input), results: [], activeIndex: -1, message: "正在查找…" };
  renderSuggestionOptions();
  suggestionTimer = setTimeout(async () => {
    const state = suggestionState;
    if (!state || state.input !== input || state.characterId !== activeCharacter.id) return;
    try {
      if (state.kind === 'subclass') {
        const owner = input === elements.subclass ? activeCharacter : activeCharacter.multiclasses[Number(input.dataset.classIndex)];
        const entries = classCatalog.get(state.ruleset)?.find(c=>c.classId===owner?.classId)?.payload?.规则关联?.subclasses || [];
        state.results = entries.filter(s=>s.name.toLocaleLowerCase().includes(state.query.trim().toLocaleLowerCase())).map(s=>({...s,kind:'subclass',classId:owner.classId,englishName:`${s.minLevel}级起`}));
        state.total = state.results.length;
        state.message = state.results.length ? `${CLASSES[owner.classId].name}子职业 · 也可自定义输入` : '没有匹配的子职业；可继续自定义输入';
        if (requestId === suggestionRequestId && input.isConnected) renderSuggestionOptions();
        return;
      }
      const params = suggestionSearchParams({ ruleset: state.ruleset, kind: state.kind, query: input.value, rank: state.rank });
      if(input===elements.subrace) {params.set('speciesFor',activeCharacter.species);params.set('speciesEntryId',activeCharacter.speciesEntryId||'');}
      if (["spell", "class_feature", "species_feature", "feat", "fighting_style", "feature_option"].includes(state.kind)) {
        params.set("context", JSON.stringify(state.context));
        for (const [key, value] of Object.entries(state.contextOptions)) params.set(key, value);
      }
      const data = await libraryGet(`/api/library/search?${params}`);
      state.results = data.results;
      state.total = data.total;
      const rankLabel = state.rank === null ? "" : ` · ${state.rank === 0 ? "戏法" : `${state.rank} 环`}`;
      const classLabel = state.kind === "spell" && state.contextOptions.castingClassId !== "other" ? ` · ${CLASSES[state.contextOptions.castingClassId]?.name || "当前职业"}` : "";
      state.message = state.results.length ? `${libraryEdition()}${classLabel}${rankLabel} · 选中后带入数据`
        : state.kind === "curio" ? "当前规则下没有匹配的奇物；可换关键词或自行输入"
          : state.rank !== null ? `当前职业与${state.rank === 0 ? "戏法" : `${state.rank} 环`}没有匹配；其他来源可在左页切换`
            : "无匹配；可继续输入自定义内容";
      if (requestId === suggestionRequestId && suggestionState === state && input.isConnected) renderSuggestionOptions();
    } catch {
      if (requestId === suggestionRequestId && suggestionState === state) {
        state.message = "资料库暂不可用；仍可手动输入";
        renderSuggestionOptions();
      }
    }
  }, 130);
}

function renderSuggestionOptions() {
  const state = suggestionState;
  if (!state?.input?.isConnected) return closeSuggestions();
  state.input.setAttribute("aria-expanded", "true");
  if (state.activeIndex >= state.results.length) state.activeIndex = -1;
  if (state.activeIndex >= 0) state.input.setAttribute("aria-activedescendant", `suggestion-option-${state.activeIndex}`);
  else state.input.removeAttribute("aria-activedescendant");
  elements.suggestionPopover.innerHTML = `<div class="suggestion-caption">${escapeHtml(state.message)}</div>${state.results.map((item, index) => `<button id="suggestion-option-${index}" type="button" role="option" aria-selected="${index === state.activeIndex}" class="suggestion-option${index === state.activeIndex ? " is-active" : ""}" data-suggestion-index="${index}"><strong>${escapeHtml(item.name)}</strong><span>${item.kind === "spell" ? (item.rank === 0 ? "戏法" : `${item.rank} 环`) : escapeHtml(item.payload?.规则关联?.subclass || item.payload?.职业 || item.englishName || libraryKindName(item.kind,item.ruleset) || item.kind)}</span>${item.eligibility?.status !== "eligible" && item.eligibility ? `<small>${escapeHtml(item.eligibility.failures.join("；") || `需确认：${item.eligibility.review.join("；")}`)} · 可带入，条件待核对</small>` : ""}</button>`).join("")}`;
  elements.suggestionPopover.hidden = false;
  if(state.kind==='species') state.results.forEach((item,index)=>{
    const family=item.speciesFamily||item.payload?.族系;
    if(family) elements.suggestionPopover.querySelector(`#suggestion-option-${index} span`).textContent=`${family}族系 · ${item.name===family?'基础种族':'亚种／变体'}`;
  });
  const caption = elements.suggestionPopover.querySelector('.suggestion-caption');
  if (Number.isFinite(state.total) && state.results.length) caption.textContent += ` · 已显示 ${state.results.length} / ${state.total} 条`;
  if (state.results.length < state.total) elements.suggestionPopover.insertAdjacentHTML('beforeend', `<button type="button" class="suggestion-more" data-suggestion-more ${state.loadingMore ? 'disabled' : ''}>${state.loadingMore ? '加载中…' : '加载更多匹配项'}</button>`);
  positionSuggestions();
  elements.suggestionPopover.querySelector(".suggestion-option.is-active")?.scrollIntoView({ block: "nearest" });
}

async function loadMoreSuggestions() {
  const state = suggestionState;
  if (!state || state.loadingMore || state.results.length >= state.total) return;
  state.loadingMore = true;
  const scrollTop = elements.suggestionPopover.scrollTop;
  renderSuggestionOptions();
  try {
    const params = suggestionSearchParams({ ruleset: state.ruleset, kind: state.kind, query: state.query, rank: state.rank, offset: state.results.length });
    if(state.input===elements.subrace) {params.set('speciesFor',activeCharacter.species);params.set('speciesEntryId',activeCharacter.speciesEntryId||'');}
    if (["spell", "class_feature", "species_feature", "feat", "fighting_style", "feature_option"].includes(state.kind)) {
      params.set('context', JSON.stringify(state.context));
      for (const [key, value] of Object.entries(state.contextOptions)) params.set(key, value);
    }
    const data = await libraryGet(`/api/library/search?${params}`);
    if (suggestionState !== state || activeCharacter.id !== state.characterId || state.input.value !== state.query) return;
    state.results.push(...data.results);
    state.total = data.results.length ? data.total : state.results.length;
  } catch {
    if (suggestionState === state) state.message = '加载失败，可重试；已显示的选项仍可选择';
  } finally {
    state.loadingMore = false;
    if (suggestionState === state) { renderSuggestionOptions(); elements.suggestionPopover.scrollTop = scrollTop; }
  }
}

function positionSuggestions() {
  if (!suggestionState) return;
  if (!suggestionState.input.isConnected) return closeSuggestions();
  const rect = suggestionState.input.getBoundingClientRect();
  const popover = elements.suggestionPopover;
  if (rect.bottom < 0 || rect.top > innerHeight) {
    popover.hidden = true;
    suggestionState.input.setAttribute("aria-expanded", "false");
    return;
  }
  popover.hidden = false;
  suggestionState.input.setAttribute("aria-expanded", "true");
  const width = Math.min(Math.max(rect.width, 280), 420, innerWidth - 24);
  popover.style.width = `${width}px`;
  popover.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - width - 12))}px`;
  const below = innerHeight - rect.bottom;
  popover.style.top = below >= Math.min(popover.offsetHeight, 240) || below >= rect.top
    ? `${rect.bottom + 4}px` : `${Math.max(8, rect.top - popover.offsetHeight - 4)}px`;
}

function closeSuggestions() {
  clearTimeout(suggestionTimer);
  suggestionRequestId++;
  if (suggestionState?.input?.isConnected) {
    suggestionState.input.setAttribute("aria-expanded", "false");
    suggestionState.input.removeAttribute("aria-activedescendant");
  }
  suggestionState = null;
  elements.suggestionPopover.hidden = true;
}

async function selectSuggestion(index) {
  const state = suggestionState;
  const selected = state?.results[index];
  if (!selected) return;
  if (state.kind === "spell" && (spellRankForSuggestion(state.input) !== state.rank || Number(selected.rank) !== state.rank)) {
    closeSuggestions();
    return;
  }
  const input = state.input;
  const characterId = state.characterId;
  const inputAtSelection = input.value;
  closeSuggestions();
  if (state.kind === 'subclass') {
    const owner = input === elements.subclass ? activeCharacter : activeCharacter.multiclasses[Number(input.dataset.classIndex)];
    if (activeCharacter.id !== characterId || activeCharacter.ruleset !== state.ruleset || owner?.classId !== selected.classId) return;
    const classIndex = input.dataset.classIndex;
    input.value = selected.name;
    input.dispatchEvent(new Event('change',{bubbles:true}));
    focusAfterSuggestion(classIndex === undefined ? elements.subclass : elements.multiclassRows.querySelector(`[data-class-index="${classIndex}"][data-class-field="subclass"]`));
    return;
  }
  try {
    const entry = await libraryGet(`/api/library/entry?${new URLSearchParams({ id: selected.id, ruleset: state.ruleset, context: JSON.stringify(state.context) })}`);
    if(state.kind==='species_feature' && JSON.stringify(state.context)!==JSON.stringify(suggestionCharacterContext())) return;
    if (activeCharacter.id !== characterId || libraryRuleset() !== state.ruleset || input.value !== inputAtSelection
      || (state.kind === "spell" && (spellRankForSuggestion(input) !== state.rank || Number(entry.rank) !== state.rank))) return;
    await applySuggestedEntry(input, entry, characterId);
  } catch (error) { showToast(`无法套用资料：${error.message}`); }
}

async function applySuggestedEntry(input, entry, characterId) {
  if (activeCharacter.id !== characterId || !input.isConnected) return;
  const kind = input.dataset.suggestKind;
  if (["spell", "class_feature", "feat", "fighting_style", "feature_option"].includes(kind)) {
    const eligibility = entryEligibility(entry, suggestionCharacterContext(), suggestionContextOptions(input));
    if (entry.ruleset && entry.ruleset !== libraryRuleset()) return showToast('不能带入另一规则版本的资料');
    if (eligibility.status === "blocked") showToast('资料已允许带入；条件不符的效果需在“自动填卡效果”中由玩家确认。');
  }
  if (kind === "weapon") {
    const index = Number(input.dataset.weaponIndex);
    const item = activeCharacter.weapons[index];
    if (!item) return;
    const defaults = entry.local ? entry.payload : weaponPatchFromEntry(entry);
    const previous = Object.values(item.catalogDefaults || {}).some(Boolean)
      ? item.catalogDefaults : WEAPON_CATALOG_5R[item.catalogType] || {};
    Object.assign(item, mergeCatalogFields(item, defaults, previous));
    item.weaponType = entry.name;
    item.catalogType = entry.name;
    item.catalogDefaults = { ...defaults };
    if (!item.name) item.name = entry.name;
    markDirty();
    renderEquipmentRows();
    focusAfterSuggestion(elements.weaponRows.querySelector(`[data-weapon-index="${index}"][data-item-field="weaponType"]`));
  } else if (kind === "spell") {
    const record = activeCharacter.spells.find((item) => item.id === input.dataset.recordId);
    if (!record) return;
    Object.assign(record, spellPatchFromEntry(entry));
    record.customRank = false;
    record.castingClassId = spellSourceClass(record);
    markDirty();
    renderSpellWorkspace();
    focusAfterSuggestion(elements.spellInspector.querySelector('[data-record-field="name"]'));
  } else if (kind === "curio") {
      const index = Number(input.dataset.curioIndex);
      const record = activeCharacter.curios[index];
      if (!record) return;
      record.name = entry.name;
      const patch=curioPatchFromEntry(entry);
      if(!record.properties)record.properties=patch.properties;
      if(!record.rarity)record.rarity=patch.rarity;
      markDirty();
      renderEquipmentRows();
      focusAfterSuggestion(elements.curioRows.querySelector(`[data-curio-index="${index}"][data-item-field="name"]`));
  } else if (kind === "item") {
      const record = activeCharacter.inventory.find((item) => item.id === input.dataset.recordId);
      if (!record) return;
      Object.assign(record, itemPatchFromEntry(entry));
      markDirty();
      renderCollections(deriveMvpCharacter(activeCharacter));
      focusAfterSuggestion(document.querySelector(`[data-collection="inventory"][data-record-id="${record.id}"][data-record-field="name"]`));
  } else if (kind === "background") {
    const previous = activeCharacter.backgroundSource;
    const mappings = { backgroundSkillProficiencies: ['技能熟练'], backgroundToolProficiencies: ['工具熟练'], backgroundLanguages: ['语言'], backgroundEquipment: ['装备','初始装备'], backgroundSpecialOptions: ['特殊选项','专长'], backgroundFeature: ['背景特性','背景描述'] };
    for (const [field, keys] of Object.entries(mappings)) {
      const old = keys.map(k => previous?.payload?.[k]).find(Boolean);
      const next = keys.map(k => entry.payload?.[k]).find(Boolean);
      if (!activeCharacter[field] || activeCharacter[field] === String(old || '')) { activeCharacter[field] = String(next || '').slice(0,2000); if(elements[field]) elements[field].value = activeCharacter[field]; }
    }
    activeCharacter.backgroundSource = { id:entry.id, name:entry.name, ruleset:entry.ruleset, payload:entry.payload };
    if (previous?.id !== entry.id) activeCharacter.backgroundAbilityBonuses = {};
    activeCharacter.background = entry.name;
    elements.background.value = entry.name;
    if (!activeCharacter.backgroundFeature) {
      activeCharacter.backgroundFeature = String(entry.payload?.背景特性 ?? "").slice(0, 2000);
      elements.backgroundFeature.value = activeCharacter.backgroundFeature;
    }
    if (!activeCharacter.backgroundSpecialOptions) {
      activeCharacter.backgroundSpecialOptions = String(entry.payload?.特殊选项 ?? entry.payload?.专长 ?? "").slice(0, 2000);
      elements.backgroundSpecialOptions.value = activeCharacter.backgroundSpecialOptions;
    }
    for (const [field, sources] of [["backgroundSkillProficiencies", ["技能熟练"]], ["backgroundToolProficiencies", ["工具熟练"]], ["backgroundLanguages", ["语言"]], ["backgroundEquipment", ["装备", "初始装备"]]]) {
      const value = sources.map((source) => entry.payload?.[source]).find((candidate) => candidate !== undefined && candidate !== null && candidate !== "");
      if (!activeCharacter[field] && value) { activeCharacter[field] = String(value).slice(0, 1000); elements[field].value = activeCharacter[field]; }
    }
    markDirty(); render();
    focusAfterSuggestion(elements.background);
  } else if (kind === "species") {
    if(input===elements.subrace) {
      activeCharacter.subrace=entry.name;elements.subrace.value=entry.name;
      markDirty();renderFeatureRows();focusAfterSuggestion(elements.subrace);
      await fillAvailableFeatures('species',true);return;
    }
    if(activeCharacter.species!==entry.name) {activeCharacter.subrace='';elements.subrace.value='';}
    activeCharacter.species = entry.name;
    activeCharacter.speciesEntryId=entry.id;
    elements.species.value = entry.name;
    if (entry.payload?.速度 && !activeCharacter.speed) { activeCharacter.speed = String(entry.payload.速度); elements.speed.value = activeCharacter.speed; }
    markDirty(); renderFeatureRows(); focusAfterSuggestion(elements.species);
    await fillAvailableFeatures('species',true);
  } else if (kind === "feat" || kind === "fighting_style" || kind === "class_feature" || kind === "species_feature" || kind === "feature_option") {
    const feature = activeCharacter.featureEntries.find((item) => item.id === input.dataset.featureId);
    if (!feature) return;
    feature.name = entry.name;
    if (!feature.description || feature.description === String(feature.catalogEntry?.payload?.描述 || "").slice(0, 3000)) feature.description = String(entry.payload?.描述 ?? "").slice(0, 3000);
    feature.catalogEntry = { id: entry.id, name: entry.name, kind: entry.kind, ruleset: entry.ruleset, payload: entry.payload };
    if(kind==='species_feature') {feature.speciesBinding=speciesContext(activeCharacter);feature.speciesSourceId=entry.id;}
    if(feature.kind==='feat') feature.sourceRuleset=entry.ruleset;
    if (!feature.level && entry.payload?.规则关联?.minLevel) feature.level = entry.payload.规则关联.minLevel;
    markDirty(); render();
    focusAfterSuggestion(document.querySelector(`[data-feature-id="${feature.id}"][data-feature-field="name"]`));
  } else if (kind === "creature") {
    const record = activeCharacter.deployedCreatures.find((item) => item.id === input.dataset.recordId);
    if (!record) return;
    mergeCreatureEntry(record,entry);
    markDirty(); renderCollections(deriveMvpCharacter(activeCharacter));
    focusAfterSuggestion(document.querySelector(`[data-collection="deployedCreatures"][data-record-id="${record.id}"][data-record-field="name"]`));
  }
}

function focusAfterSuggestion(input) {
  if (!input) return;
  suppressSuggestionFocus = true;
  input.focus();
  queueMicrotask(() => { suppressSuggestionFocus = false; });
}

function renderLibraryBooks() {
  const selected=elements.libraryBook.value, group=elements.librarySourceGroup.value;
  const books=[...new Set(libraryBooks.filter(b=>!group||b.sourceGroup===group).map(b=>b.book))];
  elements.libraryBook.innerHTML='<option value="">全部书籍</option>'+books.map(book=>`<option value="${escapeHtml(book)}">${escapeHtml(book)}</option>`).join('');
  if(books.includes(selected))elements.libraryBook.value=selected;
}

async function openLibrary() {
  elements.libraryKind.innerHTML=isCoc(activeCharacter)?'<option value="">全部类别</option>'+Object.entries(COC_KINDS).map(([k,l])=>`<option value="${k}">${l}</option>`).join(''):dndLibraryKinds;
  elements.libraryRank.value='';elements.libraryRank.disabled=isCoc(activeCharacter);
  elements.libraryQuery.value='';
  elements.libraryDialog.showModal();
  elements.libraryQuery.focus();
  selectedLibraryId = null;
  elements.libraryDetail.textContent = "从左侧选择资料，查看内容与来源。规则与资料正文支持全文关键词查找。";
  elements.libraryEdition.textContent = `本机资料 / ${libraryEdition()}`;
  try {
    const ruleset = libraryRuleset();
    const summary = await libraryGet(`/api/library/summary?ruleset=${ruleset}`);
    if (ruleset !== libraryRuleset()) return;
    libraryOffset=0;
    libraryBooks=summary.books||[];
    elements.librarySourceGroup.innerHTML='<option value="">全部来源</option>'+Object.entries(summary.sourceGroups||{}).map(([key,label])=>`<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`).join('');
    renderLibraryBooks();
    elements.librarySummary.textContent = `${summary.sources.length} 个资料来源 · ${summary.kinds.map(({ kind, count }) => `${count} ${libraryKindName(kind) ?? kind}`).join(" · ")} · ${summary.totalCells} ${ruleset==='coc-7e'?'条来源记录':'个表格来源单元格'}`;
    await loadLibraryResults();
  } catch (error) {
    elements.librarySummary.textContent = String(error.message || error);
    elements.libraryResults.textContent = "暂无可用资料。请先运行本机资料导入。";
    elements.libraryDetail.textContent = "资料库不会自动覆盖人物卡。";
  }
}

async function loadLibraryResults() {
  const requestId = ++libraryRequestId;
  const params = new URLSearchParams({ ruleset: libraryRuleset(), query: elements.libraryQuery.value, kind: elements.libraryKind.value,
    rank: elements.libraryRank.value, sourceGroup:elements.librarySourceGroup.value,book:elements.libraryBook.value,offset: String(libraryOffset), limit: "30" });
  elements.libraryResults.textContent = "正在查找…";
  try {
    const { total, results } = await libraryGet(`/api/library/search?${params}`);
    if (requestId !== libraryRequestId) return;
    elements.libraryResultCount.textContent = `${total} 条`;
    elements.libraryPageNumber.textContent = `${Math.floor(libraryOffset / 30) + 1} / ${Math.max(1, Math.ceil(total / 30))}`;
    elements.libraryPrevious.disabled = libraryOffset === 0;
    elements.libraryNext.disabled = libraryOffset + 30 >= total;
    elements.libraryResults.innerHTML = results.length ? results.map((entry) => `<button type="button" class="library-result${entry.id === selectedLibraryId ? " is-active" : ""}" data-library-id="${escapeHtml(entry.id)}"><span class="library-rank">${entry.kind === "spell" ? (entry.rank === 0 ? "戏法" : `${entry.rank} 环`) : escapeHtml(libraryKindName(entry.kind,entry.ruleset) || entry.kind)}</span><span><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.englishName || entry.sourceBook || entry.sourceSheet)}</small></span><em>›</em></button>`).join("") : `<div class="library-detail-empty" style="padding:22px">${elements.libraryKind.value === "curio" ? "当前规则下没有匹配的奇物。可缩短关键词，或在人物卡中手动填写。" : "没有匹配的资料。"}</div>`;
  } catch (error) {
    if (requestId === libraryRequestId) elements.libraryResults.textContent = String(error.message || error);
  }
}

async function loadLibraryEntry(id) {
  selectedLibraryId=id;
  selectedLibraryId = id;
  const ruleset = libraryRuleset();
  elements.libraryResults.querySelectorAll("[data-library-id]").forEach((button) => button.classList.toggle("is-active", button.dataset.libraryId === id));
  elements.libraryDetail.textContent = "正在读取条目…";
  try {
    const entry = await libraryGet(`/api/library/entry?${new URLSearchParams({ id, ruleset })}`);
    if (selectedLibraryId !== id || ruleset !== libraryRuleset()) return;
    const fields = Object.entries({适用系统:RULESETS[entry.ruleset]?.shortName||entry.ruleset,来源分类:entry.provenance?.groupLabel,来源书籍:entry.provenance?.book,原书版本:entry.provenance?.edition,...entry.payload}).filter(([, value]) => value != null && value !== "" && value !== "×" && value !== "x");
    elements.libraryDetail.innerHTML = `<h2 class="library-detail-title">${escapeHtml(entry.name)}</h2><p class="library-detail-subtitle">${escapeHtml(entry.englishName || libraryKindName(entry.kind,entry.ruleset) || entry.kind)}</p><div class="library-detail-meta"><span>${escapeHtml(entry.domain || "未分类")} / ${escapeHtml(entry.categoryLabel || libraryKindName(entry.kind,entry.ruleset) || entry.kind)}</span>${entry.subcategory ? `<span>${escapeHtml(entry.subcategory)}</span>` : ""}${entry.rank !== null ? `<span>${entry.rank === 0 ? "戏法" : `${entry.rank} 环`}</span>` : ""}<span>${escapeHtml(entry.sourceSheet)}!${escapeHtml(entry.sourceRange)}</span><span>未经逐条复核</span></div>${entry.categoryWarning ? `<p class="library-caution">${escapeHtml(entry.categoryWarning)}</p>` : ""}<dl class="library-fields">${fields.map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(formatLibraryValue(value))}</dd></div>`).join("")}</dl>`;
  } catch (error) {
    if (selectedLibraryId === id) elements.libraryDetail.textContent = String(error.message || error);
  }
}

function openCreateCharacter() {
  createWizardStep = 1;
  elements.createName.value = "新人物";
  elements.createPlayer.value = activeCharacter?.player?.trim() || "玩家";
  elements.createSystemOptions.querySelectorAll('input[name="createRuleset"]').forEach((option) => { option.checked = false; });
  elements.createError.textContent = "";
  renderCreateWizard();
  elements.createCharacterDialog.showModal();
  elements.createName.focus();
  elements.createName.select();
}

function closeCreateCharacter() {
  elements.createCharacterDialog.close();
}

function setCreateWizardStep(step) {
  if (step === 2) {
    const name = elements.createName.value.trim();
    const player = elements.createPlayer.value.trim();
    if (!name || !player) {
      elements.createError.textContent = !name ? "请先填写人物名称。" : "请先填写玩家名称。";
      (!name ? elements.createName : elements.createPlayer).focus();
      return;
    }
  }
  createWizardStep = step;
  elements.createError.textContent = "";
  renderCreateWizard();
  if (step === 2) (elements.createSystemOptions.querySelector("input:checked") || elements.createSystemOptions.querySelector("input:not(:disabled)"))?.focus();
}

function renderCreateWizard() {
  const identity = createWizardStep === 1;
  elements.createIdentityStep.hidden = !identity;
  elements.createSystemStep.hidden = identity;
  elements.createBack.hidden = identity;
  elements.createNext.hidden = !identity;
  elements.createConfirm.hidden = identity;
  elements.createStepLabel.textContent = `步骤 ${createWizardStep} / 2`;
  elements.createCharacterTitle.textContent = identity ? "先给人物一个身份" : "选择规则系统";
  renderCreateSelection();
}

function renderCreateSelection() {
  const selected = elements.createSystemOptions.querySelector('input[name="createRuleset"]:checked')?.value;
  elements.createConfirm.disabled = !selected || !RULESETS[selected];
  elements.createConfirm.textContent = selected && RULESETS[selected] ? `创建 ${RULE_ENGINES[selected].name} 人物` : '请先选择系统';
  elements.createSystemSelection.textContent = selected && RULESETS[selected] ? `已选择：${RULESETS[selected].fullName}` : '选择 5E、5R 或 CoC；创建后系统固定。';
  if (selected) elements.createError.textContent = '';
}

function createNewCharacter(event) {
  event.preventDefault();
  if (createWizardStep !== 2) { setCreateWizardStep(2); return; }
  const ruleset = elements.createSystemOptions.querySelector('input[name="createRuleset"]:checked')?.value;
  if (!ruleset || !RULESETS[ruleset]) {
    elements.createError.textContent = ruleset ? "该规则系统的计算插件尚未安装。" : "请先选择规则系统。";
    return;
  }
  const created = createCharacter({ name: elements.createName.value.trim(), player: elements.createPlayer.value.trim(), ruleset });
  if(!isCoc(created))syncCharacterSlots(created, { preserveSpent: false });
  workspace.characters.push(created);
  expandedCharacterId = created.id;
  activePage = "character";
  selectCharacter(created.id);
  closeCreateCharacter();
  showToast(`已按 ${RULE_ENGINES[ruleset].name} 创建“${created.name}”`);
}

function openDeleteCharacter(id) {
  if (workspace.characters.length <= 1) { showToast("工作区至少需要保留一名人物"); return; }
  const character = workspace.characters.find((item) => item.id === id);
  if (!character) return;
  pendingDeleteId = id;
  elements.deleteCharacterName.textContent = character.name.trim() || "未命名角色";
  elements.deleteCharacterDialog.showModal();
  elements.confirmDeleteCharacter.focus();
}

function confirmDeleteCharacter() {
  const index = workspace.characters.findIndex((item) => item.id === pendingDeleteId);
  if (index < 0 || workspace.characters.length <= 1) { elements.deleteCharacterDialog.close(); return; }
  const [character] = workspace.characters.splice(index, 1);
  lastDeletedCharacter = { character, index };
  elements.deleteCharacterDialog.close();
  pendingDeleteId = null;
  const next = workspace.characters[Math.min(index, workspace.characters.length - 1)];
  expandedCharacterId = next.id;
  activePage = "character";
  selectCharacter(next.id);
  showToast(`已删除“${character.name.trim() || "未命名角色"}”`, { label: "撤销", action: undoDeleteCharacter, duration: 10000 });
}

function undoDeleteCharacter() {
  if (!lastDeletedCharacter) return;
  const { character, index } = lastDeletedCharacter;
  workspace.characters.splice(Math.min(index, workspace.characters.length), 0, character);
  lastDeletedCharacter = null;
  expandedCharacterId = character.id;
  selectCharacter(character.id);
  showToast(`已恢复“${character.name.trim() || "未命名角色"}”`);
}

function selectCharacter(id) {
  elements.classImportStatus.textContent='';
  elements.speciesImportStatus.textContent='';
  closeSuggestions();
  knowledgeRequestId++;
  elements.assistantKnowledgeQuery.value = "";
  elements.assistantKnowledgeResults.textContent = "输入关键词查找，不会跨规则版本混用。";
  activeCharacter = workspace.characters.find((character) => character.id === id) ?? workspace.characters[0];
  if (!activeCharacter) {
    activeCharacter = createCharacter({ ruleset: "dnd5r-2024" });
    workspace.characters.push(activeCharacter);
  }
  workspace.activeId = activeCharacter.id;
  if(!characterPages(activeCharacter).some(p=>p.id===activePage))activePage='character';
  if(isCoc(activeCharacter)){activeSpellId=null;render();persist(false);return;}
  try {switchSpeciesFeatures(activeCharacter);} catch(error) {showToast(error.message);}
  // Pin legacy spells once; changing the active spellbook must not reassign learned spells.
  for (const spell of activeCharacter.spells) if (!spell.castingClassId) spell.castingClassId = spellSourceClass(null);
  activeSpellId = activeCharacter.spells[0]?.id ?? null;
  if (expandedCharacterId === null) expandedCharacterId = activeCharacter.id;
  hydrateForm();
  render();
  persist(false);
  loadClassCatalog();
}

function hydrateForm() {
  for (const id of ['resistances','immunities','senses']) if(elements[id]) elements[id].value = activeCharacter[id] || '';
  elements.subclass.value = activeCharacter.subclass || "";
  const fields = ["name", "player", "species", "subrace", "gender", "alignment", "age", "faith", "height", "weight", "hair", "skin", "eyes", "appearance", "characterImage", "backgroundSkillProficiencies", "backgroundToolProficiencies", "backgroundLanguages", "backgroundEquipment", "backgroundSpecialOptions", "backgroundFeature", "backgroundStory", "personalityTwo", "classId", "level", "experience", "multiclass", "size", "currentHp", "tempHp", "hitDiceCurrent", "armorId", "armorBonus", "armorProperty", "shieldName", "shieldAcBonus", "weaponAttackAbility", "ammunitionName", "ammunitionCount", "speed", "weaponProficiencies", "armorTraining", "knownLanguages", "toolProficiencies", "inspiration", "injuries", "renown", "piety", "blessings", "charms", "epicBoons", "equipmentLoad", "carryingCapacity", "defensesSenses", "background", "personality", "ideal", "bond", "flaw", "equipmentArmor"];
  for (const key of fields) if (elements[key]) elements[key].value = activeCharacter[key] ?? "";
  elements.shield.checked = activeCharacter.shield;
  elements.shieldAttuned.checked = activeCharacter.shieldAttuned;
  for (const { attunementField } of EQUIPMENT_SLOTS) if (elements[attunementField]) elements[attunementField].checked = Boolean(activeCharacter[attunementField]);
  document.querySelectorAll("[data-ability]").forEach((input) => { input.value = activeCharacter.abilities[input.dataset.ability]; });
  document.querySelectorAll("[data-currency]").forEach((input) => { input.value = activeCharacter.currency[input.dataset.currency] ?? 0; });
}

function handleFormInput(event) {
  const target = event.target;
  if(target.dataset.speciesImportSource) {if(event.type==='change')fillAvailableFeatures('species',true);return;}
  // Edition belongs to the character's identity. Old form events cannot migrate a card.
  if (target.name === 'ruleset' || target.id === 'rulesetDisplay') return;
  if(target.dataset.startingBranch!==undefined||target.dataset.startingReplacement||target.id==='startingRestrictions') {
    if(target.tagName!=='INPUT'||target.type==='checkbox') {if(event.type!=='change') return;}
    const entry=(classCatalog.get(activeCharacter.ruleset)||[]).find(c=>c.classId===activeCharacter.classId),plan=startingEquipmentPlan(activeCharacter,entry);
    if(!plan?.key) return;
    const choice=activeCharacter.startingEquipmentChoices[plan.key]||={branches:[],replacements:{}};
    if(target.dataset.startingBranch!==undefined) choice.branches[Number(target.dataset.startingBranch)]=target.value;
    else if(target.dataset.startingReplacement) choice.replacements[target.dataset.startingReplacement]=target.value;
    else choice.confirmRestrictions=target.checked;
    markDirty();
    if(target.tagName==='INPUT'&&target.type!=='checkbox') {
      const next=startingEquipmentPlan(activeCharacter,entry);
      const feedback=document.getElementById('startingFeedback');if(feedback) feedback.textContent=next.errors.join('；');
      return;
    }
    const selector=target.id?`#${target.id}`:`[data-starting-branch="${target.dataset.startingBranch}"]`;
    renderClassConfiguration();document.querySelector(selector)?.focus({preventScroll:true});return;
  }
  if(target.dataset.skillGrant) {
    if(event.type!=='change') return;
    const group=characterEffects(activeCharacter).skillGrants.groups.find(g=>g.id===target.dataset.skillGrant);
    if(!group) return;
    activeCharacter.skillChoices||={};
    const selected=[...(activeCharacter.skillChoices[group.id]||[])];selected[Number(target.dataset.choiceIndex)]=target.value;
    activeCharacter.skillChoices[group.id]=selected;
    markDirty();render();
    document.querySelector(`[data-skill-grant="${CSS.escape(group.id)}"][data-choice-index="${target.dataset.choiceIndex}"]`)?.focus({preventScroll:true});
    return;
  }
  if(target.id==='hitDieClass') {
    document.getElementById('hitDieRoll').max=String(CLASSES[target.value]?.hitDie||12);return;
  }
  if(target.dataset.featChoice) {
    if(event.type!=='change') return;
    const feature=activeCharacter.featureEntries.find(f=>f.id===target.dataset.featChoice);
    if(!feature) return;
    const key=featChoiceKey(feature,activeCharacter);
    activeCharacter.featAbilityChoices[key]||=[];
    activeCharacter.featAbilityChoices[key][Number(target.dataset.choiceIndex)]=target.value;
    markDirty();render();
    document.querySelector(`[data-feat-choice="${CSS.escape(feature.id)}"][data-choice-index="${target.dataset.choiceIndex}"]`)?.focus({preventScroll:true});
    return;
  }
  if(target.dataset.proficiencyGrant) {
    const group=effectiveProficiencies(activeCharacter).grants.groups.find(g=>g.id===target.dataset.proficiencyGrant);
    if(!group) return;
    activeCharacter.proficiencyChoices[group.id]||=[];
    activeCharacter.proficiencyChoices[group.id][Number(target.dataset.choiceIndex)]=target.value.trim();
    if(target.tagName==='INPUT') {
      markDirty();
      const state=effectiveProficiencies(activeCharacter).grants,updated=state.groups.find(g=>g.id===group.id),fieldset=target.closest('fieldset');
      fieldset.querySelector('legend').textContent=`${updated.name} · ${updated.valid.length}/${updated.count}`;
      fieldset.querySelector('.grant-feedback').textContent=updated.errors.join('；');
      document.getElementById('effectiveToolsLanguages').textContent=`当前工具：${state.tools.join('、')||'无'}；当前语言：${state.languages.join('、')||'无'}。自动来源与手动来源分开保存。`;
      return;
    }
    markDirty();render();
    document.querySelector(`[data-proficiency-grant="${CSS.escape(group.id)}"][data-choice-index="${target.dataset.choiceIndex}"]`)?.focus({preventScroll:true});return;
  }
  if(target.dataset.featSource) {
    if(event.type!=='change') return;
    const feature=activeCharacter.featureEntries.find(f=>f.id===target.dataset.featSource);
    if(!feature) return;
    feature.advancementSource=target.value;
    feature.sourceRuleset=activeCharacter.ruleset;
    markDirty();render();
    document.querySelector(`[data-feat-source="${CSS.escape(feature.id)}"]`)?.focus({preventScroll:true});return;
  }
  if (target.dataset.backgroundBonus) {
    activeCharacter.backgroundAbilityBonuses[target.dataset.backgroundBonus] = Number(target.value);
    markDirty(); render(); return;
  }
  if (target.dataset.proficiencyPick) {
    const key = target.dataset.proficiencyPick;
    const values = activeCharacter[key].split(/[，,、；;]/).filter(Boolean);
    if (target.value && !values.includes(target.value)) values.push(target.value);
    activeCharacter[key] = values.join('、'); elements[key].value = activeCharacter[key];
    target.value = ''; markDirty(); render(); return;
  }
  if (target.name === "classId" && activeCharacter.multiclasses.some((c) => c.classId === target.value)) {
    target.value = activeCharacter.classId; showToast("此职业已在兼职中，请先合并或移除重复职业。"); return;
  }
  if (target.dataset.classIndex !== undefined) {
    const index = Number(target.dataset.classIndex);
    const row = activeCharacter.multiclasses[index];
    if (!row) return;
    const field = target.dataset.classField;
    if (field === "classId" && (activeCharacter.classId === target.value || activeCharacter.multiclasses.some((c, i) => i !== index && c.classId === target.value))) { renderClassConfiguration(); return; }
    if (field === "classId" && row.classId !== target.value) row.subclass = "";
    row[field] = field === "level" ? Math.max(1, Math.min(20, Math.trunc(Number(target.value) || 1))) : target.value;
    syncCharacterSlots(activeCharacter); closeSuggestions(); markDirty();
    render(event.type === "input" && field !== "classId");
    elements.classLevelSummary.textContent = `总等级 ${totalLevel(activeCharacter)} / 20 · ${characterClasses(activeCharacter).map((c) => `${CLASSES[c.classId]?.name} ${c.level}`).join(" / ")}`;
    return;
  }
  if (target.dataset.legacyClassNote !== undefined) {
    activeCharacter.multiclassUnresolved = target.value; markDirty();
    if (event.type === "change") { syncCharacterSlots(activeCharacter); render(); }
    return;
  }
  if (target.dataset.pactField) {
    activeCharacter.pactSlots[target.dataset.pactField] = Math.max(0, Math.trunc(Number(target.value) || 0));
    markDirty(); return;
  }
  if (target.dataset.fillField) {
    const feature=activeCharacter.featureEntries.find(item=>item.id===target.dataset.fillOwner);
    if(!feature) return;
    const rows=featureFillEffects(feature,activeCharacter.ruleset),row=rows[Number(target.dataset.fillIndex)];
    if(!row) return;
    const field=target.dataset.fillField;
    if(field==='type') rows[Number(target.dataset.fillIndex)]=target.value==='bonus'?{type:'bonus',target:'hp',value:0,scale:'fixed'}:{type:target.value,target:['skill','expertise'].includes(target.value)?'athletics':target.value==='save'?'str':''};
    else row[field]=field==='value'?numberOr(target.value,0):target.value;
    feature.fillEffects=normalizeFillEffects(rows);
    markDirty();
    const derived=deriveMvpCharacter(activeCharacter);
    renderStats(derived);renderSkills(derived);renderEquipmentSummary(derived);renderEffects(derived);renderFormMeta(derived);
    if(event.type==='change') renderFeatureRows();
    return;
  }
  if (target.dataset.featureId) {
    const feature = activeCharacter.featureEntries.find((item) => item.id === target.dataset.featureId);
    if (!feature) return;
    feature[target.dataset.featureField] = target.type === "number" ? numberOr(target.value, 0) : target.value;
    if (target.dataset.featureField === "name") {
      feature.catalogEntry = null;
      target.closest('.feature-ledger-row')?.querySelector('[data-remove-feature]')?.setAttribute('aria-label', `移除${feature.name || '此特性'}`);
      const editor=target.closest('.feature-ledger-row')?.querySelector('[data-effect-editor]');
      if(editor) editor.outerHTML=renderFillEffectEditor(feature,activeCharacter.ruleset,escapeHtml,editor.open);
    }
    markDirty();
    const derived = deriveMvpCharacter(activeCharacter);
    renderStats(derived); renderSkills(derived); renderEquipmentSummary(derived); renderFormMeta(derived);
    if(target.dataset.featureField!=='sourceNote') renderEffects(derived);
    if(event.type==='change'&&target.dataset.featureField==='effectMode') renderFeatureRows();
    return;
  }
  if (target.dataset.weaponIndex !== undefined || target.dataset.curioIndex !== undefined) {
    const collection = target.dataset.weaponIndex !== undefined ? "weapons" : "curios";
    const index = Number(collection === "weapons" ? target.dataset.weaponIndex : target.dataset.curioIndex);
    const field = target.dataset.itemField;
    if (!activeCharacter[collection]?.[index] || !field) return;
    activeCharacter[collection][index][field] = target.type === "checkbox" ? target.checked : target.type === "number" ? numberOr(target.value, 0) : target.value;
    if(collection==='weapons') {
      if(field==='attackDie') activeCharacter.weapons[index].attackMode='manual';
      if(field==='proficient') activeCharacter.weapons[index].proficiencyMode='manual';
      if(event.type==='change') renderEquipmentRows();
      else {
        const result=weaponCalculation(activeCharacter,activeCharacter.weapons[index]);
        const summary=elements.weaponRows.querySelector(`[data-weapon-result="${index}"] span`);
        if(summary) summary.textContent=`命中 ${result.attackDie}；伤害 ${result.damageDie||'未填'}。${result.note}`;
        if(field!=='attackDie'&&activeCharacter.weapons[index].attackMode!=='manual') elements.weaponRows.querySelector(`[data-weapon-index="${index}"][data-item-field="attackDie"]`).value=result.attackDie;
      }
    }
    markDirty();
    if (field === "attuned") renderEquipmentSummary(deriveMvpCharacter(activeCharacter));
    return;
  }
  if (target.dataset.collection) {
    updateCollectionRecord(target);
    if(target.dataset.collection==='spells'&&target.dataset.recordField==='alwaysPrepared'&&target.checked) activeCharacter.spells.find(s=>s.id===target.dataset.recordId).prepared=true;
    markDirty();
    if (target.dataset.collection === 'deployedCreatures') {
      const item = activeCharacter.deployedCreatures.find(item => item.id === target.dataset.recordId);
      const card = target.closest('.creature-record');
      if (target.dataset.recordField.startsWith('abilities.')) {
        target.closest('label')?.querySelector('output')?.replaceChildren(document.createTextNode(signed(Math.floor((numberOr(target.value, 10) - 10) / 2))));
      }
      if (item && card) {
        card.querySelector('.creature-card-title strong').textContent = item.name || '未命名生物';
        card.querySelector('.creature-card-title span').textContent = [item.size, item.type].filter(Boolean).join(' · ') || '资料未填写';
      }
    }
    if (target.dataset.collection === "spells" && target.dataset.recordField === "name") {
      const spell = activeCharacter.spells.find((item) => item.id === target.dataset.recordId);
      if (spell) spell.customRank = false;
      const select = elements.spellList.querySelector(`[data-select-spell="${target.dataset.recordId}"]`);
      if (select) {
        select.querySelector('.spell-index-name').textContent = target.value.trim() || '未命名法术';
        select.setAttribute("aria-label", `查看${target.value.trim() || "未命名法术"}详情`);
      }
      if (spell?.id === activeSpellId) updateSpellRankStatus();
    } else if (target.dataset.collection === "spells" && event.type === "change") {
      const changedRank = target.dataset.recordField === "level";
      if (changedRank) closeSuggestions();
      renderSpellWorkspace();
      elements.spellInspector.querySelector(`[data-record-field="${CSS.escape(target.dataset.recordField)}"]`)?.focus({ preventScroll: true });
    }
    if (target.dataset.collection === "inventory") {
      renderResourceSummary();
      if (target.dataset.recordField === 'section') renderInventoryBook();
      else { const button = document.querySelector(`[data-select-inventory="${CSS.escape(target.dataset.recordId)}"]`); if (button) { const item = activeCharacter.inventory.find(i => i.id === target.dataset.recordId); button.querySelector('strong').textContent = item.name || '未命名物品'; button.querySelector('small').textContent = `${item.quantity} 件 · ${Number(item.weight)*Number(item.quantity)} 磅`; } }
    }
    return;
  }
  if (target.dataset.currency) {
    activeCharacter.currency[target.dataset.currency] = Math.max(0, Math.trunc(numberOr(target.value, 0)));
    markDirty();
    renderResourceSummary();
    return;
  }
  if (target.dataset.spellSlot) {
    const slot = activeCharacter.spellSlots[target.dataset.spellSlot];
    slot[target.dataset.slotField] = Math.max(0, Math.trunc(numberOr(target.value, 0)));
    markDirty();
    return;
  }
  if (target.dataset.ability) activeCharacter.abilities[target.dataset.ability] = numberOr(target.value, 10);
  else if (target.name === "shield") activeCharacter.shield = target.checked;
  else if (target.name === "shieldAttuned") activeCharacter.shieldAttuned = target.checked;
  else if (ATTUNEMENT_FIELDS.has(target.name)) activeCharacter[target.name] = target.checked;
  else if (["equipmentLoad", "carryingCapacity"].includes(target.name)) activeCharacter[target.name] = target.value === "" ? null : numberOr(target.value, 0);
  else if (["level", "speed", "experience", "currentHp", "tempHp", "hitDiceCurrent", "ammunitionCount", "armorBonus", "shieldAcBonus"].includes(target.name)) activeCharacter[target.name] = numberOr(target.value, target.name === "level" ? 1 : 0);
  else if (target.name) activeCharacter[target.name] = target.value;
  else return;
  if (target.name === "classId") { activeCharacter.subclass = ""; elements.subclass.value = ""; }
  if (["classId", "level", "subclass"].includes(target.name) && Number.isInteger(Number(activeCharacter.level)) && Number(activeCharacter.level) >= 1 && Number(activeCharacter.level) <= 20) {
    closeSuggestions(); syncCharacterSlots(activeCharacter);
  }
  markDirty();
  if (target.name === "equipmentLoad") renderResourceSummary();
  render();
  if(event.type==='change' && ['species','subrace'].includes(target.name)) {
    if(target.name==='species') {activeCharacter.speciesEntryId='';activeCharacter.subrace='';elements.subrace.value='';}
    fillAvailableFeatures('species',true);
  }
}

function handleSkillClick(event) {
  const button = event.target.closest("[data-skill]");
  if (!button) return;
  const skill = button.dataset.skill;
  activeCharacter.skills[skill] = (activeCharacter.skills[skill] + 1) % 3;
  markDirty();
  render();
}

function selectCharacterPage(page) {
  if (!characterPages(activeCharacter).some((item) => item.id === page)) return;
  closeSuggestions();
  activePage = page;
  expandedCharacterId = activeCharacter.id;
  renderCharacterList();
  renderPageState();
  elements.contentScroll.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  elements.mainWorkspace.focus({ preventScroll: true });
}

function renderPageState() {
  if(isCoc(activeCharacter)){
    document.querySelector('.app-shell').dataset.page='coc';
    elements.pageBreadcrumb.textContent=COC_PAGES.find(p=>p.id===activePage)?.label||'调查员';
    cocView.render(activeCharacter,activePage);return;
  }
  const page = CHARACTER_PAGES.find((item) => item.id === activePage) ?? CHARACTER_PAGES[0];
  document.querySelectorAll("[data-page-panel]").forEach((panel) => {
    const active = panel.dataset.pagePanel === page.id;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  document.querySelector(".app-shell").dataset.page = page.id;
  const portrait = document.querySelector('.portrait-card');
  const portraitHost = page.id === 'summary' ? elements.summaryPortraitDock : document.querySelector('.profile-pane');
  if (portrait.parentElement !== portraitHost) portraitHost.prepend(portrait);
  elements.pageBreadcrumb.textContent = page.label;
}

function addCollectionRecord(collection, overrides = {}) {
  const templates = {
    attacks: { id: createRecordId(), name: "", ability: "力量", attackBonus: 0, damage: "", damageType: "", notes: "" },
    spells: { id: createRecordId(), name: "", level: 0, prepared: false, source: "", classes: "", school: "", ritual: false, concentration: false, castingTime: "", range: "", duration: "", verbal: false, somatic: false, materialComponent: false, material: "", effect: "" },
    deployedCreatures: { id: createRecordId(), name: "", sex: "", species: "", type: "", alignment: "", size: "中型", challengeRating: "", proficiencyBonus: 2, armorClass: 10, hitPoints: 1, currentHitPoints: 1, tempHitPoints: 0, hitDice: "", initiative: 0, speed: "", abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, skills: "", resistances: "", immunities: "", senses: "", languages: "", actions: "", traits: "", notes: "" },
    inventory: { id: createRecordId(), name: "", section: "quick", description: "", quantity: 1, weight: 0 },
    ledger: { id: createRecordId(), kind: "income", project: "", detail: "", amount: 0 },
  };
  const record = { ...templates[collection], ...overrides };
  if (collection === "spells") record.castingClassId = spellSourceClass(null);
  activeCharacter[collection].push(record);
  if (collection === "spells") activeSpellId = record.id;
  if (collection === 'inventory') activeInventoryId = record.id;
  markDirty();
  const derived = deriveMvpCharacter(activeCharacter);
  renderCollections(derived);
  requestAnimationFrame(() => document.querySelector(`[data-record-id="${record.id}"] input`)?.focus());
}

function handleCollectionClick(event) {
  const subclassDropdown = event.target.closest('[data-subclass-dropdown]');
  if (subclassDropdown) {
    const input = subclassDropdown.parentElement.querySelector('input');
    input.focus({preventScroll:true}); queueSuggestions(input,{all:true}); return;
  }
  if (event.target.closest('[data-add-weapon]')) {
    if (activeCharacter.weapons.length >= 200) return showToast('最多记录 200 件武器。');
    closeSuggestions();
    activeCharacter.weapons.push(normalizeWeapon());
    markDirty(); renderEquipmentRows();
    elements.weaponRows.querySelector(`[data-weapon-index="${activeCharacter.weapons.length - 1}"][data-item-field="weaponType"]`)?.focus();
    return;
  }
  const removeWeapon = event.target.closest('[data-remove-weapon]');
  if (removeWeapon) {
    const owner = activeCharacter, index = Number(removeWeapon.dataset.removeWeapon);
    if (!Number.isInteger(index) || !owner.weapons[index]) return;
    closeSuggestions();
    const [removed] = owner.weapons.splice(index, 1);
    markDirty(); renderEquipmentRows(); renderEquipmentSummary(deriveMvpCharacter(owner));
    (elements.weaponRows.querySelector(`[data-remove-weapon="${Math.min(index, owner.weapons.length - 1)}"]`) || document.querySelector('[data-add-weapon]')).focus({preventScroll:true});
    showToast(`已删除${removed.name || removed.weaponType || '空白武器'}`, {label:'撤销',duration:8000,action:()=>{
      if (!workspace.characters.includes(owner) || owner.weapons.length >= 200) return;
      owner.weapons.splice(Math.min(index, owner.weapons.length), 0, removed);
      markDirty();
      if (activeCharacter === owner) {renderEquipmentRows();renderEquipmentSummary(deriveMvpCharacter(owner));}
    }});
    return;
  }
  const fillAction=event.target.closest('[data-fill-action]');
  if(fillAction) {
    const feature=activeCharacter.featureEntries.find(item=>item.id===fillAction.dataset.fillOwner);
    if(!feature) return;
    const rows=featureFillEffects(feature,activeCharacter.ruleset);
    if(fillAction.dataset.fillAction==='add'&&rows.length<32) rows.push({type:'bonus',target:'hp',value:0,scale:'fixed'});
    if(fillAction.dataset.fillAction==='remove') rows.splice(Number(fillAction.dataset.fillIndex),1);
    feature.fillEffects=fillAction.dataset.fillAction==='reset'?null:normalizeFillEffects(rows);
    markDirty();const derived=deriveMvpCharacter(activeCharacter);
    renderFeatureRows();renderStats(derived);renderSkills(derived);renderEffects(derived);renderEquipmentSummary(derived);renderFormMeta(derived);
    const editor=document.querySelector(`[data-effect-editor="${CSS.escape(feature.id)}"]`);
    if(editor) {editor.open=true;editor.querySelector(fillAction.dataset.fillAction==='add'?'.fill-effect-row:last-child select':'summary')?.focus();}
    return;
  }
  const starting=event.target.closest('[data-starting-action]');
  if(starting) { handleStartingEquipment(starting);return; }
  const runtimeAction=event.target.closest('[data-runtime-action]');
  if(runtimeAction) { handleRuntimeAction(runtimeAction); return; }
  const weaponAuto=event.target.closest('[data-weapon-auto]');
  if(weaponAuto) { const w=activeCharacter.weapons[Number(weaponAuto.dataset.weaponAuto)];w.attackMode='auto';w.proficiencyMode='auto';w.proficient=false;markDirty();renderEquipmentRows();return; }
  const clearPortrait = event.target.closest('[data-clear-creature-portrait]');
  if(clearPortrait) { const item = activeCharacter.deployedCreatures.find(c=>c.id === clearPortrait.dataset.clearCreaturePortrait); if(item) item.portrait=''; markDirty(); renderCollections(deriveMvpCharacter(activeCharacter)); return; }
  const pickItem = event.target.closest('[data-select-inventory]');
  if (pickItem) { activeInventoryId = pickItem.dataset.selectInventory; renderInventoryBook(); return; }
  const removeClass = event.target.closest("[data-remove-class]");
  if (removeClass) {
    activeCharacter.multiclasses.splice(Number(removeClass.dataset.removeClass), 1);
    syncCharacterSlots(activeCharacter); closeSuggestions(); markDirty(); render(); return;
  }
  const fixSpellRank = event.target.closest("[data-fix-spell-rank]");
  const keepCustomRank = event.target.closest("[data-keep-custom-rank]");
  const resetCustomRank = event.target.closest("[data-reset-custom-rank]");
  if (fixSpellRank || keepCustomRank || resetCustomRank) {
    const spell = activeCharacter.spells.find((item) => item.id === (fixSpellRank || keepCustomRank || resetCustomRank).dataset.recordId);
    if (!spell) return;
    if (fixSpellRank) {
      const rank = Number(fixSpellRank.dataset.fixSpellRank);
      if (!Number.isInteger(rank) || rank < 0 || rank > 9) return;
      spell.level = rank;
      spell.customRank = false;
    } else spell.customRank = Boolean(keepCustomRank);
    markDirty();
    renderSpellWorkspace();
    return;
  }
  const addAdvancement=event.target.closest('[data-add-advancement]');
  if(addAdvancement) {
    const slot=advancementSlots(activeCharacter).find(s=>s.id===addAdvancement.dataset.addAdvancement);
    if(!slot||activeCharacter.featureEntries.some(f=>f.advancementSource===slot.id&&f.effectMode!=='off')) return;
    const asi=addAdvancement.dataset.reward==='asi';
    const feature={id:createRecordId(),kind:'feat',level:0,name:asi?'属性值提升':'',description:asi?'你可以选择一项属性值提升2点，或是选择两项属性各提升1点。不过你不能通过此特性让属性值超过20。':'',
      advancementSource:slot.id,sourceRuleset:activeCharacter.ruleset,effectMode:'auto'};
    activeCharacter.featureEntries.push(feature);markDirty();render();
    document.querySelector(asi?`[data-feat-choice="${feature.id}"]`:`[data-feature-id="${feature.id}"][data-feature-field="name"]`)?.focus();
    return;
  }
  const addFeature = event.target.closest("[data-add-feature]");
  if (addFeature) {
    const feature = { id: createRecordId(), kind: addFeature.dataset.addFeature, level: 0, name: "", description: "", current: 0, maximum: 0, recovery: "", sourceRuleset:activeCharacter.ruleset };
    if(feature.kind==='species') feature.speciesBinding=speciesContext(activeCharacter);
    activeCharacter.featureEntries.push(feature);
    markDirty();
    renderFeatureRows();
    document.querySelector(`[data-feature-id="${feature.id}"][data-feature-field="name"]`)?.focus();
    return;
  }
  const removeFeature = event.target.closest("[data-remove-feature]");
  if (removeFeature) {
    activeCharacter.featureEntries = activeCharacter.featureEntries.filter((item) => item.id !== removeFeature.dataset.removeFeature);
    markDirty();
    render();
    return;
  }
  const spellSelection = event.target.closest("[data-select-spell]");
  if (spellSelection) {
    activeSpellId = spellSelection.dataset.selectSpell;
    closeSuggestions();
    renderSpellWorkspace();
    elements.spellList.querySelector(`[data-select-spell="${CSS.escape(activeSpellId)}"]`)?.focus({ preventScroll: true });
    return;
  }
  const remove = event.target.closest("[data-remove-record]");
  if (!remove) return;
  const collection = remove.dataset.removeRecord;
  activeCharacter[collection] = activeCharacter[collection].filter((item) => item.id !== remove.dataset.recordId);
  if (collection === "spells" && activeSpellId === remove.dataset.recordId) activeSpellId = activeCharacter.spells[0]?.id ?? null;
  markDirty();
  renderCollections(deriveMvpCharacter(activeCharacter));
}

function updateCollectionRecord(target) {
  const records = activeCharacter[target.dataset.collection];
  const record = records?.find((item) => item.id === target.dataset.recordId);
  if (!record) return;
  const field = target.dataset.recordField;
  const numericFields = ["level", "armorClass", "hitPoints", "currentHitPoints", "tempHitPoints", "quantity", "weight", "amount", "proficiencyBonus"];
  let value = target.type === "checkbox" ? target.checked : target.type === "number" || numericFields.includes(field) || field.startsWith("abilities.") ? numberOr(target.value, 0) : target.value;
  if (field.includes(".")) {
    const [group, key] = field.split(".");
    record[group] ??= {};
    record[group][key] = value;
  } else record[field] = value;
}

function render(preserveClassInputs = false) {
  aiChat.refresh();diceView.refresh();
  document.querySelector('.app-shell').dataset.system=isCoc(activeCharacter)?'coc':'dnd';
  cocRoot.hidden=!isCoc(activeCharacter);elements.characterForm.hidden=isCoc(activeCharacter);
  elements.currentSystemName.textContent='已载入：5E、5R、CoC';
  if(isCoc(activeCharacter)){
    elements.characterTitle.textContent=activeCharacter.name||'新调查员';elements.editionBreadcrumb.textContent='CoC · 七版';
    elements.libraryButtonEdition.textContent='CoC · 独立本地资料';
    renderCharacterList();renderPageState();refreshAssistant();return;
  }
  elements.assistantTraceSelect.innerHTML=dndTraceOptions;
  syncHitDice(activeCharacter);
  let derived;
  try { derived = deriveMvpCharacter(activeCharacter); }
  catch (error) { renderFatalCalculationError(error); return; }
  const issues = validateCharacter(activeCharacter);
  elements.libraryButtonEdition.textContent = `${libraryEdition()} · 本机导入`;
  renderCharacterList();
  renderHeader(derived, issues);
  renderStats(derived);
  renderEffects(derived);
  renderRuntimeControls(derived);
  if (!preserveClassInputs) renderClassConfiguration();
  renderFormMeta(derived, issues);
  renderSkills(derived);
  renderProfile(derived);
  renderIssues(issues);
  renderAssistant(derived);
  renderAdvice(derived);
  renderCollections(derived);
  renderPageState();
}

function renderCharacterList() {
  elements.characterList.innerHTML = workspace.characters.map((character) => {
    const definition = CLASSES[character.classId] ?? CLASSES.bard;
    const active = character.id === activeCharacter.id;
    const token = character.portrait ? `<span class="portrait-token"><img src="${character.portrait}" alt="" /></span>` : `<span class="portrait-token">${escapeHtml((character.name.trim() || "未").slice(0, 1))}</span>`;
    const expanded = expandedCharacterId === character.id;
    const pages = expanded ? `<nav class="character-pages" aria-label="${escapeHtml(character.name.trim() || "未命名角色")}的工作页">${characterPages(character).map((page) => `<button type="button" data-character-page="${page.id}" data-character-owner="${escapeHtml(character.id)}" class="${active && activePage === page.id ? "is-active" : ""}" ${active && activePage === page.id ? 'aria-current="page"' : ""}><span>${escapeHtml(page.label)}</span></button>`).join("")}</nav>` : "";
    const deleteDisabled = workspace.characters.length <= 1;
    const displayName = escapeHtml(character.name.trim() || "未命名角色");
    const subtitle=isCoc(character)?`CoC · ${character.occupation||'调查员'}`:`${definition.name} ${character.level}`;
    return `<div class="character-entry"><div class="character-row"><button type="button" class="character-chip${active ? " is-active" : ""}" data-character-id="${escapeHtml(character.id)}" aria-current="${active ? "true" : "false"}" aria-expanded="${expanded ? "true" : "false"}" title="${displayName}">${token}<span><strong>${displayName}</strong><small>${escapeHtml(subtitle)}</small></span><i class="character-chevron" aria-hidden="true"></i></button><button type="button" class="delete-character" data-delete-character="${escapeHtml(character.id)}" aria-label="删除${displayName}" title="${deleteDisabled ? "至少保留一名人物" : "删除人物"}" ${deleteDisabled ? "disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8l1 2h4v2H3V5h4l1-2Zm1 6h2v8H9V9Zm4 0h2v8h-2V9ZM6 9h2v10h8V9h2v12H6V9Z"/></svg></button></div>${pages}</div>`;
  }).join("");
}

function renderHeader(derived, issues) {
  elements.rulesetDisplay.value = derived.rulesetDefinition.shortName;
  renderExperience();
  elements.characterTitle.textContent = activeCharacter.name.trim() || "未命名角色";
  elements.editionBreadcrumb.textContent = derived.rulesetDefinition.shortName;
  elements.sourcePack.textContent = derived.rulesetDefinition.pack;
  elements.saveButton.disabled = issues.some((issue) => issue.severity === "error");
  elements.currentSystemName.textContent = "已载入：5E、5R、CoC";
}

function renderExperience() {
  const progress = experienceProgress(activeCharacter);
  elements.experienceSummary.textContent = experienceHint(progress);
  elements.experienceSource.textContent = progress?.source || '';
  elements.experienceNote.textContent = `累计经验，不在升级时扣除。${progress?.xpLevel ? `当前经验对应 ${progress.xpLevel} 级。` : ''}兼职按总等级计算；此处只作参考，不自动修改等级，里程碑升级可不填经验。`;
  const table = (start, end) => `<table><thead><tr><th scope="col">等级</th><th scope="col">累计经验值</th><th scope="col">相比上一级</th></tr></thead><tbody>${EXPERIENCE_THRESHOLDS.slice(start, end).map((xp, i) => {
    const index = start + i;
    return `<tr${progress?.level === index + 1 ? ' aria-current="true"' : ''}><th scope="row">${index + 1}${progress?.level === index + 1 ? '（当前）' : ''}</th><td>${xp.toLocaleString('zh-CN')}</td><td>${index === 0 ? '—' : `+${(xp - EXPERIENCE_THRESHOLDS[index - 1]).toLocaleString('zh-CN')}`}</td></tr>`;
  }).join('')}</tbody></table>`;
  elements.experienceTable.innerHTML = table(0, 10) + table(10, 20);
}

async function loadClassCatalog() {
  const ruleset = activeCharacter.ruleset;
  if (!classCatalog.has(ruleset)) {
    try {
      const response = await fetch(`/api/library/classes?ruleset=${encodeURIComponent(ruleset)}`);
      if (!response.ok) throw new Error("职业索引暂不可用");
      const data=await response.json();
      if(data.ruleset!==ruleset) throw new Error('职业资料规则版本不匹配');
      classCatalog.set(ruleset, (data.results||[]).map(entry=>({...entry,ruleset:data.ruleset})));
    } catch { if (activeCharacter.ruleset === ruleset) elements.classStartingInfo.textContent = "职业来源索引未载入，仍可手动填写。"; return; }
  }
  if (activeCharacter.ruleset === ruleset) renderClassConfiguration();
}

async function fillAvailableClassFeatures() {
  return fillAvailableFeatures('class');
}
const featureImportRequests={class:0,species:0};
async function fillAvailableFeatures(kind, automatic=false) {
  let transition={archived:0,restored:0};
  if(kind==='species') {
    try {transition=switchSpeciesFeatures(activeCharacter);markDirty();renderFeatureRows();}
    catch(error) {elements.speciesImportStatus.textContent=error.message;return;}
  }
  const ticket=++featureImportRequests[kind];
  const characterId = activeCharacter.id;
  const context = JSON.stringify(suggestionCharacterContext());
  const ruleset = activeCharacter.ruleset;
  const button=kind==='class'?elements.fillClassFeatures:elements.fillSpeciesFeatures;
  const status=kind==='class'?elements.classImportStatus:elements.speciesImportStatus;
  const label=button.dataset.importLabel || button.textContent;
  button.dataset.importLabel=label;
  button.disabled=true; button.setAttribute('aria-busy','true'); button.textContent='正在补入…';
  status.textContent='正在读取当前规则的资料…';
  try {
    const requestContext=context;
    const data=await libraryGet(`/api/library/features?${new URLSearchParams({ruleset,kind,context:requestContext})}`);
    if (ticket!==featureImportRequests[kind] || activeCharacter.id !== characterId || JSON.stringify(suggestionCharacterContext()) !== context) {
      if(ticket===featureImportRequests[kind] && activeCharacter.id===characterId) status.textContent='人物条件已变化，未写入；请重新补入。'; return;
    }
    const {added,skipped,overflow,updated}=kind==='species' ? syncSpeciesFeatures(activeCharacter,data.results,createRecordId) : appendImportedFeatures(activeCharacter,data.results,kind,createRecordId);
    markDirty(); renderFeatureRows();
    if(kind==='species' && data.sourceChoices?.length) {
      for(const choice of data.sourceChoices) {
        if([...elements.speciesImportSources.querySelectorAll('select')].some(el=>el.dataset.speciesImportSource===choice.name)) continue;
        elements.speciesImportSources.insertAdjacentHTML('beforeend',`<label>${escapeHtml(choice.name)}的来源<select data-species-import-source="${escapeHtml(choice.name)}"><option value="">请选择来源版本…</option>${choice.options.map(option=>`<option value="${escapeHtml(option.id)}">${escapeHtml(option.label)}</option>`).join('')}</select></label>`);
      }
    }
    status.textContent=`已补入 ${added} 项，已有 ${skipped} 项保持不变。${updated?`更新 ${updated} 项未手改的旧正文。`:''}${overflow?`记录已满，另有 ${overflow} 项未加入。`:''} ${data.sourceChoices?.length?'请在下方选择来源后再次补入。 ':''}${(data.warnings||[]).join(' ')} 本次补入特性说明；数值、自选项及法术按原文填写。`;
    if(!automatic || added) showToast(`已补入 ${added} 项${kind==='species'?'种族特性':'职业能力'}。`);
    if(kind==='species') status.textContent+=` 已撤下旧种族 ${transition.archived} 项，恢复 ${transition.restored} 项。旧记录保存在人物备份中，切回对应种族可恢复。`;
  } catch (error) { if(ticket===featureImportRequests[kind] && activeCharacter.id===characterId) status.textContent=`暂未补入：${error.message}。可重试。${transition.archived?'旧种族记录已移入存档，未丢失。':'原记录未改动。'}`; }
  finally { if(ticket===featureImportRequests[kind]) {button.disabled=false; button.removeAttribute('aria-busy'); button.textContent=label;} }
}

function renderClassConfiguration() {
  const classes = characterClasses(activeCharacter);
  const catalog = classCatalog.get(activeCharacter.ruleset) || [];
  const subclasses = (id) => catalog.find((c) => c.classId === id)?.payload?.规则关联?.subclasses || [];
  const options = (id) => subclasses(id).map((s) => `<option value="${escapeHtml(s.name)}">${s.minLevel} 级起</option>`).join("");
  elements.subclassOptions.innerHTML = options(activeCharacter.classId);
  elements.classLevelSummary.textContent = `总等级 ${totalLevel(activeCharacter)} / 20 · ${classes.map((c) => `${CLASSES[c.classId]?.name || c.classId} ${c.level}`).join(" / ")}`;
  elements.addMulticlass.disabled = totalLevel(activeCharacter) >= 20 || classes.length >= Object.keys(CLASSES).length;
  elements.multiclassRows.innerHTML = activeCharacter.multiclasses.map((c, index) => {
    const attr = `data-class-index="${index}"`;
    return `<div class="multiclass-row"><label class="field"><span>兼职职业</span><select ${attr} data-class-field="classId" aria-label="兼职${index + 1}职业">${Object.entries(CLASSES).filter(([id]) => id === c.classId || !classes.some((x) => x.classId === id)).map(([id, value]) => option(id, c.classId, value.name)).join("")}</select></label><label class="field"><span>职业等级</span><input type="number" min="1" max="20" ${attr} data-class-field="level" value="${c.level}" aria-label="兼职${index + 1}等级" /></label><label class="field"><span>子职业</span><input ${attr} data-class-field="subclass" value="${escapeHtml(c.subclass)}" list="multiSubclass${index}" aria-label="兼职${index + 1}子职业" placeholder="选择或输入子职" /><datalist id="multiSubclass${index}">${options(c.classId)}</datalist></label><button type="button" class="secondary" data-remove-class="${index}" aria-label="移除兼职${index + 1}">移除</button></div>`;
  }).join("") + (activeCharacter.multiclassUnresolved ? `<label class="field legacy-class-note"><span>旧兼职备注未识别；请先添加对应职业，再清空此栏以启用计算</span><input data-legacy-class-note value="${escapeHtml(activeCharacter.multiclassUnresolved)}" aria-label="未识别的兼职备注" /></label>` : "");
  const notes = multiclassIssues(suggestionCharacterContext());
  for (const c of classes) {
    const subclass = subclasses(c.classId).find((s) => s.name === c.subclass);
    if (subclass?.minLevel > c.level) notes.push(`${CLASSES[c.classId].name} ${subclass.minLevel} 级才能获得${c.subclass}。`);
    if (c.subclass && !subclass && classCatalog.has(activeCharacter.ruleset)) notes.push(`${c.subclass}尚无当前规则版本的子职关联，按自定义内容保留，请核对来源。`);
  }
  elements.classPrerequisiteNote.textContent = notes.join(" ");
  elements.classPrerequisiteNote.hidden = !notes.length;
  elements.multiclassRows.querySelectorAll('[data-class-field="subclass"]').forEach((input,index) => {
    input.removeAttribute('list'); input.dataset.suggestKind='subclass';
    const combo=document.createElement('div'); combo.className='subclass-combo';
    input.before(combo); combo.append(input);
    combo.insertAdjacentHTML('beforeend',`<button type="button" data-subclass-dropdown aria-label="展开兼职${index+1}子职业列表" title="选择子职业">⌄</button>`);
  });
  const primary = catalog.find((c) => c.classId === activeCharacter.classId);
  const p = primary?.payload?.初始熟练与装备 || primary?.payload || {};
  elements.classStartingInfo.innerHTML = `<p>初始豁免只来自首个职业，之后的职业能力与专长另行计算。兼职不重复授予初始装备。</p>${typeof p==='string'?`<p class="starting-source-text">${escapeHtml(p)}</p>`:Object.entries(p).filter(([key,value])=>/熟练|护甲|装备/.test(key)&&typeof value!=='object').map(([key,value])=>`<p><strong>${escapeHtml(key)}</strong> ${escapeHtml(String(value))}</p>`).join('')}${renderStartingEquipment(primary)}`;
}

function renderStartingEquipment(entry) {
  const plan=startingEquipmentPlan(activeCharacter,entry),receipt=activeCharacter.startingEquipmentReceipt;
  if(receipt) return `<p>已领取：${escapeHtml(receipt.name)} · ${escapeHtml(receipt.ruleset)}。领取物保留在背包，切换职业不会删除。</p><button type="button" data-starting-action="undo">撤销初始装备领取</button><p>仅在领取物和金币未改动时可自动撤销。</p>`;
  if(!plan) return '<p>等待载入当前职业的初始装备原文。</p>';
  if(plan.review) return `<p role="status">${escapeHtml(plan.review)}</p>`;
  return `<fieldset class="grant-group"><legend>初始装备方案</legend><div class="grant-selects">${plan.groups.map((group,i)=>`<label>第${i+1}组<select data-starting-branch="${i}" aria-label="初始装备第${i+1}组">${option('',plan.choice.branches?.[i]||'','请选择方案…')}${group.map(o=>option(o.id,plan.choice.branches?.[i]||'',`${o.id}：${o.text}`)).join('')}</select></label>`).join('')}</div>${plan.fixed.length?`<p>固定装备：${escapeHtml(plan.fixed.join('；'))}</p>`:''}${plan.pending.map(p=>`<label class="field"><span>具体物品：${escapeHtml(p.label)}</span><input data-starting-replacement="${escapeHtml(p.id)}" value="${escapeHtml(p.selected)}" aria-label="具体物品 ${escapeHtml(p.label)}" placeholder="填写具体武器、工具或乐器名称" maxlength="120" /></label>`).join('')}<p>待入背包：${escapeHtml(plan.items.map(x=>`${x.name} ×${x.quantity}`).join('、')||'无')}；金币 ${plan.gp} GP。</p><label class="starting-confirm"><input type="checkbox" id="startingRestrictions" ${plan.choice.confirmRestrictions?'checked':''} />已核对未领取过初始职业装备；自选物品及熟练限制符合原文</label><p>只领取一次，不自动着装；套组暂按整包记录，未匹配重量会标记待核对。背景装备另行记录。</p><p role="status" id="startingFeedback">${escapeHtml(plan.errors.join('；'))}</p><button type="button" data-starting-action="apply">领取所选方案到背包</button></fieldset>`;
}

async function handleStartingEquipment(button) {
  const c=activeCharacter,entry=(classCatalog.get(c.ruleset)||[]).find(x=>x.classId===c.classId);
  const status=document.getElementById('startingFeedback');
  try {
    if(button.dataset.startingAction==='undo') {undoStartingEquipment(c);markDirty();render();showToast('已撤销初始装备领取');return;}
    const plan=startingEquipmentPlan(c,entry);
    if(!plan||plan.errors.length||!plan.choice.confirmRestrictions) throw new Error(plan?.errors.join('；')||'请先核对并勾选领取确认。');
    const fingerprint=JSON.stringify(c);button.disabled=true;button.textContent='核对物品资料…';
    const itemDetails=await Promise.all(plan.items.map(async item=>{
      try {
        const result=await libraryGet(`/api/library/search?${new URLSearchParams({ruleset:c.ruleset,query:item.name,limit:'50'})}`);
        const match=result.results.filter(x=>['item','weapon','armor','tool'].includes(x.kind)&&x.name===item.name);
        if(match.length!==1) return {};
        const data=await libraryGet(`/api/library/entry?${new URLSearchParams({id:match[0].id,ruleset:c.ruleset})}`);
        const fullEntry=data.entry||data,payload=fullEntry.payload||{};
        return {weight:catalogUnitWeight(fullEntry),description:String(payload.描述||payload.说明||'')};
      } catch {return {};}
    }));
    if(activeCharacter!==c||fingerprint!==JSON.stringify(c)) throw new Error('查询期间人物卡发生变化，请重新核对方案后领取。');
    const message=applyStartingEquipment(c,entry,{confirmed:true,itemDetails});markDirty();render();showToast(message);
  } catch(error) {if(status) status.textContent=error.message;showToast(error.message);}
  finally {button.disabled=false;button.textContent='领取所选方案到背包';}
}

function renderCollections(derived) {
  renderFeatureRows();
  renderResourceSummary();
  elements.spellAbilitySummary.textContent = derived.castingAbility ? ABILITIES[derived.castingAbility] : "无";
  elements.spellDcSummary.textContent = derived.spellcasting?.saveDc ?? "—";
  elements.spellAttackSummary.textContent = derived.spellcasting ? signed(derived.spellcasting.attackBonus) : "—";
  elements.cantripCountSummary.textContent = activeCharacter.spells.filter((spell) => Number(spell.level) === 0).length;
  elements.preparedCountSummary.textContent = activeCharacter.spells.filter((spell) => spell.prepared).length;
  elements.spellCount.textContent = `${activeCharacter.spells.length} 个`;
  elements.creatureCount.textContent = `${activeCharacter.deployedCreatures.length} 个`;
  elements.spellSlots.innerHTML = Array.from({ length: 9 }, (_, index) => {
    const level = String(index + 1); const slot = activeCharacter.spellSlots[level];
    return `<label class="slot-field"><span>${level} 环</span><span><input type="number" min="0" max="99" data-spell-slot="${level}" data-slot-field="current" value="${escapeHtml(slot.current)}" aria-label="${level}环现有法术位" /><i>/</i><input type="number" min="0" max="99" data-spell-slot="${level}" data-slot-field="maximum" value="${escapeHtml(slot.maximum)}" aria-label="${level}环法术位上限" /></span></label>`;
  }).join("");
  const progression = spellProgression(activeCharacter);
  const casters = progression.classes.filter((c) => c.kind !== "none");
  elements.spellcastingClass.innerHTML = casters.length ? casters.map((c) => option(c.classId, derived.castingClassId, `${CLASSES[c.classId].name} ${c.level} 级 · ${ABILITIES[c.ability]}`)).join("") : '<option value="other">其他来源 / 自定义</option>';
  elements.spellClassHint.textContent = casters.length ? "按各职业自己的等级筛选可学法术；合并法术位不提高可学环阶。每条法术可指定职业或其他来源。" : "没有默认施法职业；专长、种族及团规法术使用其他来源。";
  elements.spellSlotAutoFill.hidden = !casters.length;
  elements.spellSlotAutoFill.disabled = totalLevel(activeCharacter) > 20 || Boolean(activeCharacter.multiclassUnresolved);
  elements.spellSlotAutoFill.textContent = "重算法术位并补满";
  elements.spellSlotRuleNote.textContent = "普通法术位与契约位分开记录；升级保留已消耗量。准备/已知上限见下方，秘奥法门与特殊免费施法仍需核对。";
  const pact = activeCharacter.pactSlots || progression.pact;
  if (progression.pact.maximum) elements.spellSlots.insertAdjacentHTML("beforeend", `<label class="slot-field pact-slot"><span>契约 · ${pact.level} 环</span><span><input type="number" min="0" data-pact-field="current" value="${pact.current || 0}" aria-label="现有契约法术位" /><i>/</i><input type="number" min="0" data-pact-field="maximum" value="${pact.maximum}" aria-label="契约法术位上限" /></span><small>短休或长休恢复</small></label>`);
  renderEquipmentRows();
  renderSpellWorkspace();
  elements.creatureList.innerHTML = activeCharacter.deployedCreatures.length ? activeCharacter.deployedCreatures.map(renderCreatureRecord).join("") : emptyRecord("尚未部署生物", "魔宠、召唤物和同行生物都可以放在这里。");
  renderInventoryBook();
  elements.ledgerList.innerHTML = activeCharacter.ledger.length ? activeCharacter.ledger.map(renderLedgerRecord).join("") : emptyRecord("账本为空", "添加收入或支出项目，保留金币流向。");
  renderEquipmentSummary(derived);
}

function renderFeatureRows() {
  const history=activeCharacter.speciesFeatureArchive||[];
  elements.speciesHistory.hidden=!history.length;
  const historyOpen=elements.speciesHistory.open;
  elements.speciesHistory.innerHTML=`<summary>旧种族特性存档 · ${history.length} 项（不参与当前卡片）</summary><p>切回对应种族／亚种会恢复原记录；JSON 人物备份包含此存档。</p>${history.map(f=>`<details><summary>${escapeHtml(f.name)} · ${escapeHtml(f.catalogEntry?.payload?.规则关联?.species||'手写记录')}</summary><p class="starting-source-text">${escapeHtml(f.description)}</p></details>`).join('')}`;
  elements.speciesHistory.open=historyOpen;
  const sourceContext=JSON.stringify([activeCharacter.id,activeCharacter.ruleset,activeCharacter.species,activeCharacter.subrace]);
  if(elements.speciesImportSources.dataset.context!==sourceContext) {
    elements.speciesImportSources.replaceChildren();
    elements.speciesImportSources.dataset.context=sourceContext;
    elements.speciesImportStatus.textContent='';
  }
  const opened=new Set([...document.querySelectorAll('[data-effect-editor][open]')].map(el=>el.dataset.effectEditor));
  const effects=characterEffects(activeCharacter);
  const groups = { class: elements.classFeatureRows, species: elements.speciesFeatureRows, feat: elements.featRows, fighting: elements.fightingFeatureRows, special: elements.specialFeatureRows };
  for (const [kind, container] of Object.entries(groups)) {
    const entries = activeCharacter.featureEntries.filter((item) => item.kind === kind);
    container.innerHTML = entries.length ? entries.map((item) => {
      const attrs = `data-feature-id="${escapeHtml(item.id)}"`;
      return `<div class="feature-ledger-row" data-record-id="${escapeHtml(item.id)}">${["class", "feat"].includes(kind) ? `<input type="number" min="0" max="20" ${attrs} data-feature-field="level" value="${item.level || ""}" aria-label="获得等级" />` : ""}<input ${attrs} data-feature-field="name" ${kind === "class" ? 'data-suggest-kind="class_feature"' : ["feat", "fighting"].includes(kind) ? 'data-suggest-kind="feat"' : kind === "special" ? 'data-suggest-kind="feature_option"' : ""} value="${escapeHtml(item.name)}" maxlength="120" aria-label="特性名称" /><textarea ${attrs} data-feature-field="description" rows="2" maxlength="3000" aria-label="特性描述">${escapeHtml(item.description)}</textarea><button type="button" data-remove-feature="${escapeHtml(item.id)}" aria-label="移除${escapeHtml(item.name || "此特性")}">×</button>${kind === "special" ? `<div class="feature-resource"><label>现有<input type="number" min="0" ${attrs} data-feature-field="current" value="${item.current}" /></label><label>上限<input type="number" min="0" ${attrs} data-feature-field="maximum" value="${item.maximum}" /></label><label>恢复<input ${attrs} data-feature-field="recovery" value="${escapeHtml(item.recovery)}" maxlength="40" placeholder="短休 / 长休" /></label></div>` : ""}</div>`;
    }).join("") : '<p class="feature-empty">尚未记录</p>';
  }
  for (const item of activeCharacter.featureEntries) {
    const input = document.querySelector(`[data-feature-id="${CSS.escape(item.id)}"][data-feature-field="name"]`);
    if (item.kind === 'species' && input) { input.dataset.suggestKind='species_feature'; input.placeholder='搜索当前种族特性或自行填写'; }
    if (item.kind === 'fighting' && input) input.dataset.suggestKind = 'fighting_style';
    input?.closest('.feature-ledger-row')?.insertAdjacentHTML('beforeend',renderFillEffectEditor(item,activeCharacter.ruleset,escapeHtml,opened.has(item.id)));
    if(item.kind==='feat') {
      const result=effects.activations.find(a=>a.feature.id===item.id);
      input?.closest('.feature-ledger-row')?.insertAdjacentHTML('beforeend',`<small class="feature-eligibility" role="status">${result?.active?(item.effectMode==='manual'?'玩家确认应用':'自动效果已应用'):'未应用：'+escapeHtml(result?.reason||'待核对')}；属性与来源分配见上方“属性提升与专长来源”。</small>`);
    }
    if (!item.catalogEntry) continue;
    const eligibility = entryEligibility(item.catalogEntry, suggestionCharacterContext(), { featureKind: item.kind });
    const notes = [...eligibility.failures, ...eligibility.review];
    if (item.kind === 'feat' && !['健壮','警觉','属性值提升'].includes(item.name)) notes.push(effects.advancement.rows.some(r=>r.feature.id===item.id)?'属性选择已适配；其余条件效果仍按原文处理':'此专长的条件效果仍按原文处理');
    if (item.catalogEntry.ruleset && item.catalogEntry.ruleset !== activeCharacter.ruleset) notes.unshift("来源规则与当前人物不一致");
    const link = item.catalogEntry.payload?.规则关联 || {};
    const source = [item.catalogEntry.payload?.来源卷册, link.className, link.subclass, link.speciesOption, link.minLevel && item.kind!=='species' ? `${link.minLevel} 级` : ""].filter(Boolean).join(" · ");
    if (!notes.length && !source) continue;
    const row = document.querySelector(`[data-record-id="${CSS.escape(item.id)}"].feature-ledger-row`);
    row?.insertAdjacentHTML("beforeend", `<small class="feature-eligibility ${eligibility.status}" role="status">${escapeHtml([source, notes.join("；")].filter(Boolean).join(" — "))}</small>`);
  }
  refreshFeaturePanels();
}

function renderResourceSummary() {
  const coins = activeCharacter.currency;
  const inventoryWeight = activeCharacter.inventory.reduce((sum, item) => sum + Math.max(0, Number(item.weight) || 0) * Math.max(0, Number(item.quantity) || 0), 0);
  const coinCount = Object.values(coins).reduce((sum, count) => sum + (Number(count) || 0), 0);
  const coinWeight = coinCount / 50;
  const formatWeight = (value) => `${Number(value.toFixed(2))} 磅`;
  elements.inventoryWeightSummary.textContent = formatWeight(inventoryWeight);
  elements.coinWeightSummary.textContent = formatWeight(coinWeight);
  elements.recordedWeightSummary.textContent = formatWeight(inventoryWeight + coinWeight + (Number(activeCharacter.equipmentLoad) || 0));
  for (const [coin, element] of [["pp", elements.summaryPp], ["gp", elements.summaryGp], ["ep", elements.summaryEp], ["sp", elements.summarySp], ["cp", elements.summaryCp]]) element.textContent = coins[coin] ?? 0;
  elements.wealthSummary.textContent = `${Number(((coins.pp * 10) + coins.gp + (coins.ep / 2) + (coins.sp / 10) + (coins.cp / 100)).toFixed(2))} GP`;
  const load=loadSummary(activeCharacter);
  elements.carryingCapacity.placeholder=String(load.capacity);
  elements.carryingCapacity.title=`力量与体型自动载重 ${load.capacity} 磅；输入数值可覆盖`;
  elements.recordedWeightSummary.textContent+=` / ${load.capacity} 磅${load.over?'（超载）':''}${load.manualEquipment?'':'（未含未登记的装备重量）'}`;
}

function renderEquipmentRows() {
  const weaponFields = [
    ["weaponType", "武器类型", "text"], ["attuned", "同调", "checkbox"], ["name", "名称", "text"], ["bonus", "加值", "number"],
    ["properties", "特性", "text"], ["proficient", "熟练", "checkbox"], ["attackDie", "攻击骰", "text"], ["damageDie", "伤害骰", "text"],
    ["damageType", "伤害类型", "text"], ["extraDamageDie", "附加伤害骰", "text"], ["extraDamageType", "附加伤害类型", "text"], ["mastery", "精通", "text"], ["effect", "效果", "text"],
  ];
  const fieldHtml = (collection, index, item, [field, label, type]) => {
    const attribute = collection === "weapons" ? "data-weapon-index" : "data-curio-index";
    const common = `${attribute}="${index}" data-item-field="${field}" aria-label="${collection === "weapons" ? "武器" : "奇物"}${index + 1}${label}"`;
    if (type === "checkbox") return `<label class="ledger-cell ledger-check" data-label="${label}"><input type="checkbox" ${common} ${item[field] ? "checked" : ""} /></label>`;
    if (type === "select") return `<label class="ledger-cell" data-label="${label}"><select ${common}><option value="">—</option>${(field === "rarity" ? ["普通", "非普通", "珍稀", "极珍稀", "传说", "神器"] : CURIO_SLOTS).map((option) => `<option value="${option}" ${item[field] === option ? "selected" : ""}>${option}</option>`).join("")}</select></label>`;
    const suggest = field === "weaponType" ? 'data-suggest-kind="weapon" placeholder="输入或选择"'
      : collection === "curios" && field === "name" ? 'data-suggest-kind="curio" placeholder="输入奇物名称"' : "";
    if (collection === 'weapons' && field === 'effect') return `<div class="ledger-cell weapon-effect-cell" data-label="效果"><input type="text" ${common} value="${escapeHtml(item.effect)}" maxlength="500" /><button type="button" data-remove-weapon="${index}" aria-label="删除武器${index + 1}${escapeHtml(item.name || item.weaponType)}" title="删除此武器">×</button></div>`;
    return `<label class="ledger-cell" data-label="${label}"><input type="${type}" ${common} value="${escapeHtml(item[field] ?? "")}" ${type === "number" ? 'min="-10" max="20"' : 'maxlength="500"'} ${suggest} /></label>`;
  };
  elements.weaponRows.innerHTML = activeCharacter.weapons.map((item, index) => {
    const calculated=weaponCalculation(activeCharacter,item);
    const display={...item,attackDie:item.weaponType||item.name?calculated.attackDie:item.attackDie||'',proficient:calculated.proficient};
    return `<div class="weapon-ledger-row">${weaponFields.map((field) => fieldHtml("weapons", index, display, field)).join("")}</div>${item.weaponType||item.name?`<div class="weapon-calculation" data-weapon-result="${index}"><span>命中 ${escapeHtml(calculated.attackDie)}；伤害 ${escapeHtml(calculated.damageDie||'未填')}。${escapeHtml(calculated.note)}</span><label>属性<select data-weapon-index="${index}" data-item-field="ability" aria-label="武器${index+1}攻击属性">${option('',item.ability||'','按武器自动')}${Object.entries(ABILITIES).map(([id,name])=>option(id,item.ability,name)).join('')}</select></label><button type="button" data-weapon-auto="${index}">恢复自动计算</button><small>${item.attackMode==='manual'?'攻击骰已手动覆盖':'攻击骰自动计算'}；直接修改攻击骰或熟练可覆盖</small></div>`:''}`;
  }).join("");
  const curioFields = [["name", "奇物", "text"], ["attuned", "同调", "checkbox"], ["rarity", "稀有度", "select"], ["slot", "部位", "select"], ["properties", "特性", "text"]];
  elements.curioRows.innerHTML = activeCharacter.curios.map((item, index) => `<div class="curio-ledger-row">${curioFields.map((field) => fieldHtml("curios", index, item, field)).join("")}</div>`).join("");
}

function renderEquipmentSummary(derived) {
  const armor = ARMORS[activeCharacter.armorId] ?? ARMORS.unarmored;
  elements.armorBaseAc.textContent = armor.base + Number(activeCharacter.armorBonus || 0);
  elements.armorDexBonus.textContent = armor.category === "heavy" ? 0 : armor.category === "medium" ? Math.min(2, derived.abilityModifiers.dex) : derived.abilityModifiers.dex;
  const attunedCount = getAttunedEquipment(activeCharacter).length;
  elements.attunementCount.textContent = attunedCount;
  elements.attunementCounter.classList.toggle("is-over-limit", attunedCount > derived.mechanics.attunementLimit);
  elements.attunementCounter.title=`当前同调上限 ${derived.mechanics.attunementLimit}`;
  elements.attunementLimit.textContent=derived.mechanics.attunementLimit;
}

function renderSpellWorkspace() {
  elements.spellCapacitySummary.textContent=spellCapacity(activeCharacter).map(c=>`${CLASSES[c.classId].name} ${c.level}级：${c.mode} ${c.count} / ${c.limit??'待核对'}${c.over?'（超过上限）':''}`).join('；')+'。不含戏法；额外常备法术单独标记。';
  if (!activeCharacter.spells.some((item) => item.id === activeSpellId)) activeSpellId = activeCharacter.spells[0]?.id ?? null;
  const ordered = orderSpellsForBook(activeCharacter.spells);
  elements.preparedCountSummary.textContent = ordered.filter((spell) => spell.prepared).length;
  elements.cantripCountSummary.textContent = ordered.filter((spell) => Number(spell.level) === 0).length;
  elements.spellList.innerHTML = ordered.length ? Array.from({ length: Math.ceil(ordered.length / 50) }, (_, column) => {
    const start = column * 50;
    return `<div class="spell-ledger-column"><div class="spell-ledger-head" aria-hidden="true"><span>序号</span><span>环阶</span><span>法术名称</span><span>准备</span></div>${ordered.slice(start, start + 50).map((spell, index) => renderSpellRecord(spell, start + index)).join("")}</div>`;
  }).join("") : emptyRecord("尚未记录法术", "添加法术后，在右侧选择条目查看详情。");
  const selected = activeCharacter.spells.find((item) => item.id === activeSpellId);
  elements.spellInspector.innerHTML = selected ? renderSpellInspector(selected) : '<p class="spell-inspector-empty">从右侧法术列表中选择一项。</p>';
  updateSpellRankStatus();
}

function spellRankLabel(rank) { return rank === 0 ? "戏法" : `${rank} 环`; }

async function lookupSpellRanks(ruleset, name) {
  const key = `${ruleset}\u0000${name.trim().toLocaleLowerCase()}`;
  if (!spellRankCache.has(key)) {
    const lookup = (async () => {
      const results = [];
      let offset = 0;
      let total = 0;
      do {
        const params = suggestionSearchParams({ ruleset, kind: "spell", query: name, limit: 50 });
        params.set("offset", String(offset));
        const page = await libraryGet(`/api/library/search?${params}`);
        results.push(...page.results);
        total = page.total;
        offset += page.results.length;
      } while (offset < total && offset < 10000 && results.length > 0 && catalogSpellRanks(name, results).length === 0);
      return catalogSpellRanks(name, results);
    })().catch((error) => { spellRankCache.delete(key); throw error; });
    spellRankCache.set(key, lookup);
  }
  return spellRankCache.get(key);
}

async function updateSpellRankStatus() {
  const requestId = ++spellRankStatusRequestId;
  const spell = activeCharacter.spells.find((item) => item.id === activeSpellId);
  const status = elements.spellInspector.querySelector("[data-spell-rank-status]");
  if (!spell || !status || !spell.name.trim()) {
    if (status) status.hidden = true;
    return;
  }
  status.classList.toggle("is-custom", spell.customRank);
  if (spell.customRank) {
    status.hidden = false;
    status.innerHTML = `<span>同名自定义法术 · ${escapeHtml(spell.name.trim())}按人物卡填写的${spellRankLabel(Number(spell.level))}保留，不视作资料库法术。</span><button type="button" data-reset-custom-rank data-record-id="${escapeHtml(spell.id)}">恢复资料库校验</button>`;
    return;
  }
  const ruleset = libraryRuleset();
  const name = spell.name.trim();
  try {
    const ranks = await lookupSpellRanks(ruleset, name);
    if (requestId !== spellRankStatusRequestId || activeCharacter.spells.find((item) => item.id === activeSpellId) !== spell
      || spell.name.trim() !== name || libraryRuleset() !== ruleset || !status.isConnected) return;
    if (!spellRankConflict(spell, ranks)) { status.hidden = true; return; }
    const suggested = ranks[0];
    status.hidden = false;
    status.innerHTML = `<span>环阶冲突：${escapeHtml(name)}在当前资料库中是${ranks.map(spellRankLabel).join("、")}，人物卡却填了${spellRankLabel(Number(spell.level))}。</span><button type="button" data-fix-spell-rank="${suggested}" data-record-id="${escapeHtml(spell.id)}">改为${spellRankLabel(suggested)}</button><button type="button" data-keep-custom-rank data-record-id="${escapeHtml(spell.id)}">同名自定义法术</button>`;
  } catch {
    if (requestId === spellRankStatusRequestId && status.isConnected) status.hidden = true;
  }
}

function renderSpellRecord(item, index) {
  return renderSpellIndexRow(item, index, activeSpellId);
}

function renderSpellInspector(item) {
  const record = recordAttrs("spells", item.id);
  const sourceClass = spellSourceClass(item);
  const classChoices = spellProgression(activeCharacter).classes.filter((c) => c.kind !== "none");
  const missingClass = sourceClass !== "other" && !classChoices.some((c) => c.classId === sourceClass);
  const classStatus = sourceClass !== "other" && item.name ? entryEligibility({ kind: "spell", rank: item.level, payload: { 职业列表: String(item.classes || "").split(/[\s、,，/]+/) } }, activeCharacter, { castingClassId: sourceClass }) : null;
  return `<article class="spell-book-page" data-record-id="${escapeHtml(item.id)}">
    <header class="spell-book-title"><label><span>法术名称 · 可搜索或自定义</span><input ${record} data-record-field="name" data-suggest-kind="spell" value="${escapeHtml(item.name)}" maxlength="120" placeholder="输入法术名" aria-label="法术名称" /></label><label><span>出处</span><input ${record} data-record-field="source" value="${escapeHtml(item.source)}" maxlength="160" aria-label="法术出处" /></label></header>
    <div class="spell-rank-status" data-spell-rank-status role="status" hidden></div>
    <label class="spell-book-line spell-source-class"><span>学习来源</span><select ${record} data-record-field="castingClassId" aria-label="法术学习来源">${classChoices.map((c) => option(c.classId, sourceClass, `${CLASSES[c.classId].name} ${c.level} 级`)).join("")}${missingClass ? option(sourceClass, sourceClass, `${CLASSES[sourceClass]?.name || sourceClass}（当前已无此施法来源）`) : ""}${option("other", sourceClass, "其他来源 / 自定义")}</select></label>
    ${classStatus?.failures.length ? `<p class="spell-class-status" role="status">${escapeHtml(classStatus.failures.join("；"))}。特殊授予的法术请选择“其他来源”，原有内容不会被删除。</p>` : ""}
    <label class="spell-book-prepared"><input type="checkbox" ${record} data-record-field="prepared" ${item.prepared ? 'checked' : ''} aria-label="准备此法术" />准备此法术<span>已准备法术在右侧按环阶优先排列</span></label>
    <label class="spell-book-prepared"><input type="checkbox" ${record} data-record-field="alwaysPrepared" ${item.alwaysPrepared?'checked':''} />额外常备（不占准备上限，请确认授予来源）</label>
    <div class="spell-cast-controls"><label>消耗法术位<select id="castSlotChoice" aria-label="施放使用的法术位">${item.level===0?'<option value="cantrip">戏法 · 不消耗</option>':Object.entries(activeCharacter.spellSlots).filter(([rank,slot])=>Number(rank)>=item.level&&slot.maximum>0).map(([rank,slot])=>`<option value="${rank}">${rank} 环 · 剩余 ${slot.current}</option>`).join('')+(activeCharacter.pactSlots?.level>=item.level&&activeCharacter.pactSlots.maximum>0?`<option value="pact">契约 ${activeCharacter.pactSlots.level}环 · 剩余 ${activeCharacter.pactSlots.current}</option>`:'')}</select></label><button type="button" data-runtime-action="cast" data-spell-id="${escapeHtml(item.id)}">施放并记录</button>${item.concentration&&activeCharacter.concentrationSpellId&&activeCharacter.concentrationSpellId!==item.id?'<label><input id="replaceConcentration" type="checkbox" />结束旧专注</label>':''}<button type="button" data-runtime-action="undo" ${lastResourceOperation?.id===activeCharacter.id?'':'disabled'}>撤销上次资源操作</button></div>
    <div class="spell-book-facts">
      <label class="spell-book-classes"><span>适用职业</span><input ${record} data-record-field="classes" value="${escapeHtml(item.classes || "")}" maxlength="240" aria-label="适用职业" /></label>
      <label><span>环阶</span><select ${record} data-record-field="level" aria-label="法术环阶">${Array.from({ length: 10 }, (_, level) => `<option value="${level}" ${Number(item.level) === level ? "selected" : ""}>${level === 0 ? "戏法" : `${level} 环`}</option>`).join("")}</select></label>
      <label><span>系别</span><input ${record} data-record-field="school" value="${escapeHtml(item.school)}" maxlength="40" aria-label="法术系别" /></label>
      <label><span>施法时间</span><input ${record} data-record-field="castingTime" value="${escapeHtml(item.castingTime)}" maxlength="80" aria-label="施法时间" /></label>
      <label><span>施法距离</span><input ${record} data-record-field="range" value="${escapeHtml(item.range)}" maxlength="80" aria-label="施法距离" /></label>
    </div>
    <div class="spell-book-components"><strong>法术成分</strong><label><input type="checkbox" ${record} data-record-field="verbal" ${item.verbal ? "checked" : ""} />语言（V）</label><label><input type="checkbox" ${record} data-record-field="somatic" ${item.somatic ? "checked" : ""} />姿势（S）</label><label><input type="checkbox" ${record} data-record-field="materialComponent" ${item.materialComponent ? "checked" : ""} />材料（M）</label><label><input type="checkbox" ${record} data-record-field="ritual" ${item.ritual ? "checked" : ""} />仪式</label><label><input type="checkbox" ${record} data-record-field="concentration" ${item.concentration ? "checked" : ""} />专注</label></div>
    <label class="spell-book-line"><span>法术材料</span><textarea ${record} data-record-field="material" rows="2" maxlength="500" aria-label="具体施法材料">${escapeHtml(item.material)}</textarea></label>
    <label class="spell-book-line"><span>持续时间</span><input ${record} data-record-field="duration" value="${escapeHtml(item.duration)}" maxlength="100" aria-label="持续时间" /></label>
    <label class="spell-book-description"><span>法术说明</span><textarea ${record} data-record-field="effect" rows="10" maxlength="2000" aria-label="法术说明">${escapeHtml(item.effect)}</textarea></label>
    <div class="spell-inspector-actions">${removeRecordButton("spells", item.id, "移除法术")}</div>
  </article>`;
}

function renderAttackRecord(item) {
  const record = recordAttrs("attacks", item.id);
  return `<article class="record-row attack-record" data-record-id="${escapeHtml(item.id)}"><label class="record-field record-name"><span>名称</span><input ${record} data-record-field="name" value="${escapeHtml(item.name)}" maxlength="120" /></label><label class="record-field"><span>使用属性</span><select ${record} data-record-field="ability">${Object.values(ABILITIES).map((value) => option(value, item.ability)).join("")}</select></label><label class="record-field record-number"><span>命中加值</span><input type="number" min="-99" max="99" ${record} data-record-field="attackBonus" value="${escapeHtml(item.attackBonus)}" /></label><label class="record-field"><span>伤害</span><input ${record} data-record-field="damage" value="${escapeHtml(item.damage)}" maxlength="80" placeholder="1d8 + 3" /></label><label class="record-field"><span>伤害类型</span><input ${record} data-record-field="damageType" value="${escapeHtml(item.damageType)}" maxlength="60" /></label><label class="record-field record-notes"><span>特性 / 备注</span><input ${record} data-record-field="notes" value="${escapeHtml(item.notes)}" maxlength="500" /></label>${removeRecordButton("attacks", item.id, "移除攻击")}</article>`;
}

function renderCreatureRecord(item) {
  const record = recordAttrs("deployedCreatures", item.id);
  return `<article class="record-row creature-record" data-record-id="${escapeHtml(item.id)}">
    <div class="creature-card-title"><strong>${escapeHtml(item.name || "未命名生物")}</strong><span>${escapeHtml([item.size, item.type].filter(Boolean).join(" · ") || "资料未填写")}</span></div>
    <div class="creature-profile-layout"><div class="creature-overview-grid" aria-label="生物身份与战斗速查">
      <div class="creature-ledger-panel">
        <label class="creature-ledger-field"><span>名字</span><input ${record} data-record-field="name" data-suggest-kind="creature" value="${escapeHtml(item.name)}" maxlength="120" placeholder="输入或搜索生物" /></label>
        <label class="creature-ledger-field"><span>种族</span><input ${record} data-record-field="species" value="${escapeHtml(item.species)}" maxlength="80" /></label>
        <label class="creature-ledger-field"><span>阵营</span><input ${record} data-record-field="alignment" value="${escapeHtml(item.alignment)}" maxlength="60" /></label>
      </div>
      <div class="creature-ledger-panel">
        <label class="creature-ledger-field"><span>性别</span><input ${record} data-record-field="sex" value="${escapeHtml(item.sex)}" maxlength="40" /></label>
        <label class="creature-ledger-field"><span>类型</span><input ${record} data-record-field="type" value="${escapeHtml(item.type)}" maxlength="80" /></label>
        <label class="creature-ledger-field"><span>体型</span><input ${record} data-record-field="size" value="${escapeHtml(item.size)}" maxlength="20" /></label>
      </div>
      <div class="creature-ledger-panel">
        <label class="creature-ledger-field creature-paired-field"><span>HP</span><i><input type="number" min="0" ${record} data-record-field="currentHitPoints" value="${escapeHtml(item.currentHitPoints)}" aria-label="现有生命值" /><b>/</b><input type="number" min="0" ${record} data-record-field="hitPoints" value="${escapeHtml(item.hitPoints)}" aria-label="最大生命值" /></i></label>
        <label class="creature-ledger-field"><span>HD</span><input ${record} data-record-field="hitDice" value="${escapeHtml(item.hitDice)}" maxlength="60" /></label>
        <label class="creature-ledger-field"><span>临时生命</span><input type="number" min="0" ${record} data-record-field="tempHitPoints" value="${escapeHtml(item.tempHitPoints)}" /></label>
      </div>
      <div class="creature-ledger-panel creature-defense-panel">
        <div class="creature-ledger-split"><label class="creature-ledger-field"><span>AC</span><input type="number" min="0" ${record} data-record-field="armorClass" value="${escapeHtml(item.armorClass)}" /></label><label class="creature-ledger-field"><span>先攻</span><input type="number" min="-30" max="30" ${record} data-record-field="initiative" value="${escapeHtml(item.initiative)}" /></label></div>
        <div class="creature-ledger-split"><label class="creature-ledger-field"><span>CR</span><input ${record} data-record-field="challengeRating" value="${escapeHtml(item.challengeRating)}" maxlength="30" /></label><label class="creature-ledger-field"><span>熟练</span><input type="number" min="-20" max="20" ${record} data-record-field="proficiencyBonus" value="${escapeHtml(item.proficiencyBonus)}" /></label></div>
        <label class="creature-ledger-field"><span>速度</span><input ${record} data-record-field="speed" value="${escapeHtml(item.speed)}" maxlength="120" /></label>
      </div>
    </div>
    <aside class="creature-art-column" aria-label="生物立绘与形象"><figure class="creature-portrait"><div class="creature-portrait-stage">${item.portrait?`<img src="${escapeHtml(item.portrait)}" alt="${escapeHtml(item.name || '部署生物')}立绘" />`:'<span>生物立绘</span>'}</div><figcaption><label class="portrait-upload-label">${item.portrait?'更换立绘':'选择立绘'}<input type="file" accept="image/png,image/jpeg,image/webp" data-creature-portrait="${escapeHtml(item.id)}" aria-label="选择${escapeHtml(item.name || '部署生物')}立绘" /></label>${item.portrait?`<button type="button" data-clear-creature-portrait="${escapeHtml(item.id)}">移除</button>`:''}</figcaption></figure>
      <label class="creature-image-panel"><span class="creature-band">形象与描述</span><textarea ${record} data-record-field="notes" rows="3" placeholder="外观、习性、与人物的关系或召唤来源">${escapeHtml(item.notes)}</textarea></label>
    </aside>
    <div class="creature-sheet-body">
      <section class="creature-ability-panel" aria-label="六维属性"><div class="creature-band">六维属性</div><div class="creature-ability-table">${Object.entries(ABILITIES).map(([id, label]) => { const score = item.abilities?.[id] ?? 10; return `<label><span><strong>${label}</strong><small>${ABILITY_ABBREVIATIONS[id]}</small></span><input type="number" min="1" max="30" ${record} data-record-field="abilities.${id}" value="${escapeHtml(score)}" aria-label="${label}属性值" /><output aria-label="${label}调整值">${signed(Math.floor((Number(score) - 10) / 2))}</output></label>`; }).join("")}</div></section>
      <section class="creature-summary-panel" aria-label="生物概览"><div class="creature-band">概览</div><label class="creature-ledger-text"><span>技能</span><textarea ${record} data-record-field="skills" rows="2">${escapeHtml(item.skills)}</textarea></label><label class="creature-ledger-text"><span>抗性</span><textarea ${record} data-record-field="resistances" rows="2">${escapeHtml(item.resistances)}</textarea></label><label class="creature-ledger-text"><span>免疫</span><textarea ${record} data-record-field="immunities" rows="2">${escapeHtml(item.immunities)}</textarea></label><label class="creature-ledger-text"><span>感官</span><textarea ${record} data-record-field="senses" rows="2">${escapeHtml(item.senses)}</textarea></label><label class="creature-ledger-text"><span>语言</span><textarea ${record} data-record-field="languages" rows="2">${escapeHtml(item.languages)}</textarea></label></section>
    </div></div>
    <div class="creature-bottom-grid"><label><span class="creature-band">动作</span><textarea ${record} data-record-field="actions" rows="8">${escapeHtml(item.actions)}</textarea></label><label><span class="creature-band">特质</span><textarea ${record} data-record-field="traits" rows="8">${escapeHtml(item.traits)}</textarea></label></div>
    ${removeRecordButton("deployedCreatures", item.id, "移除生物")}
  </article>`;
}

function renderInventoryRecord(item) {
  const record = recordAttrs("inventory", item.id);
  return `<article class="record-row inventory-record" data-record-id="${escapeHtml(item.id)}">
    <label class="record-field record-name"><span>名称</span><input ${record} data-record-field="name" data-suggest-kind="item" value="${escapeHtml(item.name)}" maxlength="120" placeholder="输入或搜索物品" /></label><label class="record-field record-notes"><span>描述</span><input ${record} data-record-field="description" value="${escapeHtml(item.description)}" maxlength="1000" /></label><label class="record-field record-number"><span>磅</span><input type="number" min="0" max="9999" step="0.1" ${record} data-record-field="weight" value="${escapeHtml(item.weight)}" /></label><label class="record-field record-number"><span>数量</span><input type="number" min="0" max="9999" ${record} data-record-field="quantity" value="${escapeHtml(item.quantity)}" /></label>
    ${removeRecordButton("inventory", item.id, "移除物品")}
  </article>`;
}

function renderLedgerRecord(item) {
  const record = recordAttrs("ledger", item.id);
  return `<article class="record-row ledger-record" data-record-id="${escapeHtml(item.id)}"><label class="record-field"><span>类型</span><select ${record} data-record-field="kind">${option("income", item.kind, "收入")}${option("expense", item.kind, "支出")}</select></label><label class="record-field"><span>项目</span><input ${record} data-record-field="project" value="${escapeHtml(item.project)}" maxlength="120" /></label><label class="record-field record-notes"><span>明细</span><input ${record} data-record-field="detail" value="${escapeHtml(item.detail)}" maxlength="500" /></label><label class="record-field record-number"><span>金额（金币）</span><input type="number" min="0" step="0.01" ${record} data-record-field="amount" value="${escapeHtml(item.amount)}" /></label>${removeRecordButton("ledger", item.id, "移除账目")}</article>`;
}

function renderInventorySection(section, container, title, copy) {
  const items = activeCharacter.inventory.filter((item) => item.section === section);
  container.innerHTML = items.length ? items.map(renderInventoryRecord).join("") : emptyRecord(title, copy);
}

function renderInventoryBook() {
  if (!activeCharacter.inventory.some(i=>i.id===activeInventoryId)) activeInventoryId=activeCharacter.inventory[0]?.id || null;
  for (const [section,container] of [['quick',elements.inventoryQuickList],['self',elements.inventorySelfList],['container',elements.inventoryContainerList]]) {
    container.innerHTML = activeCharacter.inventory.filter(i=>i.section===section).map((item,index)=>`<button type="button" class="inventory-index-row ${item.id===activeInventoryId?'is-selected':''}" data-select-inventory="${escapeHtml(item.id)}" aria-pressed="${item.id===activeInventoryId}"><span>${index+1}</span><strong>${escapeHtml(item.name || '未命名物品')}</strong><small>${item.quantity} 件 · ${Number(item.quantity)*Number(item.weight)} 磅</small></button>`).join('') || '<p class="feature-empty">尚无物品</p>';
  }
  const item=activeCharacter.inventory.find(i=>i.id===activeInventoryId);
  if(!item) { elements.inventoryInspector.innerHTML='<p class="collection-empty">添加物品后，在右页选择条目查看和编辑。</p>';return; }
  const record=recordAttrs('inventory',item.id);
  elements.inventoryInspector.innerHTML=`<article class="inventory-book-page" data-record-id="${escapeHtml(item.id)}"><label class="item-book-title"><span>物品名称</span><input ${record} data-record-field="name" data-suggest-kind="item" value="${escapeHtml(item.name)}" placeholder="搜索或自定义物品" maxlength="120" /></label><div class="item-book-facts"><label class="field"><span>分类</span><select ${record} data-record-field="section">${[['quick','速查'],['self','自述'],['container','次元袋 / 载具']].map(([id,name])=>option(id,item.section,name)).join('')}</select></label><label class="field"><span>数量</span><input type="number" min="0" ${record} data-record-field="quantity" value="${item.quantity}" /></label><label class="field"><span>单件重量（磅）</span><input type="number" min="0" step="0.1" ${record} data-record-field="weight" value="${item.weight}" /></label></div><label class="item-book-description"><span>物品说明</span><textarea ${record} data-record-field="description" rows="12" maxlength="1000" placeholder="用法、效果、外观或收纳说明">${escapeHtml(item.description)}</textarea></label><div class="spell-inspector-actions">${removeRecordButton('inventory',item.id,'移除物品')}</div></article>`;
}

function renderEffects(derived) {
  const effects=derived.effects;
  const inactive=effects.activations.filter(a=>!a.active);
  elements.effectSummary.textContent = [...effects.trace,...(inactive.length?[`${inactive.length} 条能力来源失效或条件待核对，详见各能力栏。`]:[])].join('；') || '暂无已应用的背景或专长数值加成';
  elements.legacyDefenses.hidden = !activeCharacter.defensesSenses;
  const allowed=backgroundAbilityOptions(activeCharacter);
  renderSkillGrants(effects.skillGrants);
  renderAdvancement(effects.advancement);
  elements.backgroundAutomation.innerHTML = `${effects.originFeat?`<p>起源专长：${escapeHtml(effects.originFeat)}${['健壮','警觉'].includes(effects.originFeat)?'（已参与计算）':'（其他效果待逐项选择或核对）'}</p>`:''}${allowed.length?'<p>背景属性加成（下方六维填写基础值；这里的加成另计，最高20）</p><div class="background-bonus-grid">'+allowed.map(id=>`<label>${ABILITIES[id]}<select data-background-bonus="${id}" aria-label="背景${ABILITIES[id]}加成">${[0,1,2].map(n=>option(String(n),String(activeCharacter.backgroundAbilityBonuses[id] || 0),`+${n}`)).join('')}</select></label>`).join('')+'</div>':''}${effects.backgroundBonusWarning?`<p role="status">${effects.backgroundBonusWarning}</p>`:''}`;
  if(effects.skillGrants.groups.some(g=>g.id.includes(':background:'))) elements.backgroundAutomation.insertAdjacentHTML('beforeend','<p>背景技能选择入口：主要情况 → 熟练与专精选择。固定熟练已参与计算。</p>');
  const prof=effectiveProficiencies(activeCharacter);
  const labels={armorTraining:'添加护甲熟练',weaponProficiencies:'添加武器熟练',toolProficiencies:'添加手动工具熟练',knownLanguages:'添加手动语言'};
  elements.proficiencyChoices.innerHTML = Object.entries(PROFICIENCY_OPTIONS).map(([key,values])=>`<label>${labels[key]}<select data-proficiency-pick="${key}" aria-label="${labels[key]}"><option value="">选择…</option>${values.map(v=>option(v,'',v)).join('')}</select></label>`).join('')+`<p>有效熟练：武器 ${escapeHtml(prof.weapons.join('、') || '无')}；护甲 ${escapeHtml(prof.armor || '无')}。上方文字栏只补充或删改手动来源。</p><p id="effectiveToolsLanguages">当前工具：${escapeHtml(prof.tools||'无')}；当前语言：${escapeHtml(prof.languages||'无')}。任选项在“工具与语言：职业、背景及专长”中分配；种族与扩展能力仍需核对。</p>`;
  renderProficiencyGrants(prof.grants);
}

function renderProficiencyGrants(state) {
  elements.proficiencyGrantChoices.innerHTML=`<p>固定工具：${escapeHtml(state.fixedTools.join('、')||'无')}；固定语言：${escapeHtml(state.fixedLanguages.join('、')||'无')}。来源与手动栏分开保存。</p>${state.groups.map((g,index)=>`<fieldset class="grant-group"><legend>${escapeHtml(g.name)} · ${g.valid.length}/${g.count}</legend><div class="grant-selects">${Array.from({length:g.count},(_,i)=>{
    const attrs=`data-proficiency-grant="${escapeHtml(g.id)}" data-choice-index="${i}" aria-label="${escapeHtml(g.name)}第${i+1}项"`,value=g.selected[i]||'';
    return `<label>第${i+1}项${g.custom?`<input ${attrs} list="grant-options-${index}" value="${escapeHtml(value)}" maxlength="80" placeholder="选择或输入语言" />`:`<select ${attrs}>${option('',value,'请选择…')}${value&&!g.options.includes(value)?option(value,value,`${value}（已不符合条件）`):''}${g.options.map(v=>option(v,value,v)).join('')}</select>`}</label>`;
  }).join('')}</div>${g.custom?`<datalist id="grant-options-${index}">${g.options.map(v=>`<option value="${escapeHtml(v)}"></option>`).join('')}</datalist>`:''}${g.note?`<p>${escapeHtml(g.note)}</p>`:''}<p class="grant-feedback" role="status">${escapeHtml(g.errors.join('；'))}</p></fieldset>`).join('')}${state.issues.filter(i=>i.includes('原文')||i.includes('停用')).map(i=>`<p class="grant-feedback" role="status">${escapeHtml(i)}</p>`).join('')}${!state.groups.length?'<p>没有可自动展开的任选项；复杂条件保留原文，确认后可填入手动工具或语言栏。</p>':''}`;
}

function renderAdvancement(state) {
  elements.advancementStatus.textContent=`（${RULESETS[activeCharacter.ruleset]?.shortName||activeCharacter.ruleset} · ${state.slots.filter(s=>s.features.length).length}/${state.slots.length} 个职业名额）`;
  const feats=activeCharacter.featureEntries.filter(f=>f.kind==='feat');
  elements.advancementChoices.innerHTML=`<p>职业奖励按各自职业等级解锁。基础属性请填未含下列提升的值；旧卡不会自动重复加点。属性提升选两次同一项为 +2，选不同项为各 +1。</p><div class="advancement-slots">${state.slots.map(s=>`<div><span>${escapeHtml(s.name)}</span>${s.features.length?`<strong>${escapeHtml(s.features.map(f=>f.name||'待选专长').join('、'))}</strong>`:`<button type="button" data-add-advancement="${s.id}" data-reward="asi">添加属性提升</button><button type="button" data-add-advancement="${s.id}" data-reward="feat">添加专长</button>`}</div>`).join('')||'<p>当前职业等级尚未解锁属性提升名额。</p>'}</div>${feats.map(f=>{
    const row=state.rows.find(r=>r.feature.id===f.id),source=f.advancementSource||'',unknown=source&&!state.slots.some(s=>s.id===source);
    return `<fieldset class="grant-group"><legend>${escapeHtml(f.name||'待选专长')}</legend><div class="grant-selects"><label>获得来源<select data-feat-source="${escapeHtml(f.id)}" aria-label="${escapeHtml(f.name||'待选专长')}获得来源">${option('',source,'其他来源 / 旧卡待核对')}${unknown?option(source,source,'原职业名额（已不适用）'):''}${state.slots.map(s=>option(s.id,source,s.name)).join('')}</select></label>${!source?`<label>来源说明<input data-feature-id="${escapeHtml(f.id)}" data-feature-field="sourceNote" value="${escapeHtml(f.sourceNote||'')}" aria-label="${escapeHtml(f.name)}来源说明" maxlength="160" placeholder="例如：种族、背景、团规" /></label>`:''}<label>数值效果<select data-feature-id="${escapeHtml(f.id)}" data-feature-field="effectMode" aria-label="${escapeHtml(f.name)}效果开关">${EFFECT_MODES.map(([id,name])=>option(id,f.effectMode||'auto',name)).join('')}</select></label>${row?Array.from({length:row.spec.count},(_,i)=>`<label>属性提升${row.spec.count>1?` ${i+1}`:''}（+1）<select data-feat-choice="${escapeHtml(f.id)}" data-choice-index="${i}" aria-label="${escapeHtml(f.name)}属性提升${i+1}">${option('',row.selected[i]||'','不计入 / 待选择')}${row.selected[i]&&!row.spec.options.includes(row.selected[i])?option(row.selected[i],row.selected[i],`${ABILITIES[row.selected[i]]}（已有熟练或不符条件）`):''}${row.spec.options.map(id=>option(id,row.selected[i]||'',ABILITIES[id])).join('')}</select></label>`).join(''):''}</div>${row?`<p class="grant-feedback" role="status">${escapeHtml(row.error||'已计入：'+Object.entries(row.applied).map(([id,n])=>`${ABILITIES[id]} +${n}`).join('、'))}</p>`:''}</fieldset>`;
  }).join('')}<p>切换规则、移除来源或停用后，仅撤销该来源的自动加成。旧选择仍保留；额外来源和兼职的历史获得顺序需自行核对。</p>`;
  for(const [index,fieldset] of [...elements.advancementChoices.querySelectorAll('fieldset')].entries()) {
    const f=feats[index],edition=RULESETS[f.catalogEntry?.ruleset||f.sourceRuleset]?.shortName||'旧卡 / 手动来源';
    fieldset.querySelector('legend').textContent=`${f.name||'待选专长'} · ${edition}`;
    const row=state.rows.find(r=>r.feature.id===f.id);
    fieldset.querySelectorAll('[data-feat-choice]').forEach(select=>{select.disabled=Boolean(row&&!row.active);});
  }
}

function renderSkillGrants(state) {
  elements.skillGrantStatus.textContent=state.pending?`（${state.pending}组待选）`:'（已分配）';
  elements.skillGrantChoices.innerHTML=`<p>按来源选择，立即参与技能检定。旧手动技能保留；下拉清空只撤销该来源。</p>${state.groups.map(g=>`<fieldset class="grant-group"><legend>${escapeHtml(g.name)} · ${g.valid.length} / ${g.count}</legend>${g.fixed?.length?`<p>固定熟练：${g.fixed.map(skillChoiceLabel).join('、')}（已生效）</p>`:''}<div class="grant-selects">${Array.from({length:g.count},(_,i)=>{
    const selected=g.selected[i]||'',missing=selected&&!g.options.includes(selected);
    return `<label>第${i+1}项<select data-skill-grant="${escapeHtml(g.id)}" data-choice-index="${i}" aria-label="${escapeHtml(g.name)}第${i+1}项"><option value="">请选择…</option>${missing?option(selected,selected,`${skillChoiceLabel(selected)}（已不符合条件）`):''}${g.options.map(id=>option(id,selected,skillChoiceLabel(id))).join('')}</select></label>`;
  }).join('')}</div>${g.errors.length?`<p class="grant-feedback" role="status">${escapeHtml(g.errors.join('；'))}</p>`:''}</fieldset>`).join('')}${state.toolExpertise?'<p>盗贼工具专精已记录：相关检定使用两倍熟练加值，检定属性由情境决定。</p>':''}${state.inactive?`<p>${state.inactive}组旧来源选择已停用并保留；切回原规则与来源后重新检查。</p>`:''}`;
}

function runtimeFingerprint(c) { const {updatedAt,...rest}=c; return JSON.stringify(rest); }
function handleRuntimeAction(button) {
  const action=button.dataset.runtimeAction;
  try {
    if(action==='undo') {
      if(!lastResourceOperation||lastResourceOperation.id!==activeCharacter.id) throw new Error('没有可撤销的资源操作。');
      if(runtimeFingerprint(activeCharacter)!==lastResourceOperation.after) throw new Error('人物卡此后已有其他修改，不能覆盖这些修改；请手动核对资源。');
      Object.assign(activeCharacter,JSON.parse(lastResourceOperation.before));lastResourceOperation=null;markDirty();render();showToast('已撤销上次资源操作');return;
    }
    const before=JSON.stringify(activeCharacter);
    let message;
    const derived=deriveMvpCharacter(activeCharacter);
    if(action==='short'||action==='long') {
      if(!document.getElementById('restRequirements')?.checked) throw new Error('请先确认已满足休息条件。');
      const recovery=Object.fromEntries([...document.querySelectorAll('[data-hit-die-recovery]')].map(el=>[el.dataset.hitDieRecovery,Number(el.value)]));
      message=completeRest(activeCharacter,action,derived.hitPoints,{hitDiceRecovery:recovery});
    } else if(action==='cast') {
      const value=document.getElementById('castSlotChoice')?.value;
      message=castSpell(activeCharacter,button.dataset.spellId,{pool:value==='pact'?'pact':'slot',rank:Number(value),replaceConcentration:Boolean(document.getElementById('replaceConcentration')?.checked)});
    } else if(action==='resource') {
      const resource=resourceDefinitions(activeCharacter).find(r=>r.id===button.dataset.resourceId);
      if(!resource||resource.current<1) throw new Error('此资源已用尽。');
      activeCharacter.resourceSpent||={};activeCharacter.resourceSpent[resource.id]=Math.max(0,resource.maximum-resource.current)+1;
      message=`${resource.name}已消耗1点`;
    } else if(action==='allocateHitDice') {
      const allocation=Object.fromEntries([...document.querySelectorAll('[data-hit-die-current]')].map(el=>[el.dataset.hitDieCurrent,el.value]));
      message=setHitDiceAllocation(activeCharacter,allocation);
    } else if(action==='hitDie') {
      if(!document.getElementById('restRequirements')?.checked) throw new Error('请先确认已满足短休条件，再消耗生命骰治疗。');
      message=spendHitDie(activeCharacter,document.getElementById('hitDieClass')?.value,Number(document.getElementById('hitDieRoll')?.value),derived.hitPoints);
    }
    else if(action==='endConcentration') {activeCharacter.concentrationSpellId=null;message='已结束专注';}
    else return;
    lastResourceOperation={id:activeCharacter.id,before,after:runtimeFingerprint(activeCharacter)};
    markDirty();render();showToast(message);
  } catch(error) {showToast(error.message);const feedback=document.getElementById('runtimeFeedback');if(feedback) feedback.textContent=error.message;elements.runtimeControls?.setAttribute('data-last-error',error.message);}
}
function renderRuntimeControls(derived) {
  const diceOpen = elements.runtimeControls.querySelector('.hit-dice-ledger')?.open;
  const concentration=activeCharacter.spells.find(s=>s.id===activeCharacter.concentrationSpellId);
  const dice=hitDiceState(activeCharacter),recovery=hitDiceRecovery(activeCharacter);
  for(const key of ['currentHp','tempHp']) if(document.activeElement!==elements[key]) elements[key].value=activeCharacter[key];
  elements.hitDiceCurrent.value=dice.current;elements.hitDiceCurrent.readOnly=true;
  elements.hitDiceCurrent.title='分职业生命骰合计；在资源与休息中调整各职业数量。';
  elements.runtimeControls.innerHTML=`<div class="runtime-actions"><label title="确认已满足本次休息的时长与次数限制"><input id="restRequirements" type="checkbox" />已满足休息条件</label><button type="button" data-runtime-action="short">短休</button><button type="button" data-runtime-action="long">长休</button><button type="button" data-runtime-action="undo" title="撤销上次资源操作" ${lastResourceOperation?.id===activeCharacter.id?'':'disabled'}>撤销</button></div>
    <p id="runtimeFeedback" role="status" aria-live="polite"></p>
    <p>短休不回满生命；长休恢复${activeCharacter.ruleset==='dnd5r-2024'?'全部生命骰':'总等级一半的生命骰（向下取整，至少1枚）'}。</p>
    <details class="hit-dice-ledger" ${diceOpen?'open':''}><summary>生命骰 ${dice.current} / ${dice.maximum}${dice.pending?' · 待分配':''}</summary>${dice.pending?'<p class="grant-feedback">请分配旧卡生命骰，合计保持不变。分配后才能消耗。</p>':''}
    <div class="hit-dice-pools">${dice.pools.map(p=>`<label>${escapeHtml(CLASSES[p.classId]?.name||p.classId)} d${p.die}<input type="number" data-hit-die-current="${escapeHtml(p.classId)}" aria-label="${escapeHtml(CLASSES[p.classId]?.name)}当前生命骰" min="0" max="${p.maximum}" value="${p.current??''}" placeholder="待分配" /><span>/ ${p.maximum}</span></label>`).join('')}<button type="button" data-runtime-action="allocateHitDice">${dice.pending?'确认旧卡分配':'保存数量校正'}</button></div>
    ${recovery.needsChoice?`<p>本次长休可恢复 ${recovery.count} 枚；请在各职业间分配后点击「完成长休」。</p><div class="hit-dice-pools">${recovery.pools.filter(p=>p.spent>0).map(p=>`<label>${escapeHtml(CLASSES[p.classId].name)}恢复<input type="number" data-hit-die-recovery="${p.classId}" aria-label="长休恢复${escapeHtml(CLASSES[p.classId].name)}生命骰" min="0" max="${p.spent}" value="0" /><span>最多 ${p.spent}</span></label>`).join('')}</div>`:''}
    <div class="runtime-actions"><label>消耗职业<select id="hitDieClass" aria-label="消耗生命骰的职业">${dice.pools.map(p=>option(p.classId,dice.pools[0]?.classId,`${CLASSES[p.classId]?.name} · d${p.die} · 剩余${p.current??'待确认'}`)).join('')}</select></label><label>骰面点数<input id="hitDieRoll" type="number" min="1" max="${dice.pools[0]?.die||12}" aria-label="生命骰实际点数" /></label><button type="button" data-runtime-action="hitDie" ${dice.pending?'disabled':''}>消耗1枚并治疗</button></div></details>
    <div class="runtime-resource-grid">${resourceDefinitions(activeCharacter).map(r=>`<div><span>${escapeHtml(r.name)}</span><strong>${r.current} / ${r.maximum}</strong><button type="button" data-runtime-action="resource" data-resource-id="${r.id}" ${r.current?'':'disabled'} aria-label="消耗1点${escapeHtml(r.name)}">用1</button><small>${escapeHtml(r.detail)}</small></div>`).join('')}</div><div class="runtime-actions"><span>当前专注：${escapeHtml(concentration?.name||'无')}</span>${concentration?'<button type="button" data-runtime-action="endConcentration">结束专注</button>':''}</div>`;
  const unlimited=activeCharacter.ruleset==='dnd5e-2014'?characterClasses(activeCharacter).filter(x=>x.level===20&&['druid','barbarian'].includes(x.classId)).map(x=>x.classId==='druid'?'荒野形态':'狂暴'):[];
  if(unlimited.length) elements.runtimeControls.insertAdjacentHTML('beforeend',`<p>${unlimited.join('、')}：20级不限使用次数，仍需满足使用条件。</p>`);
}

function recordAttrs(collection, id) {
  return `data-collection="${collection}" data-record-id="${escapeHtml(id)}"`;
}

function option(value, selected, label = value) {
  return `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function removeRecordButton(collection, id, label) {
  return `<button class="record-remove" type="button" data-remove-record="${collection}" data-record-id="${escapeHtml(id)}" aria-label="${label}" title="${label}">×</button>`;
}

function emptyRecord(title, copy) {
  return `<div class="collection-empty"><strong>${title}</strong><span>${copy}</span></div>`;
}

function renderStats(derived) {
  elements.statAc.textContent = derived.armorClass;
  elements.statAcHint.textContent = ARMORS[activeCharacter.armorId].name + (activeCharacter.shield ? " + 盾" : "");
  elements.statHp.textContent = derived.hitPoints;
  elements.statHpHint.textContent = `${derived.level}级 · ${derived.hitDiceLabel}`;
  elements.statInitiative.textContent = signed(derived.initiative);
  elements.statProficiency.textContent = signed(derived.proficiencyBonus);
  elements.statLevelHint.textContent = `角色等级 ${derived.level}`;
  elements.statPassive.textContent = derived.passivePerception;
  elements.statSpellDc.textContent = derived.spellcasting?.saveDc ?? "—";
  elements.statCastingHint.textContent = derived.castingAbility ? ABILITIES[derived.castingAbility] : "无默认施法";
  elements.combatMaxHp.textContent = derived.hitPoints;
  elements.combatInitiative.textContent = signed(derived.initiative);
  elements.combatArmorClass.textContent = derived.armorClass;
  elements.combatHitDiceMax.textContent = derived.hitDiceLabel;
  elements.combatClassDc.textContent = derived.spellcasting?.saveDc ?? 8 + derived.proficiencyBonus;
}

function renderFormMeta(derived, issues=validateCharacter(activeCharacter)) {
  if(!document.getElementById('effectiveSpeed')) elements.speed.insertAdjacentHTML('afterend','<small id="effectiveSpeed" role="status"></small>');
  document.getElementById('effectiveSpeed').textContent=derived.effects.fill.bonuses.speed?`合计 ${derived.speed} 尺（含来源 ${signed(derived.effects.fill.bonuses.speed)}；上栏填基础值）`:'';
  elements.identityCompletion.textContent = activeCharacter.name.trim() ? "已完成" : "待填写";
  elements.identityCompletion.classList.toggle("is-complete", Boolean(activeCharacter.name.trim()));
  elements.hitDieSummary.textContent = derived.hitDiceLabel;
  elements.saveSummary.textContent = derived.effects.advancement.savingThrows.map((ability) => ABILITIES[ability]).join("、")+(derived.deathSaveBonus?`；死亡豁免 ${signed(derived.deathSaveBonus)}`:'');
  elements.castingSummary.textContent = derived.castingAbility ? ABILITIES[derived.castingAbility] : "无";
  document.querySelectorAll("[data-ability]").forEach((input) => {
    const ability = input.dataset.ability;
    const total = derived.effects.abilities[ability];
    const added = total - Number(activeCharacter.abilities[ability]);
    document.querySelector(`[data-ability-mod="${ability}"]`).textContent = `${added ? `总${total} / ` : ''}${signed(derived.abilityModifiers[ability])}`;
    const save=document.querySelector(`[data-ability-save="${ability}"]`);
    save.textContent=`豁免 ${signed(derived.savingThrows[ability])}`;
    save.title=derived.effects.advancement.savingThrows.includes(ability)?'已含熟练加值':'未熟练';
    const issue = issues.find((entry) => entry.field === `ability-${ability}`);
    document.querySelector(`[data-ability-error="${ability}"]`).textContent = issue?.severity === "warning" ? "需来源" : issue ? "无效" : "";
    input.setAttribute("aria-invalid", issue?.severity === "error" ? "true" : "false");
  });
  const nameIssue = issues.find((issue) => issue.field === "name");
  elements.nameError.textContent = nameIssue?.message ?? "";
  elements.name.setAttribute("aria-invalid", nameIssue ? "true" : "false");
  elements.name.setAttribute("aria-describedby", "nameError");
  const levelIssue = issues.find((issue) => issue.field === "level");
  elements.levelError.textContent = levelIssue?.message ?? "";
  elements.level.setAttribute("aria-invalid", levelIssue ? "true" : "false");
  elements.level.setAttribute("aria-describedby", "levelError");
}

function renderSkills(derived) {
  let proficientCount = 0;
  document.querySelectorAll("[data-skill]").forEach((button) => {
    const skill = button.dataset.skill;
    const rank = derived.effects.skillGrants.ranks[skill];
    const sources=derived.effects.skillGrants.sources[skill];
    if (rank > 0) proficientCount += 1;
    button.dataset.rank = String(rank);
    button.setAttribute("aria-pressed", rank > 0 ? "true" : "false");
    button.querySelector(".skill-state").textContent = sources.length&&rank===1?'来源熟练':["未熟练", "熟练", "专精"][rank];
    button.title=`${sources.length?'来源：'+sources.join('、')+'。':''}手动记录：${['未熟练','熟练','专精'][activeCharacter.skills[skill]]}；点击只调整手动记录，不删除来源授予。`;
    button.querySelector(".skill-rank").textContent = ["", "●", "◆"][rank];
    button.querySelector("[data-skill-value]").textContent = signed(derived.skills[skill]);
  });
  elements.skillCount.textContent = `${proficientCount} 项熟练`;
}

function renderProfile(derived) {
  const hasPortrait = Boolean(activeCharacter.portrait);
  elements.portraitImage.hidden = !hasPortrait;
  elements.portraitFallback.hidden = hasPortrait;
  elements.portraitClear.hidden = !hasPortrait;
  if (hasPortrait && elements.portraitImage.src !== activeCharacter.portrait) elements.portraitImage.src = activeCharacter.portrait;
  elements.portraitMonogram.textContent = (activeCharacter.name.trim() || "未").slice(0, 1);
  elements.profileName.textContent = activeCharacter.name.trim() || "未命名角色";
  elements.profileClass.textContent = characterClasses(activeCharacter).map((c) => `${CLASSES[c.classId]?.name} ${c.level} 级`).join(" / ");
}

function renderIssues(issues) {
  elements.issueBadge.textContent = issues.length;
  elements.issueBadge.classList.toggle("has-issues", issues.length > 0);
  elements.assistantIssueDot.hidden = issues.length === 0;
  elements.assistantIssueDot.textContent=String(issues.length);
  elements.assistantIssueDot.setAttribute('aria-hidden','true');
  elements.assistantOrb.title=`填卡助手 · ${issues.length} 项待核对；可拖动或按 Alt + 方向键移动`;
  elements.assistantLiveStatus.textContent=`本机检查：${issues.filter(i=>i.severity==='error').length} 项错误，${issues.filter(i=>i.severity!=='error').length} 项提示`;
  elements.issueHeading.textContent = issues.length ? `${issues.length} 项需要留意` : "已实现的检查未发现问题";
  elements.issueList.innerHTML = issues.length ? issues.map((issue) => `<button type="button" class="issue ${issue.severity}" data-field-target="${escapeHtml(issue.field)}"><strong>${issue.severity === "error" ? "需要修正" : "待核对"}</strong><span>${escapeHtml(issue.message)}</span><small>前往对应字段</small></button>`).join("") : '<div class="empty-state"><p>没有发现已覆盖范围内的问题。未适配的规则和手动来源仍需玩家核对。</p></div>';
  elements.issueList.querySelectorAll("[data-field-target]").forEach((button) => button.addEventListener("click", () => focusField(button.dataset.fieldTarget)));
  const errors = issues.filter((issue) => issue.severity === "error");
  elements.errorSummary.hidden = errors.length === 0;
  elements.errorSummaryList.innerHTML = errors.map((issue) => `<li><a href="#${escapeHtml(issue.field)}">${escapeHtml(issue.message)}</a></li>`).join("");
}

function renderAssistant(derived) {
  if(isCoc(activeCharacter))return renderCocAssistant();
  derived ||= deriveMvpCharacter(activeCharacter);
  const contextKey=`${activeCharacter.id}:${activeCharacter.ruleset}`;
  if(contextKey!==assistantContextKey) {
    assistantContextKey=contextKey;assistantLibraryRequest++;knowledgeRequestId++;clearTimeout(knowledgeTimer);
    elements.assistantKnowledgeQuery.value='';elements.assistantKnowledgeResults.textContent='输入关键词查询当前版本资料。';
    elements.assistantLibraryStatus.textContent='尚未读取此版本的资料库';
    if(!elements.assistantPopover.hidden) refreshAssistantLibrary();
  }
  elements.assistantScope.textContent = `${activeCharacter.name.trim() || "未命名角色"} · ${libraryEdition()}`;
  const trace = buildTrace(activeCharacter, derived, selectedTrace);
  elements.assistantTraceSelect.value=trace.key;
  elements.traceCrumb.textContent = `派生值 / ${trace.title}`;
  elements.traceTitle.textContent = trace.title;
  elements.traceResult.textContent = trace.result;
  elements.traceSource.textContent = `${libraryEdition()} · 当前卡输入与已实现逻辑`;
  elements.traceTerms.innerHTML=trace.terms.map(term=>`<div><dt>${escapeHtml(term.label)}</dt><dd>${signed(term.value)}</dd></div>`).join('');
  elements.traceSources.innerHTML=trace.sources.map(source=>`<li>${escapeHtml(source)}</li>`).join('');
  elements.traceFormula.textContent = trace.formula;
  elements.traceNotes.textContent = trace.notes;
  document.querySelectorAll("[data-trace]").forEach((button) => button.classList.toggle("is-selected", button.dataset.trace === selectedTrace));
}

function renderAdvice(derived) {
  const tasks=assistantTasks(validateCharacter(activeCharacter),derived);
  elements.adviceHeading.textContent=tasks.length?`${tasks.length} 处需要处理`:'暂无自动发现的待办';
  elements.adviceCard.innerHTML=tasks.length?tasks.map(task=>`<button type="button" data-assistant-target="${escapeHtml(task.field)}"><strong>${task.severity==='error'?'修正填写':'核对选项'} · ${task.messages.length} 项</strong><span>${escapeHtml(task.messages[0])}</span><small>前往填写${task.messages.length>1?`，另有 ${task.messages.length-1} 项同类提示`:''}</small></button>`).join(''):'<p>当前已实现的检查没有生成待办。不据此判断构筑强弱，也不会擅自添加熟练或专长。</p>';
  elements.assistantAiStatus.textContent=assistantAiStatus(workspace.settings.aiProfile,Boolean(sessionStorage.getItem(AI_SESSION_KEY)));
}

function refreshAssistant() {
  diceView.refresh();
  aiChat.refresh();
  if(isCoc(activeCharacter)){renderCocAssistant();return;}
  try {
    const derived=deriveMvpCharacter(activeCharacter);
    const issues=validateCharacter(activeCharacter);
    elements.saveButton.disabled=issues.some(issue=>issue.severity==='error');
    renderIssues(issues);renderAssistant(derived);renderAdvice(derived);
  } catch(error) { renderFatalCalculationError(error); }
}

function renderCocAssistant(){
  const d=deriveCoc(activeCharacter),issues=validateCoc(activeCharacter),key=`${activeCharacter.id}:coc-7e`;
  if(assistantContextKey!==key){assistantContextKey=key;assistantLibraryRequest++;knowledgeRequestId++;elements.assistantKnowledgeQuery.value='';elements.assistantKnowledgeResults.textContent='检索 CoC 独立资料包，不包含 D&D。';elements.assistantLibraryStatus.textContent='CoC · 本地工作簿资料';}
  renderIssues(issues);elements.saveButton.disabled=issues.some(i=>i.severity==='error');
  const traceKeys={hpMax:'生命上限',mpMax:'魔法上限',sanMax:'理智上限',mov:'移动',db:'伤害加值',build:'体格',occupationPoints:'职业点数',interestPoints:'兴趣点数'};
  if(!Object.hasOwn(traceKeys,selectedTrace))selectedTrace='hpMax';
  elements.assistantTraceSelect.innerHTML=Object.entries(traceKeys).map(([k,l])=>`<option value="${k}" ${k===selectedTrace?'selected':''}>${l}</option>`).join('');
  elements.assistantScope.textContent=`${activeCharacter.name} · CoC 七版`;
  elements.traceCrumb.textContent='CoC / 派生值';elements.traceTitle.textContent=traceKeys[selectedTrace];elements.traceResult.textContent=d[selectedTrace];
  elements.traceSource.textContent='CoC七版 · CY23PlusFinal 原表映射';elements.traceTerms.innerHTML='';elements.traceSources.innerHTML='';
  elements.traceFormula.textContent=({hpMax:'向下取整((CON + SIZ) / 10)',mpMax:'向下取整(POW / 5)',sanMax:'99 − 克苏鲁神话',mov:'STR、DEX与SIZ比较 → 年龄减值 → 可选护甲减值',db:'STR + SIZ 查伤害加值表',build:'STR + SIZ 查体格表',occupationPoints:d.occupation?.formula||'EDU × 4（自定义时可覆盖）',interestPoints:'INT × 2'})[selectedTrace];
  elements.traceNotes.textContent=activeCharacter.overrides[selectedTrace]!=null?`手动覆盖生效；自动参考值 ${d.auto[selectedTrace]}。`:'自动值生效；派生值手动修正留空时使用公式。';
  elements.adviceHeading.textContent='CoC 填卡核对';elements.adviceCard.textContent=issues.map(i=>i.message).join('\n')||'点数与已实现的状态检查未发现问题。年龄属性调整、任选技能和可选规则仍需玩家与KP确认。';
  elements.assistantAiStatus.textContent=assistantAiStatus(workspace.settings.aiProfile,Boolean(sessionStorage.getItem(AI_SESSION_KEY)));
}

async function refreshAssistantLibrary() {
  const request=++assistantLibraryRequest,key=assistantContextKey,ruleset=libraryRuleset();
  elements.assistantLibraryStatus.textContent='正在读取本机资料库…';
  try {
    const data=await libraryGet(`/api/library/summary?${new URLSearchParams({ruleset})}`);
    if(request!==assistantLibraryRequest||key!==assistantContextKey) return;
    if(data.ruleset!==ruleset) throw new Error('资料版本不一致');
    const count=data.kinds.reduce((n,row)=>n+Number(row.count||0),0);
    elements.assistantLibraryStatus.textContent=data.sources.length?`${libraryEdition()} · ${count} 条目录记录\n来源：${data.sources.map(s=>s.filename).join('、')}`:'当前版本没有已导入的资料源。';
  } catch {
    if(request===assistantLibraryRequest&&key===assistantContextKey) elements.assistantLibraryStatus.textContent='本机资料库不可用，无法确认收录内容。可重试；人物数据仍保留。';
  }
}

async function importPortrait(event) {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file) return;
  try {
    if (!file.type.startsWith("image/")) throw new Error("请选择 PNG、JPEG 或 WebP 图片。");
    if (file.size > 8_000_000) throw new Error("原始图片不能超过 8 MB。");
    const portrait = await resizePortrait(file);
    if (portrait.length > 1_800_000) throw new Error("压缩后的立绘仍然过大，请换一张图片。");
    activeCharacter.portrait = portrait;
    markDirty(); render(); showToast("立绘已保存到这张本地人物卡");
  } catch (error) { showToast(`立绘导入失败：${error.message}`); }
}

function resizePortrait(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("无法读取图片。"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("无法解析图片。"));
      image.onload = () => {
        const scale = Math.min(1, 900 / image.width, 1200 / image.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        context.fillStyle = "#181a1e"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", .84));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function clearPortrait() { activeCharacter.portrait = ""; elements.portraitImage.removeAttribute("src"); markDirty(); render(); showToast("已移除立绘"); }

function openSettings() {
  const settings = workspace.settings;
  closeRulebook(false);
  const profile = settings.aiProfile;
  elements.aiProfileName.value = profile?.name ?? "默认服务";
  elements.aiBaseUrl.value = profile?.baseUrl ?? "";
  elements.aiModel.value = profile?.model ?? "";
  elements.aiApiKey.value = sessionStorage.getItem(AI_SESSION_KEY) ?? "";
  invalidateAiTest();
  if (profile?.testedAt) elements.aiTestStatus.textContent = `已有配置上次通过测试：${new Date(profile.testedAt).toLocaleString()}。修改后需要重新测试。`;
  elements.settingsDialog.showModal();
}

async function openRulebook(ruleset) {
  if (!RULESETS[ruleset] || RULE_ENGINES[ruleset]?.status !== "installed") return;
  if (rulebookRuleset === ruleset && !elements.rulebookReader.hidden) { closeRulebook(); return; }
  rulebookRuleset = ruleset;
  rulebookKind = "";
  const requestId = ++rulebookRequestId;
  rulebookDetailRequestId++;
  elements.rulebookReader.hidden = false;
  elements.rulebookTitle.textContent = RULE_ENGINES[ruleset].name;
  elements.rulebookEdition.textContent = RULESETS[ruleset].fullName;
  elements.rulebookSummary.textContent = "正在读取本机资料…";
  elements.rulebookKinds.innerHTML = "";
  elements.rulebookQuery.value = "";
  elements.rulebookResults.textContent = "正在整理目录…";
  elements.rulebookDetail.textContent = "";
  elements.ruleEngineOptions.querySelectorAll("[data-open-rulebook]").forEach((button) => button.setAttribute("aria-expanded", button.dataset.openRulebook === ruleset ? "true" : "false"));
  elements.rulebookReader.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "instant" : "smooth" });
  try {
    const summary = await libraryGet(`/api/library/summary?ruleset=${encodeURIComponent(ruleset)}`);
    if (requestId !== rulebookRequestId || rulebookRuleset !== ruleset) return;
    const total = summary.kinds.reduce((sum, item) => sum + item.count, 0);
    elements.rulebookSummary.textContent = `${summary.kinds.length} 类 · ${total} 条可检索资料\n来源：${summary.sources[0]?.filename || "尚未导入"}`;
    const groupedKinds = Map.groupBy(summary.kinds, (item) => item.domain || "未分类");
    elements.rulebookKinds.innerHTML = `<button type="button" data-rulebook-kind="" aria-pressed="true"><span>全部</span><b>${total}</b></button>${Array.from(groupedKinds, ([domain, items]) => `<p class="rulebook-kind-group">${escapeHtml(domain)}</p>${items.map(({ kind, count, label }) => `<button type="button" data-rulebook-kind="${escapeHtml(kind)}" aria-pressed="false"><span>${escapeHtml(label || libraryKindName(kind) || kind)}</span><b>${count}</b></button>`).join("")}`).join("")}`;
    loadRulebookResults();
  } catch (error) {
    if (requestId !== rulebookRequestId) return;
    elements.rulebookSummary.textContent = `本机资料库不可用：${String(error.message || error)}`;
    elements.rulebookResults.textContent = "可在新建人物时选择这套规则；检索需先导入对应表格。";
  }
}

function closeRulebook(restoreFocus = true) {
  const previous = rulebookRuleset;
  rulebookRuleset = null;
  rulebookRequestId++;
  rulebookDetailRequestId++;
  clearTimeout(rulebookSearchTimer);
  elements.rulebookReader.hidden = true;
  elements.ruleEngineOptions.querySelectorAll("[data-open-rulebook]").forEach((button) => button.setAttribute("aria-expanded", "false"));
  if (restoreFocus && previous && elements.settingsDialog.open) elements.ruleEngineOptions.querySelector(`[data-open-rulebook="${previous}"]`)?.focus();
}

async function loadRulebookResults() {
  if (!rulebookRuleset) return;
  rulebookDetailRequestId++;
  const ruleset = rulebookRuleset;
  const requestId = ++rulebookRequestId;
  const params = new URLSearchParams({ ruleset, kind: rulebookKind, query: elements.rulebookQuery.value.trim(), limit: "12" });
  elements.rulebookResults.textContent = "正在查找…";
  elements.rulebookDetail.textContent = "";
  try {
    const data = await libraryGet(`/api/library/search?${params}`);
    if (requestId !== rulebookRequestId || ruleset !== rulebookRuleset) return;
    elements.rulebookResults.innerHTML = data.results.length ? `<p role="status">找到 ${data.total} 条，显示前 ${data.results.length} 条</p>${data.results.map((entry) => `<button type="button" data-rulebook-entry="${escapeHtml(entry.id)}"><strong>${escapeHtml(entry.name)}</strong><span>${escapeHtml(libraryKindName(entry.kind,entry.ruleset) || entry.kind)}</span></button>`).join("")}` : '<p role="status">本册没有匹配条目。</p>';
  } catch (error) {
    if (requestId === rulebookRequestId) elements.rulebookResults.textContent = String(error.message || error);
  }
}

async function loadRulebookEntry(id) {
  if (!rulebookRuleset) return;
  const ruleset = rulebookRuleset;
  const requestId = ++rulebookDetailRequestId;
  elements.rulebookDetail.textContent = "正在翻到这条资料…";
  try {
    const entry = await libraryGet(`/api/library/entry?${new URLSearchParams({ id, ruleset })}`);
    if (requestId !== rulebookDetailRequestId || ruleset !== rulebookRuleset) return;
    const fields = Object.entries(entry.payload).filter(([, value]) => value !== null && value !== "" && value !== "×" && value !== "x");
    elements.rulebookDetail.innerHTML = `<h4>${escapeHtml(entry.name)}</h4><p>${escapeHtml(entry.sourceSheet)}!${escapeHtml(entry.sourceRange)} · 原表导入，待逐条复核</p>${entry.categoryWarning ? `<p class="library-caution">${escapeHtml(entry.categoryWarning)}</p>` : ""}<dl>${fields.map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(formatLibraryValue(value))}</dd></div>`).join("")}</dl>`;
    const page = elements.rulebookDetail.parentElement;
    page.scrollTop = elements.rulebookDetail.offsetTop - page.offsetTop - 12;
    elements.rulebookDetail.focus({ preventScroll: true });
  } catch (error) {
    if (requestId === rulebookDetailRequestId) elements.rulebookDetail.textContent = String(error.message || error);
  }
}

function aiDraft() {
  return { name: elements.aiProfileName.value, baseUrl: elements.aiBaseUrl.value, model: elements.aiModel.value, apiKey: elements.aiApiKey.value };
}

function invalidateAiTest() {
  verifiedAiSignature = null;
  elements.saveAiSettings.disabled = true;
  elements.aiTestStatus.className = "connection-status";
  elements.aiTestStatus.textContent = "尚未测试当前配置。旧配置不会在测试失败时被覆盖。";
}

async function testAiConnection() {
  const draft = aiDraft();
  const errors = validateAiProfile(draft);
  if (errors.length) { setAiStatus(errors[0], "error"); return; }
  elements.testAiConnection.disabled = true;
  setAiStatus("正在发送固定的最小聊天请求……", "");
  try {
    const response = await fetch("/api/ai/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
    const result = await response.json().catch(() => ({ ok: false, message: "本地测试服务返回了无法解析的响应。" }));
    if (!response.ok || !result.ok) throw new Error(result.message || "连接测试失败。");
    if(profileSignature(aiDraft())!==profileSignature(draft)){invalidateAiTest();setAiStatus('测试期间配置已更改，请测试当前配置。','');return;}
    verifiedAiSignature = profileSignature(draft);
    elements.saveAiSettings.disabled = false;
    setAiStatus("连接成功。现在可以保存这份已验证配置。", "ok");
  } catch (error) { verifiedAiSignature = null; elements.saveAiSettings.disabled = true; setAiStatus(`连接失败：${error.message}`, "error"); }
  finally { elements.testAiConnection.disabled = false; }
}

function saveAiSettings() {
  const draft = aiDraft();
  if (!verifiedAiSignature || verifiedAiSignature !== profileSignature(draft)) { invalidateAiTest(); return; }
  workspace.settings.aiProfile = savedAiProfile(draft);
  sessionStorage.setItem(AI_SESSION_KEY, draft.apiKey);
  persist(false);
  elements.saveAiSettings.disabled = true;
  setAiStatus("已保存验证过的地址与模型；密钥只保留在当前会话。", "ok");
  showToast("AI API 配置已保存");
}

function setAiStatus(message, state) { elements.aiTestStatus.textContent = message; elements.aiTestStatus.className = `connection-status${state ? ` is-${state}` : ""}`; }

function toggleAssistant(open) {
  elements.assistantPopover.hidden = !open;
  elements.assistantOrb.setAttribute("aria-expanded", open ? "true" : "false");
  elements.assistantOrb.setAttribute("aria-label", open ? "关闭规则助手" : "打开规则助手");
  if (open) {
    refreshAssistant();refreshAssistantLibrary();
    if(assistantPosition) setAssistantPosition(assistantPosition.x,assistantPosition.y);
    document.querySelector(".assistant-tabs .is-active")?.focus();
  }
}

function initializeAssistantPosition() {
  try { assistantPosition = JSON.parse(localStorage.getItem(ASSISTANT_POSITION_KEY)); } catch { assistantPosition = null; }
  const defaultX = innerWidth - (activePage === "character" ? 360 : 0) - 82;
  setAssistantPosition(Number.isFinite(assistantPosition?.x) ? assistantPosition.x : defaultX, Number.isFinite(assistantPosition?.y) ? assistantPosition.y : innerHeight - 82);
}

function setAssistantPosition(x, y, save = false) {
  const margin = 12;
  const width = 58;
  assistantPosition = { x: Math.round(Math.max(margin, Math.min(x, innerWidth - width - margin))), y: Math.round(Math.max(margin, Math.min(y, innerHeight - width - margin))) };
  const float = document.querySelector(".assistant-float");
  float.style.left = `${assistantPosition.x}px`;
  float.style.top = `${assistantPosition.y}px`;
  float.classList.toggle("is-left", assistantPosition.x < innerWidth / 2);
  float.classList.toggle("is-top", assistantPosition.y < innerHeight / 2);
  const geometry=assistantGeometry(assistantPosition.x,assistantPosition.y,innerWidth,innerHeight);
  for(const [name,value] of Object.entries(geometry)) elements.assistantPopover.style[name]=`${value}px`;
  elements.assistantPopover.style.maxHeight=`${geometry.height}px`;
  if (save) try { localStorage.setItem(ASSISTANT_POSITION_KEY, JSON.stringify(assistantPosition)); } catch { /* private browsing */ }
}

function startAssistantDrag(event) {
  if (event.button !== 0) return;
  assistantDrag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: assistantPosition.x, y: assistantPosition.y, moved: false };
  elements.assistantOrb.setPointerCapture(event.pointerId);
}

function moveAssistantDrag(event) {
  if (!assistantDrag || event.pointerId !== assistantDrag.pointerId) return;
  const dx = event.clientX - assistantDrag.startX;
  const dy = event.clientY - assistantDrag.startY;
  if (!assistantDrag.moved && Math.hypot(dx, dy) < 5) return;
  assistantDrag.moved = true;
  setAssistantPosition(assistantDrag.x + dx, assistantDrag.y + dy);
}

function endAssistantDrag(event) {
  if (!assistantDrag || event.pointerId !== assistantDrag.pointerId) return;
  if (assistantDrag.moved) {
    suppressOrbClick = true;
    setAssistantPosition(assistantPosition.x, assistantPosition.y, true);
  }
  assistantDrag = null;
}

function cycleAssistantCorner() {
  const corners = [[12, 12], [innerWidth - 70, 12], [innerWidth - 70, innerHeight - 70], [12, innerHeight - 70]];
  const nearest = corners.reduce((best, point, index) => Math.hypot(assistantPosition.x - point[0], assistantPosition.y - point[1]) < Math.hypot(assistantPosition.x - corners[best][0], assistantPosition.y - corners[best][1]) ? index : best, 0);
  setAssistantPosition(...corners[(nearest + 1) % corners.length], true);
}

function queueKnowledgeSearch() {
  clearTimeout(knowledgeTimer);
  const query = elements.assistantKnowledgeQuery.value.trim();
  const requestId = ++knowledgeRequestId;
  if (!query) { elements.assistantKnowledgeResults.textContent = "输入关键词查找，不会跨规则版本混用。"; return; }
  const ruleset = libraryRuleset();
  elements.assistantKnowledgeResults.textContent = "正在查找当前版本资料…";
  knowledgeTimer = setTimeout(async () => {
    try {
      const data = await libraryGet(`/api/library/search?${new URLSearchParams({ ruleset, query, limit: "8" })}`);
      if (requestId !== knowledgeRequestId || ruleset !== libraryRuleset()) return;
      elements.assistantKnowledgeResults.innerHTML = data.results.length ? data.results.map((item) => `<button type="button" data-knowledge-entry="${escapeHtml(item.id)}"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(libraryKindName(item.kind,item.ruleset) ?? item.kind)}</span></button>`).join("") : "当前版本无匹配，可在人物卡中自定义输入。";
    } catch { if (requestId === knowledgeRequestId) elements.assistantKnowledgeResults.textContent = "本机资料库暂不可用。"; }
  }, 180);
}

function renderFatalCalculationError(error) {
  elements.errorSummary.hidden = false;
  elements.errorSummaryList.innerHTML = `<li>${escapeHtml(error.message)}</li>`;
  elements.saveButton.disabled = true;
  elements.assistantIssueDot.hidden = false;
  elements.assistantIssueDot.textContent='!';
  elements.assistantOrb.title='填卡助手 · 当前计算失败，请检查输入';
  elements.assistantLiveStatus.textContent='计算失败：无法提供当前数值，旧结果已隐藏。';
  elements.traceResult.textContent='—';elements.traceFormula.textContent='无法计算';
  elements.traceTerms.innerHTML='';elements.traceSources.innerHTML='';
  elements.traceSource.textContent='当前计算不可用';elements.traceNotes.textContent=error.message;
  elements.issueBadge.textContent='!';elements.issueHeading.textContent='计算失败';
  elements.issueList.textContent=error.message;elements.adviceHeading.textContent='无法生成待办';elements.adviceCard.textContent='请先检查人物输入。';
}

function markDirty() {
  if(!assistantRefreshQueued) {
    assistantRefreshQueued=true;
    queueMicrotask(()=>{assistantRefreshQueued=false;refreshAssistant();});
  }
  activeCharacter.updatedAt = new Date().toISOString();
  elements.saveStatus.classList.add("is-dirty");
  elements.saveStatus.innerHTML = "<i></i> 有未保存修改";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persist(false), 450);
}

function persist(announce) {
  clearTimeout(saveTimer);
  workspace.activeId = activeCharacter.id;
  try {
    saveWorkspace(workspace);
    elements.saveStatus.classList.remove("is-dirty");
    elements.saveStatus.innerHTML = "<i></i> 已保存";
    if (announce) showToast("人物已保存到本机");
  } catch {
    elements.saveStatus.classList.add("is-dirty");
    elements.saveStatus.innerHTML = "<i></i> 保存空间不足";
    showToast("本地保存失败；立绘可能过大");
  }
}

function exportCharacterFile() {
  elements.exportStatus.textContent = '';
  elements.exportDialog.querySelector('.export-choice p').textContent=isCoc(activeCharacter)?'调查员、技能、战斗、资产与物品、经历与神话，共五张工作表。保留立绘与描述；Excel为当前数值快照，完整备份请使用JSON。':'人物、主要情况、施法、部署生物、背包，共五张工作表。保留立绘与完整描述，支持编辑和打印。';
  elements.exportDialog.showModal();
}

function downloadCharacterBlob(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; link.hidden = true;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

let excelExportBusy = false;
async function exportExcelFile() {
  if (excelExportBusy) return;
  excelExportBusy = true;
  const snapshot = JSON.parse(JSON.stringify(activeCharacter));
  const dialog = elements.exportDialog, button = elements.exportExcel;
  const cancelled = new AbortController();
  const cancel = () => cancelled.abort();
  dialog.addEventListener('close', cancel, { once: true });
  button.disabled = true; button.textContent = '正在生成…';
  elements.exportStatus.textContent = '正在整理五张工作表与立绘，请稍候。';
  dialog.setAttribute('aria-busy', 'true');
  try {
    const { exportCharacterXlsx } = await import('./excel-export.mjs');
    const bytes = await exportCharacterXlsx(snapshot);
    if (cancelled.signal.aborted || !dialog.open) return;
    downloadCharacterBlob(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${characterExportBasename(snapshot)}.xlsx`);
    elements.exportStatus.textContent = '已生成 Excel 并交给浏览器下载。';
    showToast('Excel 人物卡已生成（五张工作表）');
  } catch (error) {
    if (!cancelled.signal.aborted) elements.exportStatus.textContent = `Excel 导出失败：${error.message}。可重试或先导出 JSON 备份。`;
  } finally {
    excelExportBusy = false; button.disabled = false; button.textContent = '导出 Excel';
    dialog.removeAttribute('aria-busy'); dialog.removeEventListener('close', cancel);
  }
}

function exportJsonFile() {
  const errors = validateCharacter(activeCharacter).filter((issue) => issue.severity === "error");
  if (errors.length) { elements.exportDialog.close(); selectPanel("issues"); toggleAssistant(true); elements.errorSummary.focus(); showToast("请先修正阻断问题"); return; }
  const blob = new Blob([JSON.stringify(exportDocument(activeCharacter), null, 2)], { type: "application/json" });
  downloadCharacterBlob(blob, `${characterExportBasename(activeCharacter)}.json`);
  elements.exportStatus.textContent = '已生成 JSON 完整备份并交给浏览器下载。';
  showToast("已导出人物 JSON");
}

async function importCharacterFile(event) {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file) return;
  try {
    if (file.size > 3_000_000) throw new Error("人物文件不能超过 3 MB");
    const document = JSON.parse(await file.text());
    const imported = importDocument(document);
    imported.id = createCharacter().id; imported.name = `${imported.name}（导入）`;
    workspace.characters.push(imported); selectCharacter(imported.id); showToast("导入完成，请核对规则版本与数值");
  } catch (error) { showToast(`导入失败：${error.message}`); }
}

function selectPanel(panel) {
  if(panel==='dice')diceView.refresh(true);
  if(panel==='chat')aiChat.refresh();
  document.querySelectorAll(".assistant-tabs button").forEach((button) => { const active = button.dataset.panel === panel; button.classList.toggle("is-active", active); button.setAttribute("aria-selected", active ? "true" : "false"); button.tabIndex=active?0:-1; });
  document.querySelectorAll(".assistant-panel").forEach((section) => section.classList.toggle("is-active", section.id === `panel-${panel}`));
}

function focusField(field) {
  const target = document.getElementById(field);
  if (!target) {showToast('没有找到对应字段，请在主要情况中核对。');return;}
  toggleAssistant(false);
  const panel=target.closest('[data-page-panel]');
  if(panel) selectCharacterPage(panel.dataset.pagePanel);
  for(let parent=target.parentElement;parent;parent=parent.parentElement) if(parent.tagName==='DETAILS') parent.open=true;
  const focus=target.matches('input,select,textarea,button')?target:target.querySelector('input,select,textarea,button')||target;
  if(focus===target&&!target.matches('input,select,textarea,button')) target.tabIndex=-1;
  target.scrollIntoView({behavior:prefersReducedMotion()?'auto':'smooth',block:'center'});focus.focus({preventScroll:true});
}

function applyTheme(theme, save = false) {
  document.documentElement.dataset.theme = theme;
  elements.themeToggle.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
  workspace.theme = theme;
  if (save) persist(false);
}

function loadSidebarState() {
  try { return localStorage.getItem(SIDEBAR_STATE_KEY) === "true"; }
  catch { return false; }
}

function applySidebarState(collapsed, save = false) {
  const shell = document.querySelector(".app-shell");
  shell.classList.toggle("is-sidebar-collapsed", collapsed);
  elements.sidebarToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  elements.sidebarToggle.setAttribute("aria-label", collapsed ? "展开人物栏" : "收起人物栏");
  elements.sidebarToggle.title = collapsed ? "展开人物栏" : "收起人物栏";
  if (save) {
    try { localStorage.setItem(SIDEBAR_STATE_KEY, String(collapsed)); }
    catch { /* 偏好保存失败不影响人物编辑。 */ }
  }
}

function showToast(message, action = null) {
  clearTimeout(toastTimer);
  elements.toast.innerHTML = `<span>${escapeHtml(message)}</span>${action ? `<button id="toastAction" type="button">${escapeHtml(action.label)}</button>` : ""}`;
  if (action) elements.toast.querySelector("button").addEventListener("click", () => { clearTimeout(toastTimer); elements.toast.classList.remove("is-visible"); action.action(); }, { once: true });
  elements.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => { elements.toast.classList.remove("is-visible"); if (action) lastDeletedCharacter = null; }, action?.duration ?? 2600);
}

function numberOr(value, fallback) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function createRecordId() { return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `record-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
function prefersReducedMotion() { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
