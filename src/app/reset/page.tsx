"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../supabase";

export default function ResetPage() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) setToast("메일의 리셋 링크로 들어와야 함.");
    });
  }, []);

  const setNewPw = async () => {
    setToast("");
    if (pw.length < 6) return setToast("비번 너무 짧음(6자 이상)");

    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return setToast(error.message);

    setToast("비번 변경 완료.");
    setTimeout(() => router.replace("/"), 700);
  };

  return (
    <div className="container" style={{ paddingTop: 60, maxWidth: 520 }}>
      <div className="card cardPad">
        <h2 className="sectionTitle" style={{ marginTop: 0 }}>
          비밀번호 재설정
        </h2>

        <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="새 비밀번호" />
        <div style={{ height: 12 }} />
        <button className="btn btnBlue" style={{ width: "100%" }} onClick={setNewPw}>
          새 비밀번호로 변경
        </button>

        {toast && (
          <div style={{ marginTop: 12 }} className="toast">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
