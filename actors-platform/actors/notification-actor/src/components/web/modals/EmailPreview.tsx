import React, { useState, useEffect } from 'react';
import Handlebars from 'handlebars';

export interface EmailPreviewProps {
  template: string;
  data: Record<string, any>;
  onClose?: () => void;
  className?: string;
}

export const EmailPreview: React.FC<EmailPreviewProps> = ({
  template,
  data,
  onClose,
  className = ''
}) => {
  const [preview, setPreview] = useState<{
    subject: string;
    html: string;
    text?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'desktop' | 'mobile'>('desktop');

  useEffect(() => {
    const generatePreview = async () => {
      try {
        // Fetch template details
        const response = await fetch(`/api/notifications/templates/${template}`);
        const templateData = await response.json();

        // Compile templates
        const subjectTemplate = Handlebars.compile(templateData.subject);
        const htmlTemplate = Handlebars.compile(templateData.htmlTemplate);
        const textTemplate = templateData.textTemplate 
          ? Handlebars.compile(templateData.textTemplate) 
          : null;

        // Generate preview
        setPreview({
          subject: subjectTemplate(data),
          html: htmlTemplate(data),
          text: textTemplate ? textTemplate(data) : undefined
        });
      } catch (err: any) {
        setError(err.message || 'Failed to generate preview');
      }
    };

    generatePreview();
  }, [template, data]);

  if (error) {
    return (
      <div className={`email-preview-modal ${className}`}>
        <div className="modal-overlay" onClick={onClose} />
        <div className="modal-content error">
          <div className="modal-header">
            <h3>Email Preview Error</h3>
            <button className="close-button" onClick={onClose}>×</button>
          </div>
          <div className="error-message">
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className={`email-preview-modal ${className}`}>
        <div className="modal-overlay" onClick={onClose} />
        <div className="modal-content loading">
          <div className="spinner">Loading preview...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`email-preview-modal ${className}`}>
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal-content">
        <div className="modal-header">
          <h3>Email Preview</h3>
          <div className="view-mode-toggle">
            <button 
              className={viewMode === 'desktop' ? 'active' : ''}
              onClick={() => setViewMode('desktop')}
            >
              Desktop
            </button>
            <button 
              className={viewMode === 'mobile' ? 'active' : ''}
              onClick={() => setViewMode('mobile')}
            >
              Mobile
            </button>
          </div>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="preview-info">
          <div className="info-row">
            <span className="label">Template:</span>
            <span className="value">{template}</span>
          </div>
          <div className="info-row">
            <span className="label">Subject:</span>
            <span className="value">{preview.subject}</span>
          </div>
        </div>

        <div className={`preview-container ${viewMode}`}>
          <div className="preview-frame">
            <div className="preview-header">
              <div className="from">Your Company &lt;noreply@company.com&gt;</div>
              <div className="to">To: user@example.com</div>
              <div className="subject">{preview.subject}</div>
            </div>
            <div className="preview-body">
              <iframe
                srcDoc={preview.html}
                title="Email Preview"
                sandbox="allow-same-origin"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none'
                }}
              />
            </div>
          </div>
        </div>

        {preview.text && (
          <details className="text-version">
            <summary>Text Version</summary>
            <pre>{preview.text}</pre>
          </details>
        )}

        <div className="test-data">
          <h4>Test Data Used:</h4>
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
};

// Default styles
const styles = `
.email-preview-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
}

.modal-content {
  position: relative;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  width: 90%;
  max-width: 800px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid #e0e0e0;
}

.modal-header h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.view-mode-toggle {
  display: flex;
  gap: 8px;
}

.view-mode-toggle button {
  padding: 6px 12px;
  background: #f0f0f0;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
}

.view-mode-toggle button.active {
  background: #2196F3;
  color: white;
}

.close-button {
  background: none;
  border: none;
  font-size: 28px;
  cursor: pointer;
  color: #666;
  line-height: 1;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-button:hover {
  color: #000;
}

.preview-info {
  padding: 16px 24px;
  background: #f8f8f8;
  border-bottom: 1px solid #e0e0e0;
}

.info-row {
  display: flex;
  margin-bottom: 8px;
}

.info-row:last-child {
  margin-bottom: 0;
}

.info-row .label {
  font-weight: 600;
  margin-right: 8px;
  min-width: 80px;
}

.preview-container {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  background: #f0f0f0;
}

.preview-frame {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  margin: 0 auto;
  transition: max-width 0.3s;
}

.preview-container.desktop .preview-frame {
  max-width: 600px;
}

.preview-container.mobile .preview-frame {
  max-width: 375px;
}

.preview-header {
  padding: 16px;
  border-bottom: 1px solid #e0e0e0;
  background: #fafafa;
}

.preview-header .from,
.preview-header .to {
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.preview-header .subject {
  font-size: 16px;
  font-weight: 600;
  margin-top: 8px;
}

.preview-body {
  height: 400px;
  overflow: hidden;
}

.text-version {
  margin: 24px;
  padding: 16px;
  background: #f8f8f8;
  border-radius: 4px;
}

.text-version summary {
  cursor: pointer;
  font-weight: 600;
  margin-bottom: 8px;
}

.text-version pre {
  margin: 8px 0 0 0;
  white-space: pre-wrap;
  font-family: monospace;
  font-size: 13px;
  line-height: 1.5;
}

.test-data {
  margin: 24px;
  padding: 16px;
  background: #f8f8f8;
  border-radius: 4px;
}

.test-data h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 600;
}

.test-data pre {
  margin: 0;
  font-family: monospace;
  font-size: 12px;
  overflow-x: auto;
}

.error-message {
  padding: 32px;
  text-align: center;
  color: #d32f2f;
}

.loading {
  padding: 48px;
  text-align: center;
}

.spinner {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`;

export const EmailPreviewStyles = styles;