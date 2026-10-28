import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'node:http';
import {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHmac
} from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';

dotenv.config();

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: true,
    credentials: true
  }
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, 'data');
const dataFile = join(dataDir, 'chat-store.json');

mkdirSync(dataDir, { recursive: true });

const store = existsSync(dataFile)
  ? JSON.parse(readFileSync(dataFile, 'utf8'))
  : { users: [], messages: [] };

function persist() {
  writeFileSync(dataFile, JSON.stringify(store, null, 2));
}

const AUTH_SECRET =
  process.env.AUTH_SECRET ||
  'change-this-development-secret-before-deploying';

function tokenFor(user) {
  const payload = Buffer.from(
    JSON.stringify({
      id: user.id,
      username: user.username,
      exp: Date.now() + 7 * 86400000
    })
  ).toString('base64url');

  return (
    payload +
    '.' +
    createHmac('sha256', AUTH_SECRET)
      .update(payload)
      .digest('base64url')
  );
}

function userFromToken(token) {
  try {
    const [payload, signature] = String(token || '').split('.');

    if (!payload || !signature) return null;

    const expected = createHmac('sha256', AUTH_SECRET)
      .update(payload)
      .digest();

    const actual = Buffer.from(signature, 'base64url');

    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      return null;
    }

    const data = JSON.parse(
      Buffer.from(payload, 'base64url').toString()
    );

    if (data.exp < Date.now()) return null;

    return store.users.find((user) => user.id === data.id) || null;
  } catch {
    return null;
  }
}

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(
    /^Bearer\s+/i,
    ''
  );

  const user = userFromToken(token);

  if (!user) {
    return res.status(401).json({
      error: 'Please sign in to use real chat.'
    });
  }

  req.user = user;
  next();
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username
  };
}

app.use(cors());
app.use(express.json({ limit: '20kb' }));

const PORT = process.env.PORT || 5000;
const MAX_TEXT = 5000;

/* ---------------- SAFETY ANALYSIS ---------------- */

