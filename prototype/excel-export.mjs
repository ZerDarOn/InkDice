import './vendor/jszip.min.mjs';
import { WORKBOOK_BASE64, STYLE_IDS } from './export-assets/workbook-template.mjs';
import { buildExcelLayout, columnName } from './excel-layout.mjs';

const JSZip = globalThis.JSZip || globalThis.window?.JSZip;
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
export const xmlText = value => String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));

function cellXml(cell) {
  const ref=`${columnName(cell.col)}${cell.row}`,style=STYLE_IDS[cell.style];
  if(cell.formula) return `<c r="${ref}" s="${style}"><f>${xmlText(cell.formula)}</f><v>${Number(cell.value)}</v></c>`;
  if(typeof cell.value==='number'&&Number.isFinite(cell.value))return `<c r="${ref}" s="${style}" t="n"><v>${cell.value}</v></c>`;
  // All player-authored content is literal text, including strings starting with =,+,-,@.
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlText(cell.value)}</t></is></c>`;
}
function sheetXml(sheet,hasImages) {
  const rows=sheet.rows.map((height,i)=>{
    const cells=sheet.cells.filter(c=>c.row===i+1).flatMap(c=>[c,...Array.from({length:c.span-1},(_,n)=>({...c,col:c.col+n+1,span:1,value:'',formula:null}))]);
    return `<row r="${i+1}" ht="${height}" customHeight="1">${cells.sort((a,b)=>a.col-b.col).map(cellXml).join('')}</row>`;
  }).join('');
  const merges=sheet.cells.filter(c=>c.span>1).map(c=>`<mergeCell ref="${columnName(c.col)}${c.row}:${columnName(c.col+c.span-1)}${c.row}"/>`);
  const breaks=sheet.breaks.length?`<rowBreaks count="${sheet.breaks.length}" manualBreakCount="${sheet.breaks.length}">${sheet.breaks.map(id=>`<brk id="${id}" max="16383" man="1"/>`).join('')}</rowBreaks>`:'';
  return `${declaration}<worksheet xmlns="${NS}" xmlns:r="${REL}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:L${sheet.rows.length}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0" zoomScale="90"><pane ySplit="${sheet.freeze}" topLeftCell="A${sheet.freeze+1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="26"/><cols>${sheet.widths.map((width,i)=>`<col min="${i+1}" max="${i+1}" width="${width}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData><mergeCells count="${merges.length}">${merges.join('')}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.15" footer="0.15"/><pageSetup paperSize="9" orientation="${sheet.orientation}" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;L${xmlText(sheet.name)}&amp;C墨骰工坊 · InkDice&amp;R第 &amp;P 页 / 共 &amp;N 页</oddFooter></headerFooter>${breaks}${hasImages?'<drawing r:id="rIdPortraits"/>':''}</worksheet>`;
}

// Browser-only conversion makes WebP portraits compatible with Excel without remote uploads.
export async function prepareExcelImage(dataUrl) {
  if(!/^data:image\/(png|jpeg|webp);base64,/.test(dataUrl))throw Error('立绘格式不支持 Excel 导出');
  if(typeof Image==='undefined')throw Error('需要图像解码器来导出立绘');
  const image=new Image();image.src=dataUrl;await image.decode();
  const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  return {base64:canvas.toDataURL('image/png').split(',')[1],width:canvas.width,height:canvas.height};
}

export async function exportCharacterXlsx(character,{imageLoader=prepareExcelImage}={}) {
  // Snapshot first so a concurrent edit cannot mix two different character states.
  const snapshot=JSON.parse(JSON.stringify(character)),layout=buildExcelLayout(snapshot);
  const zip=await JSZip.loadAsync(WORKBOOK_BASE64,{base64:true});
  let contentTypes=await zip.file('[Content_Types].xml').async('string');
  if(!contentTypes.includes('Extension="png"'))contentTypes=contentTypes.replace('</Types>','<Default Extension="png" ContentType="image/png"/></Types>');
  for(const [index,sheet] of layout.sheets.entries()) {
    const id=index+1,anchors=[],relationships=[];
    for(const [n,placement] of sheet.images.entries()) {
      const image=await imageLoader(placement.dataUrl);
      if(!(image.width>0&&image.height>0&&image.base64))throw Error('立绘解码失败，未生成不完整的 Excel');
      const ratio=Math.min(placement.width/image.width,placement.height/image.height),width=Math.round(image.width*ratio),height=Math.round(image.height*ratio);
      const imageName=`portrait-${id}-${n+1}.png`;
      zip.file(`xl/media/${imageName}`,image.base64,{base64:true});
      anchors.push(`<xdr:oneCellAnchor><xdr:from><xdr:col>${placement.col}</xdr:col><xdr:colOff>${Math.round((placement.width-width)/2)*9525}</xdr:colOff><xdr:row>${placement.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${width*9525}" cy="${height*9525}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${n+1}" name="立绘 ${n+1}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${n+1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width*9525}" cy="${height*9525}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`);
      relationships.push(`<Relationship Id="rId${n+1}" Type="${REL}/image" Target="../media/${imageName}"/>`);
    }
    zip.file(`xl/worksheets/sheet${id}.xml`,sheetXml(sheet,anchors.length>0));
    if(anchors.length) {
      zip.file(`xl/drawings/drawing${id}.xml`,`${declaration}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${REL}">${anchors.join('')}</xdr:wsDr>`);
      zip.file(`xl/drawings/_rels/drawing${id}.xml.rels`,`${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join('')}</Relationships>`);
      zip.file(`xl/worksheets/_rels/sheet${id}.xml.rels`,`${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdPortraits" Type="${REL}/drawing" Target="../drawings/drawing${id}.xml"/></Relationships>`);
      contentTypes=contentTypes.replace('</Types>',`<Override PartName="/xl/drawings/drawing${id}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
    }
  }
  let workbook=await zip.file('xl/workbook.xml').async('string');
  // Artifact Tool uses an x: namespace prefix; normalize it before adding print names.
  workbook=workbook.replace(/(<\/?)(?:x:)/g,'$1').replace(/xmlns:x=/g,'xmlns=');
  if(character.ruleset==='coc-7e'){
    let index=0;workbook=workbook.replace(/<sheet\b[^>]*\bname="[^"]*"[^>]*\/>/g,tag=>tag.replace(/\bname="[^"]*"/,`name="${xmlText(layout.sheets[index++].name)}"`));
  }
  workbook=workbook.replace(/<definedNames[\s\S]*?<\/definedNames>/,'').replace(/<calcPr[^>]*\/>/,'');
  const names=layout.sheets.map((s,i)=>`<definedName name="_xlnm.Print_Area" localSheetId="${i}">'${xmlText(s.name)}'!$A$1:$L$${s.rows.length}</definedName><definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${xmlText(s.name)}'!$1:$3</definedName>`).join('');
  workbook=workbook.replace('</workbook>',`<definedNames>${names}</definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`);
  zip.file('xl/workbook.xml',workbook);zip.file('[Content_Types].xml',contentTypes);
  return zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:6}});
}
