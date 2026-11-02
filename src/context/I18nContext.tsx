"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'en' | 'fr' | 'es' | 'de' | 'it' | 'pt' | 'ar' | 'ja' | 'zh';

interface I18nContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string) => string;
  isRTL: boolean;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    "app.name": "VELORIS",
    "app.tagline": "Premium AI Intelligence",
    "nav.chat": "Chat",
    "nav.builder": "AI Builder",
    "nav.images": "Images",
    "nav.audio": "Audio",
    "nav.video": "Video",
    "nav.plans": "Plans",
    "nav.settings": "Settings",
    "nav.admin": "Admin",
    "nav.logout": "Logout",
    "chat.new": "New Chat",
    "chat.welcome": "Hi {name}. What shall we create?",
    "chat.placeholder": "Ask anything...",
    "chat.send": "Send",
    "chat.regenerate": "Regenerate",
    "chat.copy": "Copy",
    "chat.edit": "Edit",
    "chat.delete": "Delete",
    "chat.search": "Search chats...",
    "settings.title": "Settings",
    "settings.language": "Language",
    "settings.theme": "Appearance",
    "settings.customization": "Customization",
    "settings.save": "Save Changes",
    "settings.assistant": "Assistant Behavior",
    "settings.personality": "Personality",
    "settings.custom_instructions": "Custom Instructions",
    "settings.display_name": "Display Name",
    "settings.security": "Security",
    "settings.change_password": "Change Password",
    "settings.logout_desc": "Sign out on this device.",
    "settings.quotas_reset": "Your daily quotas reset at 00:00 UTC.",
    "common.loading": "Loading...",
    "common.error": "Error",
    "common.success": "Success",
    "plans.free": "Free",
    "plans.premium": "Premium",
    "plans.ultra": "Ultra",
    "images.generate": "Generate Image",
    "images.prompt": "Prompt",
    "images.painting": "Painting pixels...",
    "images.no_generations": "No generations yet",
    "images.no_generations_desc": "Your creations will appear here.",
    "audio.generate": "Generate Voice",
    "audio.transcribe": "Transcribe",
    "audio.tagline": "Voice & Transcription",
    "plans.tagline": "Premium Excellence",
    "plans.current": "Current",
    "plans.your_plan": "Your Plan",
    "nav.login": "Login",
    "nav.get_started": "Get Started",
    "builder.projects": "Projects",
    "builder.save": "Save",
    "builder.generating": "Architecting your vision...",
    "builder.rename": "Rename",
    "builder.delete": "Delete",
    "landing.feat1.title": "Streaming Chat",
    "landing.feat1.desc": "Frontier models, Markdown, and real-time streaming for an unmatched experience.",
    "landing.feat2.title": "Image Studio",
    "landing.feat2.desc": "Create, edit and transform images using professional-grade open models.",
    "landing.feat3.title": "Audio Excellence",
    "landing.feat3.desc": "Neural text-to-speech and fast transcription for your recordings.",
    "landing.feat4.title": "Video Pipeline",
    "landing.feat4.desc": "Ready for high-quality video generation as soon as free models arrive.",
    "landing.feat5.title": "Secure Access",
    "landing.feat5.desc": "Protected by Resend email verification and industry-standard security.",
    "landing.feat6.title": "Pure Intelligence",
    "landing.feat6.desc": "Powered exclusively by verified free models from the Pollinations catalog.",
  },
  fr: {
    "app.name": "VELORIS",
    "app.tagline": "Intelligence Artificielle Premium",
    "nav.chat": "Chat",
    "nav.builder": "AI Builder",
    "nav.images": "Images",
    "nav.audio": "Audio",
    "nav.video": "Vidéo",
    "nav.plans": "Offres",
    "nav.settings": "Réglages",
    "nav.admin": "Console admin",
    "nav.logout": "Déconnexion",
    "nav.login": "Connexion",
    "nav.get_started": "Commencer",
    "chat.new": "Nouveau Chat",
    "chat.welcome": "Bonjour {name}. Que devrions-nous créer ?",
    "chat.placeholder": "Demandez n'importe quoi...",
    "chat.send": "Envoyer",
    "chat.regenerate": "Régénérer",
    "chat.copy": "Copier",
    "chat.edit": "Modifier",
    "chat.delete": "Supprimer",
    "chat.search": "Rechercher...",
    "settings.title": "Réglages",
    "settings.language": "Langue",
    "settings.theme": "Apparence",
    "settings.customization": "Personnalisation",
    "settings.save": "Enregistrer les modifications",
    "settings.assistant": "Comportement de l'Assistant",
    "settings.personality": "Personnalité",
    "settings.custom_instructions": "Instructions personnalisées",
    "settings.display_name": "Nom d'affichage",
    "settings.security": "Sécurité",
    "settings.change_password": "Changer le mot de passe",
    "settings.logout_desc": "Déconnexion de cet appareil.",
    "settings.quotas_reset": "Vos quotas quotidiens sont réinitialisés à 00:00 UTC.",
    "common.loading": "Chargement...",
    "common.error": "Erreur",
    "common.success": "Succès",
    "plans.free": "Gratuit",
    "plans.premium": "Premium",
    "plans.ultra": "Ultra",
    "plans.tagline": "L'excellence Premium",
    "plans.current": "Actuel",
    "plans.your_plan": "Votre offre",
    "images.generate": "Générer une image",
    "images.prompt": "Prompt",
    "images.painting": "Peinture des pixels...",
    "images.no_generations": "Aucune génération",
    "images.no_generations_desc": "Vos créations apparaîtront ici.",
    "audio.generate": "Générer la voix",
    "audio.transcribe": "Transcrire",
    "audio.tagline": "Voix & Transcription",
    "builder.projects": "Projets",
    "builder.save": "Sauvegarder",
    "builder.generating": "Architecture de votre vision...",
    "builder.rename": "Renommer",
    "builder.delete": "Supprimer",
    "landing.feat1.title": "Chat en Streaming",
    "landing.feat1.desc": "Modèles frontier et streaming en temps réel pour une expérience fluide.",
    "landing.feat2.title": "Studio Image",
    "landing.feat2.desc": "Créez et transformez des images avec des modèles professionnels.",
    "landing.feat3.title": "Excellence Audio",
    "landing.feat3.desc": "Synthèse vocale neurale et transcription rapide de vos fichiers.",
    "landing.feat4.title": "Pipeline Vidéo",
    "landing.feat4.desc": "Prêt pour la génération vidéo dès que les modèles gratuits seront disponibles.",
    "landing.feat5.title": "Accès Sécurisé",
    "landing.feat5.desc": "Vérification par e-mail et sécurité renforcée de vos données.",
    "landing.feat6.title": "Intelligence Pure",
    "landing.feat6.desc": "Propulsé exclusivement par les modèles gratuits vérifiés de Pollinations.",
  },
  es: {
    "nav.chat": "Chat", "nav.settings": "Ajustes", "settings.title": "Ajustes",
    "chat.send": "Enviar", "chat.new": "Nuevo Chat", "nav.logout": "Cerrar sesión"
  },
  de: {
    "nav.chat": "Chat", "nav.settings": "Einstellungen", "settings.title": "Einstellungen",
    "chat.send": "Senden", "chat.new": "Neuer Chat", "nav.logout": "Abmelden"
  },
  it: {
    "nav.chat": "Chat", "nav.settings": "Impostazioni", "settings.title": "Impostazioni",
    "chat.send": "Invia", "chat.new": "Nuova Chat", "nav.logout": "Disconnetti"
  },
  pt: {
    "nav.chat": "Chat", "nav.settings": "Configurações", "settings.title": "Configurações",
    "chat.send": "Enviar", "chat.new": "Novo Chat", "nav.logout": "Sair"
  },
  ar: {
    "nav.chat": "دردشة", "nav.settings": "الإعدادات", "settings.title": "الإعدادات",
    "chat.send": "إرسال", "chat.new": "دردشة جديدة", "nav.logout": "تسجيل الخروج"
  },
  ja: {
    "nav.chat": "チャット", "nav.settings": "設定", "settings.title": "設定",
    "chat.send": "送信", "chat.new": "新しいチャット", "nav.logout": "ログアウト"
  },
  zh: {
    "nav.chat": "聊天", "nav.settings": "设置", "settings.title": "设置",
    "chat.send": "发送", "chat.new": "新聊天", "nav.logout": "登出"
  },
};

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Language>('en');

  useEffect(() => {
    const saved = localStorage.getItem('veloris-lang') as Language;
    if (saved && translations[saved]) {
      setLang(saved);
    } else {
      const browserLang = navigator.language.split('-')[0] as Language;
      if (translations[browserLang]) {
        setLang(browserLang);
      }
    }
  }, []);

  const setAndSaveLang = (newLang: Language) => {
    setLang(newLang);
    localStorage.setItem('veloris-lang', newLang);
    document.documentElement.lang = newLang;
    document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr';
  };

  const t = (key: string) => {
    return translations[lang]?.[key] || translations['en']?.[key] || key;
  };

  const isRTL = lang === 'ar';

  return (
    <I18nContext.Provider value={{ lang, setLang: setAndSaveLang, t, isRTL }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within I18nProvider');
  return context;
}