const RULES = [
  {
    label: 'Financial request',
    pattern:
      /\b(send|wire|transfer|lend|borrow|loan me|give me)\b.{0,70}\b(money|cash|gift card|crypto|bitcoin|payment|funds)\b|\b(gift card|crypto wallet|bitcoin)\b/i,
    level: 'high',
    confidence: 0.94,
    advice:
      'Requests for money or crypto are a common romance-scam warning sign, especially before an in-person meeting or independent verification.',
    next:
      'Do not send money, gift cards, cryptocurrency, or financial details.'
  },
  {
    label: 'Urgency or pressure',
    pattern:
      /\b(urgent|right now|immediately|last chance|today only|prove you trust me|if you loved me|don't let me down)\b/i,
    level: 'high',
    confidence: 0.88,
    advice:
      'Urgency or guilt can be used to push you into a decision before you have time to think.',
    next:
      'Pause. You do not owe anyone an immediate response or proof of trust.'
  },
  {
    label: 'Secrecy request',
    pattern:
      /\b(keep (this|it) (a )?secret|don't tell (anyone|your friends|your family)|between (you and me|us)|tell nobody|keep this private)\b/i,
    level: 'high',
    confidence: 0.87,
    advice:
      'Pressure to hide a relationship or request can isolate you from people who could help you assess it.',
    next:
      'Talk it through with someone you trust; do not agree to secrecy under pressure.'
  },
  {
    label: 'Suspicious or unexpected link',
    pattern:
      /https?:\/\/[^\s]+|\b(bit\.ly|tinyurl\.com|cutt\.ly|t\.co|shorturl\.at)\b/i,
    level: 'medium',
    confidence: 0.83,
    advice:
      'A link can lead to phishing, impersonation, or malware. The text alone cannot prove where a link goes.',
    next:
      'Do not click unexpected links. If needed, open the official service by typing its address yourself.'
  },
  {
    label: 'Sensitive information request',
    pattern:
      /\b(password|one[- ]time password|otp|verification code|bank details|aadhaar number|social security number|passport number)\b/i,
    level: 'high',
    confidence: 0.96,
    advice:
      'Passwords, one-time codes, identity numbers, and banking credentials should not be shared in a dating conversation.',
    next:
      'Never share passwords, OTPs, identity documents, or banking credentials.'
  },
  {
    label: 'Fast emotional escalation',
    pattern:
      /\b(soulmate|love of my life|marry you|never felt this way|destiny brought us)\b/i,
    level: 'low',
    confidence: 0.69,
    advice:
      'Very intense affection early on can be worth noticing, but by itself it does not prove bad intent.',
    next:
      'Take your time and look for consistent, respectful behaviour over time.'
  },
  {
    label: 'Pressure to move off-platform',
    pattern:
      /\b(whatsapp|telegram|signal|leave this app|move to another app|text me privately)\b/i,
    level: 'medium',
    confidence: 0.76,
    advice:
      'Moving platforms is not inherently suspicious, but pressure to do so quickly can remove platform protections.',
    next:
      'Keep the conversation on-platform until you feel comfortable and have independently verified the person.'
  },
  {
    label: 'Impersonation or unverifiable claim',
    pattern:
      /\b(i am (a )?(celebrity|famous|a public figure|in the military|a doctor overseas)|my official account|this is my private account|management team)\b/i,
    level: 'medium',
    confidence: 0.72,
    advice:
      'Claims of status or identity cannot be verified from a message. Impersonators may use authority or fame to gain trust.',
    next:
      'Verify through an independent, official channel rather than links or contact details they provide.'
  }
];

function analyzeSafety(input) {
  const text = String(input || '').slice(0, MAX_TEXT * 2 + 100);
  const findings = [];

  for (const rule of RULES) {
    const match = rule.pattern.exec(text);

    if (match) {
      findings.push({
        label: rule.label,
        level: rule.level,
        confidence: rule.confidence,
        evidence: match[0].slice(0, 180),
        explanation: rule.advice,
        advice: rule.next
      });
    }
  }

  const rank = { high: 3, medium: 2, low: 1 };

  findings.sort((a, b) => rank[b.level] - rank[a.level]);

  const high = findings.some((finding) => finding.level === 'high');
  const medium = findings.some((finding) => finding.level === 'medium');

  return {
    mode: 'rules-based',

    level: high
      ? 'Pause & protect yourself'
      : medium
        ? 'Worth a closer look'
        : findings.length
          ? 'Notice the context'
          : 'No obvious signals found',

    summary: high
      ? 'This text contains patterns that deserve extra caution. The highlighted phrases are evidence of language patterns—not proof of someone’s identity or intentions.'
      : medium
        ? 'Some patterns may deserve a closer look. Context matters; use your judgment and take your time.'
        : findings.length
          ? 'One possible signal appeared. This alone does not establish that someone is dishonest.'
          : 'This checklist did not detect obvious warning patterns. That does not prove a person or link is safe.',

    findings,

    severity: high
      ? 'high'
      : medium
        ? 'medium'
        : findings.length
          ? 'low'
          : 'none',

    confidenceNote:
      'Confidence describes how closely the text matched a detection rule; it is not the probability that a person is a scammer.',

    nextSteps: high
      ? [
          'Pause and verify the person through a trusted, independent method.',
          'Do not send money or share passwords, OTPs, identity numbers, or financial details.',
          'Do not click unexpected links; use the platform’s block/report tools if you feel pressured or unsafe.'
        ]
      : [
          'Keep personal and financial information private.',
          'Verify identity independently before relying on claims or links.',
          'Notice whether your boundaries are respected. If meeting, choose a public place and tell someone you trust.'
        ]
  };
}

/* ---------------- LOCAL REPLY GENERATION ---------------- */

function localReplies({ bio = '', message = '', tone = 'Friendly' }) {
  const context = `${bio} ${message}`.toLowerCase();

  const interestPrompts = [
    [
      'hiking',
      'Your hiking weekends sound lovely—do you have a favourite trail?',
      'It references their interest in hiking and invites an easy-to-answer story.'
    ],
    [
      'music',
      'You mentioned music—what song has been on repeat for you lately?',
      'It picks up their music interest and gives them room to share their taste.'
    ],
    [
      'book',
      'I’d love a book recommendation: what’s one you still think about?',
      'It builds on their reading interest without assuming you share the same favourites.'
    ],
    [
      'travel',
      'Which place you’ve visited would you happily go back to?',
      'It invites a personal story while keeping the question light.'
    ],
    [
      'coffee',
      'Important question: favourite coffee spot, or are you more of a tea person?',
      'It connects to their coffee interest with a playful, low-pressure choice.'
    ],
    [
      'food',
      'What’s one local food spot you think deserves more love?',
      'It draws on their food interest and could lead to a shared recommendation.'
    ],
    [
      'movie',
      'What film or show would you recommend for a cosy evening?',
      'It references their screen-time interest and makes it easy to continue the conversation.'
    ],
    [
      'art',
      'What kind of creative project have you enjoyed lately?',
      'It shows curiosity about their creative side without making assumptions.'
    ],
    [
      'dog',
      'What’s your ideal weekend activity with a four-legged sidekick?',
      'It gently picks up their interest in dogs and invites a fun answer.'
    ],
    [
      'game',
      'What game have you been enjoying lately—and would you recommend it?',
      'It gives them a chance to talk about a hobby they chose to share.'
    ]
  ];

  const match = interestPrompts.find(([word]) => context.includes(word));

  const prompts = match
    ? [
        match[1],
        'What’s a small thing that can instantly make your day better?',
        'What are you looking forward to this week?'
      ]
    : [
        'Your profile caught my attention—what’s something you’ve been genuinely excited about lately?',
        'What’s a hobby or interest you could talk about for hours?',
        'What does your ideal relaxed weekend look like?'
      ];

  let replies;

  if (tone === 'Playful') {
    replies = [
      {
        text: `Important compatibility question: ${
          match ? match[1] : 'what is your most elite snack choice?'
        }`,
        reason: match
          ? match[2]
          : 'A light, low-stakes question adds a little humour without putting pressure on them.'
      },
      {
        text: 'I was going to invent a clever opener, but curiosity won: what’s been the highlight of your week?',
        reason:
          'It is playful and honest, and gives them an easy way into a real conversation.'
      },
      {
        text: 'You seem like you have a good story or two. Which one should I hear first?',
        reason:
          'It invites them to choose what they want to share rather than asking for private details.'
      }
    ];
  } else if (tone === 'Thoughtful') {
    replies = [
      {
        text: prompts[0],
        reason: match
          ? match[2]
          : 'It asks about something meaningful without pushing for personal or sensitive information.'
      },
      {
        text: 'What’s a small thing that can make an ordinary day feel really good?',
        reason:
          'It encourages a reflective answer while staying comfortable and low-pressure.'
      },
      {
        text: 'What topic could you happily talk about for hours?',
        reason:
          'It lets them lead with an interest they enjoy sharing.'
      }
    ];
  } else {
    replies = [
      {
        text: `Hey! ${prompts[0]}`,
        reason: match
          ? match[2]
          : 'It is friendly, open-ended, and easy to answer without oversharing.'
      },
      {
        text: prompts[1],
        reason:
          'It invites a personal preference, not private information, and leaves room for follow-up.'
      },
      {
        text: prompts[2],
        reason:
          'It is timely and conversational, giving them an easy starting point.'
      }
    ];
  }

  return { mode: 'rules-based', replies };
}

/* ---------------- OPTIONAL AI INTEGRATION ---------------- */

async function optionalAI(messages) {
  const { AI_API_URL, AI_API_KEY, AI_MODEL } = process.env;

  if (!AI_API_URL || !AI_API_KEY || !AI_MODEL) {
    return null;
  }

  try {
    const response = await fetch(AI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AI_API_KEY}`
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
        temperature: 0.5
      })
    });

    if (!response.ok) return null;

    const data = await response.json();

    return data?.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

/* ---------------- AUTHENTICATION ROUTES ---------------- */

app.post('/api/auth/register', (req, res) => {
  const username = String(req.body?.username || '')
    .trim()
    .replace(/\s+/g, ' ');

  const password = String(req.body?.password || '');

  if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(username)) {
    return res.status(400).json({
      error: 'Username must be 3–24 characters (letters, numbers, _, . or -).'
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: 'Use a password with at least 8 characters.'
    });
  }

  if (
    store.users.some(
      (user) => user.username.toLowerCase() === username.toLowerCase()
    )
  ) {
    return res.status(409).json({
      error: 'That username is already taken.'
    });
  }

  const salt = randomBytes(16).toString('hex');
  const passwordHash = scryptSync(password, salt, 64).toString('hex');

  const user = {
    id: randomUUID(),
    username,
    salt,
    passwordHash,
    createdAt: new Date().toISOString()
  };

  store.users.push(user);
  persist();

  res.status(201).json({
    token: tokenFor(user),
    user: publicUser(user)
  });
});

app.post('/api/auth/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  const user = store.users.find(
    (item) => item.username.toLowerCase() === username.toLowerCase()
  );

  if (!user) {
    return res.status(401).json({
      error: 'Invalid username or password.'
    });
  }

  const hash = scryptSync(password, user.salt, 64);
  const saved = Buffer.from(user.passwordHash, 'hex');

  if (
    saved.length !== hash.length ||
    !timingSafeEqual(saved, hash)
  ) {
    return res.status(401).json({
      error: 'Invalid username or password.'
    });
  }

  res.json({
    token: tokenFor(user),
    user: publicUser(user)
  });
});

app.get('/api/auth/me', auth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

/* ---------------- CHAT ROUTES ---------------- */

app.get('/api/chat/users', auth, (_req, res) => {
  res.json({ users: store.users.map(publicUser) });
});

app.get('/api/chat/messages/:userId', auth, (req, res) => {
  const other = store.users.find(
    (user) => user.id === req.params.userId
  );

  if (!other) {
    return res.status(404).json({
      error: 'User not found.'
    });
  }

  const messages = store.messages
    .filter(
      (message) =>
        (message.fromId === req.user.id && message.toId === other.id) ||
        (message.fromId === other.id && message.toId === req.user.id)
    )
    .sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    );

  res.json({
    messages: messages.map((message) => ({
      ...message,
      from: message.fromId === req.user.id ? 'you' : 'them',
      sender:
        store.users.find((user) => user.id === message.fromId)?.username ||
        'Unknown'
    }))
  });
});

app.post('/api/chat/messages', auth, (req, res) => {
  const toId = String(req.body?.toId || '');
  const text = String(req.body?.text || '').trim();

  if (!text) {
    return res.status(400).json({
      error: 'Write a message first.'
    });
  }

  if (text.length > 1000) {
    return res.status(413).json({
      error: 'Messages must be 1,000 characters or fewer.'
    });
  }

  const recipient = store.users.find((user) => user.id === toId);

  if (!recipient) {
    return res.status(404).json({
      error: 'Recipient not found. Register a second demo account first.'
    });
  }

  if (recipient.id === req.user.id) {
    return res.status(400).json({
      error: 'Choose another user to start a conversation.'
    });
  }

  const message = {
    id: randomUUID(),
    fromId: req.user.id,
    toId,
    text,
    createdAt: new Date().toISOString()
  };

  store.messages.push(message);
  persist();

  const result = {
    ...message,
    from: 'you',
    sender: req.user.username
  };

  io.to(`user:${recipient.id}`).emit('chat:message', {
    ...message,
    from: 'them',
    sender: req.user.username
  });

  io.to(`user:${req.user.id}`).emit('chat:message', result);

  res.status(201).json({ message: result });
});

/* ---------------- SOCKET.IO AUTHENTICATION ---------------- */

io.use((socket, next) => {
  const user = userFromToken(socket.handshake.auth?.token);

  if (!user) {
    return next(new Error('Authentication required'));
  }

  socket.user = user;
  next();
});

io.on('connection', (socket) => {
  socket.join(`user:${socket.user.id}`);
});

/* ---------------- HEALTH CHECK ---------------- */

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean(
      process.env.AI_API_URL &&
      process.env.AI_API_KEY &&
      process.env.AI_MODEL
    )
  });
});

/* ---------------- MESSAGE ANALYSIS ROUTE ---------------- */

app.post('/api/analyze', async (req, res) => {
  const bio = String(req.body?.bio || '').trim();
  const message = String(req.body?.message || '').trim();
  const legacyText = String(req.body?.text || '').trim();

  const text = [
    bio ? `Profile bio: ${bio}` : '',
    message ? `Message: ${message}` : '',
    !bio && !message ? legacyText : ''
  ]
    .filter(Boolean)
    .join('\n');

  if (!text) {
    return res.status(400).json({
      error: 'Paste a message or bio to analyze.'
    });
  }

  if (
    bio.length > MAX_TEXT ||
    message.length > MAX_TEXT ||
    text.length > MAX_TEXT * 2 + 100
  ) {
    return res.status(413).json({
      error: `Please keep each field under ${MAX_TEXT} characters.`
    });
  }

  // Rules flag language patterns, not a person's identity or intent.
  const result = analyzeSafety(text);

  res.json({
    ...result,
    scannedSources: [
      bio ? 'profile bio' : '',
      message ? 'message' : ''
    ].filter(Boolean)
  });
});

/* ---------------- REPLY GENERATION ROUTE ---------------- */

app.post('/api/replies', async (req, res) => {
  const bio = String(req.body?.bio || '')
    .trim()
    .slice(0, MAX_TEXT);

  const message = String(req.body?.message || '')
    .trim()
    .slice(0, MAX_TEXT);

  const tone = ['Friendly', 'Playful', 'Thoughtful'].includes(
    req.body?.tone
  )
    ? req.body.tone
    : 'Friendly';

  if (!bio && !message) {
    return res.status(400).json({
      error: 'Add a bio or message to get reply ideas.'
    });
  }

  const fallback = localReplies({ bio, message, tone });

  const aiText = await optionalAI([
    {
      role: 'system',
      content:
        'Return JSON only: {"replies":[{"text":"...","reason":"..."}]}. Generate exactly 3 respectful, personalized, natural conversation openers. Use only interests in the provided text; never invent familiarity or encourage sharing sensitive details. Tone must be Friendly, Playful, or Thoughtful. No pressure, manipulation, negging, or sexual assumptions.'
    },
    {
      role: 'user',
      content: JSON.stringify({ bio, message, tone })
    }
  ]);

  if (aiText) {
    try {
      const cleanedAIText = aiText.replace(
        /^```json\s*|\s*```$/g,
        ''
      );

      const parsed = JSON.parse(cleanedAIText);

      if (
        Array.isArray(parsed.replies) &&
        parsed.replies.length >= 3
      ) {
        const replies = parsed.replies
          .slice(0, 3)
          .map((reply) =>
            typeof reply === 'string'
              ? {
                  text: reply,
                  reason:
                    'A respectful, low-pressure way to start a conversation.'
                }
              : {
                  text: String(reply.text || ''),
                  reason: String(
                    reply.reason ||
                    'A respectful, low-pressure way to start a conversation.'
                  )
                }
          )
          .filter((reply) => reply.text);

        if (replies.length === 3) {
          return res.json({
            replies,
            mode: 'AI-assisted'
          });
        }
      }
    } catch {
      // Use the local fallback if the AI response is invalid.
    }
  }

  res.json(fallback);
});

/* ---------------- SERVE THE FRONTEND IN PRODUCTION ---------------- */

const clientDist = join(__dirname, '..', 'dist');

// Serve static assets generated by the Vite build.
app.use(express.static(clientDist));

// Serve the React app for frontend routes.
// This middleware fallback avoids Express wildcard-route syntax differences.
app.use((req, res, next) => {
  if (
    req.path.startsWith('/api/') ||
    req.path.startsWith('/socket.io/')
  ) {
    return next();
  }

  res.sendFile(join(clientDist, 'index.html'), (err) => {
    if (err) next(err);
  });
});

/* ---------------- ERROR HANDLING ---------------- */

// Keep error-handling middleware last.
app.use((err, _req, res, _next) => {
  console.error(err?.message || 'Unexpected server error');

  res.status(500).json({
    error: 'Something went wrong. Please try again.'
  });
});

/* ---------------- START SERVER ---------------- */

httpServer.listen(PORT, () => {
  console.log(`TrustTalk API running on port ${PORT}`);
});