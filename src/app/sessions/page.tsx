"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

type MemberRow = {
  session_id: string;
  user_id: string;
  role: string;
  profiles?: any; // 조인 결과 타입 헐렁하게
};

export default function SessionsPage() {
  const router = useRouter();

  const [me, setMe] = useState<string | null>(null);
  const [meNick, setMeNick] = useState<string>("");

  const [rows, setRows] = useState<SessionRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [toast, setToast] = useState<string>("");

  const [mineOnly, setMineOnly] = useState(false);
  const [purposeFilter, setPurposeFilter] = useState<string>("all");
  const [sortMode, setSortMode] = useState<"soon" | "late" | "newest">("soon");

  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [placeText, setPlaceText] = useState("");
  const [capacity, setCapacity] = useState(2);

  const [startAt, setStartAt] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60 * 1000)));
  const [endAt, setEndAt] = useState(() => toLocalInput(new Date(Date.now() + 2 * 60 * 60 * 1000)));

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;
      if (!uid) {
        router.replace("/");
        return;
      }
      setMe(uid);

      const { data: pData } = await supabase.from("profiles").select("nickname").eq("id", uid).maybeSingle();
      setMeNick(pData?.nickname ?? "");

      await loadAll(uid);
      setLoading(false);
    };

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (!sess) router.replace("/");
    });

    return () => sub.subscription.unsubscribe();
  }, [router]);

  const loadAll = async (_uid?: string) => {
    setToast("");

    const nowIso = new Date().toISOString();

    const { data: sData, error: sErr } = await supabase
      .from("sessions")
      .select("*")
      .eq("status", "open")
      .gte("end_at", nowIso)
      .order("start_at", { ascending: true })
      .limit(100);

    if (sErr) setToast(sErr.message);
    setRows((sData ?? []) as SessionRow[]);

    const { data: mData, error: mErr } = await supabase
      .from("session_members")
      .select("session_id,user_id,role,profiles(nickname)");

    if (mErr) setToast(mErr.message);
    setMembers(((mData ?? []) as unknown) as MemberRow[]);
  };

  const memberCount = (sessionId: string) => members.filter((m) => m.session_id === sessionId).length;
  const joined = (sessionId: string) => !!me && members.some((m) => m.session_id === sessionId && m.user_id === me);

  const getNickname = (m: MemberRow) => {
    const p = m.profiles;
    if (!p) return "익명";
    if (Array.isArray(p)) return p?.[0]?.nickname ?? "익명";
    if (typeof p === "object") return p.nickname ?? "익명";
    return "익명";
  };

  const avatarsFor = (sessionId: string) => {
    const list = members
      .filter((m) => m.session_id === sessionId)
      .map((m) => ({
        user_id: m.user_id,
        role: m.role,
        nickname: getNickname(m),
      }));

    list.sort((a, b) => (a.role === "host" ? -1 : 1) - (b.role === "host" ? -1 : 1));
    return list.slice(0, 6);
  };

  const purposes = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.purpose);
    return Array.from(set).sort();
  }, [rows]);

  const visibleRows = useMemo(() => {
    const filtered = rows
      .filter((r) => (mineOnly ? !!me && members.some((m) => m.session_id === r.id && m.user_id === me) : true))
      .filter((r) => (purposeFilter === "all" ? true : r.purpose === purposeFilter));

    const sorted = [...filtered].sort((a, b) => {
      if (sortMode === "newest") return +new Date(b.created_at) - +new Date(a.created_at);
      if (sortMode === "late") return +new Date(b.start_at) - +new Date(a.start_at);
      return +new Date(a.start_at) - +new Date(b.start_at);
    });

    return sorted;
  }, [rows, members, me, mineOnly, purposeFilter, sortMode]);

  const createSession = async () => {
    setToast("");

    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id ?? null;
    if (!uid) return setToast("로그인부터");

    const s = new Date(startAt);
    const e = new Date(endAt);

    if (!title.trim()) return setToast("제목 비었음");
    if (!purpose.trim()) return setToast("테마 비었음");
    if (!placeText.trim()) return setToast("장소 비었음");
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return setToast("시간 이상함");
    if (e <= s) return setToast("종료 시간이 시작보다 뒤여야 함");
    if (capacity < 2 || capacity > 6) return setToast("정원은 2~6");

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

    if (insErr) return setToast(insErr.message);

    const { error: memErr } = await supabase.from("session_members").insert({
      session_id: created.id,
      user_id: uid,
      role: "host",
    });

    if (memErr) setToast("세션 생성은 됐는데 참가 저장 실패: " + memErr.message);

    setTitle("");
    setPurpose("");
    setPlaceText("");
    setCapacity(2);

    await loadAll(uid);
  };

  const joinSession = async (sessionId: string, cap: number) => {
    setToast("");

    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id ?? null;
    if (!uid) return setToast("로그인부터");

    if (members.some((m) => m.session_id === sessionId && m.user_id === uid)) return setToast("이미 참가함");
    if (memberCount(sessionId) >= cap) return setToast("정원 찼음");

    const { error } = await supabase.from("session_members").insert({
      session_id: sessionId,
      user_id: uid,
      role: "member",
    });

    if (error) return setToast(error.message);
    await loadAll(uid);
  };

  const leaveSession = async (sessionId: string) => {
    setToast("");

    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id ?? null;
    if (!uid) return setToast("로그인부터");

    const { error } = await supabase.from("session_members").delete().eq("session_id", sessionId).eq("user_id", uid);
    if (error) return setToast(error.message);
    await loadAll(uid);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace("/");
  };

  const meBadge = useMemo(() => {
    const base = (meNick || "ME").trim();
    return base.length ? base[0].toUpperCase() : "M";
  }, [meNick]);

  return (
    <>
      <div className="topbar">
        <div className="topbarInner">
          <div className="row" style={{ gap: 10 }}>
            <div className="brand">타임메이트</div>
            <span className="tag">Sessions</span>
          </div>

          <div className="row" style={{ gap: 10 }}>
            <span className="pill">
              <span className="avatar" style={{ width: 26, height: 26, fontSize: 12 }}>
                {meBadge}
              </span>
              <span className="small">{meNick ? meNick : "로그인됨"}</span>
            </span>
            <button className="btn btnGhost" onClick={logout}>
              로그아웃
            </button>
          </div>
        </div>
      </div>

      <div className="container" style={{ paddingTop: 16 }}>
        <div className="feed">
          <div style={{ display: "grid", gap: 14 }}>
            <div className="card cardPad">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                <h3 className="sectionTitle" style={{ margin: 0 }}>
                  열린 세션
                </h3>

                <div className="row" style={{ gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <label className="pill" style={{ cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={mineOnly}
                      onChange={(e) => setMineOnly(e.target.checked)}
                      style={{ transform: "translateY(1px)" }}
                    />
                    내 세션만
                  </label>

                  <select className="input" style={{ width: 160 }} value={purposeFilter} onChange={(e) => setPurposeFilter(e.target.value)}>
                    <option value="all">전체</option>
                    {purposes.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>

                  <select className="input" style={{ width: 160 }} value={sortMode} onChange={(e) => setSortMode(e.target.value as any)}>
                    <option value="soon">가까운 시간순</option>
                    <option value="late">늦은 시간순</option>
                    <option value="newest">최신 생성순</option>
                  </select>
                </div>
              </div>

              {toast && (
                <div style={{ marginTop: 12 }} className="toast">
                  {toast}
                </div>
              )}
            </div>

            {loading ? (
              <div className="card cardPad">불러오는 중</div>
            ) : visibleRows.length === 0 ? (
              <div className="card cardPad">{mineOnly ? "내가 참가한 열린 세션 없음." : "열린 세션 없음."}</div>
            ) : (
              visibleRows.map((r) => {
                const cnt = memberCount(r.id);
                const isJoined = joined(r.id);
                const avs = avatarsFor(r.id);

                return (
                  <div key={r.id} className="card">
                    <div className="cardPad">
                      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ display: "grid", gap: 6 }}>
                          <div className="row" style={{ gap: 10 }}>
                            <div style={{ fontWeight: 900, letterSpacing: -0.2 }}>{r.title}</div>
                            <span className="tag">{r.purpose}</span>
                          </div>
                          <div className="muted small">
                            {fmt(r.start_at)} ~ {fmt(r.end_at)}
                          </div>
                          <div className="small">
                            {r.place_text} · <span className="muted">인원</span> {cnt}/{r.capacity}
                          </div>
                        </div>

                        <div className="row" style={{ gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {!isJoined ? (
                            <button className="btn btnBlue" onClick={() => joinSession(r.id, r.capacity)}>
                              참가
                            </button>
                          ) : (
                            <button className="btn btnGhost" onClick={() => leaveSession(r.id)}>
                              나가기
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="hr" />

                      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                          {avs.map((m) => (
                            <span key={m.user_id} className="pill" title={m.nickname}>
                              <span className="avatar">{(m.nickname?.trim()?.[0] ?? "익").toUpperCase()}</span>
                              <span className="small">
                                {m.role === "host" ? "HOST " : ""}
                                {m.nickname}
                                {me === m.user_id ? " (나)" : ""}
                              </span>
                            </span>
                          ))}
                        </div>

                        <span className="muted small">좋은 사람만 와라</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            <div className="card cardPad">
              <h3 className="sectionTitle" style={{ marginTop: 0 }}>
                세션 만들기
              </h3>

              <div style={{ display: "grid", gap: 10 }}>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" />
                <div className="grid2">
                  <input className="input" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="테마" />
                  <input
                    className="input"
                    type="number"
                    value={capacity}
                    min={2}
                    max={6}
                    onChange={(e) => setCapacity(Number(e.target.value))}
                    placeholder="정원(2~6)"
                  />
                </div>
                <input className="input" value={placeText} onChange={(e) => setPlaceText(e.target.value)} placeholder="장소 입력" />
                <div className="grid2">
                  <input className="input" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
                  <input className="input" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
                </div>

                <button className="btn btnBlue" onClick={createSession}>
                  생성
                </button>

                <div className="muted small">
                  인스타 느낌이라도 본질은 똑같음. 우선 기능부터 안정화하고, 다음에 카드/애니메이션 더 깎자.
                </div>
              </div>
            </div>

            <div className="card cardPad">
              <h3 className="sectionTitle" style={{ marginTop: 0 }}>
                팁
              </h3>
              <div className="muted small" style={{ display: "grid", gap: 8 }}>
                <div>로그인 유지는 supabase가 브라우저에 세션 저장해서 자동임.</div>
                <div>친구한테는 Vercel 주소만 보내라. localhost 보내면 100% 안 됨.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

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
