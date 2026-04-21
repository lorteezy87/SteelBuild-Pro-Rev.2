import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

const OCR_PROMPTS = {
  delivery_ticket: `Extract all data from this delivery ticket/bill of lading. Return ONLY valid JSON, no other text:
{
  "vendorName": "",
  "poNumber": "",
  "deliveryDate": "YYYY-MM-DD or null",
  "pieces": null,
  "weightLbs": null,
  "weightTons": null,
  "materialDescription": "",
  "truckNumber": "",
  "driverName": "",
  "receivedBy": "",
  "jobNumber": "",
  "projectName": "",
  "ticketNumber": "",
  "notes": "",
  "items": [{"description": "", "quantity": null, "unit": "", "weight": null}]
}`,
  site_photo: `Analyze this construction site photo. Return ONLY valid JSON, no other text:
{
  "photoDate": "YYYY-MM-DD or null",
  "location": "",
  "workActivity": "",
  "phase": "",
  "suggestedCaption": "",
  "suggestedCategory": "Progress|Safety|Issue|Delivery|Other",
  "issuesVisible": [],
  "progressNotes": "",
  "safetyObservations": "",
  "estimatedPercentComplete": null,
  "gridReference": "",
  "membersVisible": []
}`,
};

async function runOCR(file, fileType) {
  const prompt = OCR_PROMPTS[fileType] || OCR_PROMPTS.site_photo;

  const raw = await base44.integrations.Core.InvokeLLM({
    prompt,
    system: 'You are an OCR data extraction engine for a structural steel construction management app. Extract data accurately from construction documents and photos. Always return valid JSON only. Use null for missing numeric fields. Use empty string for missing text fields.',
    file_urls: [await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    })],
  });

  const clean = (raw || '{}').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    console.error("OCR returned malformed JSON:", clean.slice(0, 200));
    return {};
  }
}

function OCRResultCard({ result, fileType }) {
  return (
    <div style={{
      marginTop: 10,
      background: 'rgba(0,214,143,0.05)',
      border: '1px solid rgba(0,214,143,0.2)',
      borderRadius: 10,
      padding: '12px 14px',
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--status-success)', letterSpacing: '0.14em', marginBottom: 10 }}>
        ✦ AI EXTRACTED DATA
      </div>

      {fileType === 'delivery_ticket' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            ['Vendor', result.vendorName],
            ['PO #', result.poNumber],
            ['Date', result.deliveryDate],
            ['Ticket #', result.ticketNumber],
            ['Pieces', result.pieces],
            ['Weight', result.weightTons ? `${result.weightTons} tons` : result.weightLbs ? `${result.weightLbs} lbs` : null],
            ['Received By', result.receivedBy],
            ['Truck #', result.truckNumber],
          ].filter(([, v]) => v != null && v !== '').map(([label, value]) => (
            <div key={label}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em' }}>{label.toUpperCase()}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-primary)', fontWeight: 600 }}>{String(value)}</div>
            </div>
          ))}
          {result.materialDescription && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em' }}>MATERIAL</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-primary)' }}>{result.materialDescription}</div>
            </div>
          )}
        </div>
      )}

      {fileType === 'site_photo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {result.suggestedCaption && (
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: 3 }}>SUGGESTED CAPTION</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-primary)' }}>{result.suggestedCaption}</div>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              ['Activity', result.workActivity],
              ['Phase', result.phase],
              ['Location', result.location],
              ['Grid Ref', result.gridReference],
              ['Category', result.suggestedCategory],
              ['Progress', result.estimatedPercentComplete != null ? `${result.estimatedPercentComplete}%` : null],
            ].filter(([, v]) => v != null && v !== '').map(([label, value]) => (
              <div key={label}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em' }}>{label.toUpperCase()}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-primary)', fontWeight: 600 }}>{String(value)}</div>
              </div>
            ))}
          </div>
          {result.issuesVisible?.length > 0 && (
            <div style={{ background: 'rgba(255,61,61,0.08)', border: '1px solid rgba(255,61,61,0.2)', borderRadius: 6, padding: '6px 10px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--status-error)', marginBottom: 4 }}>ISSUES DETECTED</div>
              {result.issuesVisible.map((issue, i) => (
                <div key={i} style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--status-warning)' }}>• {issue}</div>
              ))}
            </div>
          )}
          {result.safetyObservations && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Safety: {result.safetyObservations}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FileUploadWithOCR({ fileType, linkedEntityId, linkedEntity, onUploadComplete, projectId }) {
  const [uploading, setUploading] = useState(false);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError('Supported formats: JPG, PNG, WEBP, HEIC, PDF');
      return;
    }
    if (file.size > MAX_SIZE) {
      setUploadError('File too large. Max 10MB.');
      return;
    }
    setUploadError(null);
    setOcrResult(null);
    setUploading(true);

    if (file.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(file));
    }

    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      const uploadRecord = await base44.entities.UploadedFile.create({
        project_id: projectId,
        file_name: file.name,
        file_url,
        file_type: fileType,
        linked_entity: linkedEntity || 'none',
        linked_entity_id: linkedEntityId || '',
        uploaded_date: new Date().toISOString(),
        ocr_status: 'processing',
      });

      setUploading(false);
      setOcrRunning(true);

      const extracted = await runOCR(file, fileType);

      await base44.entities.UploadedFile.update(uploadRecord.id, {
        ocr_status: 'complete',
        ocr_extracted_data: JSON.stringify(extracted),
        ocr_processed_at: new Date().toISOString(),
      });

      setOcrResult(extracted);
      setOcrRunning(false);

      if (onUploadComplete) {
        onUploadComplete({ fileId: uploadRecord.id, fileUrl: file_url, extracted });
      }
    } catch (err) {
      console.error('Upload/OCR failed:', err);
      setUploadError(err.message);
      setUploading(false);
      setOcrRunning(false);
    }
  };

  const statusLabel = uploading
    ? '⟳ Uploading...'
    : ocrRunning
    ? '✦ Reading document with AI...'
    : dragOver
    ? 'Drop to upload'
    : fileType === 'delivery_ticket'
    ? 'Drop delivery ticket or click to browse'
    : 'Drop site photo or click to browse';

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => !uploading && !ocrRunning && fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--accent-border)'}`,
          borderRadius: 10,
          padding: '20px',
          textAlign: 'center',
          cursor: uploading || ocrRunning ? 'default' : 'pointer',
          background: dragOver ? 'var(--accent-muted)' : 'transparent',
          transition: 'all 0.15s',
        }}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="preview" style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 6, marginBottom: 8 }} />
        ) : (
          <div style={{ fontSize: 24, marginBottom: 8 }}>{fileType === 'delivery_ticket' ? '📋' : '📷'}</div>
        )}
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-secondary)' }}>{statusLabel}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', marginTop: 4 }}>
          JPG · PNG · WEBP · HEIC · PDF · max 10MB
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />

      {uploadError && (
        <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(255,61,61,0.08)', border: '1px solid rgba(255,61,61,0.25)', borderRadius: 8, color: 'var(--status-error)', fontFamily: 'var(--font-body)', fontSize: 11 }}>
          ⚠ {uploadError}
        </div>
      )}

      {ocrResult && <OCRResultCard result={ocrResult} fileType={fileType} />}
    </div>
  );
}