import React, { useEffect, useRef, useState } from "react";
import {
  Search,
  ArrowUpLeft,
  ArrowLeft,
  Bookmark,
  SlidersHorizontal,
  X,
  Check,
  Plus,
  Cloud,
  Server,
  Globe2,
  Cpu,
  HardDrive,
  MemoryStick,
  Sparkles,
  GitCompareArrows,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Info,
  ChevronDown,
  Download,
  LoaderCircle,
  Database,
  CheckCircle2,
  Clock3,
  Heart,
  MapPin,
  ArrowDown,
  CircleHelp,
  Link2,
  Layers3,
} from "lucide-react";
import "./styles.css";
import { providerLogos } from "./provider-logos";

type Estimate = {
  total: number;
  parts: { label: string; amount: number }[];
  warnings: string[];
  upfront: number;
};
type Offer = {
  id: string;
  providerId: string;
  sourceId: string;
  type: string;
  name: string;
  cpu: number | null;
  ram: number | null;
  disk: number;
  diskType: string;
  price: number;
  region: string;
  period: number;
  billing: string;
  trafficGB: number | null;
  trafficUnlimited?: boolean;
  ipMonthly: number | null;
  vatRate: number | null;
  custom: boolean;
  mode: string;
  verifiedAt: string;
  notes: string[];
  url: string;
  checkoutUrl: string;
  estimate: Estimate;
};
type ResourceField = "ram" | "disk" | "cpu";
type Difference = { field: ResourceField; requested: number; actual: number };
type Group = {
  id: string;
  serviceType: string;
  type: string;
  region: string;
  cpu: number | null;
  ram: number | null;
  disk: number;
  offers: Offer[];
  min: number;
  max: number;
  providerCount: number;
  differences?: Difference[];
};
type Provider = {
  id: string;
  name: string;
  en: string;
  color: string;
  ink: string;
  mark: string;
  description: string;
  url: string;
};
type Source = { id: string; providerId: string; name: string; url: string };
type Status = {
  id: string;
  state: string;
  verifiedAt: string | null;
  checkedAt: string;
  count: number;
  error: string | null;
};
type Model = { state: string; name: string; error: string | null };
type Job = {
  state: string;
  done: number;
  total: number;
  finishedAt: string | null;
};
type SearchResult = {
  groups: Group[];
  similarGroups: Group[];
  similarTotalGroups: number;
  resourceFilters: Partial<Record<ResourceField, number>>;
  totalOffers: number;
  intent: { fields: Record<string, string | number> };
  filters: Record<string, unknown>;
  model: Model;
};
type Choices = { saved: string[]; compared: string[] };
type Filters = {
  type: string;
  workload: string;
  region: string;
  provider: string;
  cpu: string;
  ram: string;
  disk: string;
  maxPrice: string;
  sort: string;
};
type View = "discover" | "saved" | "compare" | "sources";
const fa = (n: number) =>
  new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(n);
const date = (s: string) =>
  new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeZone: "Asia/Tehran",
  }).format(new Date(s));
const datetime = (s: string) =>
  new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tehran",
  }).format(new Date(s));
const region = (s: string) =>
  s === "ir" ? "ایران" : s === "eu" ? "اروپا" : "نامشخص";
const resourceLabels: Record<ResourceField, string> = {
  ram: "حافظهٔ RAM",
  disk: "فضای دیسک",
  cpu: "هستهٔ پردازنده",
};
const differenceText = (d: Difference) =>
  `${d.field === "ram" ? "رم" : d.field === "disk" ? "دیسک" : "پردازنده"}: ${fa(d.actual)} ${d.field === "cpu" ? "هسته" : "GB"} به‌جای ${fa(d.requested)}`;
const title = (g: Group) =>
  g.type === "vps"
    ? `سرور ${fa(g.ram || 0)} گیگابایت`
    : `${g.serviceType === "wordpress" ? "وردپرس" : "هاست"} ${fa(g.disk)} گیگابایت`;
