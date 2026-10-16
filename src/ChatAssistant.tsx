import { useEffect, useRef, useState } from "react";
import { formatPrice } from "./format-price";
import { outboundLink } from "../shared/outbound-link.ts";
import { ChatNeedsForm } from "./ChatNeedsForm";
import {
  MessageCircle,
  X,
  Send,
  Sparkles,
  LoaderCircle,
  ArrowUpLeft,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";

import {
  WorkloadRequirements,
  type Requirements,
} from "./WorkloadRequirements";
type Needs = Record<
  "purpose" | "quantity" | "storage" | "load" | "features",
  string | null
>;
const emptyNeeds = (): Needs => ({
  purpose: null,
  quantity: null,
  storage: null,
  load: null,
  features: null,
});
export type ChatFilters = {
  scenario: string;
  resourceMode: string;
  minDisk: number | null;
  minRam: number | null;
  minCpu: number | null;
  dataGB: number | null;
  growthGB: number | null;
  backupCopies: number | null;
  gpu: boolean;
  type: string;
  workload: string;
  region: string;
  provider: string[];
  ram: number | null;
  cpu: number | null;
  disk: number | null;
  maxPrice: number | null;
  sort: string;
  traffic: number;
  ip: boolean;
};
type Recommendation = {
  id: string;
  name: string;
  provider: string;
  type: string;
  cpu: number | null;
  ram: number | null;
  disk: number;
  region: string;
  monthly: number;
  upfront: number;
  period: number;
  verifiedAt: string;
  warnings: string[];
  sourceUrl: string;
  href: string;
};
type Answer = {
  reply: string;
  needs: Needs;
  canApply: boolean;
  assessment: {
    ready: boolean;
    pending: { key: string; text: string }[];
    requirements: Requirements;
  };
  filters: ChatFilters;
  recommendations: Recommendation[];
  model: string;
  catalogCount: number;
};
type Turn = { role: "user" | "assistant"; content: string; answer?: Answer };
type ChatStatus = {
  configured: boolean;
  provider: string;
  model: string;
  message: string;
  timeoutMs: number;
};
const fa = (value: number) => new Intl.NumberFormat("fa-IR").format(value);
const starts = [
  "هاست می‌خوام",
  "برای بک‌اند سرور مجازی می‌خوام",
  "سرور اختصاصی می‌خوام",
];
export function ChatAssistant({
  filters,
  onApply,
}: {
  filters: Record<string, unknown>;
  onApply: (filters: ChatFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [messages, setMessages] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [useFreeText, setUseFreeText] = useState(false);
  const [failedMessage, setFailedMessage] = useState("");
  const [waitingLong, setWaitingLong] = useState(false);
  const [conversationFilters, setConversationFilters] =
    useState<ChatFilters | null>(null);
  const [conversationNeeds, setConversationNeeds] = useState<Needs>(emptyNeeds);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const request = useRef<AbortController | null>(null);
  const formContext = JSON.stringify(filters);
  const latestAnswer = messages[messages.length - 1]?.answer;
  const showNeedsForm = Boolean(
    latestAnswer &&
    !latestAnswer.assessment.ready &&
    latestAnswer.assessment.pending.length &&
    (latestAnswer.filters.type !== "all" ||
      latestAnswer.filters.workload !== "all") &&
    !useFreeText,
  );
  useEffect(() => setUseFreeText(false), [messages.length]);
  useEffect(() => {
    if (useFreeText) input.current?.focus();
  }, [useFreeText]);
  useEffect(() => {
    setConversationFilters(null);
    setConversationNeeds(emptyNeeds());
  }, [formContext]);
  useEffect(
    () => () => {
      const active = request.current;
      request.current = null;
      active?.abort();
    },
    [],
  );
  useEffect(() => {
    setWaitingLong(false);
    if (!pending) return;
    const timer = setTimeout(() => setWaitingLong(true), 7000);
    return () => clearTimeout(timer);
  }, [pending]);
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    input.current?.focus();
    const controller = new AbortController();
    fetch("/api/chat/status", {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("وضعیت دستیار دریافت نشد.");
        setStatus(await res.json());
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError("وضعیت دستیار دریافت نشد؛ چت را ببند و دوباره باز کن.");
      });
    return () => controller.abort();
  }, [open]);
  useEffect(() => {
    if (open) end.current?.scrollIntoView({ block: "end" });
  }, [messages, pending, error, open]);
  function close() {
    dialog.current?.close();
    setOpen(false);
    launcher.current?.focus();
  }
  async function send(text = draft) {
    const content = text.trim();
    if (!content || request.current || !status?.configured) return;
    const history = messages
      .slice(-14)
      .map(({ role, content }) => ({ role, content }));
    // Bound history by both turns and characters; always retain complete pairs.
    while (
      history.reduce((sum, m) => sum + m.content.length, content.length) >
        15000 &&
      history.length
    )
      history.splice(0, 2);
    const sent = [...history, { role: "user" as const, content }];
    setPending(content);
    setDraft("");
    setError("");
    setFailedMessage("");
    const controller = new AbortController();
    request.current = controller;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: sent,
          filters: conversationFilters || filters,
          needs: conversationNeeds,
        }),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout((status.timeoutMs || 20000) + 3000),
        ]),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "گفت‌وگو انجام نشد.");
      const answer = data as Answer;
      setMessages(
        (previous) =>
          [
            ...previous,
            { role: "user", content },
            { role: "assistant", content: answer.reply, answer },
          ].slice(-60) as Turn[],
      );
      setConversationFilters(answer.filters);
      setConversationNeeds(answer.needs);
    } catch (e) {
      if (request.current === controller) {
        setError(
          controller.signal.aborted
            ? "دریافت پاسخ متوقف شد. پیام تو حفظ شده است."
            : (e as Error).name === "TimeoutError"
              ? "پاسخ طول کشید؛ پیام تو حفظ شده است. دوباره تلاش کن."
              : (e as Error).message,
        );
        setDraft(content);
        setFailedMessage(content);
      }
    } finally {
      if (request.current === controller) {
        setPending("");
        request.current = null;
        input.current?.focus();
      }
    }
  }
  return (
    <>
      <button
        ref={launcher}
        className="chat-launcher"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <MessageCircle size={21} />
        <span>دستیار انتخاب سرویس</span>
        <Sparkles size={15} />
      </button>
      <dialog
        ref={dialog}
        className="chat-dialog"
        aria-labelledby="chat-title"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
      >
        <header className="chat-header">
          <span className="chat-avatar">
            <Sparkles size={22} />
          </span>
          <div>
            <h2 id="chat-title">با هم سرویس مناسب را پیدا کنیم</h2>
            <p>راهنمای هوشمند ابرگزین</p>
          </div>
          <button
            className="icon-button"
            aria-label="گفت‌وگوی تازه"
            disabled={Boolean(pending) || !messages.length}
            onClick={() => {
              setMessages([]);
              setConversationFilters(null);
              setConversationNeeds(emptyNeeds());
              setDraft("");
              setError("");
              setFailedMessage("");
              input.current?.focus();
            }}
          >
            <RotateCcw size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="بستن گفت‌وگو"
            onClick={close}
          >
            <X size={20} />
          </button>
        </header>
        <div
          className="chat-transcript"
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
        >
          {!messages.length && !pending && (
            <div className="chat-welcome">
              <span className="chat-welcome-icon">
                <MessageCircle size={28} />
              </span>
              <h3>از چیزی که می‌خواهی اجرا کنی شروع کن.</h3>
              <p>
                نیازت را بگو؛ دربارهٔ منابع، موقعیت و بودجه صحبت می‌کنیم و
                پیشنهادهای کاتالوگ را کنار هم می‌بینیم.
              </p>
              <div className="chat-starters">
                {starts.map((text) => (
                  <button
                    key={text}
                    type="button"
                    disabled={Boolean(pending) || !status?.configured}
                    onClick={() => void send(text)}
                  >
                    {text}
                    <ArrowUpLeft size={14} />
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((turn, index) => (
            <div key={index} className={"chat-turn " + turn.role}>
              <span className="chat-speaker">
                {turn.role === "user" ? "شما" : "دستیار ابرگزین"}
              </span>
              <p>{turn.content}</p>
              {turn.answer?.canApply && (
                <WorkloadRequirements
                  value={turn.answer.assessment.requirements}
                />
              )}
              {turn.answer?.recommendations.map((offer) => (
                <article className="chat-recommendation" key={offer.id}>
                  <div>
                    <strong>{offer.provider}</strong>
                    <span>{offer.name}</span>
                  </div>
                  <p>
                    {offer.ram === null
                      ? "رم نامشخص"
                      : fa(offer.ram) + " GB رم"}{" "}
                    · {fa(offer.disk)} GB دیسک
                    {offer.cpu !== null && " · " + fa(offer.cpu) + " هسته"}
                  </p>
                  <strong className="chat-offer-price">
                    <bdi className="price-number" dir="ltr">
                      {formatPrice(offer.monthly)}
                    </bdi>{" "}
                    <small>تومان / ماه، برآورد</small>
                  </strong>
                  {offer.period > 1 && (
                    <small>
                      پرداخت {fa(offer.period)} ماهه؛ مبلغ پایهٔ دوره:{" "}
                      <bdi className="price-number" dir="ltr">
                        {formatPrice(offer.upfront)}
                      </bdi>{" "}
                      تومان
                    </small>
                  )}
                  <small>
                    تأیید تعرفه:{" "}
                    {new Date(offer.verifiedAt).toLocaleDateString("fa-IR", {
                      timeZone: "Asia/Tehran",
                    })}
                  </small>
                  {!!offer.warnings.length && (
                    <small className="chat-offer-warning">
                      {offer.warnings.join(" ")}
                    </small>
                  )}
                  <a
                    href={outboundLink(offer.href, "chat")}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    بررسی در سایت ارائه‌دهنده <ArrowUpLeft size={14} />
                  </a>
                </article>
              ))}
              {turn.answer?.canApply && (
                <button
                  className="chat-apply"
                  onClick={() => {
                    onApply(turn.answer!.filters);
                    close();
                  }}
                >
                  <SlidersHorizontal size={15} />
                  اعمال این انتخاب‌ها در نتایج
                </button>
              )}
            </div>
          ))}
          {showNeedsForm && latestAnswer && (
            <ChatNeedsForm
              key={messages.length}
              questions={latestAnswer.assessment.pending}
              workload={latestAnswer.filters.workload}
              scenario={latestAnswer.filters.scenario}
              needsBudget={latestAnswer.filters.maxPrice === null}
              disabled={Boolean(pending) || !status?.configured}
              pending={Boolean(pending)}
              onSubmit={send}
              onWriteMessage={() => setUseFreeText(true)}
            />
          )}
          {pending && (
            <>
              <div className="chat-turn user">
                <span className="chat-speaker">شما</span>
                <p>{pending}</p>
              </div>
              <div className="chat-thinking" role="status">
                <LoaderCircle className="spin" size={17} />
                <span>
                  در حال پردازش
                  {waitingLong && (
                    <small>
                      پاسخ سرویس کمی طول کشیده؛ می‌توانی دریافت را متوقف کنی.
                    </small>
                  )}
                </span>
                <button
                  type="button"
                  className="chat-stop"
                  onClick={() => request.current?.abort()}
                >
                  توقف
                </button>
              </div>
            </>
          )}
          {status && !status.configured && (
            <p className="chat-notice" role="status">
              {status.message}
            </p>
          )}
          {error && (
            <div className="chat-error" role="alert">
              <p>{error}</p>
              {status?.configured && failedMessage && (
                <button
                  onClick={() => send(failedMessage)}
                  disabled={Boolean(pending)}
                >
                  تلاش دوباره
                </button>
              )}
            </div>
          )}
          <div ref={end} />
        </div>
        {!showNeedsForm && (
          <form
            className="chat-compose"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label className="sr-only" htmlFor="chat-message">
              پیام به دستیار
            </label>
            <textarea
              ref={input}
              id="chat-message"
              value={draft}
              readOnly={Boolean(pending)}
              maxLength={2000}
              rows={2}
              placeholder="مثلاً هاست وردپرس می‌خوام"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing
                ) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button
              type="submit"
              className="chat-send"
              aria-label="ارسال پیام"
              disabled={
                !draft.trim() || Boolean(pending) || !status?.configured
              }
            >
              {pending ? (
                <LoaderCircle className="spin" size={19} />
              ) : (
                <Send size={19} />
              )}
            </button>
          </form>
        )}
      </dialog>
    </>
  );
}
