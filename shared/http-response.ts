function responseError(status: number, fallback: string): string {
  if (status === 408 || status === 504)
    return "پاسخ سرور طول کشید؛ دوباره تلاش کن.";
  if (status === 502 || status === 503)
    return "سرویس موقتاً در دسترس نیست؛ دوباره تلاش کن.";
  return fallback;
}

export async function readApiResponse<T>(
  response: Response,
  fallback = "ارتباط با سرور برقرار نشد؛ دوباره تلاش کن.",
): Promise<T> {
  // A CDN timeout can return HTML. Never show its markup or a JSON parser error.
  if (!response.headers.get("content-type")?.includes("application/json")) {
    await response.body?.cancel();
    throw new Error(responseError(response.status, fallback));
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(responseError(response.status, fallback));
  }
  if (!response.ok)
    throw new Error(
      typeof data?.error === "string" && data.error.trim()
        ? data.error
        : responseError(response.status, fallback),
    );
  return data as T;
}
