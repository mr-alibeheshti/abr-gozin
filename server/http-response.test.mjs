import test from "node:test";
import assert from "node:assert/strict";
import { readApiResponse } from "../shared/http-response.ts";

test("CDN HTML timeout pages produce a Persian retry message instead of a JSON parser error", async () => {
  const response = new Response("<!DOCTYPE html><h1>Gateway timeout</h1>", {
    status: 504,
    headers: { "Content-Type": "text/html" },
  });
  await assert.rejects(readApiResponse(response), {
    message: "پاسخ سرور طول کشید؛ دوباره تلاش کن.",
  });
});

test("Malformed or non-JSON responses never expose response markup or parser details", async () => {
  for (const [status, body, contentType] of [
    [502, "<html>Bad gateway</html>", "text/html"],
    [200, "<!DOCTYPE html>", "text/html"],
    [200, "broken JSON", "application/json"],
  ]) {
    await assert.rejects(
      readApiResponse(
        new Response(body, {
          status,
          headers: { "Content-Type": contentType },
        }),
      ),
      (error) =>
        !/JSON|Unexpected|DOCTYPE|<html>/.test(error.message) &&
        /[آ-ی]/.test(error.message),
    );
  }
});

test("Valid API data and explicit server errors retain their existing meaning", async () => {
  assert.deepEqual(await readApiResponse(Response.json({ reply: "سلام" })), {
    reply: "سلام",
  });
  await assert.rejects(
    readApiResponse(
      Response.json({ error: "سهمیهٔ سرویس تمام شده است." }, { status: 429 }),
    ),
    { message: "سهمیهٔ سرویس تمام شده است." },
  );
});
