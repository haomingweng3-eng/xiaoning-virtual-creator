import { useEffect, useRef, useState } from 'react';
import { clearMemory as defaultClearMemory, createConversation as defaultCreateConversation, createSessionId, deleteConversation as defaultDeleteConversation, deleteMemory as defaultDeleteMemory, getCurrentConversationId, getMemory as defaultGetMemory, listConversations as defaultListConversations, sendChat as defaultSendChat, getSessionState as defaultGetSessionState } from './api.js';

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

function CreatorHeader({ creator, status, topic, onNewSession, onOpenConversations, onOpenMemory }) {
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
        <button type="button" className="new-conversation" onClick={onOpenConversations} aria-label="打开会话列表">会话</button>
        <button type="button" className="new-conversation" onClick={onOpenMemory} aria-label="打开小柠记住的">小柠记住的</button>
        <button type="button" className="new-conversation" onClick={onNewSession} aria-label="新对话">新对话</button>
        <span className="creator-header-mark" aria-hidden="true" />
      </div>
    </header>
  );
}

function ConversationDrawer({ conversations, activeId, onSelect, onNew, onDelete, onClose }) {
  return <div className="management-backdrop" role="presentation" onClick={onClose}><aside className="management-drawer" role="dialog" aria-modal="true" aria-label="会话列表" onClick={(event) => event.stopPropagation()}><div className="management-heading"><div><span>CONVERSATIONS</span><h2>最近对话</h2></div><button type="button" onClick={onClose} aria-label="关闭会话列表">×</button></div><button type="button" className="drawer-new" onClick={onNew}>＋ 新对话</button><div className="drawer-items">{conversations.map((item) => <div className={item.conversationId === activeId ? 'drawer-item is-active' : 'drawer-item'} key={item.conversationId}><button type="button" onClick={() => onSelect(item.conversationId)}><strong>{item.title || '新对话'}</strong><small>{item.currentTopic || `${item.messageCount || 0} 条消息`}</small></button><button type="button" aria-label={`删除${item.title || '对话'}`} onClick={() => onDelete(item.conversationId)}>×</button></div>)}</div></aside></div>;
}

