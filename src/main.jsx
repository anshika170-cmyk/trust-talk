import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowDownRight, ArrowUpRight, BadgeCheck, Check, CheckCircle2, ChevronRight,
  Activity, BarChart3, Copy, Heart, HeartHandshake, History, Leaf, LockKeyhole, MessageCircle, RefreshCw, Send,
  ShieldAlert, ShieldCheck, Sparkles, Trash2, WandSparkles
} from 'lucide-react';
import { io } from 'socket.io-client';
import './styles.css';

const API = '/api';
const sampleMessage = 'I feel like we have a special connection already. I need help urgently and can only access my crypto wallet. Could you send me some money today? Please prove you trust me.';
const sampleBio = 'Weekend hiker, indie music fan, always looking for a new coffee spot. I love thoughtful conversations and spontaneous little adventures.';

function App() {
  const [tab, setTab] = useState('safety');
  const [message, setMessage] = useState('');
  const [safetyBio, setSafetyBio] = useState('');
  const [bio, setBio] = useState(sampleBio);
  const [tone, setTone] = useState('Friendly');
  const [safety, setSafety] = useState(null);
  const [scanHistory, setScanHistory] = useState(() => { try { return JSON.parse(localStorage.getItem('trusttalk_scan_history') || '[]'); } catch { return []; } });
  const [replies, setReplies] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [apiMode, setApiMode] = useState('checking');
  const [actionMessage, setActionMessage] = useState('');
  const [chatDraft, setChatDraft] = useState('');
  const [chatMessages, setChatMessages] = useState([
    { id: 1, from: 'match', text: 'Hey! I noticed you like hiking too. Have you found any good trails lately?', time: '10:04' },
    { id: 2, from: 'you', text: 'Hi! I have a few favourites. I’m always looking for new ones 🌿', time: '10:05' },
    { id: 3, from: 'match', text: 'That sounds great. What kind of trail do you usually enjoy?', time: '10:06' }
  ]);
  const [chatNotice, setChatNotice] = useState('');
  const [chatMode, setChatMode] = useState('demo');
  const [authMode, setAuthMode] = useState('register');
  const [authForm, setAuthForm] = useState({ username: '', password: '' });
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('trusttalk_token') || '');
  const [currentUser, setCurrentUser] = useState(null);
  const [chatUsers, setChatUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [realMessages, setRealMessages] = useState([]);
  const [realChatError, setRealChatError] = useState('');
  const [realChatBusy, setRealChatBusy] = useState(false);
  const [evaluationResults, setEvaluationResults] = useState([]);
  const [evaluationRunning, setEvaluationRunning] = useState(false);
  const [evaluationError, setEvaluationError] = useState('');

  useEffect(() => {
    try { localStorage.setItem('trusttalk_scan_history', JSON.stringify(scanHistory.slice(0, 30))); } catch {}
  }, [scanHistory]);

  useEffect(() => {
    fetch(`${API}/health`).then(r => r.json()).then(d => setApiMode(d.aiConfigured ? 'AI-assisted' : 'local demo')).catch(() => setApiMode('local demo'));
  }, []);

  useEffect(() => {
    if (!authToken) return;
    let active = true;
    fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${authToken}` } })
      .then(r => { if (!r.ok) throw new Error('Session expired'); return r.json(); })
      .then(d => { if (active) setCurrentUser(d.user); })
      .catch(() => { localStorage.removeItem('trusttalk_token'); setAuthToken(''); setCurrentUser(null); });
    return () => { active = false; };
  }, [authToken]);

  useEffect(() => {
    if (!authToken || chatMode !== 'real') return;
    let socket;
    const headers = { Authorization: `Bearer ${authToken}` };
    fetch(`${API}/chat/users`, { headers })
      .then(r => r.json()).then(d => {
        setChatUsers(d.users || []);
        if (!selectedUserId) {
          const first = (d.users || []).find(u => u.id !== currentUser?.id);
          if (first) setSelectedUserId(first.id);
        }
      }).catch(e => setRealChatError(e.message));
    socket = io('/', { path: '/socket.io', auth: { token: authToken } });
    socket.on('chat:message', msg => {
      if (msg.from === 'you' || msg.from === 'them') {
        setRealMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg].sort((a,b) => new Date(a.createdAt)-new Date(b.createdAt)));
      }
    });
    socket.on('connect_error', () => setRealChatError('Live connection unavailable. Check that the backend is running.'));
    return () => socket?.disconnect();
  }, [authToken, chatMode, currentUser?.id, selectedUserId]);

  useEffect(() => {
    if (!authToken || !selectedUserId || chatMode !== 'real') return;
    fetch(`${API}/chat/messages/${selectedUserId}`, { headers: { Authorization: `Bearer ${authToken}` } })
      .then(r => r.json()).then(d => setRealMessages(d.messages || []))
      .catch(e => setRealChatError(e.message));
  }, [authToken, selectedUserId, chatMode]);

  async function authenticateChat(e) {
    e.preventDefault(); setRealChatError(''); setRealChatBusy(true);
    try {
      const data = await request(`auth/${authMode}`, authForm);
      localStorage.setItem('trusttalk_token', data.token);
      setAuthToken(data.token); setCurrentUser(data.user);
      setChatNotice(`Signed in as ${data.user.username}. Create another account in a second browser to test user-to-user messaging.`);
    } catch (e) { setRealChatError(e.message); }
    finally { setRealChatBusy(false); }
  }

  function signOutChat() {
    localStorage.removeItem('trusttalk_token'); setAuthToken(''); setCurrentUser(null);
    setChatUsers([]); setRealMessages([]); setSelectedUserId(''); setRealChatError('');
  }

  async function sendRealChat() {
    const text = chatDraft.trim();
    if (!text || !selectedUserId) return;
    setRealChatError('');
    try {
      const data = await request('chat/messages', { toId: selectedUserId, text });
      setRealMessages(prev => prev.some(m => m.id === data.message.id) ? prev : [...prev, data.message].sort((a,b) => new Date(a.createdAt)-new Date(b.createdAt)));
      setChatDraft('');
    } catch (e) { setRealChatError(e.message); }
  }

  async function request(path, body) {
    const response = await fetch(`${API}/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  async function analyze(text = message) {
    const scanMessage = String(text || '').trim();
    const scanBio = safetyBio.trim();
    if (!scanMessage && !scanBio) { setError('Add a message or profile bio first, or try our sample.'); return; }
    const historyText = [scanBio ? `PROFILE BIO: ${scanBio}` : '', scanMessage ? `MESSAGE: ${scanMessage}` : ''].filter(Boolean).join('\n\n');
    setError(''); setLoading(true);
    try {
      const result = await request('analyze', { bio: scanBio, message: scanMessage, text: historyText });
      setSafety(result);
      setScanHistory(prev => [{ id: Date.now(), text: historyText.slice(0, 1200), level: result.severity || result.level || 'Review', findings: result.findings?.length || 0, mode: result.mode || 'Rules-based', createdAt: new Date().toISOString() }, ...prev].slice(0, 30));
    }
    catch (e) { setError(`${e.message} Check that the backend is running.`); }
    finally { setLoading(false); }
  }

  const evaluationCases = [
    { id: 'money', title: 'Financial pressure', category: 'Scam', message: 'Please send me money today so I can unlock this guaranteed investment reward.', expectedSignal: true },
    { id: 'otp', title: 'Sensitive information request', category: 'Phishing', message: 'Share your OTP and password immediately to keep your account active.', expectedSignal: true },
    { id: 'secret', title: 'Secrecy pressure', category: 'Manipulation', message: "Don't tell anyone about this request; keep it a secret between us.", expectedSignal: true },
    { id: 'link', title: 'Unexpected link', category: 'Link safety', message: 'Your parcel is waiting. Verify your account here: https://bit.ly/claim-now', expectedSignal: true },
    { id: 'romance', title: 'Fast emotional escalation', category: 'Context', message: "You are the love of my life and I want to marry you.", expectedSignal: true },
    { id: 'friendly', title: 'Friendly opener', category: 'Normal', message: "Hi! I saw you enjoy web development. What are you building lately?", expectedSignal: false },
    { id: 'hobby', title: 'Everyday hobby chat', category: 'Normal', message: "I tried a new coffee shop this weekend and it was lovely. Any recommendations?", expectedSignal: false },
    { id: 'plans', title: 'Low-pressure plans', category: 'Normal', message: "Would you like to exchange project ideas sometime? No worries if you're busy.", expectedSignal: false }
  ];

  async function runEvaluation() {
    setEvaluationRunning(true); setEvaluationError(''); setEvaluationResults([]);
    const results = [];
    try {
      for (const test of evaluationCases) {
        const result = await request('analyze', { message: test.message });
        const detected = Array.isArray(result.findings) && result.findings.length > 0;
        results.push({ ...test, detected, findings: result.findings || [], level: result.severity || 'none', passed: detected === test.expectedSignal });
        setEvaluationResults([...results]);
      }
    } catch (e) {
      setEvaluationError(`${e.message} Check that the backend is running, then try again.`);
    } finally { setEvaluationRunning(false); }
  }

  async function generate() {
    if (!bio.trim() && !message.trim()) { setError('Add a profile bio or a message first.'); return; }
    setError(''); setLoading(true);
    try { setReplies(await request('replies', { bio, message, tone })); }
    catch (e) { setError(`${e.message} Check that the backend is running.`); }
    finally { setLoading(false); }
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); } catch {}
  }

  function sendChat() {
    const text = chatDraft.trim();
    if (!text) return;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setChatMessages(prev => [...prev, { id: Date.now(), from: 'you', text, time }]);
    setChatDraft('');
    setChatNotice('Demo message sent. Jamie is a simulated conversation partner.');
    const lower = text.toLowerCase();
    const reply = /(hiking|trail|walk)/.test(lower) ? 'That sounds lovely! I like finding a trail with a good view. Any recommendations?' :
      /(music|song|band|artist)/.test(lower) ? 'I’m always looking for new music. What have you been listening to lately?' :
      /(coffee|tea|cafe)/.test(lower) ? 'A good coffee spot is always a win. Do you prefer cosy cafés or places with a view?' :
      /(how are you|how's it going|hello|hey|hi)/.test(lower) ? 'Hey! 😊 Glad you messaged. What’s been the highlight of your week?' :
      'That’s interesting! Tell me a little more if you feel like sharing — no pressure.';
    window.setTimeout(() => setChatMessages(prev => [...prev, { id: Date.now() + 1, from: 'match', text: reply, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]), 650);
  }

  function trySample() {
    setMessage(sampleMessage);
    setSafety(null);
    setActionMessage('');
    setError('');
    setTab('safety');
  }

  return <div className="site-shell">
    <div className="announcement"><span className="announcement-star">✳</span> A LITTLE MORE CARE. A LOT MORE CONNECTION. <span className="announcement-right">MADE FOR AFFECIO HACKS ’26 <ArrowUpRight size={12}/></span></div>
    <header className="header">
      <a className="wordmark" href="#" onClick={e => e.preventDefault()} aria-label="TrustTalk home">
        <span className="logo-shape"><HeartHandshake size={23}/></span>
        <span>trusttalk<span className="wordmark-dot">.</span><small>CONNECTION, WITH CARE</small></span>
      </a>
      <nav className="main-nav" aria-label="Main navigation">
        <button onClick={() => setTab('overview')} className={tab === 'overview' ? 'nav-item current' : 'nav-item'}><span>00</span> Overview</button>
        <button onClick={() => setTab('safety')} className={tab === 'safety' ? 'nav-item current' : 'nav-item'}><span>01</span> Safety check</button>
        <button onClick={() => setTab('conversation')} className={tab === 'conversation' ? 'nav-item current' : 'nav-item'}><span>02</span> Find your words</button>
        <button onClick={() => setTab('chat')} className={tab === 'chat' ? 'nav-item current' : 'nav-item'}><span>03</span> Chat demo</button>
        <button onClick={() => setTab('evaluation')} className={tab === 'evaluation' ? 'nav-item current' : 'nav-item'}><span>04</span> Test lab</button>
      </nav>
      <div className="header-status"><span className="live-dot"/><span>{apiMode === 'AI-assisted' ? 'AI assisted' : 'Ready to help'}</span></div>
    </header>

    <main>
      <section className="intro">
        <div className="intro-left">
          <div className="overline"><span className="overline-line"/> YOUR POCKET-SIZED CONNECTION COMPANION</div>
          <h1>Be curious.<br/>Be <em>yourself.</em><br/><span>Be safe.</span></h1>
          <p className="intro-copy">The best connections feel like you can be yourself. Spot concerning patterns, understand the evidence, and find respectful words for a thoughtful first hello.</p>
          <div className="intro-actions">
            <button className="button-dark" onClick={() => { setTab('safety'); document.getElementById('workspace')?.scrollIntoView({behavior:'smooth'}); }}>Check a message <ArrowDownRight size={17}/></button>
            <button className="button-link" onClick={() => { setTab('conversation'); document.getElementById('workspace')?.scrollIntoView({behavior:'smooth'}); }}>Need an opener? <ArrowUpRight size={15}/></button>
          </div>
          <div className="little-proof"><span className="proof-avatars"><i>♡</i><i>✳</i><i>☺</i></span><span>Thoughtful by design. <b>Always on your side.</b></span></div>
        </div>
        <div className="intro-right" aria-label="Illustration of safe and meaningful conversations">
          <div className="art-wash wash-pink"/><div className="art-wash wash-lilac"/>
          <div className="sunburst">✳</div>
          <div className="orbit orbit-a"/><div className="orbit orbit-b"/>
          <div className="art-note note-one"><span className="note-emoji">☻</span><span><b>Keep it real</b><small>Your voice, your pace.</small></span></div>
          <div className="art-note note-two"><span className="note-emoji green"><ShieldCheck size={19}/></span><span><b>Trust takes time</b><small>Notice the little things.</small></span><span className="note-tick"><Check size={13}/></span></div>
          <div className="message-art">
            <div className="message-art-top"><span className="tiny-avatar">m</span><span><b>a little hello</b><small>good things begin small</small></span><span className="message-art-heart">♡</span></div>
            <div className="chat-line left-line">Hey, I saw you love hiking…</div>
            <div className="chat-line right-line">Guilty! 🌿 Favourite trail?</div>
            <div className="chat-line left-line last-line">Ooh, I have a few ideas.</div>
            <div className="chat-footer"><span/> A CONVERSATION, NOT A PERFORMANCE</div>
          </div>
          <span className="art-scribble scribble-one">nice to meet you!</span>
          <span className="art-scribble scribble-two">✿</span>
          <span className="art-caption">GOOD CONNECTIONS<br/>GROW AT THEIR OWN PACE.</span>
        </div>
      </section>

      <section className="values-strip">
        <div><span className="value-icon icon-lilac"><ShieldCheck size={17}/></span><span><b>Trust before connection</b><small>Notice signals, not assumptions.</small></span></div>
        <span className="strip-divider"/>
        <div><span className="value-icon icon-pink"><MessageCircle size={17}/></span><span><b>Words that feel like you</b><small>Start with curiosity, not a script.</small></span></div>
        <span className="strip-divider"/>
        <div><span className="value-icon icon-green"><LockKeyhole size={17}/></span><span><b>Your pace, your privacy</b><small>Share only what you choose.</small></span></div>
      </section>

      <section className="workspace-section" id="workspace">
        <div className="workspace-heading">
          <div><div className="overline"><span className="overline-line"/> YOUR LITTLE CORNER OF THE INTERNET</div><h2>What do you need <em>today?</em></h2></div>
          <div className="workspace-note"><Sparkles size={15}/> No judgement. Just a little guidance.</div>
        </div>
        <div className="split-workspace">
          <aside className="workspace-rail">
            <div className="rail-label">THE TOOLKIT <span>↘</span></div>
            <button className={tab === 'overview' ? 'rail-option rail-active' : 'rail-option'} onClick={() => {setTab('overview');setError('');}}><span className="rail-num">00</span><span className="rail-icon rail-chat"><BarChart3 size={20}/></span><span className="rail-copy"><b>Overview</b><small>Your safety activity.</small></span><ChevronRight size={17} className="rail-chevron"/></button>
            <button className={tab === 'safety' ? 'rail-option rail-active' : 'rail-option'} onClick={() => {setTab('safety');setError('');}}>
              <span className="rail-num">01</span><span className="rail-icon rail-shield"><ShieldCheck size={20}/></span><span className="rail-copy"><b>Safety check</b><small>Pause before you reply.</small></span><ChevronRight size={17} className="rail-chevron"/>
            </button>
            <button className={tab === 'conversation' ? 'rail-option rail-active' : 'rail-option'} onClick={() => {setTab('conversation');setError('');}}>
              <span className="rail-num">02</span><span className="rail-icon rail-chat"><WandSparkles size={20}/></span><span className="rail-copy"><b>Find your words</b><small>Make the first move.</small></span><ChevronRight size={17} className="rail-chevron"/>
            </button>
            <button className={tab === 'chat' ? 'rail-option rail-active' : 'rail-option'} onClick={() => {setTab('chat');setError('');}}><span className="rail-num">03</span><span className="rail-icon rail-chat"><MessageCircle size={20}/></span><span className="rail-copy"><b>Chat demo</b><small>Try a conversation.</small></span><ChevronRight size={17} className="rail-chevron"/></button>
            <button className={tab === 'evaluation' ? 'rail-option rail-active' : 'rail-option'} onClick={() => {setTab('evaluation');setError('');}}><span className="rail-num">04</span><span className="rail-icon rail-chat"><CheckCircle2 size={20}/></span><span className="rail-copy"><b>Test lab</b><small>Evaluate the rules.</small></span><ChevronRight size={17} className="rail-chevron"/></button>
            <div className="rail-sticker"><span className="sticker-star">✳</span><p>Connection isn't a test you have to pass.</p><small>Take your time. Be you.</small><span className="sticker-heart">♡</span></div>
            <div className="privacy-note"><LockKeyhole size={15}/><span><b>A note on privacy</b><small>Don't paste passwords, verification codes, or sensitive personal details.</small></span></div>
          </aside>

          <section className="workbench">
            {tab === 'overview' ? <>
              <div className="workbench-top"><div><span className="eyebrow-number">YOUR TRUSTTALK / OVERVIEW</span><h3>A clearer view of<br/>your <em>safety.</em></h3><p>Review your recent scans and see what your safety checks have surfaced. Your history stays in this browser.</p></div><div className="big-doodle"><Activity size={43}/><span>✳</span></div></div>
              <div className="overview-stats">
                <article className="overview-stat"><span><ShieldCheck size={17}/></span><small>Total scans</small><strong>{scanHistory.length}</strong><p>Saved in this browser</p></article>
                <article className="overview-stat"><span><ShieldAlert size={17}/></span><small>High-risk flags</small><strong>{scanHistory.filter(x => /high/i.test(x.level)).length}</strong><p>Review before responding</p></article>
                <article className="overview-stat"><span><History size={17}/></span><small>Latest scan</small><strong>{scanHistory[0] ? new Date(scanHistory[0].createdAt).toLocaleDateString() : '—'}</strong><p>{scanHistory[0] ? new Date(scanHistory[0].createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : 'No scans yet'}</p></article>
              </div>
              <div className="overview-history-head"><div><span className="output-label">RECENT ACTIVITY</span><h4>Your scan history</h4></div><button className="copy-action history-clear" onClick={() => {setScanHistory([]);setSafety(null);}} disabled={!scanHistory.length}><Trash2 size={14}/> Clear history</button></div>
              {scanHistory.length ? <div className="history-list">{scanHistory.map(item => <article className="history-item" key={item.id}><span className={`history-risk ${String(item.level).toLowerCase().replace(/[^a-z]/g,'-')}`}><ShieldAlert size={17}/></span><div className="history-content"><div className="history-title"><b>{item.level} review</b><span>{new Date(item.createdAt).toLocaleString()}</span></div><p>{item.text}</p><small>{item.findings} signal(s) · {item.mode}</small></div><button className="history-open" onClick={() => {setMessage(item.text);setTab('safety');setSafety(null);setError('');setActionMessage('');}} aria-label="Review this scan again">Review <ArrowUpRight size={14}/></button></article>)}</div> : <div className="history-empty"><div><History size={26}/></div><h4>Your history starts with your first scan.</h4><p>Run a safety check and its result will appear here. You can clear this history whenever you like.</p><button className="button-dark" onClick={() => {setTab('safety');setMessage(sampleMessage);}}><ShieldCheck size={15}/> Try a sample scan</button></div>}
              <div className="fine-print"><span>♡</span><p><b>Privacy note:</b> scan history is stored in this browser's local storage. Avoid entering sensitive personal information, and clear the history on shared devices.</p></div>
            </> : tab === 'safety' ? <>
              <div className="workbench-top"><div><span className="eyebrow-number">THE TRUST DESK / 01</span><h3>Let's read between<br/>the <em>lines.</em></h3><p>Paste a message or profile bio. We'll flag patterns worth noticing—not decide who someone is.</p></div><div className="big-doodle"><ShieldCheck size={43}/><span>♡</span></div></div>
              <div className="input-block">
                <div className="field-heading"><label htmlFor="safety-bio">THEIR PROFILE BIO <i>OPTIONAL</i></label><span>{safetyBio.length} / 5000</span></div>
                <textarea id="safety-bio" value={safetyBio} maxLength={5000} onChange={e => setSafetyBio(e.target.value)} placeholder="Paste profile bio details worth checking…"/>
                <div className="field-heading second-field"><label htmlFor="message">THE MESSAGE <i>OPTIONAL</i></label><span>{message.length} / 5000</span></div>
                <textarea id="message" value={message} maxLength={5000} onChange={e => setMessage(e.target.value)} placeholder="Paste the message that's got you thinking…"/>
                <div className="field-bottom"><span><LockKeyhole size={13}/> Leave out names and private details.</span><button onClick={trySample} className="sample-link">Try a sample <ArrowUpRight size={13}/></button></div>
                <button className="action-button" disabled={loading} onClick={() => analyze()}>{loading ? <RefreshCw size={17} className="spin"/> : <ShieldCheck size={17}/>} {loading ? 'Looking for signals…' : 'Look for red flags'} <ArrowUpRight size={17}/></button>
              </div>
              {error && <div className="error-note"><ShieldAlert size={16}/>{error}</div>}
              <div className="output-block">
                {safety ? <>
                  <div className="output-top"><div><span className="output-label">YOUR SAFETY SNAPSHOT</span><h4>{safety.level}</h4></div><span className={`output-icon ${safety.findings.some(f => f.level === 'high') ? 'output-alert' : ''}`}>{safety.findings.some(f => f.level === 'high') ? <ShieldAlert size={24}/> : <ShieldCheck size={24}/>}</span></div>
                  <p className="output-summary">{safety.summary}</p>
                  {safety.scannedSources?.length > 0 && <p className="scan-sources">Checked: {safety.scannedSources.join(' + ')}. Signals are text patterns for review, not proof of intent.</p>}
                  {safety.findings.length ? <div className="finding-list">{safety.findings.map((f,i) => <article className="finding" key={i}><span className={`finding-mark ${f.level}`}>{f.level === 'high' ? '!' : f.level === 'medium' ? '↗' : '·'}</span><div><div className="finding-title">{f.label}<span className={`level ${f.level}`}>{f.level} severity</span></div>
                    {f.evidence && <blockquote className="evidence-quote">“{f.evidence}”</blockquote>}
                    <p>{f.explanation || f.advice}</p>
                    <div className="finding-meta"><span>Rule-match confidence: <b>{Math.round((f.confidence || 0.7) * 100)}%</b></span><span>Severity: <b>{f.level}</b></span></div>
                    <p className="finding-advice"><b>Suggested next step:</b> {f.advice}</p></div></article>)}</div> : <div className="no-findings"><CheckCircle2 size={17}/> No checklist signals found. That doesn't prove a person or link is safe.</div>}
                  <div className="next-step-box"><b><HeartHandshake size={16}/> Your personal safety plan</b>{safety.nextSteps.map((s,i)=><p key={i}><Check size={14}/>{s}</p>)}
                    <div className="safety-actions">
                      <button onClick={() => setActionMessage('Pause and verify: use an independent trusted method, and take time before responding.')}><ShieldCheck size={14}/> Pause and verify</button>
                      <button onClick={() => setActionMessage('Don’t click: avoid unexpected links. If you already opened one, do not enter credentials and visit the service through its official app/site.')}><LockKeyhole size={14}/> Don’t click</button>
                      <button onClick={() => setActionMessage('Block or report: use the dating platform’s in-app controls if you feel unsafe, threatened, or pressured. Save relevant evidence if needed.')}><ShieldAlert size={14}/> Block or report</button>
                    </div>
                    {actionMessage && <p className="action-message" role="status">{actionMessage}</p>}
                  </div>
                  <div className="output-bottom"><span><Sparkles size={13}/> {safety.mode === 'AI-assisted' ? 'AI-assisted' : 'Rules-based'} · Guidance, not a verdict</span><button onClick={() => {setSafety(null);setActionMessage('');setMessage('');setSafetyBio('');}} className="sample-link">Clear <span>×</span></button></div>
                </> : <div className="output-empty"><div className="empty-illustration"><div className="empty-circle"><ShieldCheck size={30}/></div><span className="empty-star">✳</span><span className="empty-heart">♡</span></div><div><span className="output-label">YOUR RESULTS WILL LIVE HERE</span><h4>A little clarity, coming up.</h4><p>We’ll explain any detected signals and offer practical next steps—without pretending to know someone's intentions.</p></div><span className="empty-side-note">LOOK CLOSELY.<br/>STAY KIND.</span></div>}
              </div>
              <div className="fine-print"><span>✳</span><p><b>Real talk:</b> no tool can verify someone's identity from a message alone. If you feel unsafe, trust your instincts and reach out to someone you trust.</p></div>
            </> : tab === 'conversation' ? <>
              <div className="workbench-top conversation-top"><div><span className="eyebrow-number">THE CONVERSATION CORNER / 02</span><h3>Less overthinking.<br/>More <em>hello.</em></h3><p>Start with their interests, add a little curiosity, and keep it sounding like you.</p></div><div className="big-doodle pink-doodle"><MessageCircle size={43}/><span>✳</span></div></div>
              <div className="input-block reply-inputs">
                <div className="field-heading"><label htmlFor="bio">THEIR PROFILE BIO <i>OPTIONAL</i></label></div>
                <textarea id="bio" className="small-textarea" value={bio} maxLength={5000} onChange={e => setBio(e.target.value)} placeholder="What are they into? Any shared interests?"/>
                <div className="field-heading second-field"><label htmlFor="reply-message">WHAT DID THEY SAY? <i>OPTIONAL</i></label></div>
                <textarea id="reply-message" className="small-textarea" value={message} maxLength={5000} onChange={e => setMessage(e.target.value)} placeholder="Paste their message if you'd like a more tailored reply…"/>
                <div className="tone-row"><span>YOUR VIBE</span>{['Friendly','Playful','Thoughtful'].map(t=><button key={t} onClick={()=>setTone(t)} className={tone===t?'tone-option tone-selected':'tone-option'}>{t==='Friendly'?'☀':t==='Playful'?'✳':'♡'} {t}</button>)}</div>
                <button className="action-button pink-action" disabled={loading} onClick={generate}>{loading ? <RefreshCw size={17} className="spin"/> : <WandSparkles size={17}/>} {loading ? 'Finding your words…' : 'Give me a few ideas'} <ArrowUpRight size={17}/></button>
              </div>
              {error && <div className="error-note"><ShieldAlert size={16}/>{error}</div>}
              <div className="output-block reply-output">
                <div className="reply-output-heading"><div><span className="output-label">OPENERS, WITH A LITTLE PERSONALITY</span><h4>Choose one. Make it yours.</h4></div>{replies && <span className="mode-chip">{replies.mode}</span>}</div>
                {replies ? <div className="reply-list">{replies.replies.map((r,i)=><article className="reply-suggestion" key={i}><span className="reply-index">0{i+1}</span><div className="reply-content"><p>{typeof r === 'string' ? r : r.text}</p><small><Sparkles size={12}/> {typeof r === 'string' ? 'A respectful, low-pressure opener.' : r.reason}</small></div><button className="copy-action" onClick={()=>copy(typeof r === 'string' ? r : r.text)} aria-label="Copy reply"><Copy size={15}/></button></article>)}</div> : <div className="reply-empty"><div className="speech-doodle"><span>hey, you seem fun…</span><span>what's your story? <b>♡</b></span></div><p>Your conversation ideas will appear here.</p></div>}
                {replies && <button className="sample-link regenerate" onClick={generate}><RefreshCw size={13}/> Another round, please</button>}
              </div>
              <div className="fine-print"><span>♡</span><p><b>Not a script, just a spark:</b> use these ideas as a starting point. Your real voice is the best part of the conversation.</p></div>
            </> : <>
              <div className="workbench-top conversation-top"><div><span className="eyebrow-number">THE CHAT ROOM / DEMO</span><h3>A real little<br/><em>conversation.</em></h3><p>Try a sample chat, send messages, and use TrustTalk's opener and safety tools along the way.</p></div><div className="big-doodle pink-doodle"><MessageCircle size={43}/><span>♡</span></div></div>
              <div className="chat-mode-switch">
                <button className={chatMode === 'demo' ? 'chat-mode active' : 'chat-mode'} onClick={() => {setChatMode('demo');setRealChatError('');}}> <Sparkles size={14}/> Simulated demo</button>
                <button className={chatMode === 'real' ? 'chat-mode active' : 'chat-mode'} onClick={() => {setChatMode('real');setChatNotice('Real chat uses accounts and server-stored messages.');setRealChatError('');}}> <MessageCircle size={14}/> Real user chat</button>
              </div>
              {chatMode === 'demo' ? <>
                <div className="chat-demo-banner"><span className="chat-avatar">J</span><div><b>Jamie <span className="verified-demo"><BadgeCheck size={13}/> simulated profile</span></b><small>Matched over hiking & indie music · Demo conversation</small></div><span className="chat-online"><i/> demo</span></div>
                <div className="chat-window" aria-label="Demo chat messages">{chatMessages.map(m => <div key={m.id} className={m.from === 'you' ? 'chat-message chat-mine' : 'chat-message chat-theirs'}><span className="chat-sender">{m.from === 'you' ? 'You' : 'Jamie'}</span><p>{m.text}</p><small>{m.time}</small></div>)}</div>
                <div className="chat-compose"><textarea value={chatDraft} onChange={e => setChatDraft(e.target.value)} maxLength={1000} placeholder="Write a thoughtful message…" aria-label="Write a chat message" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}/><button className="chat-send" onClick={sendChat} disabled={!chatDraft.trim()}><Send size={16}/> Send</button></div>
                <div className="fine-print"><span>♡</span><p><b>Simulated mode:</b> Jamie replies automatically. These messages are not sent to a real person.</p></div>
              </> : <>
                {!currentUser ? <form className="chat-auth-card" onSubmit={authenticateChat}>
                  <span className="output-label">REAL USER MESSAGING</span><h4>{authMode === 'register' ? 'Create your chat account' : 'Welcome back'}</h4>
                  <p>Register two accounts (for example in two browsers) to test real user-to-user messages.</p>
                  <label>Username<input required minLength="3" maxLength="24" value={authForm.username} onChange={e=>setAuthForm({...authForm,username:e.target.value})} placeholder="e.g. anshika_demo"/></label>
                  <label>Password<input required minLength="8" type="password" value={authForm.password} onChange={e=>setAuthForm({...authForm,password:e.target.value})} placeholder="At least 8 characters"/></label>
                  <button className="button-dark" type="submit" disabled={realChatBusy}>{realChatBusy ? 'Please wait…' : authMode === 'register' ? 'Create account' : 'Sign in'} <ArrowUpRight size={15}/></button>
                  <button type="button" className="button-link" onClick={()=>setAuthMode(authMode === 'register' ? 'login' : 'register')}>{authMode === 'register' ? 'Already registered? Sign in' : 'New here? Create an account'}</button>
                </form> : <>
                  <div className="real-chat-toolbar">
                    <div><span className="output-label">SIGNED IN AS</span><b>{currentUser.username}</b></div>
                    <button className="copy-action" onClick={signOutChat}>Sign out</button>
                  </div>
                  <label className="recipient-label">Message a user
                    <select value={selectedUserId} onChange={e=>{setSelectedUserId(e.target.value);setRealMessages([]);}}><option value="">Choose another account…</option>{chatUsers.filter(u=>u.id !== currentUser.id).map(u=><option key={u.id} value={u.id}>{u.username}</option>)}</select>
                  </label>
                  <div className="chat-window real-chat-window" aria-label="Real user chat messages">
                    {selectedUserId ? realMessages.map(m => <div key={m.id} className={m.from === 'you' ? 'chat-message chat-mine' : 'chat-message chat-theirs'}><span className="chat-sender">{m.from === 'you' ? 'You' : m.sender || 'User'}</span><p>{m.text}</p><small>{new Date(m.createdAt || Date.now()).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></div>) : <p className="reply-empty">Choose a registered user. To test, create another account in a separate browser or incognito window.</p>}
                  </div>
                  <div className="chat-compose"><textarea value={chatDraft} onChange={e=>setChatDraft(e.target.value)} maxLength={1000} disabled={!selectedUserId} placeholder="Write a message… (Enter to send)" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendRealChat();}}}/><button className="chat-send" onClick={sendRealChat} disabled={!chatDraft.trim()||!selectedUserId}><Send size={16}/> Send</button></div>
                  {chatUsers.length <= 1 && <p className="chat-notice">No other users yet. Open this site in an incognito window and register a second account.</p>}
                </>}
                {realChatError && <p className="chat-error" role="alert">{realChatError}</p>}
                <div className="chat-tools"><button onClick={()=>{setTab('conversation');setError('');}}><WandSparkles size={15}/> Get a conversation starter</button><button onClick={async()=>{const latest=[...realMessages].reverse().find(m=>m.from==='them');if(latest){setMessage(latest.text);setTab('safety');setSafety(null);setError('');}}}><ShieldCheck size={15}/> Scan latest incoming message</button></div>
                <div className="fine-print"><span>♡</span><p><b>Real chat:</b> messages are stored on this server and delivered live when both users are connected. Use a unique password; this starter project needs HTTPS, rate limiting, and production security review before public deployment.</p></div>
              </>}
              {chatNotice && <p className="chat-notice" role="status">{chatNotice}</p>}
            </>}
          </section>
        </div>
      </section>
    </main>

    <footer className="footer"><div className="footer-logo"><HeartHandshake size={19}/> trusttalk<span>.</span></div><p>For the butterflies, the boundaries, and everything in between.</p><div className="footer-right"><span>✳</span> MADE WITH CARE · AFFECIO HACKS ’26</div></footer>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);