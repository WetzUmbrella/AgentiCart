# Test-set rules (owner: D)

- `data/seed.json`: 5 development cases. B may tune the prompt on these. They are **not** scored.
- `data/testset.json`: 20 held-out cases, written by D **before** B runs the AI on them. `npm run testset` refuses to run if a seed case id appears here.
- Mix: 8 compatible, 8 incompatible, 4 tricky.
- Tricky-case rule: if the pairing only works with an adapter that is not in the bundle, `expected_compatible` is `false`. If it works but is under-powered (e.g. high-impedance headphones on a low-power output), `expected_compatible` is `true` and `why` says so.
- Each case cites the spec-sheet line in `why`.
- Never change an answer after B has run the script, unless it was a factual mistake. Say why in the commit message.

Case shape (playbook 5.4):

```json
{ "case_id": "t01", "bundle": ["mic-at2020", "if-uca202"], "check": "mic-at2020", "expected_compatible": false, "why": "UCA202 has RCA line inputs only, no mic input or phantom power; AT2020 needs 48V phantom power over XLR." }
```
