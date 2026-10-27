import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classOptions, getLibraryEntry, librarySummary, openLibrary, searchLibrary, featureImports } from "./library.mjs";
import { testAiConnection } from './ai-test.mjs';
import {answerCharacterQuestion} from './ai-chat.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT ?? 4173);
const host = "127.0.0.1";
const library = openLibrary(path.join(projectRoot, "local-data", "content-library.sqlite"));
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = createServer(async (request, response) => {
  const requestedPath = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname);
  if(requestedPath==='/api/ai/chat'){
    if(request.method!=='POST')return sendJson(response,405,{ok:false,message:'只接受 POST 请求。'});
    const controller=new AbortController();response.on('close',()=>{if(!response.writableEnded)controller.abort();});
    try{const body=await readJson(request,180000);const {status,...result}=await answerCharacterQuestion(body,fetch,controller.signal);if(!response.destroyed)sendJson(response,status,result);}
    catch{if(!response.destroyed)sendJson(response,400,{ok:false,message:'请求无效或内容过大。'});}return;
  }
  if (requestedPath === "/api/ai/test") {
    await handleAiTest(request, response);
    return;
  }
  if (requestedPath.startsWith("/api/library/")) {
    if (request.method !== "GET") return sendJson(response, 405, { error: "只接受 GET 请求。" });
    if (!library) return sendJson(response, 503, { error: "本机资料库尚未导入。" });
    try {
      const url = new URL(request.url, `http://${host}:${port}`);
      if (requestedPath === "/api/library/features") return sendJson(response, 200, featureImports(library, Object.fromEntries(url.searchParams)));
      if (requestedPath === "/api/library/classes") return sendJson(response, 200, classOptions(library, Object.fromEntries(url.searchParams)));
      if (requestedPath === "/api/library/summary") return sendJson(response, 200, librarySummary(library, Object.fromEntries(url.searchParams)));
      if (requestedPath === "/api/library/search") return sendJson(response, 200, searchLibrary(library, Object.fromEntries(url.searchParams)));
      if (requestedPath === "/api/library/entry") {
        const entry = getLibraryEntry(library, String(url.searchParams.get("id") ?? "").slice(0, 200), Object.fromEntries(url.searchParams));
        return entry ? sendJson(response, 200, entry) : sendJson(response, 404, { error: "找不到这条资料。" });
      }
      return sendJson(response, 404, { error: "接口不存在。" });
    } catch (error) {
      return sendJson(response, 400, { error: String(error?.message ?? error).slice(0, 200) });
    }
  }
  if (requestedPath === "/") {
    response.writeHead(302, { location: "/prototype/" });
    response.end();
    return;
  }
  const relativePath = requestedPath === "/prototype/" ? "prototype/index.html" : requestedPath.replace(/^\/+/, "");
  const absolutePath = path.resolve(projectRoot, relativePath);
  const allowedRoots = ["prototype", "packages"].map((folder) => path.join(projectRoot, folder));
  const isAllowed = allowedRoots.some((root) => absolutePath === root || absolutePath.startsWith(`${root}${path.sep}`));

  if (!isAllowed || !existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": mimeTypes[path.extname(absolutePath)] ?? "application/octet-stream",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  createReadStream(absolutePath).pipe(response);
});

async function handleAiTest(request, response) {
  if (request.method !== "POST") return sendJson(response, 405, { ok: false, message: "只接受 POST 请求。" });
  try {
    const body = await readJson(request, 20_000);
    const { status, ...result } = await testAiConnection(body);
    return sendJson(response, status, result);
  } catch (error) {
    const message = error?.name === "TimeoutError" ? "连接测试超时（15 秒）。" : String(error?.message ?? error).slice(0, 300);
    return sendJson(response, 400, { ok: false, message });
  }
}

function readJson(request, limit) {
  return new Promise((resolve, reject) => {
    let text = "";
    let tooLarge=false;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if(tooLarge)return;
      text += chunk;
      if (text.length > limit) {tooLarge=true;text='';reject(new Error("请求内容过大。"));}
    });
    request.on("end", () => {
      try { resolve(JSON.parse(text)); } catch { reject(new Error("请求不是有效 JSON。")); }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(payload));
}

server.listen(port, host, () => {
  console.log(`墨骰工坊 MVP：http://${host}:${port}`);
});