function MemoryDrawer({ memory, onDelete, onClear, onClose }) {
  return <div className="management-backdrop" role="presentation" onClick={onClose}><aside className="management-drawer memory-drawer" role="dialog" aria-modal="true" aria-label="小柠记住的" onClick={(event) => event.stopPropagation()}><div className="management-heading"><div><span>LIGHTWEIGHT MEMORY</span><h2>小柠记住的</h2></div><button type="button" onClick={onClose} aria-label="关闭记忆">×</button></div><p className="memory-caption">只保留你明确说过、以后挑选有帮助的偏好、预算和兴趣；同一设备会跨新对话保留。</p>{memory.length ? <div className="drawer-items">{memory.map((item) => <div className="drawer-item memory-item" key={item.text}><div><span>{item.type}</span><strong>{item.text}</strong></div><button type="button" aria-label={`删除记忆${item.text}`} onClick={() => onDelete(item.text)}>×</button></div>)}</div> : <p className="memory-empty">还没有需要记住的事。</p>}{memory.length > 0 && <button type="button" className="clear-memory" onClick={onClear}>清空全部记忆</button>}</aside></div>;
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
    <section data-testid="avatar-stage" data-stage-layout="creator-panel" className={`avatar-stage avatar-stage-mode-${mode} avatar-stage-mood-${mood} avatar-stage-status-${status}`} aria-label={`${creatorName} 的 IP 形象`}>
      <div className="avatar-stage-frame">
        <div className="stage-visual">
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
            <strong>{creatorName}</strong>
            <span>{MOOD_COPY[mood] || MOOD_COPY.neutral}{topic ? ` · ${topic}` : ''}</span>
          </div>
          {currentPick && mode === 'present' && (
            <div className="stage-current-pick">
              <span>当前推荐</span>
              <strong>{currentPick.title}</strong>
              {(currentPick.productInsights?.personalizedReason || currentPick.reason) && <p>{currentPick.productInsights?.personalizedReason || currentPick.reason}</p>}
            </div>
          )}
          {recentInteractions.length > 0 ? (
            <div className="stage-interactions" data-testid="stage-interactions">
              {recentInteractions.map((message, index) => (
                <div className={`stage-interaction stage-interaction-${message.role}`} data-interaction aria-hidden="true" key={`${message.role}-${message.id || index}`}>
                  <span>{message.role === 'user' ? '你' : creatorName}</span>
                  <p data-text={message.text} />
                </div>
              ))}
              <button type="button" className="history-trigger" aria-label="查看对话" onClick={onOpenHistory}>查看对话 ↗</button>
            </div>
          ) : (
            <div className="stage-opening">
              <span>小柠在这里</span>
              <p>不急着找答案。<br />先说说你今天在想什么。</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function formatConversationTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Math.max(0, Date.now() - date.getTime());
  if (diff < 60 * 60 * 1000) return '刚刚';
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}小时前`;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function Sidebar({ conversations, activeId, memory, onSelect, onNew, onDelete, onOpenMemory }) {
  return <aside className="app-sidebar" data-testid="app-sidebar">
    <div className="sidebar-brand"><img src="/assets/xiaoning-main.png" alt="" /><div><strong>小柠 <span>✦</span></strong><small>生活方式虚拟创作者</small></div></div>
    <button type="button" className="sidebar-new" onClick={onNew}>＋ <span>新对话</span></button>
    <div className="sidebar-section"><div className="sidebar-section-heading"><span>最近对话</span><small>{conversations.length}</small></div><div className="sidebar-conversations">{conversations.map((item) => <div className={`sidebar-conversation ${item.conversationId === activeId ? 'is-active' : ''}`} key={item.conversationId}><button type="button" onClick={() => onSelect(item.conversationId)}><span className="conversation-icon">▢</span><span className="conversation-copy"><strong>{item.title || '新对话'}</strong><small>{formatConversationTime(item.updatedAt)}</small></span></button><button type="button" className="sidebar-delete" aria-label={`删除${item.title || '对话'}`} onClick={() => onDelete(item.conversationId)}>×</button></div>)}</div></div>
    <div className="sidebar-memory"><button type="button" className="memory-heading" onClick={onOpenMemory}><span>🔖</span><strong>小柠记住的</strong></button>{memory.slice(0, 3).map((item) => <div className={`memory-preview memory-preview-${item.type}`} key={item.text}><span>{item.text}</span><b>{item.type}</b></div>)}{!memory.length && <p>还没有需要记住的事。</p>}<button type="button" className="memory-all" onClick={onOpenMemory}>查看全部记忆 <span>›</span></button></div>
    <div className="sidebar-footer">小柠 · 陪你慢慢选</div>
  </aside>;
}

function CreatorPanel({ creator, todayNote, avatar, configuredMode, configuredMood, status, topic, currentPick, recentInteractions, onOpenHistory, shelfProducts }) {
  const currentPickImage = currentPick?.imageUrl || currentPick?.image;
  const currentPickUrl = currentPick?.productUrl || currentPick?.url;
  const currentPickInsights = currentPick?.productInsights || {};
  return <aside className="creator-panel" data-testid="creator-panel">
    <div className="creator-panel-heading"><div><strong>{creator.name}</strong><small>生活方式虚拟创作者</small></div><span><i />在线</span></div>
    <AvatarStage creatorName={creator.name} mode={configuredMode} mood={configuredMood} status={status} topic={topic} media={avatar.mediaByMode?.[configuredMode] || avatar.media} fallbackImage={avatar.fallbackImage} modeObjectPosition={avatar.modeObjectPosition} recentInteractions={recentInteractions} currentPick={currentPick} onOpenHistory={onOpenHistory} />
    <div className="creator-note"><span>小柠的今日想法</span><p>{todayNote?.opinion || creator.signature || '专注当下，认真生活，也给自己一点小确幸。'}</p></div>
    {shelfProducts.length > 0 && currentPick && <section className="creator-current-pick" aria-label="当前推荐">
      <div className="creator-current-pick-heading"><span>当前推荐</span><span aria-hidden="true">›</span></div>
      <div className="creator-current-pick-body">
        <div className="creator-current-pick-image">
          {currentPickImage ? <img src={currentPickImage} alt="" /> : <span>实时商品</span>}
        </div>
        <div className="creator-current-pick-copy">
          <strong>{currentPick.model || currentPick.title}</strong>
          {currentPick.variantLabel && <span>{currentPick.variantLabel}</span>}
          <b>{formatMoney(currentPick.price, currentPick.currency) || '查看实时价格'}</b>
        </div>
      </div>
      {(currentPickInsights.personalizedReason || currentPick.reason) && <p><span>理由</span>{currentPickInsights.personalizedReason || currentPick.reason}</p>}
      {/^https?:\/\//i.test(String(currentPickUrl || '')) && <a href={currentPickUrl} target="_blank" rel="noreferrer">查看详情 <span aria-hidden="true">↗</span></a>}
    </section>}
  </aside>;
}

function UserMessage({ message }) {
  return <article className="history-message history-message-user"><p>{message.text}</p></article>;
}

function CreatorMessage({ message, creatorName = '小柠', showMeta = true }) {
  return <article className={`history-message history-message-creator ${showMeta ? '' : 'history-message-continuation'}`}>
    {showMeta ? <div className="creator-message-meta creator-message-meta-inline"><span className="message-avatar">小</span><strong>{creatorName}</strong><time>{message.time || '刚刚'}</time></div> : <div className="creator-message-meta-spacer" aria-hidden="true" />}
    <div className="creator-message-body">{message.segments.map((segment, index) => <p key={`${segment.content}-${index}`} className={segment.type === 'creator_note' ? 'creator-note-segment' : ''}>{segment.content}</p>)}</div>
  </article>;
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
  function handleKeyDown(event) {
    const isComposing = event.nativeEvent.isComposing || event.keyCode === 229;
    if (event.key === 'Enter' && !event.shiftKey && !isComposing) {
      event.preventDefault();
      onSubmit(input);
    }
  }
  return (
    <div className="composer-block">
      <div className="composer-status" aria-live="polite"><span className={loading ? 'is-active' : ''}>{statusText}</span></div>
      <form className="composer" onSubmit={(event) => { event.preventDefault(); onSubmit(input); }}>
        <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleKeyDown} disabled={loading} placeholder="和小柠说点什么…" aria-label="和小柠说点什么…" rows="1" />
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
  const specifications = (Array.isArray(product.specifications) ? product.specifications : insights.specifications || [])
    .filter((spec) => spec?.label && spec?.value && spec?.evidence);
  const reason = insights.personalizedReason || product.reason;
  const tradeoff = insights.tradeoff || product.tradeoff;
  const brand = product.brand || null;
  const model = product.model || product.title;
  const variantLabel = product.variantLabel || null;
  const visibleSpecifications = specifications.slice(0, 4);
  const extraSpecifications = specifications.slice(4);
  return (
    <a className="product-card" href={productUrl} target="_blank" rel="noreferrer" aria-label={product.title}>
      <div className={`product-image ${hasImage ? '' : 'product-image-fallback'}`}>
        {hasImage ? <img src={imageUrl} alt="" onError={() => setImageFailed(true)} /> : <div className="image-fallback-copy"><span>图片暂缺</span><small>实时信息</small></div>}
        {index === 0 && <span className="pick-label">小柠先看这个</span>}
      </div>
      <div className="product-info">
        <div className="product-source">{product.merchant || product.source || '实时商品'}</div>
        <div className="product-identity" title={product.title}>
          {brand && <span className="product-brand">{brand}</span>}
          <h3>{model}</h3>
          {variantLabel && <span className="product-variant">{variantLabel}</span>}
        </div>
        <div className="product-footer"><span className={formattedPrice ? 'product-price' : 'product-price product-price-muted'}>{formattedPrice || '查看实时价格'}</span><span className="product-link-label">查看商品 ↗</span></div>
        {specifications.length > 0 && <div className="product-specifications">
          <span className="product-specifications-title">规格信息</span>
          <dl>{visibleSpecifications.map((spec) => <div className="product-specification-row" key={`${spec.label}-${spec.value}`}><dt>{spec.label}</dt><dd title={spec.evidence}>{spec.value}</dd></div>)}</dl>
          {extraSpecifications.length > 0 && <details><summary>查看全部规格 <span aria-hidden="true">›</span></summary><dl>{extraSpecifications.map((spec) => <div className="product-specification-row" key={`${spec.label}-${spec.value}`}><dt>{spec.label}</dt><dd title={spec.evidence}>{spec.value}</dd></div>)}</dl></details>}
        </div>}
        {sellingPoints.length > 0 && <ul className="selling-points">{sellingPoints.map((point) => <li key={`${point.label}-${point.evidence}`}><strong>{point.label}</strong><span>{point.detail}</span></li>)}</ul>}
        {reason && <p className="product-reason"><span>为什么小柠挑它</span>{reason}</p>}
        {tradeoff && <p className="product-tradeoff"><span>小柠提醒</span>{tradeoff}</p>}
        {sellingPoints.length > 0 && <details className="product-evidence"><summary>商品资料依据</summary>{sellingPoints.map((point, pointIndex) => <p key={`${point.evidence}-${pointIndex}`}>{point.evidence}</p>)}</details>}
      </div>
    </a>
  );
}

function ProductShelf({ products, topic }) {
  if (!products.length) return null;
  const cardLayout = products.length === 1 ? 'single-horizontal' : products.length === 2 ? 'two-column' : 'three-column';
  return (
    <section className="product-shelf" aria-label="小柠帮你挑">
      <div className="shelf-heading"><div><span>CREATOR PICKS</span><h2>小柠帮你挑{topic ? ` · ${topic}` : ''}</h2></div><p>根据你刚才说的{topic ? `${topic}需求` : '需求'}，我先留下这几款。</p></div>
      <div className={`product-list product-list-count-${products.length}`} data-card-layout={cardLayout}>{products.map((product, index) => <ProductCard key={`${product.productUrl || product.url}-${index}`} product={product} index={index} />)}</div>
    </section>
  );
}

function TypingIndicator() {
  return <div className="typing-row" aria-label="小柠正在想一会儿"><span /><span /><span /></div>;
}

export default function App({ sendChat = defaultSendChat, getSessionState = defaultGetSessionState, listConversations = defaultListConversations, createConversation = defaultCreateConversation, deleteConversation = defaultDeleteConversation, getMemory = defaultGetMemory, deleteMemory = defaultDeleteMemory, clearMemory = defaultClearMemory }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [stageState, setStageState] = useState(null);
  const [shelfProducts, setShelfProducts] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversationId, setConversationId] = useState(() => getCurrentConversationId());
  const [conversations, setConversations] = useState([]);
  const [memory, setMemory] = useState([]);
  const [managementOpen, setManagementOpen] = useState(null);
  const revealTimer = useRef(null);
  const thinkingTimer = useRef(null);
  const messageListRef = useRef(null);

  useEffect(() => {
    const list = messageListRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, loading, shelfProducts]);

  useEffect(() => {
    let active = true;
    getSessionState(conversationId).then((nextSession) => {
      if (!active) return;
      setSession(nextSession);
      const restored = Array.isArray(nextSession.history) ? nextSession.history : [];
      setMessages(restored.map((turn, index) => turn.role === 'user'
        ? { role: 'user', text: turn.content, id: `restored-user-${index}` }
        : { role: 'assistant', segments: normalizeSegments({ reply: turn.content }), products: [], id: `restored-assistant-${index}` }));
    }).catch(() => { if (active) setSession({ recentTopics: [], currentTopic: null, history: [], creatorConfig: DEFAULT_CREATOR_CONFIG }); });
    listConversations().then((items) => { if (active) setConversations(items); }).catch(() => {});
    getMemory().then((items) => { if (active) setMemory(items); }).catch(() => {});
    return () => { active = false; };
  }, [getSessionState, listConversations, getMemory, conversationId]);

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
      setConversationId(created.conversationId);
      setSession(created);
      setConversations((current) => [{ conversationId: created.conversationId, title: '新对话', messageCount: 0, updatedAt: created.updatedAt }, ...current]);
      setManagementOpen(null);
    }).catch(() => setConversationId(createSessionId()));
    setSession(null);
    setMessages([]);
    setInput('');
    setLoading(false);
    setStageState(null);
    setShelfProducts([]);
    setHistoryOpen(false);
  }

  async function removeConversation(idToRemove) {
    await deleteConversation(idToRemove);
    setConversations((current) => current.filter((item) => item.conversationId !== idToRemove));
    if (idToRemove === conversationId) startNewConversation();
  }

  async function removeMemory(text) { await deleteMemory(text); setMemory((current) => current.filter((item) => item.text !== text)); }
  async function removeAllMemory() { await clearMemory(); setMemory([]); }

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
      const result = await sendChat(message, conversationId);
      listConversations().then((items) => setConversations(items)).catch(() => {});
      getMemory().then((items) => setMemory(items)).catch(() => {});
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
    <main className={`creator-app ${messages.length ? 'has-conversation' : ''}`} data-testid="livestream-room" data-layout="three-column">
      <div className="app-shell">
        <Sidebar conversations={conversations} activeId={conversationId} memory={memory} onSelect={(id) => setConversationId(id)} onNew={startNewConversation} onDelete={removeConversation} onOpenMemory={() => setManagementOpen('memory')} />
        <section className="conversation-pane" data-testid="conversation-pane">
          <CreatorHeader creator={creator} status={status === 'thinking' ? '正在想' : status === 'listening' ? '正在听你说' : (MOOD_COPY[configuredMood] || '正在聊')} topic={topic} onNewSession={startNewConversation} onOpenConversations={() => setManagementOpen('conversations')} onOpenMemory={() => setManagementOpen('memory')} />
          <div className="conversation-body">
            <div className="conversation-heading"><div><span>CONVERSATION</span><h2>{session.title || topic || '和小柠聊聊'}</h2></div><div className="conversation-heading-actions"><span>{session.updatedAt ? formatConversationTime(session.updatedAt) : '刚刚'}</span><button type="button" className="conversation-search" aria-label="搜索对话">⌕</button><button type="button" aria-label="更多">•••</button></div></div>
            {messages.length ? <div className="message-list" ref={messageListRef}>{messages.map((message, index) => message.role === 'user' ? <UserMessage key={`message-user-${index}`} message={message} /> : <CreatorMessage key={`message-creator-${index}`} message={message} creatorName={creator.name} showMeta={index === 0 || messages[index - 1]?.role !== 'assistant'} />)}{loading && <TypingIndicator />}{shelfProducts.length > 0 && <ProductShelf products={shelfProducts} topic={topic} />}</div> : <EntryPrompts session={session} onSelect={submitMessage} disabled={loading} />}
          </div>
          <div className="conversation-compose"><Composer input={input} setInput={setInput} onSubmit={submitMessage} loading={loading} status={status} /></div>
        </section>
        <CreatorPanel creator={creator} todayNote={session.todayNote} avatar={avatar} configuredMode={configuredMode} configuredMood={configuredMood} status={status} topic={topic} currentPick={stageState?.currentPick || null} recentInteractions={recentInteractions} onOpenHistory={() => setHistoryOpen(true)} shelfProducts={shelfProducts} />
      </div>
      {historyOpen && <HistoryDrawer messages={messages} creatorName={creator.name} onClose={() => setHistoryOpen(false)} />}
      {managementOpen === 'conversations' && <ConversationDrawer conversations={conversations} activeId={conversationId} onSelect={(id) => { setConversationId(id); setManagementOpen(null); }} onNew={startNewConversation} onDelete={removeConversation} onClose={() => setManagementOpen(null)} />}
      {managementOpen === 'memory' && <MemoryDrawer memory={memory} onDelete={removeMemory} onClear={removeAllMemory} onClose={() => setManagementOpen(null)} />}
    </main>
  );
}
