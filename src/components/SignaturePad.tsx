import { useRef, useEffect, useState } from 'react';
import { Eraser, Check, Type, Pencil, ChevronDown } from 'lucide-react';

interface SignaturePadProps {
  onSignatureChange: (signatureDataUrl: string | null) => void;
  initialSignature?: string | null;
}

const SIGNATURE_FONTS = [
  { name: 'Elegant Script', value: 'italic 32px "Brush Script MT", cursive' },
  { name: 'Classic Cursive', value: 'italic 30px "Lucida Handwriting", cursive' },
  { name: 'Modern Script', value: 'italic 28px "Segoe Script", cursive' },
  { name: 'Professional', value: 'italic 26px Georgia, serif' },
  { name: 'Bold Signature', value: 'italic bold 28px "Times New Roman", serif' },
];

export default function SignaturePad({ onSignatureChange, initialSignature }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [mode, setMode] = useState<'draw' | 'type' | 'initials'>('draw');
  const [typedName, setTypedName] = useState('');
  const [selectedFont, setSelectedFont] = useState(SIGNATURE_FONTS[0]);
  const [showFontMenu, setShowFontMenu] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(20, rect.height - 30);
    ctx.lineTo(rect.width - 20, rect.height - 30);
    ctx.stroke();
    ctx.setLineDash([]);

    if (initialSignature) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        setHasSignature(true);
      };
      img.src = initialSignature;
    }
  }, [initialSignature]);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (mode !== 'draw') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || mode !== 'draw') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    if (isDrawing && mode === 'draw') {
      setIsDrawing(false);
      saveSignature();
    }
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL('image/png');
    onSignatureChange(dataUrl);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(20, rect.height - 30);
    ctx.lineTo(rect.width - 20, rect.height - 30);
    ctx.stroke();
    ctx.setLineDash([]);

    setHasSignature(false);
    setTypedName('');
    onSignatureChange(null);
  };

  const getInitials = (name: string): string => {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return parts.map(p => p.charAt(0).toUpperCase()).join('');
  };

  const renderTypedSignature = (name: string, isInitials: boolean = false) => {
    setTypedName(name);

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(20, rect.height - 30);
    ctx.lineTo(rect.width - 20, rect.height - 30);
    ctx.stroke();
    ctx.setLineDash([]);

    const displayText = isInitials ? getInitials(name) : name;

    if (displayText) {
      if (isInitials) {
        ctx.font = 'bold 48px "Times New Roman", serif';
      } else {
        ctx.font = selectedFont.value;
      }
      ctx.fillStyle = '#1e293b';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(displayText, rect.width / 2, rect.height / 2 - 10);
      setHasSignature(true);
      saveSignature();
    } else {
      setHasSignature(false);
      onSignatureChange(null);
    }
  };

  const handleTypedSignature = (name: string) => {
    renderTypedSignature(name, mode === 'initials');
  };

  const handleFontChange = (font: typeof SIGNATURE_FONTS[0]) => {
    setSelectedFont(font);
    setShowFontMenu(false);
    if (typedName && mode === 'type') {
      setTimeout(() => renderTypedSignature(typedName, false), 0);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => { setMode('draw'); clearSignature(); }}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'draw'
              ? 'bg-sky-100 text-sky-700'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Pencil className="w-4 h-4" />
          Draw
        </button>
        <button
          type="button"
          onClick={() => { setMode('type'); clearSignature(); }}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'type'
              ? 'bg-sky-100 text-sky-700'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Type className="w-4 h-4" />
          Type
        </button>
        <button
          type="button"
          onClick={() => { setMode('initials'); clearSignature(); }}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'initials'
              ? 'bg-sky-100 text-sky-700'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <span className="font-bold text-xs">AB</span>
          Initials
        </button>
      </div>

      {(mode === 'type' || mode === 'initials') && (
        <div className="space-y-3">
          <input
            type="text"
            value={typedName}
            onChange={(e) => handleTypedSignature(e.target.value)}
            placeholder={mode === 'initials' ? "Type your full name for initials" : "Type your full name"}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          />

          {mode === 'type' && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowFontMenu(!showFontMenu)}
                className="flex items-center justify-between w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <span>Style: {selectedFont.name}</span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showFontMenu ? 'rotate-180' : ''}`} />
              </button>

              {showFontMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowFontMenu(false)} />
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1 max-h-48 overflow-y-auto">
                    {SIGNATURE_FONTS.map((font) => (
                      <button
                        key={font.name}
                        type="button"
                        onClick={() => handleFontChange(font)}
                        className={`w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 transition-colors ${
                          selectedFont.name === font.name ? 'bg-sky-50 text-sky-700' : 'text-slate-700'
                        }`}
                      >
                        <span style={{ fontFamily: font.value.split('"')[1] || 'serif', fontStyle: 'italic' }}>
                          {font.name}
                        </span>
                        {typedName && (
                          <span
                            className="block mt-1 text-slate-500"
                            style={{ font: font.value.replace('32px', '18px').replace('30px', '18px').replace('28px', '18px').replace('26px', '18px') }}
                          >
                            {typedName}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className="relative">
        <canvas
          ref={canvasRef}
          className="w-full h-40 bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl cursor-crosshair touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        {mode === 'draw' && !hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-slate-400 text-sm">Sign here with your mouse or finger</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={clearSignature}
          className="flex items-center gap-2 px-3 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg text-sm font-medium transition-colors"
        >
          <Eraser className="w-4 h-4" />
          Clear
        </button>
        {hasSignature && (
          <span className="flex items-center gap-1.5 text-emerald-600 text-sm">
            <Check className="w-4 h-4" />
            Signature captured
          </span>
        )}
      </div>
    </div>
  );
}
