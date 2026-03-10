export async function onRequest(context) {
  const url = new URL(context.request.url);
  const backendUrl = context.env.BACKEND_URL;
  
  if (!backendUrl) {
    return new Response(JSON.stringify({ error: "BACKEND_URL environment variable is not configured in Cloudflare Pages." }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Construct the target URL by appending the path and search params to the backend URL
  const targetUrl = new URL(url.pathname + url.search, backendUrl);
  
  // Create a new request based on the original one
  const request = new Request(targetUrl, context.request);
  
  // Fetch from the backend and return the response
  return fetch(request);
}
