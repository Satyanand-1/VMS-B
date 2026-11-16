'use client';
import { useEffect, useRef, useState } from 'react';

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
        box.current.innerHTML = '';
        await renderAsync(blob, box.current, undefined, {
          inWrapper: true, ignoreWidth: false, ignoreHeight: false, breakPages: true, experimental: true, useBase64URL: true, renderHeaders: true, renderFooters: true
        });
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
