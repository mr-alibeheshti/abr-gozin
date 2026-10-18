import { appPath } from "./paths";
import { readApiResponse } from "../shared/http-response.ts";
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
import { formatPrice } from "./format-price";
import { outboundLink } from "../shared/outbound-link.ts";
import { ChatAssistant, type ChatFilters } from "./ChatAssistant";
import {
  WorkloadRequirements,
  type Requirements,
  type WorkloadGuide,
} from "./WorkloadRequirements";

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
  requirements: Requirements;
  totalOffers: number;
  intent: { fields: Record<string, string | number>; semanticType?: string };
  filters: Record<string, unknown>;
  model: Model;
};
type Choices = { saved: string[]; compared: string[] };
type Filters = {
  q: string;
  scenario: string;
  minDisk: string;
  minRam: string;
  minCpu: string;
  dataGB: string;
  growthGB: string;
  backupCopies: string;
  gpu: string;
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
  g.type !== "hosting"
    ? `${g.type === "dedicated" ? "سرور اختصاصی" : "سرور"} ${fa(g.ram || 0)} گیگابایت`
    : `${g.serviceType === "wordpress" ? "وردپرس" : "هاست"} ${fa(g.disk)} گیگابایت`;
const initial = new URLSearchParams(location.search);
const defaults: Filters = {
  q: "",
  scenario: "general",
  minDisk: "",
  minRam: "",
  minCpu: "",
  dataGB: "",
  growthGB: "",
  backupCopies: "",
  gpu: "false",
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
async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(appPath(url), options);
  return readApiResponse<T>(res);
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
        src={appPath(src)}
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
  const [guides, setGuides] = useState<WorkloadGuide[]>([]);
  const [view, setView] = useState<View>("discover");
  const [filters, setFilters] = useState<Filters>(
    () =>
      Object.fromEntries(
        Object.entries(defaults).map(([k, v]) => [
          k,
          k === "provider"
            ? initial.getAll(k).join(",")
            : k === "sort"
              ? initial.get(k) === "price-desc"
                ? "price-desc"
                : "price"
              : initial.get(k) || v,
        ]),
      ) as Filters,
  );
  const [traffic, setTraffic] = useState(initial.get("traffic") || "200");
  const [draftQuery, setDraftQuery] = useState(initial.get("q") || "");
  const [model, setModel] = useState<Model | null>(null);
  const [ip, setIp] = useState(initial.get("ip") !== "false");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
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
  const jobState = useRef("idle");
  const toastTimer = useRef<number | undefined>(undefined);
  const resultsRef = useRef<HTMLDivElement>(null);
  const providerPicker = useRef<HTMLDetailsElement>(null);
  const provider = (id: string) => providers.find((p) => p.id === id);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      const picker = providerPicker.current;
      if (picker?.open && !picker.contains(event.target as Node))
        picker.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
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
          workloadGuide: WorkloadGuide[];
          sources: Source[];
          status: Status[];
          model: Model;
        }>("/api/catalog");
        if (active) {
          setModel(data.model);
          setChoices(choice);
          setProviders(data.providers);
          setGuides(data.workloadGuide);
          setSources(data.sources);
          setStatuses(data.status);
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
        setModel(data.model);
        setAllGroups(all.groups);
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
        const w = workloads.find((w) => w.id === v);
        return {
          ...f,
          workload: v,
          scenario: "general",
          dataGB: "",
          growthGB: "",
          backupCopies: "",
          gpu: "false",
          ...(w && w.type !== "all" && !["vps", "dedicated"].includes(f.type)
            ? { type: w.type }
            : {}),
        };
      }
      if (k === "type") {
        const w = workloads.find((w) => w.id === f.workload);
        const incompatible = v === "hosting" && w?.type === "vps";
        return {
          ...f,
          type: v,
          ...(incompatible
            ? {
                workload: "all",
                scenario: "general",
                dataGB: "",
                growthGB: "",
                backupCopies: "",
                gpu: "false",
              }
            : {}),
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
      setDraftQuery("");
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
    setDraftQuery("");
    setTraffic("200");
    setIp(true);
  }
  function search(query = draftQuery) {
    const q = query.trim();
    setDraftQuery(q);
    setFilters((f) => ({ ...f, q }));
    setRevision((r) => r + 1);
  }
  const applied = results?.filters || {};
  const appliedLabels = [
    ...(applied.type && applied.type !== "all"
      ? [
          applied.type === "vps"
            ? "سرور مجازی"
            : applied.type === "dedicated"
              ? "سرور اختصاصی"
              : "هاست",
        ]
      : []),
    ...(applied.region && applied.region !== "all"
      ? [region(String(applied.region))]
      : []),
    ...(["ram", "cpu", "disk"] as ResourceField[])
      .filter((key) => Number(applied[key]) > 0)
      .map(
        (key) =>
          `حداقل ${fa(Number(applied[key]))} ${key === "cpu" ? "هسته" : key === "ram" ? "گیگ رم" : "گیگ دیسک"}`,
      ),
    ...(applied.maxPrice !== undefined
      ? [`تا ${fa(Number(applied.maxPrice))} تومان در ماه`]
      : []),
    ...(Array.isArray(applied.provider)
      ? applied.provider
      : String(applied.provider || "").split(",")
    )
      .filter(Boolean)
      .map((id) => provider(String(id))?.name || String(id)),
  ];
  const selectedFilterCount =
    Object.entries(filters).filter(
      ([key, value]) => key !== "q" && value !== defaults[key as keyof Filters],
    ).length +
    Number(traffic !== "200") +
    Number(!ip);
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
            {g.type !== "hosting" ? <Server size={13} /> : <Globe2 size={13} />}{" "}
            {g.type === "dedicated"
              ? "سرور اختصاصی"
              : g.type === "vps"
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
              {g.type !== "hosting" ? "منابع قابل مقایسه" : "میزبانی وب"}
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
            <strong>
              <bdi className="price-number" dir="ltr">
                {formatPrice(g.min)}
              </bdi>
            </strong>
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
            href={appPath("/")}
            className="brand"
            onClick={(e) => {
              e.preventDefault();
              go("discover");
              reset();
            }}
          >
            <Logo />
            <span>
              ابرگزین<small>زیرساخت مناسب، انتخاب آگاهانه.</small>
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
              {view === "discover" && (
                <div className="intelligent-search">
                  <div className="intelligent-search-heading">
                    <div>
                      <span className="eyebrow">
                        <Sparkles size={16} /> جست‌وجوی هوشمند
                      </span>
                      <h2>بگو برای چه کاری زیرساخت می‌خواهی.</h2>
                    </div>
                    <span
                      className={`search-model-state ${model?.state === "ready" ? "ready" : ""}`}
                    >
                      <span className="tiny-dot" />
                      {model?.state === "ready"
                        ? "هوش مصنوعی فعال"
                        : model?.state === "failed"
                          ? "جست‌وجوی واژه‌ها فعال"
                          : "در حال آماده‌سازی هوش مصنوعی"}
                    </span>
                  </div>
                  <form
                    className="intelligent-search-form"
                    role="search"
                    onSubmit={(event) => {
                      event.preventDefault();
                      search();
                    }}
                  >
                    <label htmlFor="smart-query" className="sr-only">
                      نیازت را برای جست‌وجوی هوشمند بنویس
                    </label>
                    <div className="smart-query-field">
                      <Search size={21} aria-hidden="true" />
                      <input
                        id="smart-query"
                        type="search"
                        value={draftQuery}
                        maxLength={400}
                        placeholder="مثلاً سرور ایران برای داکر با ۴ گیگ رم زیر ۲ میلیون"
                        aria-describedby="smart-search-help"
                        enterKeyHint="search"
                        onChange={(event) => setDraftQuery(event.target.value)}
                      />
                    </div>
                    <button type="submit" className="primary" disabled={!ready}>
                      <Sparkles size={17} /> جست‌وجو
                    </button>
                  </form>
                  <p id="smart-search-help" className="smart-search-help">
                    کاربرد، منابع یا بودجه‌ات را بنویس؛ فیلترهای انتخابی تو
                    اولویت دارند.
                    {model?.state === "failed" &&
                      " مدل معنایی در دسترس نیست؛ جست‌وجوی مشخصات و واژه‌ها ادامه دارد."}
                    {model?.state === "loading" &&
                      " تا آماده‌شدن مدل، جست‌وجوی مشخصات و واژه‌ها فعال است."}
                  </p>
                  <div
                    className="search-examples"
                    aria-label="نمونه‌های جست‌وجو"
                  >
                    <span>امتحان کن:</span>
                    {[
                      "سرور ایران برای داکر با ۴ گیگ رم",
                      "هاست برای فروشگاه وردپرسی",
                      "سرور لیارا زیر ۲ میلیون",
                    ].map((example) => (
                      <button
                        type="button"
                        key={example}
                        onClick={() => search(example)}
                        disabled={!ready}
                      >
                        {example}
                        <ArrowUpLeft size={13} />
                      </button>
                    ))}
                  </div>
                  {filters.q && (
                    <div className="active-query">
                      <span>
                        عبارت جست‌وجو: <bdi>{filters.q}</bdi>
                      </span>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => search("")}
                      >
                        <X size={14} /> پاک کردن عبارت
                      </button>
                    </div>
                  )}
                </div>
              )}
              <details className="search-filters">
                <summary>
                  <SlidersHorizontal size={19} />
                  <span>
                    فیلترهای جست‌وجو
                    <small>نوع سرویس، منابع، موقعیت، ارائه‌دهنده و بودجه</small>
                  </span>
                  {selectedFilterCount > 0 && (
                    <b>{fa(selectedFilterCount)} انتخاب</b>
                  )}
                  <ChevronDown size={18} className="filter-chevron" />
                </summary>
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
                      کاربرد، حداقل منابع و بودجه را مشخص کن؛ نزدیک‌ترین پلن‌ها
                      اول نمایش داده می‌شوند.
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
                            <option value="all">
                              {filters.q &&
                              applied.type &&
                              applied.type !== "all"
                                ? `از عبارت: ${applied.type === "vps" ? "سرور مجازی" : applied.type === "dedicated" ? "سرور اختصاصی" : "هاست"}`
                                : "همهٔ سرویس‌ها"}
                            </option>
                            <option value="hosting">هاست</option>
                            <option value="vps">سرور مجازی</option>
                            <option value="dedicated">سرور اختصاصی</option>
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
                                {w.id === "all" &&
                                filters.q &&
                                applied.workload &&
                                applied.workload !== "all"
                                  ? `از عبارت: ${workloads.find((item) => item.id === applied.workload)?.name || applied.workload}`
                                  : w.name}
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
                            <option value="all">
                              {filters.q &&
                              applied.region &&
                              applied.region !== "all"
                                ? `از عبارت: ${region(String(applied.region))}`
                                : "همهٔ موقعیت‌ها"}
                            </option>
                            <option value="ir">ایران</option>
                            <option value="eu">اروپا</option>
                            <option value="unknown">موقعیت اعلام‌نشده</option>
                          </select>
                        </label>
                      </div>
                      {guides.find((g) => g.id === filters.workload) && (
                        <label className="scenario-select" htmlFor="scenario">
                          <span>نوع پروژه</span>
                          <select
                            id="scenario"
                            value={filters.scenario}
                            onChange={(e) => update("scenario", e.target.value)}
                          >
                            <option value="general">هنوز مشخص نیست</option>
                            {guides
                              .find((g) => g.id === filters.workload)!
                              .scenarios.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      )}
                      <WorkloadRequirements
                        value={!loading ? results?.requirements : undefined}
                        questions
                      />
                      <p className="configuration-help" id="workload-help">
                        کاربرد و نوع پروژه، کف منابع را تنظیم می‌کنند. ظرفیت
                        نهایی به داده‌ها، بار و نرم‌افزار پروژه بستگی دارد.
                      </p>
                    </section>
                    <section
                      className="configuration-group"
                      aria-labelledby="resources-group-title"
                    >
                      <h3 id="resources-group-title">
                        <Cpu size={18} /> منابع مورد نیاز
                      </h3>
                      <div className="parameter-grid resource-selectors">
                        {(["ram", "disk", "cpu"] as ResourceField[]).map(
                          (key) => {
                            const value = filters[key];
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
                                    (n): n is number =>
                                      n !== null &&
                                      n > 0 &&
                                      n >=
                                        (results?.requirements?.minimum[key] ||
                                          0),
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
                                  <option value="">
                                    {filters.q && Number(applied[key]) > 0
                                      ? `از عبارت: ${fa(Number(applied[key]))} ${key === "cpu" ? "هسته" : "گیگابایت"}`
                                      : "کف کاربرد؛ بدون مقدار بیشتر"}
                                  </option>
                                  {(filters.q || value === "all") && (
                                    <option value="all">
                                      فقط کف کاربرد؛ بدون مقدار عبارت
                                    </option>
                                  )}
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
                        منابع انتخابی حداقل‌اند؛ نزدیک‌ترین پلن‌های کافی اول
                        نمایش داده می‌شوند.
                      </p>
                    </section>
                    <details className="sizing-inputs">
                      <summary>
                        حجم داده، رشد و نیازهای اندازه‌گیری‌شده (اختیاری)
                      </summary>
                      <p className="configuration-help">
                        فقط مقدارهایی را که می‌دانی وارد کن؛ خالی یعنی نامشخص.
                        تعداد محصول به حجم ساختگی تبدیل نمی‌شود.
                      </p>
                      <div className="parameter-grid">
                        {(
                          [
                            ["dataGB", "حجم فعلی فایل و دیتابیس (GB)", 100000],
                            [
                              "growthGB",
                              "رشد مورد انتظار در دورهٔ انتخابی (GB)",
                              100000,
                            ],
                            [
                              "backupCopies",
                              "تعداد نسخهٔ بکاپ روی همین دیسک",
                              30,
                            ],
                            ["minDisk", "حداقل دیسک مورد نیاز (GB)", 100000],
                            ["minRam", "حداقل رم اندازه‌گیری‌شده (GB)", 4096],
                            ["minCpu", "حداقل هستهٔ مورد نیاز", 1024],
                          ] as [keyof Filters, string, number][]
                        ).map(([key, label, max]) => (
                          <label key={key} htmlFor={`sizing-${key}`}>
                            <span>{label}</span>
                            <input
                              id={`sizing-${key}`}
                              type="number"
                              min="0"
                              max={max}
                              step={key === "backupCopies" ? "1" : "any"}
                              value={filters[key]}
                              placeholder="نامشخص"
                              onChange={(e) => update(key, e.target.value)}
                            />
                          </label>
                        ))}
                      </div>
                      <label className="sizing-gpu">
                        <input
                          type="checkbox"
                          checked={filters.gpu === "true"}
                          onChange={(e) =>
                            update("gpu", String(e.target.checked))
                          }
                        />{" "}
                        به GPU نیاز دارم (ظرفیت تأییدشده در کاتالوگ نداریم)
                      </label>
                    </details>
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
                            <option value="">
                              {filters.q && applied.maxPrice !== undefined
                                ? `از عبارت: ${formatPrice(Number(applied.maxPrice))} تومان`
                                : "بدون محدودیت"}
                            </option>
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
                                  {formatPrice(n)} تومان
                                </option>
                              ))}
                          </select>
                        </label>
                        <div className="provider-picker">
                          <span id="provider-label">ارائه‌دهنده‌ها</span>
                          <details
                            ref={providerPicker}
                            onKeyDown={(event) => {
                              if (
                                event.key === "Escape" &&
                                providerPicker.current?.open
                              ) {
                                event.preventDefault();
                                providerPicker.current.open = false;
                                providerPicker.current
                                  .querySelector("summary")
                                  ?.focus();
                              }
                            }}
                          >
                            <summary aria-labelledby="provider-label provider-selection">
                              <span id="provider-selection">
                                {filters.provider
                                  ? providers
                                      .filter((p) =>
                                        filters.provider
                                          .split(",")
                                          .includes(p.id),
                                      )
                                      .map((p) => p.name)
                                      .join("، ")
                                  : "همهٔ ارائه‌دهنده‌ها"}
                              </span>
                              <ChevronDown size={16} />
                            </summary>
                            <fieldset className="provider-options">
                              <legend className="sr-only">
                                انتخاب چند ارائه‌دهنده
                              </legend>
                              <div className="provider-options-heading">
                                <span>چند گزینه را انتخاب کن</span>
                                <button
                                  type="button"
                                  onClick={() => update("provider", "")}
                                  disabled={!filters.provider}
                                >
                                  انتخاب همه
                                </button>
                              </div>
                              {providers.map((p) => (
                                <label key={p.id}>
                                  <input
                                    type="checkbox"
                                    aria-label={p.name}
                                    checked={filters.provider
                                      .split(",")
                                      .includes(p.id)}
                                    onChange={(e) =>
                                      update(
                                        "provider",
                                        (e.target.checked
                                          ? [
                                              ...filters.provider
                                                .split(",")
                                                .filter(Boolean),
                                              p.id,
                                            ]
                                          : filters.provider
                                              .split(",")
                                              .filter((id) => id !== p.id)
                                        ).join(","),
                                      )
                                    }
                                  />
                                  <ProviderLogo provider={p} small />
                                  <span>{p.name}</span>
                                </label>
                              ))}
                            </fieldset>
                          </details>
                        </div>
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
                        <label
                          className="configuration-ip"
                          htmlFor="include-ip"
                        >
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
                            <option value="price-desc">بیشترین هزینه</option>
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
                        ) : error ? (
                          <Info size={16} />
                        ) : (
                          <CheckCircle2 size={16} />
                        )}
                        {loading
                          ? "در حال دریافت پیشنهادها…"
                          : error
                            ? "دریافت پیشنهادها انجام نشد"
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
              </details>
              {!loading && !error && appliedLabels.length > 0 && (
                <div className="applied-filters" role="status">
                  <span>فیلترهای اعمال‌شده:</span>
                  {appliedLabels.map((label) => (
                    <span className="applied-filter" key={label}>
                      {label}
                    </span>
                  ))}
                  {results?.intent.semanticType && (
                    <small>
                      <Sparkles size={13} /> نوع سرویس از مفهوم عبارت تشخیص داده
                      شد.
                    </small>
                  )}
                  <button type="button" className="text-button" onClick={reset}>
                    <X size={14} /> پاک کردن همه
                  </button>
                </div>
              )}
            </section>
            <div className="catalog-heading" ref={resultsRef}>
              <div>
                <h2>
                  {view === "saved"
                    ? "ذخیره‌های تو"
                    : "پیکربندی مناسب تو اینجاست"}{" "}
                  <span>
                    {results && !loading ? fa(results.groups.length) : "—"}{" "}
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
                            ? "مطابق حداقل منابع شما"
                            : "پیشنهادهای مطابق فیلترها"}
                        </h3>
                        <p>
                          {Object.keys(results.resourceFilters).length
                            ? "نزدیک‌ترین منابع اول؛ در نزدیکی برابر، ترتیب قیمت اعمال می‌شود."
                            : "کف منابع کاربرد در این پیشنهادها رعایت شده؛ جزئیات سازگاری را بررسی کن."}
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
                          : filters.type === "dedicated"
                            ? "هنوز پلن سرور اختصاصی نداریم"
                            : "پلنی با این شرایط پیدا نشد"}
                      </h3>
                      <p>
                        {view === "saved"
                          ? "کنار پیکربندی‌های موردعلاقه‌ات، نشان ذخیره را بزن."
                          : filters.type === "dedicated"
                            ? "کاتالوگ فعلی شامل هاست و سرور مجازی است. پلن اختصاصی پس از دریافت و تأیید منبع رسمی اضافه می‌شود."
                            : "حداقل منابع یا سقف بودجه را تغییر بده."}
                      </p>
                      {!results?.similarGroups.length && (
                        <button
                          className="primary"
                          onClick={() => {
                            go("discover");
                            reset();
                          }}
                        >
                          دیدن همهٔ سرویس‌ها <ArrowLeft size={17} />
                        </button>
                      )}
                    </div>
                  )
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
                              {g.type === "dedicated"
                                ? "سرور اختصاصی"
                                : g.type === "vps"
                                  ? "سرور مجازی"
                                  : "میزبانی وب"}
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
                              <bdi className="price-number" dir="ltr">
                                {formatPrice(g.min)}
                              </bdi>{" "}
                              <small>تومان</small>
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
                                  <b>
                                    <bdi className="price-number" dir="ltr">
                                      {formatPrice(o.estimate.total)}
                                    </bdi>
                                  </b>
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
                    href={outboundLink(p.url, "provider")}
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
                      <a
                        href={outboundLink(s.url, "source")}
                        target="_blank"
                        rel="noreferrer"
                      >
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
          <span className="footer-credit">
            توسعه توسط{" "}
            <a
              href={outboundLink("https://abeheshti.ir", "footer")}
              target="_blank"
              rel="noreferrer"
            >
              علی بهشتی · <bdi>abeheshti.ir</bdi>
            </a>
          </span>
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
      <ChatAssistant
        filters={{
          ...filters,
          provider: filters.provider.split(",").filter(Boolean),
          traffic: Number(traffic),
          ip,
        }}
        onApply={(next: ChatFilters) => {
          setView("discover");
          setDraftQuery("");
          setFilters({
            ...defaults,
            ...Object.fromEntries(
              Object.keys(defaults)
                .filter((key) => key in next && key !== "provider")
                .map((key) => [
                  key,
                  next[key as keyof ChatFilters] === null
                    ? ""
                    : String(next[key as keyof ChatFilters]),
                ]),
            ),
            type: next.type,
            region: next.region,
            workload: next.workload,
            provider: next.provider.join(","),
            ram: next.ram === null ? "" : String(next.ram),
            cpu: next.cpu === null ? "" : String(next.cpu),
            disk: next.disk === null ? "" : String(next.disk),
            maxPrice: next.maxPrice === null ? "" : String(next.maxPrice),
            sort: next.sort,
          });
          setTraffic(String(next.traffic));
          setIp(next.ip);
          requestAnimationFrame(() =>
            resultsRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            }),
          );
        }}
      />
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
              {current.type !== "hosting" &&
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
              پرداخت دوره:{" "}
              <strong>
                <bdi className="price-number" dir="ltr">
                  {formatPrice(o.estimate.upfront)}
                </bdi>{" "}
                تومان
              </strong>{" "}
              برای {fa(o.period)} ماه{" "}
              {o.vatRate !== null ? "با مالیات ذکرشده" : ""}
            </div>
          )}
          <div className="verification">
            <Clock3 size={13} />
            <span>تأیید تعرفه: {datetime(o.verifiedAt)}</span>
            <a
              href={outboundLink(o.url, "offer-source")}
              target="_blank"
              rel="noreferrer"
            >
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
                    {date(h.createdAt)}:{" "}
                    <bdi className="price-number" dir="ltr">
                      {formatPrice(h.oldPrice)}
                    </bdi>{" "}
                    ←{" "}
                    <bdi className="price-number" dir="ltr">
                      {formatPrice(h.newPrice)}
                    </bdi>{" "}
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
              <b>
                <bdi className="price-number" dir="ltr">
                  {formatPrice(part.amount)}
                </bdi>
              </b>
            </div>
          ))}
          <div className="cost-total">
            <span>برآورد ماهانه</span>
            <strong>
              <bdi className="price-number" dir="ltr">
                {formatPrice(o.estimate.total)}
              </bdi>{" "}
              <small>تومان</small>
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
            href={appPath(`/go/${o.id}`)}
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
