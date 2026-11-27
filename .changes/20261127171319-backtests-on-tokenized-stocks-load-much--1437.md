---
bump: patch
section: Fixed
---
- Backtests on tokenized stocks load much faster: candle pages now overlap by one bar, so weekend and overnight closures are bridged in place instead of each being re-requested after the progress bar already shows the pair as loaded
