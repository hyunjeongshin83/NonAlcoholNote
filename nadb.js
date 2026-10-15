/* 알코올 줄이기 — 기기 안의 SQLite 데이터베이스(.db)
   · 기록의 원본은 앱이 이미 쓰는 저장소(localStorage)이고, 이 모듈은 그 기록으로 SQLite 데이터베이스를 만들어 줍니다(안드로이드 앱의 .db 처럼 표·목록 필드 구조).
   · 읽기: SQL SELECT 로 읽어 HTML 에 넣습니다. 쓰기: .db 파일 내보내기 / 가져오기(합치기).
   · 서버로 보내지 않습니다. 라이브러리(sql.js)는 vendor/ 에서 필요할 때만 불러옵니다. */
(function(){
  "use strict";
  var DDL = [
    "CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT)",
    "CREATE TABLE logs (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, kind TEXT NOT NULL, cups INTEGER NOT NULL DEFAULT 0, bev TEXT, cr INTEGER, lv TEXT, mood TEXT)",
    /* 목록 필드(상황 trig · 대처 cope)는 한 줄씩 자식 표에 — 안드로이드 Room 의 1:N 관계와 같은 모양 */
    "CREATE TABLE log_items (log_id INTEGER NOT NULL, field TEXT NOT NULL, pos INTEGER NOT NULL, value TEXT NOT NULL, PRIMARY KEY (log_id, field, pos))",
    "CREATE VIEW logs_flat AS SELECT l.id, l.t, datetime(l.t/1000, 'unixepoch', 'localtime') AS at, l.kind, l.cups, l.bev, l.cr, l.lv, l.mood, " +
      "(SELECT group_concat(value, ' / ') FROM log_items WHERE log_id = l.id AND field = 'trig') AS trig, " +
      "(SELECT group_concat(value, ' / ') FROM log_items WHERE log_id = l.id AND field = 'cope') AS cope FROM logs l"
  ];
  var MAX_BYTES = 20 * 1024 * 1024, MAX_LOGS = 5000;
  var libP = null, db = null, dirty = true, building = null, version = 0;

  function lib(){
    if(libP) return libP;
    // 스크립트는 한 번만 싣고, 초기화(.wasm 내려받기)가 실패하면 다음에 다시 시도할 수 있게 캐시를 비운다 (PR #8 Codex P2)
    var script = window.initSqlJs ? Promise.resolve() : new Promise(function(res, rej){
      var s = document.createElement("script"); s.src = "vendor/sql-wasm.js";
      s.onload = res; s.onerror = function(){ s.remove(); rej(new Error("lib")); };
      document.head.appendChild(s);
    });
    libP = script.then(function(){ return window.initSqlJs({ locateFile: function(f){ return "vendor/" + f; } }); });
    libP.catch(function(){ libP = null; });
    return libP;
  }
  function isSelect(sql){ return /^\s*select\b/i.test(sql) && !/;\s*\S/.test(sql); }
  function build(logs){
    return lib().then(function(SQL){
      var d = new SQL.Database();
      DDL.forEach(function(q){ d.run(q); });
      d.run("BEGIN");
      var ins = d.prepare("INSERT INTO logs (t, kind, cups, bev, cr, lv, mood) VALUES (?,?,?,?,?,?,?)"), it = d.prepare("INSERT INTO log_items (log_id, field, pos, value) VALUES (?,?,?,?)");
      (logs || []).forEach(function(l){
        ins.run([l.t, l.kind, l.cups || 0, l.bev || null, typeof l.cr === "number" ? l.cr : null, l.lv || null, l.mood || null]);
        var id = d.exec("SELECT last_insert_rowid()")[0].values[0][0];
        ["trig", "cope"].forEach(function(f){ (Array.isArray(l[f]) ? l[f] : []).forEach(function(v, i){ it.run([id, f, i, String(v)]); }); });
      });
      ins.free(); it.free();
      d.run("INSERT INTO meta (k, v) VALUES ('app', 'nonalcohol'), ('schema', '1'), ('built', '" + new Date().toISOString() + "')");
      d.run("COMMIT"); d.run("PRAGMA user_version = 1");
      return d;
    });
  }
  var NADB = {
    source: function(){ return []; },       // 앱이 기록 목록을 돌려주는 함수로 바꿔 둔다
    invalidate: function(){ dirty = true; version++; },
    open: function(){
      if(db && !dirty) return Promise.resolve(db);
      if(building) return building;
      var v = version;   // 만드는 동안 기록이 바뀌면(가져오기 등) 낡은 것을 깨끗한 것으로 내놓지 않고 다시 만든다 (PR #8 Sourcery)
      building = build(NADB.source()).then(function(d){
        building = null; if(db) try{ db.close(); }catch(e){} db = d; dirty = (v !== version);
        return dirty ? NADB.open() : d;
      }, function(e){ building = null; throw e; });
      return building;
    },
    /* SELECT 만 — 표로 읽는다. 결과: {columns, values} 또는 null */
    query: function(sql){
      if(!isSelect(sql)) return Promise.reject(new Error("select only"));
      return NADB.open().then(function(d){ var r = d.exec(sql); return r.length ? r[0] : null; });
    },
    /* .db 파일 바이트 */
    exportBytes: function(){ return NADB.open().then(function(d){ return d.export(); }); },
    /* 가져온 .db 파일에서 기록만 읽어 낸다 — 믿지 않고 SELECT 로 정해진 칸만. 값 검증은 부르는 쪽(cleanLog)이 한다 */
    readFile: function(bytes){
      if(!bytes || bytes.length > MAX_BYTES) return Promise.reject(new Error("size"));
      return lib().then(function(SQL){
        var d = new SQL.Database(bytes);
        try{
          // 표 이름이 뷰(무한 재귀 등)로 바뀐 파일은 읽지 않는다 — logs·log_items·meta 는 일반 표여야 한다
          var ty = d.exec("SELECT name, type FROM sqlite_master WHERE name IN ('meta','logs','log_items')"), ok = {};
          if(ty.length) ty[0].values.forEach(function(v){ ok[v[0]] = v[1]; });
          if(ok.meta !== "table" || ok.logs !== "table" || ok.log_items !== "table") throw new Error("schema");
          var m = d.exec("SELECT v FROM meta WHERE k = 'app'");
          if(!m.length || m[0].values[0][0] !== "nonalcohol") throw new Error("not ours");
          var cnt = d.exec("SELECT COUNT(*) FROM logs")[0].values[0][0];
          if(cnt > MAX_LOGS) throw new Error("too many");   // 조용히 자르지 않고 알린다 (PR #8 Sourcery)
          var r = d.exec("SELECT id, t, kind, cups, bev, cr, lv, mood FROM logs ORDER BY t DESC LIMIT " + MAX_LOGS), rows = {}, out = [];
          if(r.length) r[0].values.forEach(function(v){ var o = { t: v[1], kind: v[2], cups: v[3], bev: v[4], cr: v[5], lv: v[6], mood: v[7], trig: [], cope: [] }; rows[v[0]] = o; out.push(o); });
          var it = d.exec("SELECT log_id, field, value FROM log_items WHERE field IN ('trig','cope') ORDER BY log_id, pos LIMIT 200000");
          if(it.length) it[0].values.forEach(function(v){ var o = rows[v[0]]; if(o && o[v[1]].length < 20) o[v[1]].push(v[2]); });
          return out;
        } finally { d.close(); }
      });
    },
    /* 표(<table>)로 보여 준다 — 글자만 넣는다(HTML 로 해석하지 않음) */
    table: function(el, sql){
      return NADB.query(sql).then(function(r){
        el.textContent = "";
        if(!r){ el.textContent = "기록이 없어요"; return; }
        var t = document.createElement("table"), h = t.createTHead().insertRow();
        r.columns.forEach(function(c){ var th = document.createElement("th"); th.scope = "col"; th.textContent = c; h.appendChild(th); });
        var b = t.createTBody();
        r.values.forEach(function(row){ var tr = b.insertRow(); row.forEach(function(v){ tr.insertCell().textContent = v == null ? "" : String(v); }); });
        el.appendChild(t);
      });
    },
    /* <b data-db="SELECT COUNT(*) || '건' FROM logs"> 처럼 쓴 요소에 첫 칸 값을 넣는다 (목록: <ul data-db-list="SELECT ..."> 는 줄마다 <li>) */
    bind: function(root){
      var jobs = [];
      Array.prototype.forEach.call((root || document).querySelectorAll("[data-db]"), function(el){
        jobs.push(NADB.query(el.getAttribute("data-db")).then(function(r){ el.textContent = r && r.values.length && r.values[0][0] != null ? String(r.values[0][0]) : "—"; }, function(){ el.textContent = "—"; }));
      });
      Array.prototype.forEach.call((root || document).querySelectorAll("[data-db-list]"), function(el){
        jobs.push(NADB.query(el.getAttribute("data-db-list")).then(function(r){ el.textContent = ""; (r ? r.values : []).forEach(function(v){ var li = document.createElement("li"); li.textContent = v[0] == null ? "" : String(v[0]); el.appendChild(li); }); }, function(){ el.textContent = ""; }));
      });
      return Promise.all(jobs);
    }
  };
  window.NADB = NADB;
})();
