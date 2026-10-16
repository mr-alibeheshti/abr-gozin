import { outboundLink } from "../shared/outbound-link.ts";

export type SizingSource = {
  name: string;
  url: string;
  finding: string;
  reviewedAt: string;
};
export type WorkloadGuide = {
  id: string;
  name: string;
  type: string;
  scenarios: { id: string; name: string }[];
};
export type Requirements = {
  workload: string;
  scenario: string;
  name: string;
  revision: string;
  minimum: { disk: number; ram: number; cpu: number };
  rationale: string;
  caveat: string;
  checks: string[];
  sources: SizingSource[];
  conflicts: string[];
  blockers: string[];
  questions: Record<string, string>;
  excludedOffers?: number;
  calculation: null | { explanation: string; requiredDisk: number };
};
const fa = (n: number) => new Intl.NumberFormat("fa-IR").format(n);
export function WorkloadRequirements({
  value,
  questions = false,
}: {
  value?: Requirements;
  questions?: boolean;
}) {
  if (
    !value ||
    (value.workload === "all" &&
      !value.blockers.length &&
      !Object.values(value.minimum).some(Boolean))
  )
    return null;
  return (
    <aside
      className="workload-requirements"
      aria-label="راهنمای منابع این کاربرد"
    >
      <strong>کف بررسی اولیه برای {value.name}</strong>
      <div className="sizing-minimums">
        {value.minimum.disk > 0 && (
          <span>دیسک ≥ {fa(value.minimum.disk)} GB</span>
        )}
        {value.minimum.ram > 0 && <span>رم ≥ {fa(value.minimum.ram)} GB</span>}
        {value.minimum.cpu > 0 && (
          <span>پردازنده ≥ {fa(value.minimum.cpu)} هسته</span>
        )}
      </div>
      <p>{value.rationale}</p>
      {value.calculation && (
        <p>
          {value.calculation.explanation} فضای نهایی:{" "}
          {fa(value.calculation.requiredDisk)} گیگابایت.
        </p>
      )}
      {!!value.excludedOffers && (
        <p>
          {fa(value.excludedOffers)} پلن با منابع کمتر یا اعلام‌نشده از نتایج
          کنار گذاشته شد.
        </p>
      )}
      {[...value.conflicts, ...value.blockers].map((text) => (
        <p className="sizing-conflict" role="status" key={text}>
          {text}
        </p>
      ))}
      <details>
        <summary>نیازهای مهم و منابع رسمی</summary>
        <p>{value.caveat}</p>
        <ul>
          {value.checks.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
        {questions && (
          <>
            <b>پیش از انتخاب مشخص کن:</b>
            <ul>
              {Object.values(value.questions).map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
            <p>برای پاسخ‌دادن مرحله‌به‌مرحله، دستیار انتخاب سرویس را باز کن.</p>
          </>
        )}
        <ul className="sizing-sources">
          {value.sources.map((source) => (
            <li key={source.url}>
              <a
                href={outboundLink(source.url, "workload-requirements")}
                target="_blank"
                rel="noreferrer"
              >
                {source.name}
              </a>
              <p>{source.finding}</p>
            </li>
          ))}
        </ul>
        <small>
          تاریخ بررسی منابع:{" "}
          {new Date(value.revision + "T12:00:00Z").toLocaleDateString("fa-IR")}
        </small>
      </details>
    </aside>
  );
}
