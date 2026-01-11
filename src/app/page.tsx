"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./supabase";

type Mode = "login" | "signup";

export default function Home() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [nickname, setNickname] = useState("");

  const [sessionReady, setSessionReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string>("");

  const title = useMemo(() => (mode === "login" ? "로그인" : "회원가입"), [mode]);

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.replace("/sessions");
        return;
      }
      setSessionReady(true);
    };
    run();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (sess) router.replace("/sessions");
    });

    return () => sub.subscription.unsubscribe();
  }, [router]);

  const upsertProfile = async (uid: string, nick: string) => {
    // profiles 테이블이 없으면 여기서 에러 나는데, 그 경우엔 가입은 되고 닉네임만 저장이 안 됨.
    const { error } = await supabase.from("profiles").upsert({ id: uid, nickname: nick }, { onConflict: "id" });
    if (error) {
      setToast("닉네임 저장이 안 됨(테이블/정책 확인 필요). 그래도 로그인은 됨.");
    }
  };

  const login = async () => {
    setLoading(true);
    setToast("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: pw,
    });

    if (error) setToast(error.message);
    setLoading(false);
  };

  const signup = async () => {
    setLoading(true);
    setToast("");

    if (!nickname.trim()) {
      setToast("닉네임부터 입력해라.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: pw,
    });

    if (error) {
      setToast(error.message);
      setLoading(false);
      return;
    }

    const uid = data.user?.id;
    if (uid) await upsertProfile(uid, nickname.trim());

    // 이메일 확인을 켜놨으면 바로 로그인 안 될 수도 있음. (Supabase Auth 설정 따라 다름)
    setToast("가입 완료. 로그인 화면으로 가서 로그인해라(설정에 따라 이메일 확인이 필요할 수 있음).");
    setMode("login");
    setLoading(false);
  };

  if (!sessionReady) {
    return (
      <div className="container" style={{ paddingTop: 60 }}>
        <div className="card cardPad">로딩 중</div>
      </div>
    );
  }

  return (
    <>
      <div className="topbar">
        <div className="topbarInner">
          <div className="brand">타임메이트</div>
          <div className="pill">인스타 느낌으로 가는 중</div>
        </div>
      </div>

      <div className="container" style={{ paddingTop: 28 }}>
        <div className="card" style={{ maxWidth: 520, margin: "0 auto" }}>
          <div className="cardPad">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <div>
                <h2 className="sectionTitle" style={{ marginBottom: 6 }}>
                  {title}
                </h2>
                <div className="muted small">이메일/비번으로 간단히</div>
              </div>

              <button
                className="btn btnGhost"
                onClick={() => {
                  setToast("");
                  setMode((m) => (m === "login" ? "signup" : "login"));
                }}
              >
                {mode === "login" ? "회원가입" : "로그인"}
              </button>
            </div>

            <div className="hr" />

            {mode === "signup" && (
              <input
                className="input"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="닉네임"
                autoComplete="nickname"
              />
            )}

            <div style={{ height: 10 }} />

            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일"
              autoComplete="email"
              inputMode="email"
            />

            <div style={{ height: 10 }} />

            <input
              className="input"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="비밀번호"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />

            <div style={{ height: 14 }} />

            <button className="btn btnBlue" style={{ width: "100%" }} onClick={mode === "login" ? login : signup} disabled={loading}>
              {loading ? "처리 중" : mode === "login" ? "로그인" : "회원가입"}
            </button>

            <div style={{ height: 12 }} />

            {toast && <div className="toast">{toast}</div>}

            <div style={{ height: 10 }} />

            <div className="muted small">
              로그인 유지? supabase가 브라우저에 세션을 저장해서 탭 닫아도 유지됨. 로그아웃하면 해제됨.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
