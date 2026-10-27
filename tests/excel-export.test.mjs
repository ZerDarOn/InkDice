import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter,deriveMvpCharacter } from '../prototype/model.mjs';
import { buildExcelLayout,textChunks,EXCEL_SHEETS } from '../prototype/excel-layout.mjs';
import { exportCharacterXlsx,xmlText } from '../prototype/excel-export.mjs';
import { STYLE_IDS } from '../prototype/export-assets/workbook-template.mjs';
const unzip=bytes=>globalThis.JSZip.loadAsync(bytes);
const sheet=(zip,n)=>zip.file(`xl/worksheets/sheet${n}.xml`).async('string');
const fixture=ruleset=>createCharacter({name:'导出测试 & <角色>',ruleset,player:'玩家',species:'精灵',backgroundStory:'故事末尾',backgroundFeature:'背景特性标记',abilities:{str:9,dex:14,con:12,int:17,wis:10,cha:8},classId:'wizard',level:5,weapons:[{name:'同调武器',weaponType:'匕首',attuned:true}],curios:[{name:'奇物标记',attuned:true,slot:'头部',rarity:'珍稀',properties:'奇物效果标记'}],featureEntries:[{kind:'feat',name:'健壮',description:'专长说明标记'}],spells:[{name:'测试法术',level:3,prepared:true,school:'塑能',effect:'法术末尾',material:'材料标记'}],inventory:[{name:'物品标记',quantity:3,weight:1.5,description:'物品说明标记'}],currency:{cp:1,sp:2,ep:3,gp:4,pp:5},deployedCreatures:[{name:'生物标记',actions:'生物动作标记',traits:'生物特质标记',hitPoints:12,currentHitPoints:7}]});

test('Excel exports added weapon rows beyond the old five-row limit',async()=>{
  const c=createCharacter({weapons:Array.from({length:8},(_,i)=>({name:`新增武器${i+1}`,effect:`独立效果${i+1}`}))});
  const main=await sheet(await unzip(await exportCharacterXlsx(c)),2);
  for(let i=1;i<=8;i++) {
    assert.ok(main.includes(`新增武器${i}`));
    assert.ok(main.includes(`独立效果${i}`));
  }
});

for(const ruleset of ['dnd5e-2014','dnd5r-2024'])test(`Excel 五表、完整字段和版本 ${ruleset}`,async()=>{
  const c=fixture(ruleset), before=JSON.stringify(c), zip=await unzip(await exportCharacterXlsx(c));
  assert.equal(JSON.stringify(c),before,'导出不能修改原卡');
  const workbook=await zip.file('xl/workbook.xml').async('string');
  for(const name of EXCEL_SHEETS)assert.ok(workbook.includes(`name="${name}"`));
  assert.equal((workbook.match(/_xlnm.Print_Area/g)||[]).length,5);
  assert.equal((workbook.match(/_xlnm.Print_Titles/g)||[]).length,5);
  const sheets=await Promise.all([1,2,3,4,5].map(n=>sheet(zip,n)));
  for(const [i,words] of [['故事末尾','背景特性标记'],['同调武器','奇物标记','奇物效果标记','专长说明标记'],['法术末尾','材料标记'],['生物动作标记','生物特质标记','7 / 12'],['物品说明标记']].entries())for(const word of words)assert.ok(sheets[i].includes(word),word);
  assert.ok(sheets.every(s=>s.includes(ruleset==='dnd5r-2024'?'2024':'2014')));
  assert.ok(sheets.every(s=>!s.includes('undefined')&&!s.includes('NaN')&&!s.includes('#REF!')));
  assert.ok(sheets.every(s=>s.includes('fitToWidth="1"')&&s.includes('fitToHeight="0"')&&s.includes('state="frozen"')));
  assert.ok(!Object.keys(zip.files).some(n=>/externalLinks|vbaProject/.test(n)));
});

