'use client';
import { useEffect, useRef, useState } from 'react';

// A Word file comes from whoever uploaded it, so the rendered pages are cleaned before they are shown:
// no scripts, frames, objects or forms, no event-handler attributes, and only http(s) / mailto / in-page links
// (opened in a new tab without access back to the app); images only from data: or http(s).
const BLOCKED = 'script,iframe,frame,object,embed,form,input,button,textarea,select,link,meta,base,svg foreignObject';
function safeUrl(v: string, image: boolean) {
  const u = v.trim().toLowerCase();
  return u.startsWith('#') || u.startsWith('http://') || u.startsWith('https://') || (!image && u.startsWith('mailto:')) || (image && (u.startsWith('data:image/') || u.startsWith('blob:')));
}
function sanitize(root: HTMLElement) {
  root.querySelectorAll(BLOCKED).forEach((el) => el.remove());
  root.querySelectorAll<HTMLElement>('*').forEach((el) => {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      if (n.startsWith('on') || n === 'formaction' || n === 'srcdoc') el.removeAttribute(a.name);
      else if ((n === 'href' || n === 'xlink:href') && !safeUrl(a.value, false)) el.removeAttribute(a.name);
      else if ((n === 'src' || n === 'srcset') && !safeUrl(a.value, true)) el.removeAttribute(a.name);
      else if (n === 'style' && /expression\(|javascript:|url\(\s*['"]?\s*javascript:/i.test(a.value)) el.removeAttribute(a.name);
    }
    if (el.tagName === 'A' && el.getAttribute('href') && !el.getAttribute('href')!.startsWith('#')) { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
  });
}

// Shows a Word (.docx) file as formatted pages inside the viewer. The file is converted in the user's own browser
// (docx-preview): it is never sent to an outside service. If it cannot be read, View / Download still work.
export function DocxViewer({ src, name }: { src: string; name: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const res = await fetch(src, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const { renderAsync } = await import('docx-preview');
        if (gone || !box.current) return;
        box.current.replaceChildren();
        await renderAsync(blob, box.current, undefined, {
          inWrapper: true, ignoreWidth: false, ignoreHeight: false, breakPages: true, experimental: true, useBase64URL: true, renderHeaders: true, renderFooters: true
        });
        sanitize(box.current);
        // Fit the page width to the viewer (scrolling stays vertical); never enlarge.
        const wrapper = box.current.querySelector<HTMLElement>('.docx-wrapper');
        const page = box.current.querySelector<HTMLElement>('section.docx');
        if (wrapper && page) {
          const fit = () => { const w = page.offsetWidth + 24; const z = Math.min(1, (box.current?.clientWidth || w) / w); wrapper.style.zoom = String(z); };
          fit();
          new ResizeObserver(fit).observe(box.current);
        }
        if (!gone) setState('ok');
      } catch {
        if (!gone) setState('error');
      }
    })();
    return () => { gone = true; };
  }, [src]);
  return (
    <>
      {state !== 'ok' ? (
        <div className="doc-viewer-none">
          <span className="doc-badge">DOCX</span>
          <b>{name}</b>
          <span className="person-sub">{state === 'loading' ? 'Loading preview…' : 'This Word file could not be previewed. Use View or Download.'}</span>
        </div>
      ) : null}
      <div ref={box} className="docx-render" hidden={state !== 'ok'} />
    </>
  );
}
