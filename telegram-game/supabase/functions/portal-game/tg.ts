import type { Tg } from "./core.ts";

type FetchFn = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<Response>;

/** A minimal Bot API client. Errors carry Telegram's description and never the token. */
export function makeTg(token: string, fetchFn: FetchFn = fetch as unknown as FetchFn): Tg {
  return {
    async call(method, params) {
      let body: any;
      try {
        const res = await fetchFn(`https://api.telegram.org/bot${token}/${method}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(params),
        });
        body = await res.json();
      } catch {
        // The original error can contain the request URL, and the URL contains the token.
        throw new Error(`${method}: request to Telegram failed`);
      }
      if (!body?.ok) throw new Error(String(body?.description ?? `${method} failed`));
      return body.result;
    },
  };
}
