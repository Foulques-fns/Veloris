"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  panel: string;
  text: string;
  glow: string;
  matrixColor?: string; // hex colour for the binary rain
}

interface ThemeContextType {
  colors: ThemeColors;
  setColors: (colors: ThemeColors) => void;
  resetTheme: () => void;
  themes: Record<string, ThemeColors>;
  activeTheme: string;
  setActiveTheme: (name: string) => void;
}

const defaultThemes: Record<string, ThemeColors> = {
  obsidian: {
    primary: "#C9A227",
    secondary: "#F5D96E",
    accent: "#A07810",
    background: "#000000",
    panel: "#0A0908",
    text: "#F0EAD6",
    glow: "rgba(201, 162, 39, 0.5)",
    matrixColor: "#00ff41",
  },
  midnight: {
    primary: "#3B82F6",
    secondary: "#60A5FA",
    accent: "#1D4ED8",
    background: "#020617",
    panel: "#0F172A",
    text: "#F8FAFC",
    glow: "rgba(59, 130, 246, 0.5)",
    matrixColor: "#00aaff",
  },
  emerald: {
    primary: "#10B981",
    secondary: "#34D399",
    accent: "#047857",
    background: "#064E3B",
    panel: "#065F46",
    text: "#ECFDF5",
    glow: "rgba(16, 185, 129, 0.5)",
    matrixColor: "#00ff88",
  },
  crimson: {
    primary: "#EF4444",
    secondary: "#F87171",
    accent: "#B91C1C",
    background: "#450A0A",
    panel: "#7F1D1D",
    text: "#FEF2F2",
    glow: "rgba(239, 68, 68, 0.5)",
    matrixColor: "#ff2244",
  },
  neon: {
    primary: "#a855f7",
    secondary: "#c084fc",
    accent: "#7e22ce",
    background: "#000000",
    panel: "#0a000f",
    text: "#f3e8ff",
    glow: "rgba(168, 85, 247, 0.5)",
    matrixColor: "#cc44ff",
  },
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [activeTheme, setActiveTheme] = useState('obsidian');
  const [colors, setColors] = useState<ThemeColors>(defaultThemes.obsidian);

  useEffect(() => {
    const savedTheme = localStorage.getItem('veloris-theme');
    const savedColors = localStorage.getItem('veloris-colors');
    
    if (savedColors) {
      setColors(JSON.parse(savedColors));
    } else if (savedTheme && defaultThemes[savedTheme]) {
      setActiveTheme(savedTheme);
      setColors(defaultThemes[savedTheme]);
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--accent', colors.primary);
    root.style.setProperty('--accent-hover', colors.secondary);
    root.style.setProperty('--accent-3', colors.accent);
    root.style.setProperty('--bg', colors.background);
    root.style.setProperty('--panel-strong', colors.panel);
    root.style.setProperty('--text', colors.text);
    root.style.setProperty('--glow-color', colors.glow);
  }, [colors]);

  const updateColors = (newColors: ThemeColors) => {
    setColors(newColors);
    localStorage.setItem('veloris-colors', JSON.stringify(newColors));
  };

  const updateTheme = (name: string) => {
    if (defaultThemes[name]) {
      setActiveTheme(name);
      setColors(defaultThemes[name]);
      localStorage.removeItem('veloris-colors');
      localStorage.setItem('veloris-theme', name);
    }
  };

  const resetTheme = () => {
    updateTheme('obsidian');
  };

  return (
    <ThemeContext.Provider value={{ 
      colors, 
      setColors: updateColors, 
      resetTheme, 
      themes: defaultThemes, 
      activeTheme, 
      setActiveTheme: updateTheme 
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