const initial = new URLSearchParams(location.search);
const defaults: Filters = {
  type: "all",
  workload: "all",
  region: "all",
  provider: "",
  cpu: "",
  ram: "",
  disk: "",
  maxPrice: "",
  sort: "price",
};
const workloads = [
  { id: "all", name: "هنوز مشخص نیست / همهٔ کاربردها", type: "all" },
  { id: "docker", name: "داکر و کانتینر", type: "vps" },
  { id: "backend", name: "بک‌اند؛ Node.js یا Django", type: "vps" },
  { id: "python", name: "برنامه یا ربات پایتون", type: "vps" },
  { id: "database", name: "پایگاه دادهٔ مستقل", type: "vps" },
  { id: "wordpress", name: "سایت وردپرسی", type: "hosting" },
  { id: "website", name: "وب‌سایت و میزبانی وب", type: "hosting" },
];
function legacyWorkload(q: string) {
  if (/داکر|docker/i.test(q)) return "docker";
  if (/وردپرس|wordpress/i.test(q)) return "wordpress";
  if (/جنگو|django|node|نود|بک.اند|backend/i.test(q)) return "backend";
  if (/پایتون|python/i.test(q)) return "python";
  return "all";
}
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "ارتباط با سرور برقرار نشد");
  return data;
}
function Logo() {
  return (
    <span className="brand-symbol" aria-hidden="true">
      <Cloud size={26} strokeWidth={2.1} />
      <span />
    </span>
  );
}
function Mark({
  provider,
  small = false,
}: {
  provider?: Provider;
  small?: boolean;
}) {
  return (
    <span
      className={`provider-mark ${small ? "small" : ""}`}
      style={{ background: provider?.color, color: provider?.ink }}
      aria-hidden="true"
    >
      {provider?.mark}
    </span>
  );
}
function ProviderLogo({
  provider,
  small = false,
}: {
  provider?: Provider;
  small?: boolean;
}) {
  const logo = providerLogos[provider?.id || ""];
  const src = small ? logo?.compactSrc || logo?.src : logo?.src;
  const [failed, setFailed] = useState("");
  if (!logo || failed === src)
    return <Mark provider={provider} small={small} />;
  const dark = logo.dark && !(small && logo.compactSrc);
  return (
    <span
      className={`provider-logo${dark ? " dark" : ""}${small ? " small" : ""}`}
      aria-hidden={small ? undefined : true}
      title={small ? provider?.name : undefined}
    >
      <img
        src={src}
        width={small ? 22 : 64}
        height={small ? 22 : 36}
        alt={small ? provider?.name || "" : ""}
        loading={small ? "lazy" : undefined}
        decoding="async"
        onError={() => setFailed(src || "")}
      />
    </span>
  );
}
function Modal({
  children,
  onClose,
  label,
  wide = false,
}: {
  children: React.ReactNode;
  onClose: () => void;
  label: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    el?.showModal();
    return () => {
      el?.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      aria-label={label}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-content">
        <button
          className="icon-button modal-close"
          aria-label="بستن"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        {children}
      </div>
    </dialog>
  );
}
function ServerArt() {
  return (
    <div className="server-art" aria-hidden="true">
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <span className="art-star star-one">✦</span>
      <span className="art-star star-two">✦</span>
      <div className="art-cloud">
        <Cloud size={62} strokeWidth={1.3} />
      </div>
      <div className="rack-platform" />
      <div className="rack-stack">
        {[1, 2, 3].map((i) => (
          <div className={`rack rack-${i}`} key={i}>
            <div className="rack-vents">
              {[1, 2, 3, 4, 5, 6].map((j) => (
                <i key={j} />
              ))}
            </div>
            <div className="rack-lights">
              <i />
              <i />
              <i />
            </div>
          </div>
        ))}
      </div>
      <div className="art-label">
        <span className="tiny-dot" /> منابع یکسان، انتخاب بهتر{" "}
        <Check size={14} />
      </div>
      <div className="art-spec">
        <Cpu size={17} />
        <span dir="ltr">CPU + RAM + SSD</span>
      </div>
    </div>
  );
}
export default function App() {
  const [view, setView] = useState<View>("discover");
  const [filters, setFilters] = useState<Filters>(
    () =>
      Object.fromEntries(
        Object.entries(defaults).map(([k, v]) => [k, initial.get(k) || v]),
      ) as Filters,
  );
  const [traffic, setTraffic] = useState(initial.get("traffic") || "200");
  const [ip, setIp] = useState(initial.get("ip") !== "false");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [model, setModel] = useState<Model>({
    state: "loading",
    name: "multilingual-MiniLM",
    error: null,
  });
  const [choices, setChoices] = useState<Choices>({ saved: [], compared: [] });
  const [busyChoice, setBusyChoice] = useState(false);
  const [ready, setReady] = useState(false);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [about, setAbout] = useState(false);
  const [revision, setRevision] = useState(0);
  const [job, setJob] = useState<Job>({
    state: "idle",
    done: 0,
    total: 0,
    finishedAt: null,
  });
  const [refreshError, setRefreshError] = useState("");
  const jobState = useRef("idle");
  const toastTimer = useRef<number | undefined>(undefined);
  const resultsRef = useRef<HTMLDivElement>(null);
  const migrated = useRef(false);
  const provider = (id: string) => providers.find((p) => p.id === id);
  function say(message: string) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 4000);
  }
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const choice = await api<Choices>("/api/choices");
        const data = await api<{
          providers: Provider[];
          sources: Source[];
          status: Status[];
          model: Model;
        }>("/api/catalog");
        // Keep previously shared text searches usable in the structured form.
        const legacy =
          !migrated.current && initial.get("q")
            ? await api<SearchResult>("/api/search?" + initial.toString())
            : null;
        if (active) {
          if (legacy) {
            setFilters((f) => ({
              ...f,
              ...Object.fromEntries(
                Object.keys(defaults)
                  .filter((k) => legacy.filters[k] !== undefined)
                  .map((k) => [k, String(legacy.filters[k])]),
              ),
              workload:
                initial.get("workload") ||
                legacyWorkload(initial.get("q") || ""),
            }));
          }
          migrated.current = true;
          setChoices(choice);
          setProviders(data.providers);
          setSources(data.sources);
          setStatuses(data.status);
          setModel(data.model);
          setReady(true);
        }
      } catch (e) {
        if (active) {
          setError((e as Error).message);
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [revision]);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const p = new URLSearchParams({ traffic, ip: String(ip) });
    if (view === "saved") p.set("saved", "true");
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
    if (view === "saved") p.set("type", "all");
    const url = new URL(location.href);
    url.search = p.toString();
    history.replaceState(null, "", url);
    setLoading(true);
    setError("");
    Promise.all([
      api<SearchResult>("/api/search?" + p, { signal: controller.signal }),
      api<SearchResult>(
        "/api/search?type=all&traffic=" + traffic + "&ip=" + ip,
        { signal: controller.signal },
      ),
    ])
      .then(([data, all]) => {
        setResults(data);
        setAllGroups(all.groups);
        setModel(data.model);
        setLoading(false);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [ready, filters, traffic, ip, view, choices.saved.join(","), revision]);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    const poll = async () => {
      try {
        const data = await api<{
          sources: Source[];
          status: Status[];
          job: Job;
        }>("/api/sources");
        if (active) {
          if (jobState.current === "running" && data.job.state !== "running")
            setRevision((r) => r + 1);
          jobState.current = data.job.state;
          setJob(data.job);
          setStatuses(data.status);
        }
      } catch {}
    };
    poll();
    const id = window.setInterval(poll, 4000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [ready]);
  const current =
    (view === "discover" || view === "saved"
      ? [...(results?.groups || []), ...(results?.similarGroups || [])].find(
          (g) => g.id === selected,
        )
      : undefined) || allGroups.find((g) => g.id === selected);
  const compared = choices.compared
    .map((id) => allGroups.find((g) => g.id === id))
    .filter(Boolean) as Group[];
  function update(k: keyof Filters, v: string) {
    setFilters((f) => {
      if (k === "workload") {
        const selectedWorkload = workloads.find((w) => w.id === v);
        return {
          ...f,
          workload: v,
          ...(selectedWorkload?.type !== "all" && selectedWorkload
            ? { type: selectedWorkload.type }
            : {}),
        };
      }
      if (k === "type") {
        const workloadType = workloads.find((w) => w.id === f.workload)?.type;
        return {
          ...f,
          type: v,
          workload:
            v !== "all" && workloadType !== "all" && workloadType !== v
              ? "all"
              : f.workload,
        };
      }
      return { ...f, [k]: v };
    });
  }
  function go(next: View) {
    window.scrollTo({ top: 0, behavior: "instant" });
    setView(next);
    setSelected(null);
    if (next !== "discover") {
      setFilters({ ...defaults, type: "all" });
    }
  }
  async function changeChoices(next: Choices) {
    setBusyChoice(true);
    try {
      const data = await api<Choices>("/api/choices", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      setChoices(data);
      return true;
    } catch (e) {
      say((e as Error).message);
      return false;
    } finally {
      setBusyChoice(false);
    }
  }
  async function toggleSaved(id: string) {
    const had = choices.saved.includes(id);
    if (
      await changeChoices({
        ...choices,
        saved: had
          ? choices.saved.filter((x) => x !== id)
          : [...choices.saved, id],
      })
    )
      say(had ? "از ذخیره‌ها حذف شد" : "در ذخیره‌های تو ثبت شد");
  }
  function toggleCompare(id: string) {
    const had = choices.compared.includes(id);
    if (!had && choices.compared.length === 3) {
      say("حداکثر سه پیکربندی را هم‌زمان مقایسه کن");
      return;
    }
    changeChoices({
      ...choices,
      compared: had
        ? choices.compared.filter((x) => x !== id)
        : [...choices.compared, id],
    });
  }
  function reset() {
    setFilters(defaults);
    setTraffic("200");
    setIp(true);
  }
  async function refresh() {
    setRefreshError("");
    try {
      const data = await api<Job>("/api/refresh", { method: "POST" });
      jobState.current = data.state;
      setJob(data);
    } catch (e) {
      setRefreshError((e as Error).message);
    }
  }
  async function share() {
    try {
      await navigator.clipboard.writeText(location.href);
      say("لینک این جست‌وجو کپی شد");
    } catch {
      say("کپی انجام نشد؛ لینک را از نوار آدرس کپی کن");
    }
  }
  function exportCsv() {
    const rows = [
      [
        "پیکربندی",
        "ارائه‌دهنده",
        "پلن",
        "هسته",
        "رم GB",
        "دیسک GB",
        "موقعیت",
        "برآورد ماهانه تومان",
        "قیمت پایه تومان",
        "زمان بررسی",
        "منبع",
      ],
      ...compared.flatMap((g) =>
        g.offers.map((o) => [
          title(g),
          provider(o.providerId)?.name,
          o.name,
          o.cpu ?? "نامشخص",
          o.ram ?? "نامشخص",
          o.disk,
          region(o.region),
          o.estimate.total,
          o.price,
          o.verifiedAt,
          o.url,
        ]),
      ),
    ];
    const blob = new Blob(
      [
        "\ufeff" +
          rows
            .map((r) =>
              r
                .map((v) => '"' + String(v).replaceAll('"', '""') + '"')
                .join(","),
            )
            .join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "abrgozin-comparison.csv";
    a.click();
    URL.revokeObjectURL(url);
    say("فایل مقایسه دانلود شد");
  }
  function groupCard(g: Group) {
    return (
      <article
        className={`plan-card${g.differences?.length ? " similar-card" : ""}`}
        key={g.id}
      >
        <div className="card-top">
          <span
            className={`type-pill ${g.type === "hosting" ? "hosting" : ""}`}
          >
            {g.type === "vps" ? <Server size={13} /> : <Globe2 size={13} />}{" "}
            {g.type === "vps"
              ? "سرور مجازی"
              : g.serviceType === "wordpress"
                ? "وردپرس مدیریت‌شده"
                : "هاست اشتراکی"}
          </span>
          <button
            className={`icon-button save-button ${choices.saved.includes(g.id) ? "saved" : ""}`}
            aria-label={`${choices.saved.includes(g.id) ? "حذف از ذخیره‌ها" : "ذخیره"} ${title(g)}`}
            aria-pressed={choices.saved.includes(g.id)}
            onClick={() => toggleSaved(g.id)}
            disabled={busyChoice}
          >
            <Bookmark
              size={18}
              fill={choices.saved.includes(g.id) ? "currentColor" : "none"}
            />
          </button>
        </div>
        <div className="plan-title-row">
          <span className="mini-rack">
            <Server size={25} strokeWidth={1.5} />
          </span>
          <div>
            <button className="card-title" onClick={() => setSelected(g.id)}>
              {title(g)}
            </button>
            <span className="location">
              <MapPin size={12} /> {region(g.region)} <i />{" "}
              {g.type === "vps" ? "منابع قابل مقایسه" : "میزبانی وب"}
            </span>
          </div>
        </div>
        <div className="resources">
          <span>
            <Cpu size={15} />
            <strong>{g.cpu ? fa(g.cpu) : "اشتراکی"}</strong>
            <small>{g.cpu ? "هسته" : "CPU"}</small>
          </span>
          <span>
            <MemoryStick size={15} />
            <strong>{g.ram ? fa(g.ram) : "نامشخص"}</strong>
            <small>{g.ram ? "GB رم" : "RAM"}</small>
          </span>
          <span>
            <HardDrive size={15} />
            <strong>{fa(g.disk)}</strong>
            <small>GB فضا</small>
          </span>
        </div>
        {!!g.differences?.length && (
          <div className="match-note">
            <strong>
              <Layers3 size={12} /> پیشنهاد نزدیک
            </strong>
            {g.differences.map((d) => (
              <span key={d.field}>{differenceText(d)}</span>
            ))}
          </div>
        )}
        <div className="seller-summary">
          <div className="avatar-stack">
            {[...new Set(g.offers.map((o) => o.providerId))].map((id) => (
              <ProviderLogo key={id} provider={provider(id)} small />
            ))}
          </div>
          <span>
            {fa(g.providerCount)} ارائه‌دهنده{" "}
            {g.providerCount > 1 && (
              <span className="compare-label">قابل مقایسه</span>
            )}
          </span>
        </div>
        <div className="card-freshness">
          <Clock3 size={11} />
          <span>
            تأیید تعرفه: {date(g.offers.map((o) => o.verifiedAt).sort()[0])}
          </span>
          {g.offers.some((o) => o.mode === "snapshot") && (
            <span
              title="تعرفهٔ ثبت‌شده از صفحهٔ رسمی؛ وضعیت دریافت تازه را در بخش منابع ببین."
              className="snapshot-tag"
            >
              نسخهٔ ثبت‌شده
            </span>
          )}
        </div>
        <div className="card-price">
          <span>کمترین برآورد ماهانه</span>
          {g.offers[0]?.period > 1 && (
            <small className="billing-caption">
              با پرداخت {fa(g.offers[0].period)} ماهه
            </small>
          )}
          <div>
            <strong>{fa(g.min)}</strong>
            <small>تومان</small>
          </div>
        </div>
        <div className="card-actions">
          <button className="offer-button" onClick={() => setSelected(g.id)}>
            مشاهدهٔ {fa(g.offers.length)} پیشنهاد <ArrowLeft size={16} />
          </button>
          <button
            className={`compare-pick ${choices.compared.includes(g.id) ? "picked" : ""}`}
            aria-label={`مقایسه ${title(g)}`}
            aria-pressed={choices.compared.includes(g.id)}
            disabled={busyChoice}
            onClick={() => toggleCompare(g.id)}
          >
            {choices.compared.includes(g.id) ? (
              <Check size={16} />
            ) : (
              <Plus size={16} />
            )}
          </button>
        </div>
      </article>
    );
  }
  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <a
            href="/"
            className="brand"
            onClick={(e) => {
              e.preventDefault();
              go("discover");
              reset();
            }}
          >
            <Logo />
            <span>
              ابرگزین<small>ترب هاست و سرور</small>
            </span>
          </a>
          <nav aria-label="ناوبری اصلی">
            <button
              className={view === "discover" ? "active" : ""}
              onClick={() => go("discover")}
            >
              کشف و مقایسه
            </button>
            <button
              className={view === "sources" ? "active" : ""}
              onClick={() => go("sources")}
            >
              ارائه‌دهنده‌ها و منابع
            </button>
            <button onClick={() => setAbout(true)}>چطور کار می‌کند؟</button>
          </nav>
          <div className="header-actions">
            <button
              className={`header-saved ${view === "saved" ? "active" : ""}`}
              onClick={() => go("saved")}
            >
              <Bookmark size={18} />
              <span>ذخیره‌ها</span>
              {choices.saved.length > 0 && <b>{fa(choices.saved.length)}</b>}
            </button>
            <button className="header-compare" onClick={() => go("compare")}>
              <GitCompareArrows size={18} />
              <span>مقایسه</span>
              <b>{fa(choices.compared.length)}</b>
            </button>
          </div>
        </div>
      </header>
      {view === "discover" && (
        <section className="hero">
          <div className="hero-inner">
            <div className="hero-copy">
              <span className="eyebrow">
                <span className="tiny-dot" /> انتخاب زیرساخت، با دید باز
              </span>
              <h1>
                هاست و سرورت رو
                <br />
                <span>بهتر انتخاب کن.</span>
              </h1>
              <p>
                یک انتخاب، چند ارائه‌دهنده.
                <br className="mobile-br" /> منابع را مقایسه کن و هزینهٔ
                ماهانه‌ات را ببین.
              </p>
              <div className="hero-proof">
                <span>
                  <ShieldCheck size={16} /> تعرفه از منابع رسمی
                </span>
                <span>
                  <Layers3 size={16} /> مقایسه بر اساس منابع
                </span>
              </div>
            </div>
            <ServerArt />
          </div>
        </section>
      )}
      <main className="main-shell">
        {(view === "discover" || view === "saved") && (
          <>
            <section className="search-section">
              <form
                className="configuration-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  resultsRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }}
              >
                <fieldset className="resource-search">
                  <legend>مشخصات مورد نظرت را انتخاب کن</legend>
                  <p className="configuration-intro">
                    از کاربرد شروع کن، منابع و هزینه را مشخص کن؛ نتایج دقیق و
                    پیشنهادهای نزدیک جدا نمایش داده می‌شوند.
                  </p>
                  <section
                    className="configuration-group"
                    aria-labelledby="service-group-title"
                  >
                    <h3 id="service-group-title">
                      <Server size={18} /> نوع سرویس و کاربرد
                    </h3>
                    <div className="parameter-grid">
                      <label htmlFor="service-type">
                        <span>نوع سرویس</span>
                        <select
                          id="service-type"
                          value={filters.type}
                          onChange={(e) => update("type", e.target.value)}
                        >
                          <option value="all">همهٔ سرویس‌ها</option>
                          <option value="vps">سرور مجازی و ابری</option>
                          <option value="hosting">هاست و وردپرس</option>
                        </select>
                      </label>
                      <label htmlFor="workload">
                        <span>چی می‌خوای اجرا کنی؟</span>
                        <select
                          id="workload"
                          value={filters.workload}
                          onChange={(e) => update("workload", e.target.value)}
                          aria-describedby="workload-help"
                        >
                          {workloads.map((w) => (
                            <option value={w.id} key={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label htmlFor="region">
                        <span>موقعیت سرویس</span>
                        <select
                          id="region"
                          value={filters.region}
                          onChange={(e) => update("region", e.target.value)}
                        >
                          <option value="all">همهٔ موقعیت‌ها</option>
                          <option value="ir">ایران</option>
                          <option value="eu">اروپا</option>
                          <option value="unknown">موقعیت اعلام‌نشده</option>
                        </select>
                      </label>
                    </div>
                    <p className="configuration-help" id="workload-help">
                      انتخاب کاربرد، نوع سرویس را تنظیم می‌کند؛ منابع مورد نیاز
                      به برنامهٔ تو بستگی دارد.
                    </p>
                  </section>
                  <section
                    className="configuration-group"
                    aria-labelledby="resources-group-title"
                  >
                    <h3 id="resources-group-title">
                      <Cpu size={18} /> منابع دقیق
                    </h3>
                    <div className="parameter-grid resource-selectors">
                      {(["ram", "disk", "cpu"] as ResourceField[]).map(
                        (key) => {
                          const value = filters[key] || "all";
                          const values = [
                            ...new Set([
                              ...allGroups
                                .filter(
                                  (g) =>
                                    filters.type === "all" ||
                                    g.type === filters.type,
                                )
                                .map((g) => g[key])
                                .filter(
                                  (n): n is number => n !== null && n > 0,
                                ),
                              ...(Number(value) > 0 ? [Number(value)] : []),
                            ]),
                          ].sort((a, b) => a - b);
                          const Icon =
                            key === "ram"
                              ? MemoryStick
                              : key === "disk"
                                ? HardDrive
                                : Cpu;
                          return (
                            <label key={key} htmlFor={`resource-${key}`}>
                              <span>
                                <Icon size={17} /> {resourceLabels[key]}
                              </span>
                              <select
                                id={`resource-${key}`}
                                value={value}
                                onChange={(e) => update(key, e.target.value)}
                              >
                                <option value="all">بدون محدودیت</option>
                                {values.map((n) => (
                                  <option value={n} key={n}>
                                    {fa(n)}{" "}
                                    {key === "cpu" ? "هسته" : "گیگابایت"}
                                  </option>
                                ))}
                              </select>
                            </label>
                          );
                        },
                      )}
                    </div>
                    <p className="configuration-help">
                      نتایج دقیق با مقدار انتخاب‌شده برابرند. پلن‌هایی با منابع
                      اعلام‌نشده، در فیلتر همان منبع نمایش داده نمی‌شوند.
                    </p>
                  </section>
                  <section
                    className="configuration-group"
                    aria-labelledby="cost-group-title"
                  >
                    <h3 id="cost-group-title">
                      <SlidersHorizontal size={18} /> هزینه و ارائه‌دهنده
                    </h3>
                    <div className="parameter-grid">
                      <label htmlFor="budget">
                        <span>سقف هزینهٔ ماهانه</span>
                        <select
                          id="budget"
                          value={filters.maxPrice}
                          onChange={(e) => update("maxPrice", e.target.value)}
                        >
                          <option value="">بدون محدودیت</option>
                          {[
                            ...new Set([
                              500000,
                              1000000,
                              2000000,
                              3000000,
                              5000000,
                              10000000,
                              ...(filters.maxPrice !== ""
                                ? [Number(filters.maxPrice)]
                                : []),
                            ]),
                          ]
                            .sort((a, b) => a - b)
                            .map((n) => (
                              <option key={n} value={n}>
                                {fa(n)} تومان
                              </option>
                            ))}
                        </select>
                      </label>
                      <label htmlFor="provider">
                        <span>ارائه‌دهنده</span>
                        <select
                          id="provider"
                          value={filters.provider}
                          onChange={(e) => update("provider", e.target.value)}
                        >
                          <option value="">همهٔ ارائه‌دهنده‌ها</option>
                          {providers.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label htmlFor="traffic">
                        <span>ترافیک ماهانه</span>
                        <select
                          id="traffic"
                          value={traffic}
                          onChange={(e) => setTraffic(e.target.value)}
                        >
                          {[
                            ...new Set([
                              0,
                              100,
                              200,
                              500,
                              1000,
                              2000,
                              Number(traffic),
                            ]),
                          ]
                            .sort((a, b) => a - b)
                            .map((n) => (
                              <option value={n} key={n}>
                                {fa(n)} گیگابایت
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                    <div className="configuration-extras">
                      <label className="configuration-ip" htmlFor="include-ip">
                        <input
                          id="include-ip"
                          type="checkbox"
                          checked={ip}
                          onChange={(e) => setIp(e.target.checked)}
                        />
                        <span>هزینهٔ یک IPv4 هم حساب شود</span>
                      </label>
                      <label className="configuration-sort" htmlFor="sort">
                        <span>مرتب‌سازی نتایج</span>
                        <select
                          id="sort"
                          value={filters.sort}
                          onChange={(e) => update("sort", e.target.value)}
                        >
                          <option value="price">کمترین هزینه</option>
                          <option value="providers">بیشترین ارائه‌دهنده</option>
                          <option value="ram">بیشترین رم</option>
                        </select>
                      </label>
                    </div>
                    <p className="configuration-help">
                      برآورد ماهانه با ترافیک، IP و هزینه‌های مشخص در منبع
                      محاسبه می‌شود.
                    </p>
                  </section>
                  <div className="configuration-actions">
                    <span className="configuration-status" role="status">
                      {loading ? (
                        <LoaderCircle size={16} className="spin" />
                      ) : (
                        <CheckCircle2 size={16} />
                      )}
                      {loading
                        ? "در حال دریافت پیشنهادها…"
                        : "نتایج با هر انتخاب به‌روز می‌شوند"}
                    </span>
                    <button
                      type="button"
                      className="text-button configuration-reset"
                      onClick={reset}
                    >
                      <RefreshCw size={14} /> پاک کردن انتخاب‌ها
                    </button>
                    <button type="submit" className="primary">
                      دیدن پیشنهادها <ArrowLeft size={17} />
                    </button>
                  </div>
                </fieldset>
              </form>
            </section>
            <div className="catalog-heading" ref={resultsRef}>
              <div>
                <h2>
                  {view === "saved"
                    ? "ذخیره‌های تو"
                    : "پیکربندی مناسب تو اینجاست"}{" "}
                  <span>
                    {results ? fa(results.groups.length) : "—"}{" "}
                    {Object.keys(results?.resourceFilters || {}).length
                      ? "مطابق"
                      : "گزینه"}
                  </span>
                </h2>
                <p>
                  {view === "saved"
                    ? "انتخاب‌ها روی همین مرورگر نگه‌داری می‌شوند."
                    : "قیمت‌ها برای منابع مشابه کنار هم قرار می‌گیرند؛ جزئیات هر سرویس را هم بررسی کن."}
                </p>
              </div>
              <button className="text-button share-button" onClick={share}>
                <Link2 size={16} /> لینک جست‌وجو
              </button>
            </div>
            <div className="catalog-layout">
              <section className="catalog-results" aria-label="نتایج جست‌وجو">
                {error && (
                  <div className="error-banner" role="alert">
                    <Info size={18} />
                    {error}
                    <button onClick={() => setRevision((r) => r + 1)}>
                      تلاش دوباره
                    </button>
                  </div>
                )}
                {loading ? (
                  <div
                    className="plans-grid"
                    aria-busy="true"
                    aria-label="در حال دریافت نتایج"
                  >
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div className="skeleton-card" key={i}>
                        <span />
                        <span />
                        <span />
                      </div>
                    ))}
                  </div>
                ) : results?.groups.length ? (
                  <>
                    <div className="matching-heading exact-heading">
                      <CheckCircle2 size={22} />
                      <div>
                        <h3>
                          {Object.keys(results.resourceFilters).length
                            ? "دقیقاً مطابق انتخاب شما"
                            : "پیشنهادهای مطابق فیلترها"}
                        </h3>
                        <p>
                          {Object.keys(results.resourceFilters).length
                            ? "مقدار منابع انتخاب‌شده با مشخصات این پلن‌ها برابر است."
                            : "برای پیدا کردن پیکربندی دقیق، رم و فضای دیسک را انتخاب کن."}
                        </p>
                      </div>
                      <span>{fa(results.groups.length)} پیکربندی</span>
                    </div>
                    <div className="result-count">
                      {fa(results.totalOffers)} پیشنهاد از{" "}
                      {fa(
                        new Set(
                          results.groups.flatMap((g) =>
                            g.offers.map((o) => o.providerId),
                          ),
                        ).size,
                      )}{" "}
                      ارائه‌دهنده{" "}
                      <span>
                        <ArrowDown size={12} /> برآورد ماهانه، به تومان
                      </span>
                    </div>
                    <div
                      className="plans-grid exact-results"
                      aria-label="پیشنهادهای مطابق انتخاب"
                    >
                      {results.groups.map(groupCard)}
                    </div>
                  </>
                ) : (
                  !error && (
                    <div className="empty-state">
                      <span>
                        <Search size={32} />
                      </span>
                      <h3>
                        {view === "saved"
                          ? "هنوز چیزی ذخیره نکرده‌ای"
                          : "پیکربندی دقیق با این شرایط پیدا نشد"}
                      </h3>
                      <p>
                        {view === "saved"
                          ? "کنار پیکربندی‌های موردعلاقه‌ات، نشان ذخیره را بزن."
                          : results?.similarGroups.length
                            ? "پیشنهادهای نزدیک را در بخش بعدی ببین؛ تفاوت هر پلن با انتخاب تو مشخص شده است."
                            : "مقادیر منابع یا سقف بودجه را تغییر بده. منابع اعلام‌نشده، تطابق دقیق محسوب نمی‌شوند."}
                      </p>
                      {!results?.similarGroups.length && (
                        <button
                          className="primary"
                          onClick={() => {
                            go("discover");
                            reset();
                          }}
                        >
                          دیدن همهٔ سرورها <ArrowLeft size={17} />
                        </button>
                      )}
                    </div>
                  )
                )}
                {!loading && !error && !!results?.similarGroups.length && (
                  <section
                    className="similar-results"
                    aria-labelledby="similar-title"
                  >
                    <div className="matching-heading">
                      <Layers3 size={22} />
                      <div>
                        <h3 id="similar-title">
                          پیشنهادهای نزدیک به انتخاب شما
                        </h3>
                        <p>
                          تفاوت منابع روی هر کارت آمده است؛ فیلتر موقعیت،
                          ارائه‌دهنده و سقف بودجه رعایت شده‌اند.
                        </p>
                      </div>
                      <span>
                        {fa(results.similarGroups.length)} پیکربندی نزدیک
                      </span>
                    </div>
                    <div className="plans-grid">
                      {results.similarGroups.map(groupCard)}
                    </div>
                  </section>
                )}
                <div className="price-notice">
                  <Info size={16} />
                  <p>
                    این اعداد برآوردند. مالیات یا هزینه‌ای که در منبع مشخص نشده،
                    به مبلغ اضافه نمی‌شود و در جزئیات هشدار دارد. قیمت نهایی و
                    موجودی را در سایت ارائه‌دهنده بررسی کن.
                  </p>
                </div>
              </section>
            </div>
          </>
        )}
        {view === "compare" && (
          <section className="compare-page">
            <div className="page-title">
              <div>
                <span className="eyebrow">کنار هم، تصمیم روشن‌تر</span>
                <h1>مقایسهٔ پیکربندی‌ها</h1>
                <p>
                  تا سه گزینه را از نظر منابع و پیشنهادهای ارائه‌دهنده‌ها بسنج.
                </p>
              </div>
              {compared.length > 0 && (
                <button className="secondary" onClick={exportCsv}>
                  <Download size={17} /> دانلود جدول
                </button>
              )}
            </div>
            {!compared.length ? (
              <div className="empty-state">
                <span>
                  <GitCompareArrows size={32} />
                </span>
                <h3>مقایسه‌ات را بساز</h3>
                <p>دکمهٔ + کنار هر پیکربندی را بزن تا به این جدول اضافه شود.</p>
                <button className="primary" onClick={() => go("discover")}>
                  انتخاب سرور <ArrowLeft size={17} />
                </button>
              </div>
            ) : (
              <>
                <div className="compare-consumption">
                  <span>مبنای برآورد</span>
                  <label>
                    ترافیک{" "}
                    <select
                      aria-label="ترافیک مقایسه"
                      value={traffic}
                      onChange={(e) => setTraffic(e.target.value)}
                    >
                      {[0, 100, 200, 500, 1000, 2000].map((n) => (
                        <option key={n} value={n}>
                          {fa(n)} GB
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="ip-check">
                    <input
                      type="checkbox"
                      checked={ip}
                      onChange={(e) => setIp(e.target.checked)}
                    />{" "}
                    با IPv4
                  </label>
                </div>
                <div className="table-scroll">
                  <table className="comparison-table">
                    <thead>
                      <tr>
                        <th scope="col">مشخصات</th>
                        {compared.map((g) => (
                          <th key={g.id} scope="col">
                            <button
                              className="icon-button remove-compare"
                              aria-label={`حذف ${title(g)} از مقایسه`}
                              onClick={() => toggleCompare(g.id)}
                            >
                              <X size={16} />
                            </button>
                            <span className="mini-rack">
                              <Server size={24} />
                            </span>
                            <strong>{title(g)}</strong>
                            <small>
                              {region(g.region)} ·{" "}
                              {g.type === "vps" ? "سرور مجازی" : "میزبانی وب"}
                            </small>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        {
                          name: "کمترین برآورد ماهانه",
                          render: (g: Group) => (
                            <span className="table-price">
                              {fa(g.min)} <small>تومان</small>
                            </span>
                          ),
                        },
                        {
                          name: "پردازنده",
                          render: (g: Group) =>
                            g.cpu
                              ? `${fa(g.cpu)} هسته`
                              : "اشتراکی؛ تعداد مشخص نیست",
                        },
                        {
                          name: "حافظهٔ RAM",
                          render: (g: Group) =>
                            g.ram
                              ? `${fa(g.ram)} گیگابایت`
                              : "در منبع مشخص نشده",
                        },
                        {
                          name: "فضای دیسک",
                          render: (g: Group) => `${fa(g.disk)} گیگابایت`,
                        },
                        {
                          name: "نوع دیسک",
                          render: (g: Group) =>
                            [...new Set(g.offers.map((o) => o.diskType))].join(
                              " / ",
                            ),
                        },
                        {
                          name: "ارائه‌دهنده‌ها",
                          render: (g: Group) => (
                            <div className="table-sellers">
                              {g.offers.map((o) => (
                                <div key={o.id}>
                                  <ProviderLogo
                                    provider={provider(o.providerId)}
                                    small
                                  />
                                  <span>{provider(o.providerId)?.name}</span>
                                  <b>{fa(o.estimate.total)}</b>
                                </div>
                              ))}
                            </div>
                          ),
                        },
                        {
                          name: "دورهٔ پرداخت تعرفه",
                          render: (g: Group) =>
                            [
                              ...new Set(
                                g.offers.map((o) => `${fa(o.period)} ماه`),
                              ),
                            ].join(" / "),
                        },
                        {
                          name: "آخرین بررسی قیمت",
                          render: (g: Group) =>
                            date(g.offers.map((o) => o.verifiedAt).sort()[0]),
                        },
                      ].map((row) => (
                        <tr key={row.name}>
                          <th scope="row">{row.name}</th>
                          {compared.map((g) => (
                            <td key={g.id}>{row.render(g)}</td>
                          ))}
                        </tr>
                      ))}
                      <tr>
                        <th scope="row">بررسی و انتخاب</th>
                        {compared.map((g) => (
                          <td key={g.id}>
                            <button
                              className="primary"
                              onClick={() => setSelected(g.id)}
                            >
                              دیدن پیشنهادها <ArrowLeft size={16} />
                            </button>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="price-notice">
                  <Info size={16} /> ظرفیت یکسان به معنی کیفیت یکسان نیست؛
                  اشتراک پردازنده، مدیریت سرویس، نوع دیسک و محدودیت‌های ترافیک
                  را در جزئیات هر پیشنهاد بخوان.
                </p>
              </>
            )}
          </section>
        )}
        {view === "sources" && (
          <section className="sources-page">
            <div className="page-title">
              <div>
                <span className="eyebrow">پشت هر عدد، یک منبع</span>
                <h1>ارائه‌دهنده‌ها و منابع</h1>
                <p>
                  {fa(providers.length)} ارائه‌دهنده ·{" "}
                  {fa(allGroups.flatMap((g) => g.offers).length)} پلن و پیکربندی
                  · منبع رسمی و زمان تأیید برای هر تعرفه
                </p>
              </div>
              <button
                className="primary"
                onClick={refresh}
                disabled={job.state === "running"}
              >
                <RefreshCw
                  size={17}
                  className={job.state === "running" ? "spin" : ""}
                />
                {job.state === "running"
                  ? `بررسی ${fa(job.done)} از ${fa(job.total)}`
                  : "بررسی دوبارهٔ تعرفه‌ها"}
              </button>
            </div>
            {refreshError && (
              <p className="error-banner" role="alert">
                {refreshError}
              </p>
            )}
            <div className="catalog-downloads">
              <a href="/api/export/csv" download>
                <Download size={16} /> دریافت همهٔ تعرفه‌ها · CSV
              </a>
              <a href="/api/export/json" download>
                <Database size={16} /> JSON
              </a>
            </div>
            <div className="method-note">
              <ShieldCheck size={24} />
              <div>
                <strong>
                  وقتی دریافت شکست می‌خورد، تاریخ تأیید جلو نمی‌رود.
                </strong>
                <p>
                  استخراج فقط از صفحه‌های رسمی انجام می‌شود. اگر صفحه در دسترس
                  نباشد یا ساختارش تغییر کند، آخرین تعرفهٔ تأییدشده حفظ می‌شود و
                  خطا اینجا نمایش داده می‌شود. پیکربندی‌های آروان از تعرفهٔ واحد
                  منابع محاسبه می‌شوند.
                </p>
              </div>
            </div>
            <div className="provider-grid">
              {providers.map((p) => (
                <article className="provider-card" key={p.id}>
                  <ProviderLogo provider={p} />
                  <div>
                    <h3>{p.name}</h3>
                    <small dir="ltr">{p.en}</small>
                    <p>{p.description}</p>
                  </div>
                  <a
                    aria-label={`وب‌سایت رسمی ${p.name}`}
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ArrowUpLeft size={19} />
                  </a>
                </article>
              ))}
            </div>
            <div className="source-list">
              {sources.map((s) => {
                const state = statuses.find((x) => x.id === s.id);
                const os = allGroups
                  .flatMap((g) => g.offers)
                  .filter((o) => o.sourceId === s.id);
                const verified = state?.verifiedAt || os[0]?.verifiedAt;
                return (
                  <article className="source-row" key={s.id}>
                    <ProviderLogo provider={provider(s.providerId)} small />
                    <div className="source-name">
                      <strong>{s.name}</strong>
                      <a href={s.url} target="_blank" rel="noreferrer">
                        <bdi>{new URL(s.url).hostname}</bdi>
                        <ExternalLink size={12} />
                      </a>
                    </div>
                    <div className="source-date">
                      <span>آخرین تأیید تعرفه</span>
                      <strong>
                        {verified ? datetime(verified) : "ثبت نشده"}
                      </strong>
                      <small>{fa(os.length)} پیشنهاد</small>
                    </div>
                    <div
                      className={`source-status ${state?.state === "error" ? "source-failed" : ""}`}
                    >
                      {state?.state === "ok" ? (
                        <CheckCircle2 size={17} />
                      ) : state?.state === "error" ? (
                        <Info size={17} />
                      ) : (
                        <Clock3 size={17} />
                      )}
                      <span>
                        {state?.state === "ok"
                          ? "استخراج خودکار موفق"
                          : state?.state === "error"
                            ? "تعرفهٔ قبلی حفظ شده"
                            : "بررسی اولیهٔ منبع رسمی"}
                        <small>
                          {state?.error ||
                            (state?.checkedAt
                              ? `آخرین دریافت: ${datetime(state.checkedAt)}`
                              : "هنوز دریافت خودکار انجام نشده")}
                        </small>
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="model-status">
              <Sparkles size={19} />
              <div>
                <strong>
                  جست‌وجوی معنایی{" "}
                  {model.state === "ready"
                    ? "فعال است"
                    : model.state === "loading"
                      ? "در حال آماده‌سازی است"
                      : "آماده نشده است"}
                </strong>
                <p>
                  {model.state === "ready"
                    ? "مدل چندزبانهٔ MiniLM عبارت‌هایی مثل «اجرای داکر» را به نوع سرویس نزدیک‌تر تطبیق می‌دهد. منابع و سقف بودجه از متن استخراج می‌شوند؛ پیشنهاد کیفیت یا موجودی از مدل گرفته نمی‌شود."
                    : model.error || "جست‌وجوی مشخصات و واژه‌ها در دسترس است."}
                </p>
              </div>
            </div>
          </section>
        )}
      </main>
      <footer className="site-footer">
        <div>
          <Logo />
          <strong>ابرگزین</strong>
          <span>زیرساخت مناسب، انتخاب آگاهانه.</span>
        </div>
        <p>
          پروژهٔ مستقل مقایسهٔ هاست و سرور · وابسته به ترب یا ارائه‌دهنده‌ها
          نیست
        </p>
        <button className="text-button" onClick={() => go("sources")}>
          منابع و روش محاسبه <ArrowUpLeft size={14} />
        </button>
      </footer>
      {choices.compared.length > 0 && view !== "compare" && (
        <div className="compare-tray">
          <span className="tray-icon">
            <GitCompareArrows size={20} />
          </span>
          <div>
            <strong>{fa(choices.compared.length)} گزینه برای مقایسه</strong>
            <small>منابع، هزینه و ارائه‌دهنده‌ها</small>
          </div>
          <div className="tray-slots">
            {[0, 1, 2].map((i) => (
              <span className={choices.compared[i] ? "filled" : ""} key={i}>
                {choices.compared[i] ? (
                  <Server size={16} />
                ) : (
                  <Plus size={14} />
                )}
              </span>
            ))}
          </div>
          <button className="primary" onClick={() => go("compare")}>
            مقایسه کن <ArrowLeft size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="پاک کردن مقایسه"
            onClick={() => changeChoices({ ...choices, compared: [] })}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {current && (
        <Modal
          onClose={() => setSelected(null)}
          label={`پیشنهادهای ${title(current)}`}
          wide
        >
          <div className="offer-modal-heading">
            <span className="eyebrow">پیشنهادهای ارائه‌دهنده‌ها</span>
            <h2>
              {title(current)} <small>{region(current.region)}</small>
            </h2>
            <p>
              {current.cpu
                ? `${fa(current.cpu)} هسته · ${fa(current.ram || 0)} GB رم · `
                : ""}
              {fa(current.disk)} GB دیسک · {fa(current.providerCount)}{" "}
              ارائه‌دهنده
            </p>
          </div>
          <div className="modal-calculation">
            <SlidersHorizontal size={17} />
            <span>
              برآورد برای {fa(Number(traffic))} GB ترافیک ماهانه{" "}
              {current.type === "vps" &&
                (ip ? "و یک IPv4" : "بدون هزینهٔ IPv4")}
            </span>
            <small>کمترین هزینه در ابتدا</small>
          </div>
          {!!current.differences?.length && (
            <div className="similar-detail-note">
              <Layers3 size={18} />
              <div>
                <strong>این پیکربندی نزدیک به انتخاب شماست</strong>
                <p>{current.differences.map(differenceText).join(" · ")}</p>
              </div>
            </div>
          )}
          <div className="offer-list">
            {current.offers.map((o, i) => (
              <OfferCard
                key={o.id}
                offer={o}
                provider={provider(o.providerId)}
                lowest={i === 0}
                multiple={current.offers.length > 1}
              />
            ))}
          </div>
          <div className="price-notice">
            <Info size={16} />
            <p>
              ارقام مقایسه بر اساس ظرفیت اسمی‌اند. مبلغ نهایی، موجودی و شرایط
              سرویس در سایت رسمی تعیین می‌شود.
            </p>
          </div>
        </Modal>
      )}
      {about && (
        <Modal onClose={() => setAbout(false)} label="ابرگزین چطور کار می‌کند؟">
          <span className="eyebrow">از نیاز تا انتخاب</span>
          <h2>انتخاب مشخص، دید کامل‌تر.</h2>
          <div className="how-steps">
            {[
              [
                Search,
                "مشخصاتت را انتخاب کن",
                "نوع سرویس، کاربرد، منابع، موقعیت و هزینه را در یک فرم انتخاب کن.",
              ],
              [
                Layers3,
                "منابع مشابه را مقایسه کن",
                "ظرفیت‌های برابر کنار هم گروه‌بندی می‌شوند؛ تفاوت دیسک، ترافیک و مدیریت سرویس در جزئیات مشخص است.",
              ],
              [
                SlidersHorizontal,
                "هزینه‌ات را حساب کن",
                "مصرف ترافیک و نیاز به IP را تغییر بده. هزینه‌های نامشخص با هشدار نمایش داده می‌شوند.",
              ],
              [
                ArrowUpLeft,
                "از ارائه‌دهنده خرید کن",
                "ابرگزین فروشنده نیست. برای بررسی موجودی و خرید به صفحهٔ رسمی ارائه‌دهنده می‌روی.",
              ],
            ].map(([Icon, name, description], i) => {
              const I = Icon as React.ElementType;
              return (
                <div key={i}>
                  <span>
                    <I size={21} />
                  </span>
                  <div>
                    <strong>{String(name)}</strong>
                    <p>{String(description)}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <button className="primary" onClick={() => setAbout(false)}>
            شروع انتخاب <ArrowLeft size={17} />
          </button>
        </Modal>
      )}
    </>
  );
}
function OfferCard({
  offer: o,
  provider: p,
  lowest,
  multiple,
}: {
  offer: Offer;
  provider?: Provider;
  lowest: boolean;
  multiple: boolean;
}) {
  const [history, setHistory] = useState<
    { oldPrice: number; newPrice: number; createdAt: string }[] | null
  >(null);
  const [historyError, setHistoryError] = useState("");
  const [fetching, setFetching] = useState(false);
  return (
    <article className={`offer-detail ${lowest && multiple ? "lowest" : ""}`}>
      <div className="offer-heading">
        <ProviderLogo provider={p} />
        <div className="offer-provider-name">
          <h3>
            {p?.name}
            <small>{o.name}</small>
          </h3>
          <span className="offer-meta">
            {o.custom
              ? "پیکربندی محاسبه‌شده"
              : o.type === "wordpress"
                ? "وردپرس مدیریت‌شده"
                : o.type === "vps"
                  ? "سرور مجازی"
                  : "هاست اشتراکی"}{" "}
            · {o.diskType}
          </span>
        </div>
        {lowest && multiple && (
          <span className="lowest-badge">کمترین برآورد</span>
        )}
      </div>
      <div className="offer-columns">
        <div className="offer-information">
          <div className="offer-facts">
            <span>
              ترافیک شامل{" "}
              <strong>
                {o.trafficUnlimited
                  ? "نامحدود"
                  : o.trafficGB !== null
                    ? `${fa(o.trafficGB)} GB`
                    : "مشخص نشده"}
              </strong>
            </span>
            <span>
              دورهٔ پرداخت{" "}
              <strong>
                {o.billing === "hourly"
                  ? "محاسبهٔ ساعتی"
                  : `${fa(o.period)} ماهه`}
              </strong>
            </span>
          </div>
          <ul>
            {o.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          {o.period > 1 && (
            <div className="upfront-note">
              پرداخت دوره: <strong>{fa(o.estimate.upfront)} تومان</strong> برای{" "}
              {fa(o.period)} ماه {o.vatRate !== null ? "با مالیات ذکرشده" : ""}
            </div>
          )}
          <div className="verification">
            <Clock3 size={13} />
            <span>تأیید تعرفه: {datetime(o.verifiedAt)}</span>
            <a href={o.url} target="_blank" rel="noreferrer">
              منبع رسمی <ExternalLink size={12} />
            </a>
          </div>
          <button
            className="text-button history-button"
            disabled={fetching}
            onClick={async () => {
              if (history !== null) {
                setHistory(null);
                return;
              }
              setFetching(true);
              setHistoryError("");
              try {
                setHistory(await api("/api/history/" + o.id));
              } catch (e) {
                setHistoryError((e as Error).message);
              } finally {
                setFetching(false);
              }
            }}
          >
            {fetching ? (
              <LoaderCircle size={13} className="spin" />
            ) : (
              <Database size={13} />
            )}{" "}
            {history === null ? "سوابق تغییر قیمت" : "بستن سوابق"}
          </button>
          {historyError && <p className="error-banner">{historyError}</p>}
          {history !== null && (
            <div className="history-list">
              {history.length ? (
                history.map((h, i) => (
                  <p key={i}>
                    {date(h.createdAt)}: {fa(h.oldPrice)} ← {fa(h.newPrice)}{" "}
                    تومان
                  </p>
                ))
              ) : (
                <p>از شروع پایش، تغییری در تعرفهٔ پایه ثبت نشده است.</p>
              )}
            </div>
          )}
        </div>
        <div className="cost-breakdown">
          <span className="breakdown-title">جزئیات هزینهٔ ماهانه</span>
          {o.estimate.parts.map((part, i) => (
            <div className="cost-line" key={i}>
              <span>{part.label}</span>
              <b>{fa(part.amount)}</b>
            </div>
          ))}
          <div className="cost-total">
            <span>برآورد ماهانه</span>
            <strong>
              {fa(o.estimate.total)} <small>تومان</small>
            </strong>
          </div>
          {o.estimate.warnings.map((w) => (
            <p className="cost-warning" key={w}>
              <Info size={13} />
              {w}
            </p>
          ))}
          <a
            className="primary buy-link"
            href={`/go/${o.id}`}
            target="_blank"
            rel="noreferrer"
          >
            بررسی و خرید از {p?.name}
            <ArrowUpLeft size={17} />
          </a>
        </div>
      </div>
    </article>
  );
}
