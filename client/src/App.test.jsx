import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import App from './App.jsx';

afterEach(cleanup);

const session = {
  openingMessage: '最近想把节奏放慢一点。',
  todayNote: { topic: '简单生活', opinion: '开始一个新爱好时，最没必要做的就是第一天把装备买齐。' },
  recentTopics: ['跑步', '通勤'],
  currentTopic: '跑步',
  creatorContent: [],
  creatorConfig: {
    name: '小柠',
    category: 'Lifestyle / Daily Finds',
    signature: '简单、舒服，不过度。',
    avatarStage: {
      mode: 'talk',
      mood: 'neutral',
      media: { type: 'image', src: '/assets/xiaoning-main.png' },
      fallbackImage: '/assets/xiaoning-main.png',
    },
  },
};

describe('Final Creator Home', () => {
  test('uses the active topic instead of a stale recent topic and sends the session id', async () => {
    const activeSession = { ...session, sessionId: 'session-b', currentTopic: 'iPhone 17', recentTopics: ['跑步耳机掉落问题'] };
    const getSessionState = vi.fn().mockResolvedValue(activeSession);
    const sendChat = vi.fn().mockResolvedValue({ interaction: 'SHARE', currentTopic: 'iPhone 17', segments: [{ type: 'text', content: '这次我们只聊手机。' }], products: [] });
    render(<App getSessionState={getSessionState} sendChat={sendChat} />);
    expect(await screen.findByTestId('avatar-stage')).toHaveTextContent('iPhone 17');
    expect(screen.getByTestId('livestream-room')).not.toHaveTextContent('跑步耳机掉落问题');
    fireEvent.change(screen.getByPlaceholderText('和小柠说点什么…'), { target: { value: '想看看iPhone17' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    await screen.findByText('这次我们只聊手机。');
    expect(sendChat).toHaveBeenCalledWith('想看看iPhone17', getSessionState.mock.calls[0][0]);
  });

  test('starts a clean server session from the new conversation control', async () => {
    const getSessionState = vi.fn()
      .mockResolvedValueOnce({ ...session, sessionId: 'session-a', currentTopic: '跑步耳机' })
      .mockResolvedValueOnce({ ...session, sessionId: 'session-b', currentTopic: null, recentTopics: [] });
    render(<App getSessionState={getSessionState} sendChat={vi.fn()} />);
    await screen.findByTestId('avatar-stage');
    await userEvent.setup().click(screen.getByRole('button', { name: '新对话' }));
    await screen.findByText('留一句话，慢慢聊');
    expect(screen.getByTestId('livestream-room')).not.toHaveTextContent('跑步耳机');
    expect(getSessionState).toHaveBeenCalledTimes(2);
    expect(getSessionState.mock.calls[1][0]).not.toBe('session-a');
  });

  test('renders a config-driven IP Virtual Host without human video assets', async () => {
    render(<App getSessionState={vi.fn().mockResolvedValue(session)} sendChat={vi.fn()} />);
    await screen.findByText('小柠');
    expect(screen.getByTestId('avatar-stage')).toHaveClass('avatar-stage-mode-talk');
    expect(screen.queryByTestId('avatar-video')).not.toBeInTheDocument();
    expect(screen.getByTestId('avatar-fallback')).toHaveAttribute('src', '/assets/xiaoning-main.png');
    expect(document.body.innerHTML).not.toMatch(/avatar-main\.mp4|creator-host\.png/);
    expect(screen.getByTestId('livestream-room')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '和小柠的对话' })).not.toBeInTheDocument();
    expect(screen.queryByText(/TODAY/)).not.toBeInTheDocument();
  });

  test('keeps fashion mode layout-ready and does not repeat assistant avatars in messages', async () => {
    const fashionSession = { ...session, creatorConfig: { ...session.creatorConfig, avatarStage: { ...session.creatorConfig.avatarStage, mode: 'fashion', media: { type: 'image', src: '/assets/fashion-placeholder.png' } } } };
    const sendChat = vi.fn().mockResolvedValue({ interaction: 'SHARE', segments: [{ type: 'text', content: '这一身的比例很舒服。' }], products: [] });
    render(<App getSessionState={vi.fn().mockResolvedValue(fashionSession)} sendChat={sendChat} />);
    await screen.findByText('小柠');
    expect(screen.getByTestId('avatar-stage')).toHaveClass('avatar-stage-mode-fashion');
    const input = screen.getByPlaceholderText('和小柠说点什么…');
    await userEvent.setup().type(input, '我准备白衬衫牛仔裤');
    await screen.getByRole('button', { name: '发送' }).click();
    expect(await screen.findByText('这一身的比例很舒服。')).toBeInTheDocument();
    expect(document.querySelectorAll('.message-avatar')).toHaveLength(0);
  });

  test('shows a livestream status and creator entry points without magazine copy', async () => {
    render(<App getSessionState={vi.fn().mockResolvedValue(session)} sendChat={vi.fn()} />);
    expect(await screen.findByTestId('avatar-stage')).toHaveTextContent('陪你聊聊');
    expect(screen.getByText('正在聊 · 跑步')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '最近有点累' })).toBeInTheDocument();
    expect(screen.queryByText('NOT A SHOPPING LIST')).not.toBeInTheDocument();
    expect(screen.queryByText(/AI|助手|在线/)).not.toBeInTheDocument();
  });

  test('keeps only the latest four interactions on stage and exposes the full history in a drawer', async () => {
    const sendChat = vi.fn()
      .mockResolvedValueOnce({ interaction: 'SHARE', segments: [{ type: 'text', content: '第一轮回复。' }], products: [] })
      .mockResolvedValueOnce({ interaction: 'SHARE', segments: [{ type: 'text', content: '第二轮回复。' }], products: [] })
      .mockResolvedValueOnce({ interaction: 'SHARE', segments: [{ type: 'text', content: '第三轮回复。' }], products: [] })
      .mockResolvedValueOnce({ interaction: 'SHARE', segments: [{ type: 'text', content: '第四轮回复。' }], products: [] })
      .mockResolvedValueOnce({ interaction: 'SHARE', segments: [{ type: 'text', content: '第五轮回复。' }], products: [] });
    render(<App getSessionState={vi.fn().mockResolvedValue(session)} sendChat={sendChat} />);
    await screen.findByTestId('avatar-stage');
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText('和小柠说点什么…');
    for (const text of ['一', '二', '三', '四', '五']) {
      await user.type(input, text);
      await user.click(screen.getByRole('button', { name: '发送' }));
      await screen.findByText(`${['第一', '第二', '第三', '第四', '第五'][['一', '二', '三', '四', '五'].indexOf(text)]}轮回复。`);
    }
    expect(screen.getByTestId('stage-interactions').querySelectorAll('[data-interaction]').length).toBeLessThanOrEqual(4);
    expect(screen.getByRole('button', { name: '查看对话' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '查看对话' }));
    expect(screen.getByRole('dialog', { name: '完整对话' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '完整对话' })).toHaveTextContent('第一轮回复。');
  });

  test('shows human status labels while a reply is loading', async () => {
    let resolveChat;
    const sendChat = vi.fn(() => new Promise((resolve) => { resolveChat = resolve; }));
    render(<App getSessionState={vi.fn().mockResolvedValue(session)} sendChat={sendChat} />);
    await screen.findByTestId('avatar-stage');
    fireEvent.change(screen.getByPlaceholderText('和小柠说点什么…'), { target: { value: '最近有点累' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    expect(screen.getAllByText(/正在听你说/).length).toBeGreaterThan(0);
    expect(screen.getByTestId('avatar-stage')).toHaveClass('avatar-stage-status-listening');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 320)); });
    expect(screen.getAllByText(/正在想/).length).toBeGreaterThan(0);
    expect(screen.getByTestId('avatar-stage')).toHaveClass('avatar-stage-status-thinking');
    await act(async () => resolveChat({ interaction: 'REACT', segments: [{ type: 'text', content: '先慢一点。' }], products: [] }));
    expect(await screen.findByText('先慢一点。')).toBeInTheDocument();
    expect(screen.getByTestId('avatar-stage')).toHaveClass('avatar-stage-mood-warm');
  });

  test('maps an explicitly positive moment to the happy stage state', async () => {
    const sendChat = vi.fn().mockResolvedValue({
      interaction: 'SHARE',
      analysis: { emotion: 'warm', topic: '项目' },
      segments: [{ type: 'text', content: '终于可以松一口气了。' }],
      products: [],
    });
    render(<App getSessionState={vi.fn().mockResolvedValue(session)} sendChat={sendChat} />);
    await screen.findByTestId('avatar-stage');
    fireEvent.change(screen.getByPlaceholderText('和小柠说点什么…'), { target: { value: '今天项目终于做完了，松了一大口气' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    await screen.findByText('终于可以松一口气了。');
    expect(screen.getByTestId('avatar-stage')).toHaveClass('avatar-stage-mood-happy');
  });

  test('renders mixed text and creator note segments after a message', async () => {
    const sendChat = vi.fn().mockResolvedValue({
      interaction: 'SHARE',
      segments: [
        { type: 'text', content: '最近开始跑步，先别急着买一整套。' },
        { type: 'creator_note', content: '我更在意能不能让你愿意明天再出门。' },
      ],
      products: [],
    });
    render(<App getSessionState={vi.fn().mockResolvedValue(session)} sendChat={sendChat} />);
    await screen.findByTestId('avatar-stage');
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('和小柠说点什么…'), '最近开始跑步了');
    await user.click(screen.getByRole('button', { name: '发送' }));
    expect(await screen.findByText('最近开始跑步，先别急着买一整套。')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '查看对话' }));
    expect(screen.getByRole('dialog', { name: '完整对话' }).querySelector('.creator-note-segment')).toHaveTextContent('我更在意能不能让你愿意明天再出门。');
    expect(screen.getByRole('dialog', { name: '完整对话' })).toHaveTextContent('最近开始跑步了');
  });

  test('renders evidence-backed ProductInsights with explicit currency and safe fallbacks', async () => {
    const sendChat = vi.fn().mockResolvedValue({
      interaction: 'CURATE',
      segments: [{ type: 'text', content: '我会先看轻一点、稳一点的。' }],
      products: [{
        id: 'p1', title: '轻量跑步耳机', price: 79.99, currency: 'USD', imageUrl: null,
        merchant: 'Example Shop', productUrl: 'https://shop.example/products/p1', checkoutUrl: null, source: 'shopify',
        productInsights: {
          productId: 'p1',
          sellingPoints: [{ label: '稳固佩戴', detail: '商品资料明确提到耳挂式佩戴设计。', evidence: 'description: Secure ear hooks for running.' }],
          suitableFor: ['跑步或日常运动'],
          personalizedReason: '你刚说跑动时最烦的是容易松，这款资料明确提到稳固佩戴。',
          tradeoff: '标价 USD 79.99，高于你给出的预算上限。',
          confidence: 0.78,
        },
      }],
    });
    render(<App getSessionState={vi.fn().mockResolvedValue(session)} sendChat={sendChat} />);
    await screen.findByTestId('avatar-stage');
    fireEvent.change(screen.getByPlaceholderText('和小柠说点什么…'), { target: { value: '那你帮我看看有没有适合跑步的耳机' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    expect(await screen.findByText('我会先看轻一点、稳一点的。')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '小柠帮你挑' })).not.toBeInTheDocument();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 820)); });
    const shelf = screen.getByRole('region', { name: '小柠帮你挑' });
    expect(shelf).toHaveTextContent('轻量跑步耳机');
    expect(shelf).toHaveTextContent('$79.99');
    expect(shelf).toHaveTextContent('图片暂缺');
    expect(shelf).toHaveTextContent('稳固佩戴');
    expect(shelf).toHaveTextContent('商品资料明确提到耳挂式佩戴设计。');
    expect(shelf).toHaveTextContent(/跑动时最烦的是容易松/);
    expect(shelf).toHaveTextContent(/高于你给出的预算上限/);
    expect(shelf).toHaveTextContent('description: Secure ear hooks for running.');
    expect(screen.queryByText('¥0')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /轻量跑步耳机/ })).toHaveAttribute('href', 'https://shop.example/products/p1');
  });

  test('does not render a bare amount when product currency is unknown', async () => {
    const sendChat = vi.fn().mockResolvedValue({
      interaction: 'CURATE',
      segments: [{ type: 'text', content: '这条信息先谨慎看。' }],
      products: [{
        id: 'p2', title: '信息有限的商品', price: 169.99, currency: null, imageUrl: null,
        merchant: 'Example Shop', productUrl: 'https://shop.example/products/p2', source: 'tavily',
        productInsights: { productId: 'p2', sellingPoints: [{ label: '明确型号', detail: '标题给出型号。', evidence: 'title: Model 1' }], personalizedReason: '型号可核对。', tradeoff: null, confidence: 0.6 },
      }],
    });
    render(<App getSessionState={vi.fn().mockResolvedValue(session)} sendChat={sendChat} />);
    await screen.findByTestId('avatar-stage');
    fireEvent.change(screen.getByPlaceholderText('和小柠说点什么…'), { target: { value: '帮我看看' } });
    fireEvent.click(screen.getByRole('button', { name: '发送' }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 820)); });
    const shelf = screen.getByRole('region', { name: '小柠帮你挑' });
    expect(shelf).toHaveTextContent('查看实时价格');
    expect(shelf).not.toHaveTextContent('169.99');
  });
});
