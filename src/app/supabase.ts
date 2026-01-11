import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// build 때 url/key 없으면 죽는 거 방지(그래도 환경변수는 넣어야 정상 동작)
export const supabase = createClient(url, key);
