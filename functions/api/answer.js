export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const { sessionId, answers } = body;

  if (!sessionId || !answers) {
    return json({ ok: false, error: "sessionId 또는 answers 누락" }, 400);
  }

  const sessionRaw = await env.WORDS_KV.get(`session:${sessionId}`);
  if (!sessionRaw) {
    return json({ ok: false, error: "세션이 만료되었거나 존재하지 않습니다." }, 400);
  }

  const session = JSON.parse(sessionRaw);
  const answerSheet = session.answerSheet;

  let score = 0;
  let total = 0;
  const result = {};

  for (const qid in answerSheet) {
    total++;
    const correct = answerSheet[qid];
    const userAnswer = answers[qid];

    const isCorrect = Number(userAnswer) === correct;
    if (isCorrect) score++;

    result[qid] = {
      correctIndex: correct,
      userAnswer: userAnswer,
      isCorrect
    };
  }

  return json({
    ok: true,
    score,
    total,
    result
  }, 200);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
