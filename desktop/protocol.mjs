import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { classOptions, getLibraryEntry, librarySummary, searchLibrary, featureImports } from '../tools/library.mjs';
import { testAiConnection } from '../tools/ai-test.mjs';
import {answerCharacterQuestion} from '../tools/ai-chat.mjs';

export const APP_ORIGIN = 'inkdice://app';
export const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-src 'none'; form-action 'self'";
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json; charset=utf-8' };
const headers = { 'content-security-policy': CSP, 'x-content-type-options':'nosniff', 'cache-control':'no-store' };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers:{...headers,'content-type':MIME['.json']} });

export function createAppHandler(root, getDatabase, onRequest = () => {}) {
  return async request => {
    let url;
    try { url = new URL(request.url); } catch { return json(400,{error:'地址无效。'}); }
    if (url.protocol !== 'inkdice:' || url.host !== 'app') return json(403,{error:'不允许的来源。'});
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { return json(400,{error:'地址编码无效。'}); }
    if (pathname.includes('\\') || pathname.includes('\0')) return json(403,{error:'路径无效。'});
    try {
      if (pathname === '/api/ai/test' || pathname === '/api/ai/chat') {
        if (request.method !== 'POST') return json(405,{ok:false,message:'只接受 POST 请求。'});
        const text = await request.text();
        if (text.length > (pathname.endsWith('/chat')?180000:20000)) return json(413,{ok:false,message:'请求内容过大。'});
        let body;try{body=JSON.parse(text);}catch{return json(400,{ok:false,message:'请求不是有效 JSON。'});}
        const {status,...result} = pathname.endsWith('/chat')?await answerCharacterQuestion(body,fetch,request.signal):await testAiConnection(body);
        return json(status,result);
      }
      if (request.method !== 'GET') return json(405,{error:'只接受 GET 请求。'});
      if (pathname.startsWith('/api/library/')) {
        const db = getDatabase();
        if (!db) return json(503,{error:'尚未载入资料库。请通过“文件 → 载入本机资料库”选择已导入的 SQLite 文件。'});
        const options = Object.fromEntries(url.searchParams);
        let body;
        if (pathname === '/api/library/features') body = featureImports(db,options);
        else if (pathname === '/api/library/summary') body = librarySummary(db,options);
        else if (pathname === '/api/library/search') body = searchLibrary(db,options);
        else if (pathname === '/api/library/classes') body = classOptions(db,options);
        else if (pathname === '/api/library/entry') body = getLibraryEntry(db,String(options.id || '').slice(0,200),options);
        else return json(404,{error:'接口不存在。'});
        onRequest(pathname,options.ruleset);
        return body ? json(200,body) : json(404,{error:'找不到这条资料。'});
      }
      const relative = pathname === '/' || pathname === '/prototype/' ? 'prototype/index.html' : pathname.replace(/^\/+/, '');
      const absolute = path.resolve(root,relative);
      const allowed = ['prototype','packages'].some(folder => absolute.startsWith(path.join(root,folder)+path.sep));
      const mime = MIME[path.extname(absolute)];
      if (!allowed || !mime) return json(404,{error:'文件不存在。'});
      return new Response(await readFile(absolute),{headers:{...headers,'content-type':mime}});
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'EISDIR') return json(404,{error:'文件不存在。'});
      return json(400,{error:String(error?.message || error).slice(0,200)});
    }
  };
}
