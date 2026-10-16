import { useState, type ChangeEvent } from "react";
import { ArrowUpLeft, LoaderCircle, MessageCircle } from "lucide-react";
import { formatPrice } from "./format-price";
import "./chat-needs-form.css";

type Question = { key: string; text: string };
type Field = Question & {
  label: string;
  placeholder: string;
  multiline?: boolean;
  optional?: boolean;
};
const fieldDetails: Record<string, Omit<Field, "key" | "text">> = {
  purpose: {
    label: "نوع کار",
    placeholder: "مثلاً سایت وردپرسی یا بک‌اند",
  },
  budget: { label: "بودجهٔ ماهانه (تومان)", placeholder: "مثلاً 700,000" },
  quantity: {
    label: "تعداد و اندازهٔ پروژه",
    placeholder: "مثلاً ۳ برنامه و ۱ دیتابیس",
  },
  storage: {
    label: "حجم فایل‌ها و رشد آن‌ها",
    placeholder: "مثلاً ۱۰ GB؛ رشد ماهانه ۱ GB",
  },
  load: {
    label: "بازدید یا کاربران هم‌زمان",
    placeholder: "مثلاً روزانه ۵۰۰ بازدید",
  },
  features: {
    label: "توضیحات و نیازهای خاص",
    placeholder: "مثلاً افزونه یا دسترسی خاص",
    multiline: true,
  },
  capacity: {
    label: "جزئیات منابع مورد نیاز",
    placeholder: "مثلاً حداقل ۴ GB رم",
    multiline: true,
  },
};
const latinDigits = (text: string) =>
  text
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[,٬،\s]/g, "");

export function ChatNeedsForm({
  questions,
  workload = "all",
  scenario = "general",
  needsBudget,
  disabled,
  pending,
  onSubmit,
  onWriteMessage,
}: {
  questions: Question[];
  workload?: string;
  scenario?: string;
  needsBudget: boolean;
  disabled: boolean;
  pending: boolean;
  onSubmit: (text: string) => Promise<void>;
  onWriteMessage: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const details = { ...fieldDetails };
  if (workload === "wordpress") {
    details.purpose = {
      label: "نوع سایت",
      placeholder: "مثلاً فروشگاهی یا خبری",
    };
    details.quantity = {
      label: "محصولات و تصاویر",
      placeholder:
        scenario === "store"
          ? "مثلاً ۲۰۰ محصول، هرکدام ۳ عکس"
          : "مثلاً ۲۰۰ محصول و ۵۰۰ تصویر",
    };
  } else {
    const quantityExamples: Record<string, string> = {
      website: "مثلاً ۱۰ صفحه و ۲۰۰ تصویر",
      docker: "مثلاً ۳ کانتینر و ۱ دیتابیس",
      backend: "مثلاً ۲ برنامه و ۱ worker",
      python: "مثلاً ۲ ربات؛ هر کار ۵ ثانیه",
      database: "مثلاً ۱۰ گیگابایت داده",
    };
    if (quantityExamples[workload])
      details.quantity = {
        ...details.quantity,
        placeholder: quantityExamples[workload],
      };
  }
  const fields: Field[] = Object.keys(details)
    .filter(
      (key) =>
        questions.some((question) => question.key === key) ||
        (key === "budget" && needsBudget),
    )
    .map((key) => ({
      key,
      ...details[key],
      text:
        key === "budget"
          ? "مبلغ کامل به تومان."
          : questions.find((question) => question.key === key)?.text || "",
    }));
  if (!fields.some((field) => field.key === "features"))
    fields.push({
      key: "notes",
      label: "توضیحات بیشتر",
      text: "نکتهٔ دیگری داری؟",
      placeholder: "مثلاً انتقال سایت",
      multiline: true,
      optional: true,
    });
  const update = (key: string, value: string) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    setError("");
  };
  return (
    <form
      className="chat-needs-form"
      hidden={pending}
      aria-labelledby="chat-needs-title"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        const budget = latinDigits(values.budget || "");
        if (
          fields.some((field) => field.key === "budget") &&
          (!/^\d+$/.test(budget) || Number(budget) <= 0 || Number(budget) > 1e9)
        ) {
          setError("بودجه را به تومان و بین 1 و 1,000,000,000 وارد کن.");
          return;
        }
        const text = fields
          .filter((field) => values[field.key]?.trim())
          .map((field) =>
            field.key === "budget"
              ? `بودجهٔ ماهانه: ${budget} تومان`
              : `${field.label}: ${values[field.key].trim()}`,
          )
          .join("\n");
        void onSubmit(text);
      }}
    >
      <div className="chat-needs-heading">
        <strong id="chat-needs-title">نیازت را کامل کن</strong>
      </div>
      <fieldset disabled={disabled}>
        <legend className="sr-only">اطلاعات پروژه و بودجه</legend>
        <div className="chat-needs-fields">
          {fields.map((field) => {
            const id = `chat-need-${field.key}`;
            const attributes = {
              id,
              value: values[field.key] || "",
              required: !field.optional,
              maxLength: field.multiline ? 300 : 180,
              placeholder: field.placeholder,
              "aria-describedby": `${id}-help`,
              onChange: (
                event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
              ) => update(field.key, event.target.value),
            };
            return (
              <div
                className={`chat-needs-field${field.multiline ? " is-wide" : ""}`}
                key={field.key}
              >
                <label htmlFor={id}>
                  {field.label}
                  {field.optional && <small>اختیاری</small>}
                </label>
                <small id={`${id}-help`} className="chat-needs-help">
                  {field.text}
                </small>
                {field.multiline ? (
                  <textarea {...attributes} rows={3} />
                ) : (
                  <input
                    {...attributes}
                    type="text"
                    inputMode={field.key === "budget" ? "numeric" : "text"}
                    autoFocus={field.key === fields[0]?.key}
                    className={
                      field.key === "budget" ? "chat-needs-budget" : undefined
                    }
                    onChange={(event) => {
                      if (field.key !== "budget")
                        return update(field.key, event.target.value);
                      const digits = latinDigits(event.target.value);
                      if (/^\d{0,10}$/.test(digits))
                        update(
                          field.key,
                          digits ? formatPrice(Number(digits)) : "",
                        );
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        {error && (
          <p className="chat-needs-error" role="alert">
            {error}
          </p>
        )}
        <div className="chat-needs-actions">
          <button type="submit" className="chat-needs-submit">
            {pending ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <ArrowUpLeft size={17} />
            )}
            {pending ? "در حال پردازش" : "ارسال اطلاعات"}
          </button>
          <button
            type="button"
            className="chat-needs-text-mode"
            onClick={onWriteMessage}
          >
            <MessageCircle size={15} />
            ادامه با پیام متنی
          </button>
        </div>
      </fieldset>
    </form>
  );
}
