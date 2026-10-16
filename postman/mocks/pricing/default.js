// Local-only simulation of public HTML pricing dependencies, based on the saved
// official fixtures. No provider workspace is connected; no mock is published.
const http = require("http");
const fs = require("fs");
const path = require("path");
const pages = new Map([
  ["https://liara.ir/pricing/", "liara.html"],
  ["https://saba.host/hosts/wordpress-hosting", "saba-host.html"],
  ["https://webramz.com/server/vps/iran", "webramz-vps.html"],
]);
http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://simulation.local");
    const respond = (status, body) => {
      res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
      res.end(body);
    };
    if (req.method !== "GET" || url.pathname !== "/pricing")
      return respond(501, "Unmodeled request");
    const source = url.searchParams.get("url");
    if (source === "https://www.iranserver.com/vps/iran/")
      return respond(200, "<main>Pricing table temporarily unavailable</main>");
    const file = pages.get(source);
    if (!file)
      return respond(503, "<main>Upstream temporarily unavailable</main>");
    respond(
      200,
      fs.readFileSync(path.join(process.env.ABRGOZIN_PRICING_FIXTURES, file)),
    );
  })
  .listen(process.env.PORT);
