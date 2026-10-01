exports.handler = async (event) => {
  const VAPI_KEY = '96d7565b-f657-42e2-b144-670153ff65eb';
  
  // Build Vapi URL from query params
  const params = event.queryStringParameters || {};
  const path = params.path || '/call';
  delete params.path;
  const qs = new URLSearchParams(params).toString();
  const url = `https://api.vapi.ai${path}${qs ? '?' + qs : ''}`;
  
  const method = event.httpMethod || 'GET';
  const fetchOpts = {
    method,
    headers: {
      'Authorization': `Bearer ${VAPI_KEY}`,
      'Content-Type': 'application/json'
    }
  };
  if (event.body && method !== 'GET') fetchOpts.body = event.body;
  
  const res = await fetch(url, fetchOpts);
  const data = await res.text();
  
  return {
    statusCode: res.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: data
  };
};
