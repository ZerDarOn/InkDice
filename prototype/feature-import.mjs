export const speciesContext = c => JSON.stringify([c.ruleset,c.species||'',c.subrace||'']);
const owner = f => f.speciesBinding || (f.catalogEntry?.kind==='species_feature'
  ? JSON.stringify([f.catalogEntry.ruleset,f.catalogEntry.payload?.规则关联?.species||'',f.catalogEntry.payload?.规则关联?.subrace||'']) : '');
const importedId = f => f.speciesSourceId || f.catalogEntry?.id;

// Former species are kept outside active calculations/Excel export. Switching
// back restores edits and counters. Unowned legacy handwriting is not guessed.
export function switchSpeciesFeatures(c) {
  const target=speciesContext(c), old=c.speciesFeatureContext;
  let oldSpecies='';try {oldSpecies=JSON.parse(old||'[]')[1]||'';}catch { /* Unknown legacy context is not trusted. */ }
  c.speciesFeatureArchive ||= [];
  for(const f of c.featureEntries) if(f.kind==='species' && !f.speciesBinding && owner(f)) {
    const link=f.catalogEntry.payload?.规则关联||{};
    f.speciesSourceId=f.catalogEntry.id;
    f.speciesBinding=(old && oldSpecies===link.species ? old : '') || (link.species===c.species && (!link.subrace||link.subrace===c.subrace) ? target : owner(f));
  }
  const outgoing=c.featureEntries.filter(f=>f.kind==='species' && owner(f) && owner(f)!==target);
  if(c.speciesFeatureArchive.length+outgoing.length>2000) throw new Error('种族历史已满，请先导出人物备份；未删除旧记录');
  c.featureEntries=c.featureEntries.filter(f=>!outgoing.includes(f));
  c.speciesFeatureArchive.push(...outgoing);
  let restored=0;
  c.speciesFeatureArchive=c.speciesFeatureArchive.filter(f=>{
    if(old===target) return true;
    if(owner(f)!==target || c.featureEntries.length>=120) return true;
    if(c.featureEntries.some(a=>a.id===f.id || (importedId(f) && importedId(a)===importedId(f)))) return true;
    c.featureEntries.push(f);restored++;return false;
  });
  c.speciesFeatureContext=target;
  return {archived:outgoing.length,restored};
}

export function syncSpeciesFeatures(c,entries,createId) {
  const incoming=new Set(entries.map(e=>e.id));
  const obsolete=c.featureEntries.filter(f=>f.kind==='species' && importedId(f) && !incoming.has(importedId(f)));
  if((c.speciesFeatureArchive?.length||0)+obsolete.length>2000) throw new Error('种族历史已满，请先导出人物备份；未删除旧记录');
  c.speciesFeatureArchive ||= [];
  c.speciesFeatureArchive.push(...obsolete);
  c.featureEntries=c.featureEntries.filter(f=>!obsolete.includes(f));
  c.speciesFeatureArchive=c.speciesFeatureArchive.filter(f=>{
    if(owner(f)!==speciesContext(c) || !incoming.has(importedId(f)) || c.featureEntries.length>=120 || c.featureEntries.some(a=>importedId(a)===importedId(f))) return true;
    c.featureEntries.push(f);return false;
  });
  const result=appendImportedFeatures(c,entries,'species',createId);
  for(const f of c.featureEntries) if(f.kind==='species' && f.catalogEntry?.kind==='species_feature') {f.speciesBinding=speciesContext(c);f.speciesSourceId=f.catalogEntry.id;}
  return {...result,archived:obsolete.length};
}

// Class imports remain append-only; species imports use the synchronizer above.
export function appendImportedFeatures(character, entries, kind, createId) {
  let added=0, skipped=0, overflow=0, updated=0;
  for(const entry of entries) {
    if(entry.ruleset!==character.ruleset) {skipped++;continue;}
    const previous=character.featureEntries.find(f=>importedId(f)===entry.id);
    if(previous?.catalogEntry && previous.description===String(previous.catalogEntry.payload?.描述||'') && previous.description!==String(entry.payload.描述||'')) {
      previous.description=String(entry.payload.描述||'');
      previous.catalogEntry={id:entry.id,name:entry.name,kind:entry.kind,ruleset:entry.ruleset,payload:entry.payload};
      updated++;continue;
    }
    if(character.featureEntries.some(f=>importedId(f)===entry.id ||
      (f.kind===kind && !f.catalogEntry && f.name.trim()===entry.name.trim()))) {skipped++;continue;}
    if(character.featureEntries.length>=120) {overflow++;continue;}
    character.featureEntries.push({id:createId(),kind,level:entry.payload.规则关联?.minLevel||1,name:entry.name,
      description:String(entry.payload.描述||''),current:0,maximum:0,recovery:'',
      catalogEntry:{id:entry.id,name:entry.name,kind:entry.kind,ruleset:entry.ruleset,payload:entry.payload}});
    added++;
  }
  return {added,skipped,overflow,updated};
}
