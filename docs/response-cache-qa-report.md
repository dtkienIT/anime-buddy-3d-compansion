# Response and Audio Cache QA Report

Date: 2026-07-12 (Asia/Saigon)

## Scope

Verified the Supabase-backed reusable response and audio cache against the running local stack:

- Web: `http://127.0.0.1:3001`
- API: `http://127.0.0.1:3002`
- TTS: `http://127.0.0.1:8000`
- Browser: headed Google Chrome through the installed browser extension
- Character: `sam`
- Voice: enabled

## Browser Scenario

First input:

```text
xin chao ban nhe test cache hom nay
```

Normalized equivalent input:

```text
xin chào bạn nhé test cache hôm nay!!!
```

The first request generated this response and played its audio:

```text
Chào bạn nè! Hôm nay bạn muốn làm gì cùng em? Kể chuyện, nhảy múa hay cùng chia sẻ cảm xúc nào? 😊
```

The second request returned the exact same response, entered voice playback, completed playback, and returned to `IDLE`. The chat remained interactive and voice stayed enabled.

## API Evidence

The normalized-equivalent repeat returned:

```text
response-cache;dur=191.9;desc="HIT"
memory-disabled;dur=0
mistral;dur=0
total;dur=1276.6
```

A fuzzy variant with an added final word also hit the same cached response:

```text
Input: xin chao ban nhe test cache hom nay nha
response-cache;dur=227.9;desc="HIT"
memory-disabled;dur=0
mistral;dur=0
total;dur=1271.6
```

The matching TTS request returned:

```text
Status: 200
X-TTS-Cache: SUPABASE_HIT
Content-Type: audio/wav
Content-Length: 576044
```

This proves the repeat bypassed both Mistral and local TTS synthesis.

## Result

| Check | Result |
| --- | --- |
| First response rendered | PASS |
| First audio played and returned to `IDLE` | PASS |
| Diacritic/punctuation-normalized repeat | PASS |
| Fuzzy variant match | PASS |
| Cached text reused | PASS |
| Mistral bypassed on hit | PASS |
| Supabase Storage audio reused | PASS |
| Local TTS synthesis bypassed on hit | PASS |

## Observations

- Cache entries created by this first testing version use `approved = true`.
- The browser briefly displays `Đang truy xuất ký ức...` after 300 ms while a cache-hit request is still waiting for session/cache database calls. Server timing confirms that memory retrieval and Mistral were not executed. This label is cosmetic but can be made cache-aware in a later UI refinement.
- End-to-end cache-hit chat time was about 1.27 seconds in this run. The response-cache RPC itself took about 192-228 ms; the remaining time was primarily session/preference persistence work.
- Chrome contained an older `clearConversation` fetch error recorded before this scenario and a non-blocking VRMA spec-version warning. No new cache-related browser error appeared during this test.
