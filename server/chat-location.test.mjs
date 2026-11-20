import test from "node:test";
import assert from "node:assert/strict";
import { chatLocation, normalizeContext, formCountry } from "./chat.mjs";

const user = (content) => ({ role: "user", content });
const assistant = (content) => ({ role: "assistant", content });

test("chat accepts every location the UI can send (any, other, country)", () => {
  // `any` comes from «حذف فیلتر موقعیت»; it used to fail with 400.
  assert.equal(normalizeContext({ region: "any" }).region, "all");
  assert.equal(normalizeContext({ region: "other" }).region, "other");
  assert.equal(
    normalizeContext({ country: "TR", region: "all" }).region,
    "all",
  );
  assert.equal(formCountry({ country: "tr" }), "TR");
  assert.equal(formCountry({}), null);
  assert.throws(() => normalizeContext({ country: "XX" }));
});

test("chat location follows the user's words, then the form, then the model", () => {
  // The model cannot label Turkey as Europe.
  assert.deepEqual(
    chatLocation([user("سرور ترکیه برای ربات تلگرام")], null, "eu"),
    {
      country: "TR",
      region: "other",
    },
  );
  // The latest message naming a place wins; later answers keep it.
  assert.deepEqual(
    chatLocation(
      [
        user("سرور آلمان می‌خوام"),
        assistant("بودجه‌ات چقدر است؟"),
        user("دو میلیون"),
      ],
      null,
      "all",
    ),
    { country: "DE", region: "eu" },
  );
  assert.deepEqual(
    chatLocation(
      [user("سرور آلمان"), assistant("باشه"), user("نه، آمریکا بهتره")],
      null,
      "eu",
    ),
    { country: "US", region: "other" },
  );
  // Region words without a country, as in search.
  assert.deepEqual(chatLocation([user("سرور خارج از ایران")], null, "all"), {
    country: null,
    region: "eu",
  });
  // A provider name with «ایران» is not a location; the form's country applies.
  assert.deepEqual(chatLocation([user("ایران سرور خوبه؟")], "FI", "all"), {
    country: "FI",
    region: "eu",
  });
  // Nothing named anywhere: the model's (validated) region stays.
  assert.deepEqual(chatLocation([user("سلام")], null, "ir"), {
    country: null,
    region: "ir",
  });
});
