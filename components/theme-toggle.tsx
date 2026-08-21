"use client";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(true);
  useEffect(() => { const saved = localStorage.getItem("ai-cofounder-theme"); const useDark = saved !== "light"; setDark(useDark); document.documentElement.dataset.theme = useDark ? "dark" : "light"; }, []);
  function toggle() { const next = !dark; setDark(next); document.documentElement.dataset.theme = next ? "dark" : "light"; localStorage.setItem("ai-cofounder-theme", next ? "dark" : "light"); }
  return <button className="theme-toggle" onClick={toggle} aria-label="Toggle dark mode"><span>{dark ? "☼" : "☾"}</span>{dark ? "Light" : "Dark"}</button>;
}
