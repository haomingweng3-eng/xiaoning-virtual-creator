import { useEffect, useRef, useState } from 'react';
import { createConversation as defaultCreateConversation, createSessionId, deleteConversation as defaultDeleteConversation, getClientSessionId, listConversations as defaultListConversations, sendChat as defaultSendChat, getSessionState as defaultGetSessionState } from './api.js';

const DEFAULT_CREATOR_CONFIG = {
  name: '小柠',
  category: 'Lifestyle Virtual Creator',
  signature: '简单、舒服，不过度。',
  avatarStage: {
    mode: 'talk',
    mood: 'neutral',
    media: { type: 'image', src: '/assets/xiaoning-main.png' },
    fallbackImage: '/assets/xiaoning-main.png',
    modeObjectPosition: { talk: '50% 12%', present: '42% 12%', fashion: '50% 4%' },
  },
};

const ENTRY_SUGGESTIONS = [
  { label: '最近有点累', message: '今天有点累' },
  { label: '想听听你的看法', message: '最近开始跑步了，你怎么看？' },
  { label: '帮我挑点东西', message: '那你帮我看看有没有适合我的' },
  { label: '和小柠聊聊', message: '最近在想什么？' },
];

const MOOD_COPY = {
  neutral: '陪你聊聊',
  warm: '先陪你缓一会儿',
  happy: '替你开心一下',
  curate: '正在帮你挑',
};

function safeCreatorConfig(session) {
  return {
    ...DEFAULT_CREATOR_CONFIG,
    ...(session?.creatorConfig || {}),
    avatarStage: {
      ...DEFAULT_CREATOR_CONFIG.avatarStage,
      ...(session?.creatorConfig?.avatarStage || {}),
    },
  };
}

function queryMode() {
  const mode = new URLSearchParams(window.location.search).get('avatarMode');
  return ['talk', 'present', 'fashion'].includes(mode) ? mode : null;
}

