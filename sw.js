/* 금주노트 서비스워커 — 오프라인에서도 열리도록 캐시 */
const CACHE="nonalcohol-v14";
const ASSETS=["index.html","nadb.js","manifest.webmanifest","icon-192.png","icon-512.png","icon-512-maskable.png","apple-touch-icon.png","favicon-32.png"];
const own=(req)=>caches.open(CACHE).then(c=>c.match(req));   // 같은 주소의 다른 앱 캐시는 읽지 않는다
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS).then(()=>Promise.all(["vendor/sql-wasm.js","vendor/sql-wasm.wasm"].map(u=>c.add(u).catch(()=>{}))))).then(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith("nonalcohol-")&&x!==CACHE)  /* 같은 주소(github.io)의 다른 앱 캐시는 지우지 않는다 */.map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",e=>{
  const req=e.request; if(req.method!=="GET")return;
  const u=new URL(req.url);
  if(u.origin!==self.location.origin){ e.respondWith(fetch(req).catch(()=>own(req))); return; } // 글꼴 등 외부: 네트워크 우선
  if(req.mode==="navigate"){ // HTML: 네트워크 우선(항상 최신), 오프라인 시 캐시
    e.respondWith(fetch(req).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(req,c)).catch(()=>{});return r;}).catch(()=>own(req).then(h=>h||own("index.html"))));
    return;
  }
  e.respondWith(own(req).then(h=>h||fetch(req).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(req,c)).catch(()=>{});return r;})));
});
