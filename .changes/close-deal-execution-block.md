---
bump: patch
section: Changed
---
- Close deal opens on the same order execution block as the bot form (market, limit, chasing limit, split); it starts as a chasing limit from the order book with a visible market timeout, and Limit takes a price (default: the live market price) with quick buttons beside it