function normalizeSegments(result) {
  if (Array.isArray(result?.segments) && result.segments.length) {
    return result.segments
      .filter((segment) => ['text', 'creator_note'].includes(segment?.type) && String(segment.content || '').trim())
      .slice(0, 3);
  }
  return String(result?.reply || '')
    .split(/\n{2,}/)
    .map((content) => content.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((content) => ({ type: 'text', content }));
}

function normalizeTitle(title) {
  return String(title || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

function uniqueProducts(products) {
  const seenUrls = new Set();
  const seenTitles = new Set();
  return (Array.isArray(products) ? products : [])
    .filter((product) => {
      const url = String(product?.productUrl || product?.url || '').trim();
      const title = normalizeTitle(product?.title);
      if (!product?.title || !/^https?:\/\//i.test(url) || seenUrls.has(url) || (title && seenTitles.has(title))) return false;
      seenUrls.add(url);
      if (title) seenTitles.add(title);
      return true;
    })
    .slice(0, 3);
}

function deriveMood(result, message = '') {
  const positiveMoment = /完成了|做完了|搞定了|成功了|被夸|开心|太好了|松了一口气|松了口气|值得庆祝/.test(message);
  if (result?.interaction === 'CURATE') return 'curate';
  if (positiveMoment) return 'happy';
  if (result?.interaction === 'REACT') return 'warm';
  const emotion = String(result?.analysis?.emotion || result?.emotion || '').toLowerCase();
  if (['happy', 'joy', 'excited', 'positive'].includes(emotion)) return 'happy';
  return 'neutral';
}

function deriveTopic(result, fallback = '') {
  return result?.currentTopic || result?.analysis?.topic || fallback;
}

function CreatorHeader({ creator, status, topic, onNewSession }) {
  return (
    <header className="creator-header">
      <div>
        <div className="creator-name-row">
          <h1>{creator.name}</h1>
          <span className="creator-category">{creator.category}</span>
        </div>
        <p>{status}{topic ? ` · ${topic}` : ''}</p>
      </div>
      <div className="creator-header-actions">
        <button type="button" className="new-conversation" onClick={onNewSession}>新对话</button>
        <span className="creator-header-mark" aria-hidden="true" />
      </div>
    </header>
  );
}

export function AvatarStage({
  creatorName = '小柠',
  mode = 'talk',
  mood = 'neutral',
  status = 'idle',
  topic = '',
  media,
  fallbackImage,
  modeObjectPosition = {},
  recentInteractions = [],
  currentPick = null,
  onOpenHistory,
}) {
  const imageSrc = media?.type === 'image' && media.src ? media.src : fallbackImage;
  const objectPosition = modeObjectPosition[mode] || '50% 12%';
  const statusCopy = status === 'thinking' ? '正在想' : status === 'listening' ? '正在听你说' : '正在聊';

  return (
    <section
      data-testid="avatar-stage"
      data-stage-layout="creator-room"
      className={`avatar-stage avatar-stage-mode-${mode} avatar-stage-mood-${mood} avatar-stage-status-${status}`}
      aria-label={`${creatorName} 的直播间`}
    >
      <div className="avatar-stage-frame">
        <div className="stage-visual">
          <div className="stage-visual-orbit" aria-hidden="true" />
          <img
            data-testid="avatar-fallback"
            className="avatar-media"
            src={imageSrc}
            alt={`${creatorName} 的 IP 形象`}
            style={{ objectPosition }}
          />
          <div className="stage-live-badge"><span />{statusCopy}</div>
        </div>
        <div className="stage-content">
          <div className="stage-identity">
            <span className="stage-identity-kicker">{mode === 'present' ? 'LIVE PICK' : 'XIAONING LIVE'}</span>
            <strong>{creatorName}</strong>
            <span>{MOOD_COPY[mood] || MOOD_COPY.neutral}{topic ? ` · ${topic}` : ''}</span>
          </div>
          {currentPick && mode === 'present' && (
            <div className="stage-current-pick">
              <span>CURRENT PICK</span>
              <strong>{currentPick.title}</strong>
              {(currentPick.productInsights?.personalizedReason || currentPick.reason) && <p>{currentPick.productInsights?.personalizedReason || currentPick.reason}</p>}
            </div>
          )}
          {recentInteractions.length > 0 ? (
            <div className="stage-interactions" data-testid="stage-interactions">
              {recentInteractions.map((message, index) => (
                <div className={`stage-interaction stage-interaction-${message.role}`} data-interaction key={`${message.role}-${message.id || index}`}>
                  <span>{message.role === 'user' ? '你' : creatorName}</span>
                  <p>{message.text}</p>
                </div>
              ))}
              <button type="button" className="history-trigger" aria-label="查看对话" onClick={onOpenHistory}>查看对话 ↗</button>
            </div>
          ) : (
            <div className="stage-opening">
              <span>NOW TALKING</span>
              <p>不急着找答案。<br />先说说你今天在想什么。</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function UserMessage({ message }) {
  return <article className="history-message history-message-user"><span>你</span><p>{message.text}</p></article>;
}

function CreatorMessage({ message, creatorName = '小柠' }) {
  return <article className="history-message history-message-creator"><span>{creatorName}</span><div>{message.segments.map((segment, index) => <p key={`${segment.content}-${index}`} className={segment.type === 'creator_note' ? 'creator-note-segment' : ''}>{segment.content}</p>)}</div></article>;
}

function HistoryDrawer({ messages, creatorName, onClose }) {
  return (
    <div className="history-drawer-backdrop" role="presentation" onClick={onClose}>
      <aside className="history-drawer" role="dialog" aria-modal="true" aria-label="完整对话" onClick={(event) => event.stopPropagation()}>
        <div className="history-drawer-heading"><div><span>CONVERSATION</span><h2>和{creatorName}的对话</h2></div><button type="button" onClick={onClose} aria-label="关闭对话">×</button></div>
        <div className="history-list">{messages.map((message, index) => message.role === 'user' ? <UserMessage key={`history-user-${index}`} message={message} /> : <CreatorMessage key={`history-creator-${index}`} message={message} creatorName={creatorName} />)}</div>
      </aside>
    </div>
  );
}

function EntryPrompts({ session, onSelect, disabled }) {
  return (
    <section className="entry-prompts">
      <div className="entry-intro"><span>现在想聊什么</span><p>{session?.currentTopic ? `正在聊 · ${session.currentTopic}` : '留一句话，慢慢聊'}</p></div>
      <div className="entry-list">{ENTRY_SUGGESTIONS.map((entry) => <button key={entry.label} type="button" disabled={disabled} onClick={() => onSelect(entry.message)}><span>{entry.label}</span><span aria-hidden="true">↗</span></button>)}</div>
    </section>
  );
}

function Composer({ input, setInput, onSubmit, loading, status = 'idle' }) {
  const statusText = loading
    ? (status === 'listening' ? '小柠 · 正在听你说' : '小柠 · 正在想')
    : '和小柠说点什么';
  return (
    <div className="composer-block">
      <div className="composer-status" aria-live="polite"><span className={loading ? 'is-active' : ''}>{statusText}</span></div>
      <form className="composer" onSubmit={(event) => { event.preventDefault(); onSubmit(input); }}>
        <input value={input} onChange={(event) => setInput(event.target.value)} disabled={loading} placeholder="和小柠说点什么…" aria-label="和小柠说点什么…" />
        <button type="submit" aria-label="发送" disabled={loading || !input.trim()}>发送 <span aria-hidden="true">↗</span></button>
      </form>
    </div>
  );
}

function formatMoney(price, currency) {
  const amount = Number(price);
  const code = String(currency || '').trim().toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(code)) return null;
  try {
    return new Intl.NumberFormat(code === 'CNY' ? 'zh-CN' : 'en-US', {
      style: 'currency', currency: code, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return null;
  }
}

function ProductCard({ product, index }) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = product.imageUrl || product.image;
  const productUrl = product.productUrl || product.url;
  const hasImage = Boolean(imageUrl) && !imageFailed;
  const formattedPrice = formatMoney(product.price, product.currency);
  const insights = product.productInsights || {};
  const sellingPoints = Array.isArray(insights.sellingPoints) ? insights.sellingPoints.filter((point) => point?.label && point?.detail && point?.evidence).slice(0, 3) : [];
  const reason = insights.personalizedReason || product.reason;
  const tradeoff = insights.tradeoff || product.tradeoff;
  return (
    <a className="product-card" href={productUrl} target="_blank" rel="noreferrer" aria-label={product.title}>
      <div className={`product-image ${hasImage ? '' : 'product-image-fallback'}`}>
        {hasImage ? <img src={imageUrl} alt="" onError={() => setImageFailed(true)} /> : <div className="image-fallback-copy"><span>图片暂缺</span><small>实时信息</small></div>}
        {index === 0 && <span className="pick-label">小柠先看这个</span>}
      </div>
      <div className="product-info">
        <div className="product-source">{product.merchant || product.source || '实时商品'}</div>
        <h3>{product.title}</h3>
        <div className="product-footer"><span className={formattedPrice ? 'product-price' : 'product-price product-price-muted'}>{formattedPrice || '查看实时价格'}</span><span className="product-link-label">查看商品 ↗</span></div>
        {sellingPoints.length > 0 && <ul className="selling-points">{sellingPoints.map((point) => <li key={`${point.label}-${point.evidence}`}><strong>{point.label}</strong><span>{point.detail}</span></li>)}</ul>}
        {reason && <p className="product-reason"><span>为什么小柠挑它</span>{reason}</p>}
        {tradeoff && <p className="product-tradeoff"><span>小柠提醒</span>{tradeoff}</p>}
        {sellingPoints.length > 0 && <details className="product-evidence"><summary>商品资料依据</summary>{sellingPoints.map((point) => <p key={point.evidence}>{point.evidence}</p>)}</details>}
      </div>
    </a>
  );
}

function ProductShelf({ products, topic }) {
  if (!products.length) return null;
  return (
    <section className="product-shelf" aria-label="小柠帮你挑">
      <div className="shelf-heading"><div><span>FROM THE LIVE ROOM</span><h2>小柠帮你挑{topic ? ` · ${topic}` : ''}</h2></div><p>主播正在讲，商品只是辅助信息</p></div>
      <div className="product-list">{products.map((product, index) => <ProductCard key={`${product.productUrl || product.url}-${index}`} product={product} index={index} />)}</div>
    </section>
  );
}

function TypingIndicator() {
  return <div className="typing-row" aria-label="小柠正在想一会儿"><span /><span /><span /></div>;
}

export default function App({ sendChat = defaultSendChat, getSessionState = defaultGetSessionState, listConversations = defaultListConversations, createConversation = defaultCreateConversation, deleteConversation = defaultDeleteConversation }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [stageState, setStageState] = useState(null);
  const [shelfProducts, setShelfProducts] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessionId, setSessionId] = useState(() => getClientSessionId());
  const [conversations, setConversations] = useState([]);
  const revealTimer = useRef(null);
  const thinkingTimer = useRef(null);

  useEffect(() => {
    let active = true;
    getSessionState(sessionId).then((nextSession) => {
      if (!active) return;
      setSession(nextSession);
      const restored = Array.isArray(nextSession.history) ? nextSession.history : [];
      setMessages(restored.map((turn, index) => turn.role === 'user'
        ? { role: 'user', text: turn.content, id: `restored-user-${index}` }
        : { role: 'assistant', segments: normalizeSegments({ reply: turn.content }), products: [], id: `restored-assistant-${index}` }));
    }).catch(() => { if (active) setSession({ recentTopics: [], currentTopic: null, history: [], creatorConfig: DEFAULT_CREATOR_CONFIG }); });
    listConversations().then((items) => { if (active) setConversations(items); }).catch(() => {});
    return () => { active = false; };
  }, [getSessionState, listConversations, sessionId]);

  useEffect(() => {
    return () => {
      if (revealTimer.current) window.clearTimeout(revealTimer.current);
      if (thinkingTimer.current) window.clearTimeout(thinkingTimer.current);
    };
  }, []);

  function startNewConversation() {
    if (revealTimer.current) window.clearTimeout(revealTimer.current);
    if (thinkingTimer.current) window.clearTimeout(thinkingTimer.current);
    createConversation().then((created) => {
      setSessionId(created.conversationId);
      setSession(created);
      setConversations((current) => [{ conversationId: created.conversationId, title: '新对话', messageCount: 0, updatedAt: created.updatedAt }, ...current]);
    }).catch(() => setSessionId(createSessionId()));
    setSession(null);
    setMessages([]);
    setInput('');
    setLoading(false);
    setStageState(null);
    setShelfProducts([]);
    setHistoryOpen(false);
  }

  async function removeConversation(conversationId) {
    await deleteConversation(conversationId);
    setConversations((current) => current.filter((item) => item.conversationId !== conversationId));
    if (conversationId === sessionId) startNewConversation();
  }

  async function submitMessage(rawMessage) {
    const message = String(rawMessage || '').trim();
    if (!message || loading) return;
    if (revealTimer.current) window.clearTimeout(revealTimer.current);
    setShelfProducts([]);
    setMessages((current) => [...current, { role: 'user', text: message, id: `${Date.now()}-user` }]);
    setInput('');
    setLoading(true);
    setStageState((current) => ({ ...current, status: 'listening' }));
    thinkingTimer.current = window.setTimeout(() => {
      setStageState((current) => ({ ...current, status: 'thinking' }));
    }, 280);
    try {
      const result = await sendChat(message, sessionId);
      if (thinkingTimer.current) window.clearTimeout(thinkingTimer.current);
      const products = uniqueProducts(result.products);
      const mood = deriveMood(result, message);
      const topic = deriveTopic(result, stageState?.topic || session?.currentTopic || '');
      setMessages((current) => [...current, { role: 'assistant', segments: normalizeSegments(result), products, id: `${Date.now()}-assistant` }]);
      setStageState({ status: 'idle', mode: result.interaction === 'CURATE' ? 'present' : 'talk', mood, topic, currentPick: products[0] || null });
      if (result.interaction === 'CURATE' && products.length) revealTimer.current = window.setTimeout(() => setShelfProducts(products), 720);
    } catch (error) {
      if (thinkingTimer.current) window.clearTimeout(thinkingTimer.current);
      const fallback = error.message || '这会儿有点走神，晚点再聊。';
      setMessages((current) => [...current, { role: 'assistant', segments: [{ type: 'text', content: fallback }], products: [], id: `${Date.now()}-assistant` }]);
      setStageState({ status: 'idle', mode: 'talk', mood: 'warm', topic: stageState?.topic || '' });
    } finally {
      setLoading(false);
    }
  }

  if (!session) return <main className="creator-app"><div className="creator-loading">小柠</div></main>;
  const creator = safeCreatorConfig(session);
  const avatar = creator.avatarStage;
  const configuredMode = queryMode() || stageState?.mode || avatar.mode || 'talk';
  const configuredMood = stageState?.mood || avatar.mood || 'neutral';
  const status = stageState?.status || (loading ? 'thinking' : 'idle');
  const topic = stageState?.topic || session.currentTopic || '';
  const media = avatar.mediaByMode?.[configuredMode] || avatar.media;
  const allInteractions = messages.flatMap((message, index) => message.role === 'user'
    ? [{ role: 'user', text: message.text, id: message.id || index }]
    : message.segments.map((segment, segmentIndex) => ({ role: 'assistant', text: segment.content, id: `${message.id || index}-${segmentIndex}` })));
  const recentInteractions = allInteractions.slice(-4);

  return (
    <main className={`creator-app ${messages.length ? 'has-conversation' : ''}`} data-testid="livestream-room">
      <div className="room-shell">
        <CreatorHeader creator={creator} status={status === 'thinking' ? '正在想' : status === 'listening' ? '正在听你说' : (MOOD_COPY[configuredMood] || '正在聊')} topic={topic} onNewSession={startNewConversation} />
        {conversations.length > 0 && <nav className="conversation-list" aria-label="会话列表"><span>我的对话</span>{conversations.slice(0, 8).map((item) => <div key={item.conversationId} className={item.conversationId === sessionId ? 'conversation-item is-active' : 'conversation-item'}><button type="button" onClick={() => setSessionId(item.conversationId)}>{item.title || '新对话'} <small>{item.messageCount || 0}</small></button><button type="button" aria-label={`删除${item.title || '对话'}`} onClick={() => removeConversation(item.conversationId)}>×</button></div>)}</nav>}
        <AvatarStage creatorName={creator.name} mode={configuredMode} mood={configuredMood} status={status} topic={topic} media={media} fallbackImage={avatar.fallbackImage} modeObjectPosition={avatar.modeObjectPosition} recentInteractions={recentInteractions} currentPick={stageState?.currentPick || null} onOpenHistory={() => setHistoryOpen(true)} />
        {!messages.length && <EntryPrompts session={session} onSelect={submitMessage} disabled={loading} />}
        {messages.length > 0 && loading && <TypingIndicator />}
        <Composer input={input} setInput={setInput} onSubmit={submitMessage} loading={loading} status={status} />
        <ProductShelf products={shelfProducts} topic={topic} />
      </div>
      {historyOpen && <HistoryDrawer messages={messages} creatorName={creator.name} onClose={() => setHistoryOpen(false)} />}
    </main>
  );
}
