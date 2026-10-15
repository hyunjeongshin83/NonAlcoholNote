# vendor

- `sql-wasm.js` · `sql-wasm.wasm` — [sql.js](https://github.com/sql-js/sql.js) 1.12.0 (SQLite 를 WebAssembly 로, MIT — `LICENSE-sqljs.txt`). npm 패키지 `sql.js@1.12.0` 의 `dist/` 를 그대로 넣었습니다.
- 앱이 외부 주소에서 받지 않도록 저장소에 직접 둡니다(건강 기록을 다루는 앱이라 외부 스크립트를 쓰지 않음). 올리기 전 `npm view sql.js dist.integrity` 와 비교해 바꾸지 않았는지 확인하세요.
