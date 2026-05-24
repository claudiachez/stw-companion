const FINNHUB_KEY = 'cuhkqs1r01qva71u3eugcuhkqs1r01qva71u3ev0'
const FINNHUB_BASE = 'https://finnhub.io/api/v1'

export interface FinnhubQuote {
  c: number  // current price
  dp: number // percent change
  h: number  // high
  l: number  // low
  t: number  // timestamp
}

export async function fetchPrice(ticker: string): Promise<FinnhubQuote | null> {
  try {
    const url = `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_KEY}`
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()

    if (!data || typeof data.c !== 'number' || data.c === 0) {
      return null
    }

    return {
      c: data.c,
      dp: data.dp,
      h: data.h,
      l: data.l,
      t: data.t,
    }
  } catch {
    return null
  }
}
