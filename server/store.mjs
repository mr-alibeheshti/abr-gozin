import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import baseline from "./baseline.json" with { type: "json" };
export function createStore(path = process.env.DATA_DIR || resolve("data")) {
  mkdirSync(path, { recursive: true });
  const db = new DatabaseSync(resolve(path, "abrgozin.sqlite"));
  db.exec(
    `PRAGMA journal_mode=WAL;CREATE TABLE IF NOT EXISTS offers(id TEXT PRIMARY KEY,sourceId TEXT,record TEXT NOT NULL);CREATE TABLE IF NOT EXISTS source_status(id TEXT PRIMARY KEY,record TEXT NOT NULL);CREATE TABLE IF NOT EXISTS choices(session TEXT PRIMARY KEY,record TEXT NOT NULL);CREATE TABLE IF NOT EXISTS price_history(id INTEGER PRIMARY KEY,offerId TEXT,oldPrice REAL,newPrice REAL,createdAt TEXT);`,
  );
  const insert = db.prepare(
    "INSERT INTO offers(id,sourceId,record) VALUES(?,?,?)",
  );
  if (!db.prepare("SELECT id FROM offers LIMIT 1").get())
    for (const o of baseline)
      insert.run(o.id, o.sourceId, JSON.stringify({ ...o, mode: "snapshot" }));
  // Only add new sources; a previously refreshed source may legitimately be empty.
  const hasStatus = db.prepare("SELECT id FROM source_status WHERE id=?");
  const hasOffers = db.prepare(
    "SELECT id FROM offers WHERE sourceId=? LIMIT 1",
  );
  db.exec("BEGIN");
  try {
    for (const id of new Set(baseline.map((o) => o.sourceId))) {
      if (!hasStatus.get(id) && !hasOffers.get(id)) {
        for (const o of baseline.filter((o) => o.sourceId === id))
          insert.run(o.id, id, JSON.stringify({ ...o, mode: "snapshot" }));
      }
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  const seedStatus = db.prepare(
    "INSERT OR IGNORE INTO source_status(id,record) VALUES(?,?)",
  );
  for (const id of new Set(baseline.map((o) => o.sourceId))) {
    const list = baseline.filter((o) => o.sourceId === id);
    seedStatus.run(
      id,
      JSON.stringify({
        id,
        state: "snapshot",
        checkedAt: null,
        verifiedAt: list[0].verifiedAt,
        count: list.length,
        error: null,
      }),
    );
  }
  return {
    db,
    offers: () =>
      db
        .prepare("SELECT record FROM offers")
        .all()
        .map((x) => JSON.parse(x.record)),
    offer: (id) => {
      let x = db.prepare("SELECT record FROM offers WHERE id=?").get(id);
      return x ? JSON.parse(x.record) : null;
    },
    status: () =>
      db
        .prepare("SELECT record FROM source_status")
        .all()
        .map((x) => JSON.parse(x.record)),
    setStatus: (x) =>
      db
        .prepare(
          "INSERT INTO source_status(id,record) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record",
        )
        .run(x.id, JSON.stringify(x)),
    replace(sourceId, offers) {
      db.exec("BEGIN");
      try {
        const old = new Map(
          db
            .prepare("SELECT id,record FROM offers WHERE sourceId=?")
            .all(sourceId)
            .map((x) => [x.id, JSON.parse(x.record)]),
        );
        db.prepare("DELETE FROM offers WHERE sourceId=?").run(sourceId);
        for (const o of offers) {
          insert.run(o.id, sourceId, JSON.stringify(o));
          const prev = old.get(o.id);
          if (prev && prev.price !== o.price)
            db.prepare(
              "INSERT INTO price_history(offerId,oldPrice,newPrice,createdAt) VALUES(?,?,?,?)",
            ).run(o.id, prev.price, o.price, new Date().toISOString());
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    choices: (session) => {
      const x = db
        .prepare("SELECT record FROM choices WHERE session=?")
        .get(session);
      return x ? JSON.parse(x.record) : { saved: [], compared: [] };
    },
    setChoices: (session, x) =>
      db
        .prepare(
          "INSERT INTO choices(session,record) VALUES(?,?) ON CONFLICT(session) DO UPDATE SET record=excluded.record",
        )
        .run(session, JSON.stringify(x)),
    history: (id) =>
      db
        .prepare(
          "SELECT * FROM price_history WHERE offerId=? ORDER BY id DESC LIMIT 12",
        )
        .all(id),
  };
}
