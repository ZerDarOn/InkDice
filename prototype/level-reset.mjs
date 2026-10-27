import {deriveMvpCharacter} from './model.mjs';
import {entryEligibility, syncCharacterSlots} from './character-rules.mjs';
import {advancementSourceStatus} from './advancement.mjs';

// Return a copy so confirmation/undo can preserve the complete original card.
export function resetCharacterLevel(character, classCatalog = []) {
  const c = structuredClone(character);
  c.level = 1; c.multiclasses = []; c.multiclass = ''; c.multiclassUnresolved = '';
  c.experience = 0;
  const subclass = classCatalog.find(entry => entry.classId === c.classId)?.payload?.规则关联?.subclasses?.find(entry => entry.name === c.subclass);
  // Unknown/custom subclasses are kept for review, never silently deleted.
  if (subclass && subclass.minLevel > 1) c.subclass = '';
  c.spellcastingClassId = c.classId;
  c.hitDiceSpent = {[c.classId]:0}; c.hitDiceCurrent = 1;
  c.resourceSpent = {}; c.tempHp = 0; c.concentrationSpellId = '';
  for (const feature of c.featureEntries) {
    const classRecord = ['class','fighting','special'].includes(feature.kind);
    const blocked = classRecord && (feature.catalogEntry
      ? entryEligibility(feature.catalogEntry,c,{featureKind:feature.kind}).status === 'blocked'
      : feature.kind === 'class' && Number(feature.level)>1);
    if (blocked || advancementSourceStatus(feature,c)) feature.effectMode = 'off';
  }
  syncCharacterSlots(c, {preserveSpent:false});
  c.currentHp = deriveMvpCharacter(c).hitPoints;
  return c;
}
