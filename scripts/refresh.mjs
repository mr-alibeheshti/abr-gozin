import { createStore } from "../server/store.mjs";
import { refreshSources } from "../server/ingest.mjs";
const store = createStore();
console.table(await refreshSources(store));
store.db.close();
