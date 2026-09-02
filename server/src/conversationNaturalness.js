const CUSTOMER_SERVICE_PHRASES = [
  '您好',
  '很高兴为您服务',
  '有什么可以帮助',
  '有什么可以帮',
  '希望对你有帮助',
  '我理解你的感受',
];

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

export function analyzeTranscript(turns = []) {
  const assistantTurns = turns.filter((turn) => turn?.role === 'assistant');
  const questionTurns = assistantTurns.filter((turn) => /[？?]/u.test(String(turn.content || ''))).length;
  let consecutiveQuestionPairs = 0;
  let topicTransitions = 0;
  for (let index = 1; index < assistantTurns.length; index += 1) {
    if (/[？?]/u.test(String(assistantTurns[index - 1].content || ''))
      && /[？?]/u.test(String(assistantTurns[index].content || ''))) {
      consecutiveQuestionPairs += 1;
    }
    const previousTopic = String(assistantTurns[index - 1].topic || '');
    const topic = String(assistantTurns[index].topic || '');
    if (previousTopic && topic && previousTopic !== topic) topicTransitions += 1;
  }

  let repeatedUserExpressions = 0;
  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];
    if (turn?.role !== 'assistant') continue;
    const previousUser = [...turns.slice(0, index)].reverse().find((item) => item?.role === 'user');
    const userText = normalize(previousUser?.content);
    if (userText.length >= 4 && normalize(turn.content).includes(userText)) repeatedUserExpressions += 1;
  }

  const customerServiceTurns = assistantTurns.filter((turn) => CUSTOMER_SERVICE_PHRASES
    .some((phrase) => String(turn.content || '').includes(phrase))).length;

  return {
    assistantTurns: assistantTurns.length,
    questionTurns,
    questionRatio: assistantTurns.length ? questionTurns / assistantTurns.length : 0,
    consecutiveQuestionPairs,
    repeatedUserExpressions,
    customerServiceTurns,
    topicTransitions,
  };
}
