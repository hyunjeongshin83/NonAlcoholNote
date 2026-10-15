/* 금주노트 서비스워커 — 오프라인에서도 열리도록 캐시 */
const CACHE="nonalcohol-v1";
const ASSETS=["index.html","manifest.webmanifest","icon-192.png","icon-512.png","icon-512-maskable.png","apple-touch-icon.png","favicon-32.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith("nonalcohol-")&&x!==CACHE)  /* 같은 주소(github.io)의 다른 앱 캐시는 지우지 않는다 */.map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",e=>{
  const req=e.request; if(req.method!=="GET")return;
  const u=new URL(req.url);
  if(u.origin!==self.location.origin){ e.respondWith(fetch(req).catch(()=>caches.match(req))); return; } // 글꼴 등 외부: 네트워크 우선
  if(req.mode==="navigate"){ // HTML: 네트워크 우선(항상 최신), 오프라인 시 캐시
    e.respondWith(fetch(req).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(req,c)).catch(()=>{});return r;}).catch(()=>caches.match(req).then(h=>h||caches.match("index.html"))));
    return;
  }
  e.respondWith(caches.match(req).then(h=>h||fetch(req).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(req,c)).catch(()=>{});return r;})));
});
