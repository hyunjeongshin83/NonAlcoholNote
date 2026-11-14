/* 금주노트 서비스워커 — 오프라인에서도 열리도록 캐시 */
const CACHE="nonalcohol-v22";   // v22: research.js 가 IRB 번호 없이는 켜지지 않게 바뀜 (옛 사본이 오프라인에 남지 않게)
const ASSETS=["index.html","NonAlcohol_app.html","nadb.js","manifest.webmanifest","icon-192.png","icon-512.png","icon-512-maskable.png","apple-touch-icon.png","favicon-32.png"];
const own=(req)=>caches.open(CACHE).then(c=>c.match(req));   // 같은 주소의 다른 앱 캐시는 읽지 않는다
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS).then(()=>Promise.all(["vendor/sql-wasm.js","vendor/sql-wasm.wasm"].map(u=>c.add(u).catch(()=>{}))))).then(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith("nonalcohol-")&&x!==CACHE)  /* 같은 주소(github.io)의 다른 앱 캐시는 지우지 않는다 */.map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",e=>{
  const req=e.request; if(req.method!=="GET")return;
  const u=new URL(req.url);
  if(u.origin!==self.location.origin){ e.respondWith(fetch(req).catch(()=>own(req))); return; } // 글꼴 등 외부: 네트워크 우선
  if(req.mode==="navigate"){ // HTML: 네트워크 우선(항상 최신), 오프라인 시 캐시
    e.respondWith(fetch(req).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(req,c)).catch(()=>{});return r;}).catch(()=>own(req).then(h=>h||own("NonAlcohol_app.html"))));
    return;
  }
  // 연구 저장 코드(research.js): 네트워크 우선 + 매번 서버에 최신 여부 확인, 오프라인일 때만 캐시 (캐시 우선이면 옛 코드가 새 화면과 섞임).
  if(/\/research\.js$/.test(u.pathname)){
    e.respondWith(fetch(req,{cache:"no-cache"}).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(req,c)).catch(()=>{});return r;}).catch(()=>own(req)));
    return;
  }
  // 연구 설정(research-config.js)은 비상 차단 스위치(enabled:false)라 캐시를 절대 대신 쓰지 않는다 — 서버에서 못 받거나 오류 응답이면 꺼진 설정을 돌려줘 옛 enabled:true 로 업로드가 나가지 않게 한다.
  if(/\/research-config\.js$/.test(u.pathname)){
    const off=()=>new Response('window.NA_RESEARCH_CONFIG={enabled:false,clientId:"",consentVersion:"",consentText:"",irb:""};',{status:200,headers:{"Content-Type":"text/javascript; charset=utf-8","Cache-Control":"no-store"}});
    e.respondWith(fetch(req,{cache:"no-store"}).then(r=>r&&r.ok?r:off()).catch(off));
    return;
  }
  e.respondWith(own(req).then(h=>h||fetch(req).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(req,c)).catch(()=>{});return r;})));
});
