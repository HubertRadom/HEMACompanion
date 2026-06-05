# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Reflected ?error= URL param is a phishing vector

- **Context**: All protected Astro pages that display `?error=` from redirect
  URLs — e.g. `src/pages/fights/*.astro`, `src/pages/gear-sets/*.astro`,
  `src/pages/gear/*.astro`. Pattern introduced in S-01 and present project-wide.
- **Problem**: Pages render `Astro.url.searchParams.get("error")` directly in
  the error banner. Astro auto-escapes so there is no XSS risk, but an attacker
  can craft a URL with arbitrary text and make the page display fake application
  errors — a social-engineering / phishing vector.
- **Rule**: [fill in — e.g. "Only render ?error= values that were written by our
  own redirect logic. Gate display on Referrer or scope it to a short-lived
  session cookie instead of a URL param."]
- **Applies to**: [fill in — e.g. "Any Astro page that surfaces a ?error= query
  param in the UI. Address as a standalone cleanup change before public launch."]
