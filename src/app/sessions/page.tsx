"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";

type SessionRow = {
  id: string;
  host_id: string;
  title: string;
  purpose: string;
  start_at: string;
  end_at: string;
  place_text: string;
  capacity: number;
  status: string;
  created_at: string;
};

// 조인 결과는 상황에 따라 profiles가 null/객체/배열처럼 보일 때도 있어서
// 타입을 빡세게 잡으면 배포 빌드에서 터짐. 널널하게 처리.
type MemberRow = {
  session_id: string;
  user_id: string;
  role: "host" | "member" | string;
  profiles?: any; // <- 여기 핵심
};

type SortMode = "soon" | "late" | "newest";

export default function SessionsPage() {
  const [me, setMe] = useState<string | null>(null);

  const [rows, setRows] = useState<SessionRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [mineOnly, setMineOnly] = useState(false);
  const [purposeFilter, setPurposeFilter] = useState<"all" | string>("all");
  const [sortMode, setSortMode] = useState<SortMode>("soon");

  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [placeText, setPlaceText] = useState("");
  const [capacity, setCapacity] = useState(2);

  const [startAt, setStartAt] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60 * 1000)));
  const [endAt, setEndAt] = useState(() => toLocalInput(new Date(Date.now() + 2 * 60 * 60 * 1000)));

  const nowIso = useMemo(() => new Date().toISOString(), []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;
      setMe(uid);
      await loadAll();
    })();
  }, []);

  const loadAll = async () => {
    setLoading(true);

    const { data: sData, error: sErr } = await supabase
      .from("sessions")
      .select("*")
      .eq("status", "open")
      .gte("end_at", nowIso)
      .order("start_at", { ascending: true })
      .limit(50);

    if (sErr) alert(sErr.message);
    setRows((sData ?? []) as SessionRow[]);

    const { data: mData, error: mErr } = await supabase
      .from("session_members")
      .select("session_id,user_id,role,profiles(nickname)");

    if (mErr) alert(mErr.message);

    // TS가 조인 타입을 못 맞춰서 빌드 막는 걸 피하려고 unknown 거친다
    setMembers(((mData ?? []) as unknown) as MemberRow[]);

    setLoading(false);
  };

  const memberCount = (sessionId: string) => members.filter((m) => m.session_id === sessionId).length;
  const iJoined = (sessionId: string) => !!me && members.some((m) => m.session_id === sessionId && m.user_id === me);

  const getNickname = (m: MemberRow) => {
    const p = m.profiles;
    if (!p) return "익명";
    if (Array.isArray(p)) return p?.[0]?.nickname ?? "익명";
    if (typeof p === "object") return p.nickname ?? "익명";
    return "익명";
  };

  const memberNicknames = (sessionId: string) => {
    const list = members
      .filter((m) => m.session_id === sessionId)
      .map((m) => ({
        session_id: m.session_id,
        user_id: m.user_id,
        role: m.role,
        nickname: getNickname(m),
      }));

    list.sort((a, b) => (a.role === "host" ? -1 : 1) - (b.role === "host" ? -1 : 1));
    return list;
  };

  const createSession = async () => {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id ?? null;
    if (!uid) return alert("로그인부터 해야 함");

    const s = new Date(startAt);
    const e = new Date(endAt);
    if (isNaN(s.getTime())) return alert("시작 시간 이상함");
    if (isNaN(e.getTime())) return alert("종료 시간 이상함");
    if (e <= s) return alert("종료 시간이 시작 시간보다 뒤여야 함");
    if (capacity < 2 || capacity > 6) return alert("정원은 2~6");
    if (!title.trim()) return alert("제목 비었음");
    if (!purpose.trim()) return alert("목적 비었음");
    if (!placeText.trim()) return alert("장소 비었음");

    const { data: created, error: insErr } = await supabase
      .from("sessions")
      .insert({
        host_id: uid,
        title: title.trim(),
        purpose: purpose.trim(),
        start_at: s.toISOString(),
        end_at: e.toISOString(),
        place_text: placeText.trim(),
        capacity,
        status: "open",
      })
      .select("id")
      .single();

    if (insErr) return alert(insErr.message);

    const { error: memErr } = await supabase.from("session_members").insert({
      session_id: created.id,
      user_id: uid,
      role: "host",
    });

    if (memErr) alert("세션은 만들어졌는데 호스트 참가 저장 실패: " + memErr.message);

    await loadAll();
  };

  const join = async (sessionId: string, cap: number) => {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id ?? null;
    if (!uid) return alert("로그인부터 해야 함");

    if (members.some((m) => m.session_id === sessionId && m.user_id === uid)) return alert("이미 참가함");
    if (memberCount(sessionId) >= cap) return alert("정원 찼음");

    const { error } = await supabase.from("session_members").insert({
      session_id: sessionId,
      user_id: uid,
      role: "member",
    });

    if (error) return alert(error.message);
    await loadAll();
  };

  const leave = async (sessionId: string) => {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id ?? null;
    if (!uid) return alert("로그인부터 해야 함");

    const { error } = await supabase.from("session_members").delete().eq("session_id", sessionId).eq("user_id", uid);
    if (error) return alert(error.message);
    await loadAll();
  };

  const closeSession = async (sessionId: string, hostId: string) => {
    if (!me) return alert("로그인부터 해야 함");
    if (me !== hostId) return alert("호스트만 종료 가능");

    const { error } = await supabase
      .from("sessions")
      .update({ status: "closed" })
      .eq("id", sessionId)
      .eq("host_id", me);

    if (error) return alert(error.message);
    await loadAll();
  };

  const logout = async () => {
    await supabase.auth.signOut();
    location.href = "/";
  };

  const purposes = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.purpose);
    return Array.from(set).sort();
  }, [rows]);

  const visibleRows = useMemo(() => {
    const filtered = rows
      .filter((r) => !mineOnly || (me && members.some((m) => m.session_id === r.id && m.user_id === me)))
      .filter((r) => purposeFilter === "all" || r.purpose === purposeFilter);

    const sorted = [...filtered].sort((a, b) => {
      if (sortMode === "newest") return +new Date(b.created_at) - +new Date(a.created_at);
      if (sortMode === "late") return +new Date(b.start_at) - +new Date(a.start_at);
      return +new Date(a.start_at) - +new Date(b.start_at);
    });

    return sorted;
  }, [rows, members, me, mineOnly, purposeFilter, sortMode]);

  return (
    <main style={{ maxWidth: 820, margin: "60px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Sessions</h2>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
            내 세션만
          </label>

          <select value={purposeFilter} onChange={(e) => setPurposeFilter(e.target.value)} style={{ padding: 8 }}>
            <option value="all">전체</option>
            {purposes.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} style={{ padding: 8 }}>
            <option value="soon">가까운 시간순</option>
            <option value="late">늦은 시간순</option>
            <option value="newest">최신 생성순</option>
          </select>

          <button onClick={logout} style={{ padding: 10 }}>
            로그아웃
          </button>
        </div>
      </div>

      <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 14, marginTop: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>세션 만들기</div>

        <div style={{ display: "grid", gap: 8 }}>
          <input
  value={title}
  onChange={(e) => setTitle(e.target.value)}
  placeholder="제목"
/>

          <div style={{ display: "flex", gap: 8 }}>
            <input
  value={purpose}
  onChange={(e) => setPurpose(e.target.value)}
  placeholder="테마"
/>
            <input
              type="number"
              value={capacity}
              min={2}
              max={6}
              onChange={(e) => setCapacity(Number(e.target.value))}
              style={{ ...inp, width: 120 }}
            />
          </div>
          <input
  value={placeText}
  onChange={(e) => setPlaceText(e.target.value)}
  placeholder="장소 입력"
/>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} style={{ ...inp, flex: 1 }} />
            <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} style={{ ...inp, flex: 1 }} />
          </div>
          <button onClick={createSession} style={{ padding: 12 }}>
            생성
          </button>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        {loading ? (
          <div>불러오는 중</div>
        ) : visibleRows.length === 0 ? (
          <div>{mineOnly ? "내가 참가한 열린 세션 없음." : "열린 세션 없음."}</div>
        ) : (
          visibleRows.map((r) => {
            const cnt = memberCount(r.id);
            const joined = iJoined(r.id);
            const list = memberNicknames(r.id);

            return (
              <div key={r.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: 14, marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontWeight: 800 }}>{r.title}</div>
                  <div style={{ fontSize: 13, opacity: 0.75 }}>{r.purpose}</div>
                </div>

                <div style={{ marginTop: 6 }}>
                  {fmt(r.start_at)} ~ {fmt(r.end_at)}
                </div>

                <div style={{ marginTop: 6 }}>
                  {r.place_text} · 인원 {cnt}/{r.capacity}
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {!joined ? (
                    <button onClick={() => join(r.id, r.capacity)} style={{ padding: 10 }}>
                      참가
                    </button>
                  ) : (
                    <button onClick={() => leave(r.id)} style={{ padding: 10 }}>
                      나가기
                    </button>
                  )}

                  {me === r.host_id && (
                    <button onClick={() => closeSession(r.id, r.host_id)} style={{ padding: 10 }}>
                      세션 종료
                    </button>
                  )}
                </div>

                <div style={{ marginTop: 12, borderTop: "1px solid #f0f0f0", paddingTop: 10 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>참가자</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {list.map((m) => (
                      <span
                        key={`${m.session_id}-${m.user_id}`}
                        style={{
                          border: "1px solid #eee",
                          borderRadius: 999,
                          padding: "6px 10px",
                          fontSize: 13,
                        }}
                      >
                        {m.role === "host" ? "HOST " : ""}
                        {m.nickname}
                        {me === m.user_id ? " (나)" : ""}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}

const inp: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  border: "1px solid #ddd",
};

function fmt(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}
