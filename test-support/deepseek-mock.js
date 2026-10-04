const originalFetch = globalThis.fetch;

globalThis.fetch = async (input, init = {}) => {
  const requestUrl = input instanceof URL ? input.href : String(input);
  if (requestUrl !== "https://api.deepseek.com/chat/completions") return originalFetch(input, init);

  const headers = new Headers(init.headers);
  if (headers.get("authorization") !== `Bearer ${process.env.DEEPSEEK_API_KEY}`) {
    return Response.json({ error: "Invalid test credential." }, { status: 401 });
  }
  const request = JSON.parse(init.body);
  if (request.model !== "deepseek-flash" || request.response_format?.type !== "json_object") {
    return Response.json({ error: "Unexpected test request." }, { status: 400 });
  }
  return Response.json({
    choices: [{
      message: {
        content: JSON.stringify({
          mode: "rent",
          currency: "INR",
          type: "Apartment",
          query: "Manikonda",
          maxPrice: 50000,
          minBeds: 2,
          summary: "2-bedroom rental near Manikonda under ₹50,000 per month."
        })
      }
    }]
  });
};
