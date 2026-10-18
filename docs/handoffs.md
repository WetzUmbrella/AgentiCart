# Hand-off register

Sender marks **Delivered**. Only the receiver marks **Accepted**, after running the check. Read out at the Wed check-in; anything not Accepted by the Sun 1 Nov run-through goes to a cut decision.

The code for most routes and scripts already exists in this repo. A hand-off is now mainly "configured, tested on real data, and accepted by the receiver".

| ID | From → To | Artefact | Due | Receiver's check | Status |
|---|---|---|---|---|---|
| H01 | A → B, C, D | Sandbox Client ID/Secret, shopper + merchant logins (private message) | Mon 19 Oct | C logs into sandbox.paypal.com as the shopper | |
| H02 | A → all | Repo, MIT licence, `main` protected, D has admin | Mon 19 Oct | Each person's first PR merged | |
| H03 | B → all | Exact Gemini model names; billed project owner and spend cap named | Tue 20 Oct | D records names for Devpost | |
| H04 | D → B | One real catalogue entry plus spec file | Tue 20 Oct | Spec file loads in `npm run check-catalogue` | |
| H05 | D → B | Seed pack: 5 cases in `data/seed.json` plus their spec files | Wed 21 Oct | `npm run testset -- data/seed.json` runs | |
| H08 | A, B → all | Go/no-go rows in `docs/go-no-go.md` | Sat 24 Oct | Every row has evidence | |
| H09 | D → all | Full catalogue, every spec file present, `verified_by_d: true` | Sun 25 Oct | `npm run check-catalogue` passes | |
| H10 | A or D → all | Render deploy with env vars | Sun 25 Oct | Hosted URL loads | |
| H11 | D → B | 20 held-out cases in `data/testset.json` | Wed 28 Oct | Script parses them; C spot-checks 5 by Fri 30 | |
| H12 | B → A | `npm run test-ship` 5/5 in live mode | Wed 28 Oct | A re-runs it with A watching the server log | |
| H13 | D + B → C | `docs/demo-bundle.md` confirmed in live mode | Wed 28 Oct | Grid shows those exact products | |
| H16 | B → C | Live `/api/bundle` timing recorded | Fri 30 Oct | Demo goal returns within an acceptable time | |
| H17 | A → C, D | Full sandbox money run; screenshot in `05_Submission/` | Sat 31 Oct | Only matching lines charged in the receiving account | |
| H20 | A → D | API table checked; judge shopper login | Tue 3 Nov | README claims match the code | |
| H21 | B → D | `results/testset-YYYY-MM-DD.txt` committed | Thu 5 Nov | README score matches the file | |
| H22 | C → D | UI polished at 1280x720 | Thu 5 Nov | D runs the demo script with only the UI | |
| H23 | all → D | Frozen hosted build | Sat 7 Nov | Clean run on Sun 8 Nov | |
| H24 | D → all | Video v1 | Tue 10 Nov | Each owner signs off their segment | |
| H25 | all → D | Devpost usernames | Tue 10 Nov | Names on the project page | |
