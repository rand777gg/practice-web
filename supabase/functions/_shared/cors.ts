export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

export function corsResponse(body?: BodyInit | null, init?: ResponseInit) {
  return new Response(body, { ...init, headers: { ...corsHeaders, ...init?.headers } })
}

export function corsOk() {
  return new Response("ok", { headers: corsHeaders })
}
