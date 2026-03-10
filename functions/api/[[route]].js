export async function onRequest(context) {
  const url = new URL(context.request.url);
  const backendUrl = context.env.BACKEND_URL;
  
  if (!backendUrl) {
    return new Response(JSON.stringify({ error: "BACKEND_URL environment variable is not configured in Cloudflare Pages." }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let targetUrl;
  try {
    targetUrl = new URL(url.pathname + url.search, backendUrl);
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid BACKEND_URL configuration: " + err.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Clone headers and remove Host
  const headers = new Headers(context.request.headers);
  headers.delete('Host');
  
  // Create a new request based on the original one
  const requestInit = {
    method: context.request.method,
    headers: headers,
    redirect: 'manual'
  };
  
  // Only add body if it's a method that allows a body
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(context.request.method)) {
    requestInit.body = context.request.body;
    // Required for streaming bodies in Cloudflare Workers
    requestInit.duplex = 'half';
  }
  
  const request = new Request(targetUrl, requestInit);
  
  // Fetch from the backend and return the response
  return fetch(request);
}
