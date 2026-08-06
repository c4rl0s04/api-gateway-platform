import Script from 'next/script';
import {
  DEFAULT_SIDEBAR_PREFERENCE,
  SIDEBAR_STORAGE_KEY,
} from '@/lib/sidebar-preference';

const preferenceScript = `try{var p=localStorage.getItem(${JSON.stringify(SIDEBAR_STORAGE_KEY)});document.documentElement.dataset.sidebar=p==='collapsed'?'collapsed':${JSON.stringify(DEFAULT_SIDEBAR_PREFERENCE)}}catch(e){document.documentElement.dataset.sidebar=${JSON.stringify(DEFAULT_SIDEBAR_PREFERENCE)}}`;

export function SidebarPreferenceScript() {
  return (
    <Script
      id="sidebar-preference"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{ __html: preferenceScript }}
    />
  );
}
