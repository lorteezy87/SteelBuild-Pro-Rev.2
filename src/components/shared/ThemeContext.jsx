import React, { createContext, useContext, useState, useEffect } from "react";

const ThemeContext = createContext({ theme: "dark", toggleTheme: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("sbp-theme") || "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("sbp-theme", theme);
    } catch {}
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}