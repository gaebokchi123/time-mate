"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";






export default function Home() {
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const sendLink = async () => {
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) alert(error.message);
    else alert("메일로 로그인 링크 보냄.");
  };

  const createProfile = async () => {
    if (!userId) return;
    const { error } = await supabase.from("profiles").upsert({
      id: userId,
      nickname: nickname.trim() || "익명",
    });
    if (error) alert(error.message);
    else location.href = "/sessions";
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <main style={{ maxWidth: 480, margin: "60px auto", padding: 16 }}>
      {!userId ? (
        <>
          <h2>타임메이트</h2>
          <p>이메일로 로그인</p>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            style={{ width: "100%", padding: 12, marginTop: 8 }}
          />
          <button onClick={sendLink} style={{ marginTop: 12, padding: 12 }}>
            로그인 링크 보내기
          </button>
        </>
      ) : (
        <>
          <h2>프로필 설정</h2>
          <p>사용하실 닉네임을 입력해주세요!</p>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="nickname"
            style={{ width: "100%", padding: 12, marginTop: 8 }}
          />
          <button onClick={createProfile} style={{ marginTop: 12, padding: 12 }}>
            시작
          </button>
          <button onClick={logout} style={{ marginTop: 12, padding: 12, marginLeft: 8 }}>
            로그아웃
          </button>
        </>
      )}
    </main>
  );
}
