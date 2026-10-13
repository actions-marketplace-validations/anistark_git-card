// The REST helper the Stats and City scripts share: GitHub's API with a token, waiting out rate limits.

/** Waits out rate limits (code search on a workflow token hits them often) up to three times. */
export function restClient(token: string) {
  return async function get<T>(path: string, { auth = token, accept = 'application/vnd.github+json', text = false } = {}): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(`https://api.github.com/${path}`, { headers: { Authorization: `Bearer ${auth}`, Accept: accept } });
      if (res.ok) return (text ? res.text() : res.json()) as Promise<T>;
      const body = await res.text();
      const limited = res.status === 429 || (res.status === 403 && /rate limit/i.test(body));
      if (!limited || attempt === 3) throw Object.assign(new Error(`${path}: ${res.status} ${body}`), { status: res.status });
      const seconds = Number(res.headers.get('retry-after')) || Number(/try again in ([\d.]+)s/.exec(body)?.[1]) || 60;
      console.warn(`Rate limited on ${path.split('?')[0]}, waiting ${Math.ceil(seconds)}s`);
      await new Promise((r) => setTimeout(r, Math.min(seconds, 120) * 1000 + 1000));
    }
  };
}
