# TrustTalk AI — Hackathon Prototype

TrustTalk helps people pause, understand concerning message patterns, and start respectful conversations.

## Features

- **Safety check:** rule-based and optional AI-assisted analysis, highlighted evidence, severity labels, explanations, and suggested next steps.
- **Conversation Studio:** generates three low-pressure openers based on a profile bio, message, and selected tone.
- **Overview dashboard:** scan counts, high-risk flag counts, and recent scan history. Up to 30 scan records are saved in this browser's local storage; use **Clear history** on shared devices.
- **Chat demo:** a clearly labelled simulated conversation for demos.
- **Real user chat:** optional registration/login and live messaging between two demo accounts using Socket.IO.

## Run locally

Requirements: Node.js 18+ and npm.

```bash
npm install
npm run dev
```

Vite serves the frontend (usually `http://localhost:5173`) and `concurrently` starts the Express API. The Vite proxy forwards `/api` and `/socket.io` to the backend on port 5000.

If you use optional AI-backed conversation openers, copy `.env.example` to `.env` and set `AI_API_URL`, `AI_API_KEY`, and `AI_MODEL`. Never commit `.env` or share your API key.

## Demo flow for judges

1. Open **Overview** and note the empty scan history.
2. Go to **Safety check**, choose **Try a sample**, and run the scan.
3. Return to **Overview** to show the new history record and risk summary.
4. Open **Find your words**, enter a profile bio and choose a tone, then generate openers.
5. Open **Chat demo** to show the simulated chat. For real messaging, register two different accounts in separate browser profiles/incognito windows and select the other account.

## Important limitations

- The scanner is a checklist of language patterns, not an identity verifier or a definitive scam detector. It can miss harmful messages and can flag innocent wording.
- “Confidence” is a rule-match estimate, not the probability that a person is fraudulent.
- Scan history is stored in browser local storage and can contain text entered into the scanner. Avoid sensitive data and clear history on shared devices.
- The real-chat starter stores accounts and messages in a local JSON file for development. Before public deployment, use a production database, HTTPS, restricted CORS, rate limiting, robust session/token management, account deletion, and a security review. Do not use real personal data in this demo.


### Safety scanner update

The safety check now accepts a profile bio, a message, or both together. The backend scans the combined text for the existing evidence-first rules and returns which input types were checked. Treat findings as prompts to pause and verify—not as a verdict about a person.

## Evaluation Lab (new)

Open **Test lab** from the workspace navigation and select **Run all 8 tests**. The suite sends synthetic sample messages to the same `/api/analyze` endpoint used by the safety checker. It reports:

- **Passed**: the result matched the test's expected signal/no-signal outcome.
- **Missed warnings**: a test expected a signal but no rule matched.
- **False alarms**: a normal-message test unexpectedly triggered a rule.

This is a small regression/smoke test for the current rules, not a real-world accuracy benchmark. Do not present its pass rate as model accuracy. Expand the test cases with varied wording and independently reviewed examples before making performance claims.
