import { createStore } from "../server/store.mjs";
import { createRefreshWorker } from "../server/refresh-worker.mjs";
const store = createStore();
try {
  const worker = createRefreshWorker(store, { skipInitial: true });
  console.table(await worker.run());
  console.log("Next automatic refresh:", worker.status().nextRunAt);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  store.db.close();
}
