# Abrgozin — Hosting and Server Comparison

**Describe your workload, compare suitable infrastructure, and understand the estimated monthly cost.**

[Live application](https://abrgozin.ir/) · [API contract](docs/api.md) · [Workload sizing](docs/workload-sizing.md) · [Deployment](deploy/README.md)

Built by [Ali Beheshti](https://abeheshti.ir/). The application has a Persian, right-to-left interface with locally hosted Peyda fonts.

## Why I built it

Whenever I needed hosting or a server for myself or a client, much of the work was comparison: open tabs, pricing tables, CPU, RAM, storage, traffic, location, and the cost of an IP address. Hourly prices, monthly prices, and longer billing periods made the actual monthly cost harder to compare.

I built Abrgozin to turn that repeated process into one flow: describe the workload, narrow the options, compare resources and costs, and visit the provider to make the final purchase.

For example, a user can search in Persian:

> برای اجرای داکر، سرور ایران با ۴ گیگ رم زیر ۲ میلیون می‌خوام

“I need a server in Iran to run Docker, with at least 4 GB RAM, for under 2 million toman per month.”

## Product walkthrough

1. **Describe the need.** Natural-language search extracts service type, workload, resources, location, provider, and budget where available.
2. **Refine the shortlist.** Choose minimum CPU, RAM, and disk; location; one or more providers; budget; traffic; and IPv4. Explicit manual selections take precedence over query-derived values.
3. **Inspect comparable configurations.** Offers are grouped by service type, country, and nominal CPU/RAM/disk capacity. Minimum-resource matches rank by proximity to the requirement, with price breaking ties. Without resource constraints, price is the primary order.
4. **Understand the estimate.** Offer details show the official source, verification date, billing period, known traffic/IP costs, and warnings about unspecified charges. Changing traffic or IPv4 recalculates the estimate.
5. **Compare and keep options.** Save configurations, compare up to three side by side, download a comparison CSV, or copy a search link. Browser choices persist in SQLite and are associated with the same browser's session cookie.
6. **Ask the assistant.** Gemini gathers project needs and budget before suggesting catalog offers. Applying its filters requires an explicit button click.
7. **Continue with the provider.** Official provider pages handle availability, final terms, and purchase.

## Architecture and AI

| Layer        | Implementation                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Interface    | React 19, TypeScript, Vite, Persian RTL layout, local fonts and provider logos                       |
| Server       | Express 5 on Node.js 24+                                                                             |
| Persistence  | Node's built-in SQLite: catalog, sources, choices, price history, and refresh schedule               |
| Extraction   | Cheerio and provider-specific parsers for official HTML and public price feeds                       |
| Local search | Quantized multilingual MiniLM through Hugging Face Transformers, plus explicit Persian query parsing |
| Assistant    | Server-side Gemini; optional Cloudflare AI Gateway or HTTP CONNECT proxy                             |
| Validation   | Zod schemas, server-calculated prices, and catalog-backed recommendation IDs                         |

The local semantic model classifies service intent. It does **not** generate prices or replace resource and budget constraints. Parsing supports Persian and Arabic numerals and formatted or decimal toman budgets. If the model is loading or unavailable, specification and keyword search remain available and the actual model status is exposed. Local search does not require a Gemini key.

Gemini interprets the conversation and structured needs. The server validates its filters, searches the catalog, enforces workload/resource requirements, and calculates prices and links itself. Suggestions are gated until consultation is complete; a language model cannot invent offer IDs or bypass sizing requirements.

## Run locally

Requires **Node.js 24 or later** and npm.

```sh
npm ci
npm run build
npm start
```

Open **http://localhost:4321**. For development, use `npm run dev` instead. On macOS, `start.command` also starts the built application or opens an existing instance on port 4321.

The dated initial catalog is included in `server/baseline.json`, so a fresh installation can display recorded offers before a successful network refresh. First startup downloads approximately 140 MB of local model files into `data/models`; search remains usable while they load.

### Configuration

Copy `.env.example` to `.env` when configuration is needed. `npm start` and `npm run dev` load it if present. Keep credentials out of Git.

| Variable                                     | Purpose / default                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `PORT`                                       | HTTP port; `4321`                                                                       |
| `HOST`                                       | Bind address; see `server/runtime.mjs` for runtime defaults                             |
| `DATA_DIR`                                   | SQLite directory; `data`                                                                |
| `MODEL_CACHE_DIR`                            | Local model cache; `data/models`                                                        |
| `PUBLIC_URL`                                 | Public HTTPS URL and allowed origin; `https://abrgozin.ir` for the live root deployment |
| `APP_BASE_PATH`                              | Optional mount path; empty at the domain root. Use the same value at build and runtime. |
| `REFRESH_WORKER_ENABLED=0`                   | Disable automatic refresh without removing its stored schedule                          |
| `NO_REFRESH=1`                               | Defer the initial crawl only for a new schedule; existing overdue runs still catch up   |
| `GEMINI_API_KEY`                             | Server-side Google AI Studio key; required only for chat                                |
| `GEMINI_MODEL`                               | Defaults to `gemini-3.5-flash-lite`                                                     |
| `GEMINI_GATEWAY_URL`, `GEMINI_GATEWAY_TOKEN` | Optional paired Cloudflare AI Gateway settings                                          |
| `GEMINI_PROXY_URL`                           | Optional server-side HTTP CONNECT proxy for direct Gemini requests                      |

### Enable the assistant

1. Create a key in [Google AI Studio](https://aistudio.google.com/apikey) and set `GEMINI_API_KEY` in `.env`.
2. Restart the application. Use an unbilled project if free-tier usage is required; account, region, model, and quota eligibility vary. Check [Google's pricing](https://ai.google.dev/gemini-api/docs/pricing).
3. Optionally configure [Cloudflare AI Gateway](docs/cloudflare-gateway.md). Gateway mode requires both gateway variables and bypasses the local proxy setting.
4. Send a real message to verify end-to-end access. `/api/chat/status` returning `configured: true` confirms settings, not upstream availability or quota.

Chat sends the conversation, structured needs, search filters, and a shortlist of public catalog rows to Gemini. Credentials and saved browser choices are excluded. Conversation history stays in page memory and is cleared by a reload. Missing configuration, quota exhaustion, authentication failure, invalid responses, and timeouts produce explicit errors. There is no silent model or paid-provider fallback. The [API contract](docs/api.md) documents limits, cancellation, retries, and transport settings.

## Data provenance and pricing

The included catalog covers **205 plans or calculated configurations from 22 independent providers**, based on 23 official pricing pages or public feeds. Twelve entries are calculated ArvanCloud configurations rather than advertised plan names. Counts describe the included catalog and can change after refresh.

| Provider     | Plans / configurations | Official pricing source                                                                                                            |
| ------------ | ---------------------: | ---------------------------------------------------------------------------------------------------------------------------------- |
| ArvanCloud   |                     12 | [Cloud server](https://www.arvancloud.ir/fa/pricing/cloud-server)                                                                  |
| Liara        |                     12 | [Pricing](https://liara.ir/pricing/)                                                                                               |
| IranServer   |                      5 | [Iran VPS](https://www.iranserver.com/vps/iran/)                                                                                   |
| Netafraz     |                     16 | [Economy hosting](https://www.netafraz.com/میزبانی-وب-اقتصادی) · [Standard hosting](https://www.netafraz.com/میزبانی-وب-استاندارد) |
| ParsVDS      |                      9 | [Iran VPS](https://parsvds.com/virtual-server/iran-hiweb/)                                                                         |
| PayamOnline  |                      5 | [Iran VPS](https://my.payamonline.com/store/vpsiran)                                                                               |
| MihanWebHost |                      5 | [Iran VPS](https://mihanwebhost.com/my/iran-vps)                                                                                   |
| Server.ir    |                     24 | [Iran VPS](https://server.ir/vps/iran/)                                                                                            |
| IranHost     |                      6 | [VPS](https://iranhost.com/server/vps/)                                                                                            |
| Mizbanfa     |                     10 | [Shared hosting](https://mizbanfa.net/shared-web-hosting)                                                                          |
| AzarOnline   |                      9 | [Iran VPS](https://azaronline.com/سرور-مجازی-ایران/)                                                                               |
| Bertina      |                      8 | [Iran VPS](https://www.bertina.ir/vps/iran)                                                                                        |
| OnlineServer |                      4 | [Iran VPS](https://onlineserver.ir/virtual-server/iran-virtual-server)                                                             |
| HiData       |                      8 | [Iran NVMe VPS](https://hidata.org/vps/iran-nvme/)                                                                                 |
| AfaghHost    |                      9 | [Linux hosting](https://afagh.info/linux-webhosting/)                                                                              |
| Webdade      |                      8 | [Iran VPS](https://webdade.com/iran-vps-server)                                                                                    |
| TalaHost     |                      8 | [Iran cPanel hosting](https://www.talahost.com/group/هاست-cpanel-ایران.htm)                                                        |
| HostNegar    |                      6 | [Iran hosting](https://hostnegar.com/هاست-ایران)                                                                                   |
| MihanHosting |                      4 | [WordPress hosting](https://mihanhosting.ir/host-wordpress/)                                                                       |
| MehrHost     |                     30 | [Hosting](https://mehrhost.com/)                                                                                                   |
| SabaHost     |                      3 | [WordPress hosting](https://saba.host/hosts/wordpress-hosting)                                                                     |
| Webramz      |                      4 | [Iran VPS](https://webramz.com/server/vps/iran)                                                                                    |

Initial sources were reviewed or extracted on October 9, 2026; SabaHost and Webramz were added on October 16, 2026. Live refreshes have their own verification timestamps. Failed extraction preserves prior confirmed prices and dates, with a visible source error. A recent export timestamp does not establish that every tariff is fresh.

### Reading an estimate

- Amounts are in **toman**. Hourly and longer-period tariffs are normalized to monthly estimates. A monthly equivalent may require quarterly, semiannual, or annual payment; the actual billing period is shown.
- Selected traffic, one IPv4 address, and only explicitly documented taxes or charges are included. Unspecified values remain unknown (`null`); warnings identify incomplete estimates.
- Equal nominal resources do not establish equivalent CPU sharing, disk performance, management, network limits, or software compatibility.
- ArvanCloud's 250 GB allowance applies to the whole account; its estimate assumes no prior usage. Traffic direction follows each provider's billing definition.
- Workload floors are Abrgozin's initial shortlisting policies, separate from official software minimums and performance guarantees. Optional data/growth/backups inputs add an explicit 25% disk headroom policy. See [workload sizing](docs/workload-sizing.md).
- Unknown required capacity cannot establish a match. GPU requests have no verified catalog data and yield no matches. The current catalog also has no dedicated-server plans; that selection displays an empty state.

Offer notes retain provider-specific caveats: IranHost publishes rounded million-toman prices; MihanHosting does not distinguish Iran from Europe in its feed; Webdade's PAYG notice conflicts with a table allowance, so that allowance is not credited; sold-out MihanWebHost plans are excluded. SabaHost uses `data-monthly` rather than the default annual discount. Disk MB values use a 1000-based conversion; RAM from MihanWebHost and AzarOnline uses 1024.

Provider logos are local assets with provenance in `public/logos/sources.json`. ArvanCloud's mark comes from a recorded Wikimedia version because direct retrieval was restricted. Missing images fall back to a provider identifier.

Abrgozin does not claim full market coverage, independently measured uptime, service quality, real-time inventory, or a guaranteed checkout price.

## Refreshing and exporting

The worker runs with the Node server and stores its schedule, progress, and lease in SQLite. Each completed attempt schedules the next for **72 hours later**. Restarts preserve the schedule; overdue work catches up after startup. Three fetches run concurrently with time and size limits. A shared lease prevents overlapping automatic, CLI, and manual runs; an interrupted lease is recoverable after two minutes.

```sh
# Refresh official sources with the worker's shared lock and cooldown.
npm run refresh

# Write hosting-data.json, hosting-data.csv, and hosting-sources.md
# to the parent directory of the repository.
npm run export:catalog
```

The API exposes `GET /api/export/json` and `GET /api/export/csv`. JSON includes source metadata, verification dates, extraction evidence, and hashes. The application's comparison table has a separate CSV download.

`GET /api/sources` and `/api/health` expose refresh progress and `job.nextRunAt`. Local `POST /api/refresh` is rate-limited and returns 409 for an overlapping run. It is disabled when `PUBLIC_URL` is configured; public deployments use the server CLI for administrative refreshes. See [docs/api.md](docs/api.md).

## Validation

```sh
npm test
npm run build
```

The suite covers pricing, normalization, resource/budget constraints, Persian numerals, source extraction, atomic updates, session persistence, refresh scheduling, API validation, chat safeguards and failures, and the real local semantic model.

Install the [Postman CLI](https://learning.postman.com/docs/postman-cli/postman-cli-installation/) before running the integration suite. Existing Gemini and pricing simulations use loopback ports **4908, 4909, and 4910**, without a real Gemini key. Extraction tests serve recorded official HTML fixtures over HTTP. Passing simulations establish behavior against those fixtures and simulated responses, not current external-provider availability.

The semantic integration test allows about ten seconds for model readiness. On a fresh machine, let the first application startup finish downloading and initializing the model before running the suite; a cold download can exceed that window. Later runs reuse the cache.

Browser verification should include natural-language search, manual-filter precedence, save/reload, comparison, CSV download, search links, offer details, billing periods, source errors, chat completion, Escape handling, keyboard use, and desktop/mobile layouts. A successful build or health response alone does not verify a live Gemini conversation.

## Deployment and persistence

The public application runs at **https://abrgozin.ir/** with an empty `APP_BASE_PATH` and `PUBLIC_URL=https://abrgozin.ir`. Docker and host-specific instructions are in [deploy/README.md](deploy/README.md).

Keep `DATA_DIR` and `MODEL_CACHE_DIR` on persistent storage. SQLite holds catalog offers, source status, price history, browser selections, and the worker schedule. Do not distribute private session data or `.env` with a demo. New sources seed their own rows while preserving existing history and choices.

Fetches and checkout redirects are restricted to configured official domains. Inputs are validated server-side and state-changing requests enforce allowed origins. Browser choices use a scoped HttpOnly, SameSite cookie, with Secure enabled for public deployments.

The application, chat, and refresh worker run together. Multiple concurrent application instances need an appropriate shared persistence design instead of independent local SQLite files.
