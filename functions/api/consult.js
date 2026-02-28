export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();

    const name = (body.name || "").trim();
    const email = (body.email || "").trim();
    const phone = (body.phone || "").trim();
    const message = (body.message || "").trim();

    if (!name || !email || !message) {
      return new Response(JSON.stringify({ error: "필수값 누락" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const subject = `[상담신청] ${name} (${email})`;

    const html = `
      <h2>상담 신청 접수</h2>
      <ul>
        <li><b>이름</b>: ${name}</li>
        <li><b>이메일</b>: ${email}</li>
        <li><b>전화</b>: ${phone}</li>
      </ul>
      <pre style="white-space:pre-wrap">${message}</pre>
    `;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: \`Bearer \${env.RESEND_API_KEY}\`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [env.MAIL_TO],
        subject,
        html,
        reply_to: email,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return new Response(JSON.stringify({ error: text }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
