import { DocxViewer } from './DocxViewer';

// Document shown inside a fixed-size, scrollable viewer (Invoice Management review: client invoice and vendor / resource
// invoice side by side, both the same size). PDF and images are displayed by the browser; Word (.docx) files are
// converted to pages in the browser. Files are opened through /api/files, which checks access first.
export function DocPreview({ fileKey, name, extra }: { fileKey: string; name: string; extra?: React.ReactNode }) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const src = `/api/files/${fileKey}`;
  return (
    <div className="doc-preview">
      <div className="doc-viewer">
        {ext === 'pdf' ? <iframe src={src} title={name} loading="lazy" />
          // eslint-disable-next-line @next/next/no-img-element
          : ['jpg', 'jpeg', 'png'].includes(ext) ? <img src={src} alt={name} loading="lazy" />
          : ext === 'docx' ? <DocxViewer src={src} name={name} />
          : (
            <div className="doc-viewer-none">
              <span className="doc-badge">{ext.toUpperCase() || 'FILE'}</span>
              <b>{name}</b>
              <span className="person-sub">Word documents cannot be shown here. Use View or Download.</span>
            </div>
          )}
      </div>
      <div className="doc-preview-bar">
        <span className="doc-preview-name" title={name}>{name}</span>
        <span className="row-actions">
          <a className="link-btn" href={src} target="_blank" rel="noopener noreferrer">View</a>
          <a className="link-btn" href={`${src}?download=1`}>Download</a>
        </span>
      </div>
      {extra}
    </div>
  );
}
