export const CREATOR_CONFIG = {
  id: 'xiaoning',
  name: '小柠',
  category: 'Lifestyle / Daily Finds',
  signature: '简单、舒服，不过度。',
  avatarStage: {
    mode: 'talk',
    mood: 'neutral',
    media: { type: 'image', src: '/assets/xiaoning-main.png' },
    mediaByMode: {
      talk: { type: 'image', src: '/assets/xiaoning-main.png' },
      present: { type: 'image', src: '/assets/xiaoning-main.png' },
      fashion: { type: 'image', src: '/assets/xiaoning-main.png' },
    },
    fallbackImage: '/assets/xiaoning-main.png',
    modeObjectPosition: {
      talk: '50% 12%',
      present: '42% 12%',
      fashion: '50% 4%',
    },
  },
};