test('Excel styles have real template indices and readable fonts',async()=>{
  assert.ok(Object.values(STYLE_IDS).every(n=>n>0));
  assert.equal(new Set(Object.values(STYLE_IDS)).size,Object.keys(STYLE_IDS).length);
  const zip=await unzip(await exportCharacterXlsx(fixture('dnd5e-2014')));
  const styles=await zip.file('xl/styles.xml').async('string');
  assert.ok([...styles.matchAll(/sz val="([\d.]+)"/g)].every(m=>+m[1]>=10));
  assert.ok((await sheet(zip,2)).includes(`s="${STYLE_IDS.header}"`));
});

test('Excel formulas have cached results agreeing with current card',async()=>{
  const c=fixture('dnd5e-2014'),d=deriveMvpCharacter(c),layout=buildExcelLayout(c);
  const ability=layout.sheets[1].cells.filter(c=>c.formula);
  assert.equal(ability.length,6);assert.equal(ability[0].value,-1);
  const pack=layout.sheets[4].cells.filter(c=>c.formula);
  assert.deepEqual(pack.map(c=>c.value),[d.load.coins,4.5,d.load.inventory]);
  const zip=await unzip(await exportCharacterXlsx(c));
  assert.match(await sheet(zip,5),/<f>E\d+\*F\d+<\/f><v>4.5<\/v>/);
});

test('Long Chinese descriptions continue without content loss or oversized rows',()=>{
  const text=('长描述，保留所有标点。\n').repeat(180)+'末尾标记';
  for(const span of [1,2,3,5,12])assert.equal(textChunks(text,span).join(''),text);
  const c=fixture('dnd5e-2014');c.spells[0].effect=text;c.name='长名字'.repeat(20);
  const spec=buildExcelLayout(c).sheets[2];
  assert.ok(spec.rows.every(h=>h<=409));
  assert.ok(spec.cells.map(c=>c.value).join('').includes(text));
  const occupied=new Set();
  for(const cell of spec.cells)for(let col=cell.col;col<cell.col+cell.span;col++){const id=`${cell.row}:${col}`;assert.ok(!occupied.has(id));occupied.add(id);}
});

test('Player text is literal XML text, never executable Excel formulas',async()=>{
  const c=fixture('dnd5e-2014');c.backgroundStory='=HYPERLINK("https://invalid.test", "x")';
  const xml=await sheet(await unzip(await exportCharacterXlsx(c)),1);
  assert.ok(xml.includes('=HYPERLINK(&quot;'));assert.ok(!xml.includes('<f>HYPERLINK'));
  assert.equal(xmlText('<&\u0000>'),'&lt;&amp;&gt;');
});

test('Portraits retain aspect ratio, image parts and relationships',async()=>{
  const c=fixture('dnd5e-2014');c.portrait='data:image/png;base64,test';c.deployedCreatures[0].portrait=c.portrait;
  const zip=await unzip(await exportCharacterXlsx(c,{imageLoader:async()=>({base64:'aW1hZ2U=',width:100,height:200})}));
  for(const id of [1,4]){
    assert.ok(zip.file(`xl/media/portrait-${id}-1.png`));
    const drawing=await zip.file(`xl/drawings/drawing${id}.xml`).async('string');
    const [,w,h]=drawing.match(/xdr:ext cx="(\d+)" cy="(\d+)"/);assert.equal(+h/+w,2);
    assert.ok((await sheet(zip,id)).includes('rIdPortraits'));
  }
  const types=await zip.file('[Content_Types].xml').async('string');assert.ok(types.includes('/xl/drawings/drawing4.xml'));
  await assert.rejects(exportCharacterXlsx(c,{imageLoader:async()=>{throw Error('invalid image');}}),/invalid image/);
});

test('Empty card still produces five usable sheets',async()=>{
  const zip=await unzip(await exportCharacterXlsx(createCharacter()));
  assert.ok((await sheet(zip,4)).includes('尚未记录部署生物'));
  assert.ok((await sheet(zip,5)).includes('<f>0</f><v>0</v>'));
});

test('Unnamed weapon with manual dice is not mistaken for an empty row',async()=>{
  const c=createCharacter({weapons:[{attackDie:'d20 + 17',extraDamageDie:'2d8',extraDamageType:'力场'}]});
  const xml=await sheet(await unzip(await exportCharacterXlsx(c)),2);
  assert.ok(xml.includes('d20 + 17'));assert.ok(xml.includes('2d8'));assert.ok(xml.includes('力场'));
});
