import { useState, useRef } from 'react';
import { X, Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ReceiptUploadModalProps {
  request: {
    id: string;
    vendor_name: string;
    total_amount: number;
  };
  onClose: () => void;
  onSuccess: () => void;
}

export default function ReceiptUploadModal({ request, onClose, onSuccess }: ReceiptUploadModalProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFileSelect = (selectedFile: File) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    const maxSize = 5 * 1024 * 1024;

    if (!validTypes.includes(selectedFile.type)) {
      setError('Please upload a JPG, PNG, WebP image or PDF file');
      return;
    }

    if (selectedFile.size > maxSize) {
      setError('File size must be less than 5MB');
      return;
    }

    setError(null);
    setFile(selectedFile);

    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target?.result as string);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setPreview(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleSubmit = async () => {
    if (!file || !user) return;

    setUploading(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = e.target?.result as string;

        const { error: insertError } = await supabase
          .from('purchase_receipts')
          .insert({
            request_id: request.id,
            user_id: user.id,
            file_name: file.name,
            file_url: base64Data,
            file_type: file.type,
            file_size: file.size,
            notes: notes || null,
            employee_comment: notes || null,
            status: 'pending',
          } as any);

        if (insertError) throw insertError;

        await supabase
          .from('purchase_requests')
          .update({ receipt_status: 'uploaded' } as any)
          .eq('id', request.id);

        setSuccess(true);
        setTimeout(() => {
          onSuccess();
        }, 1500);
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error('Error uploading receipt:', err);
      setError(err.message || 'Failed to upload receipt');
      setUploading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Upload Receipt</h2>
            <p className="text-sm text-slate-500">
              {request.vendor_name} - {formatCurrency(request.total_amount)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {success ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Receipt Uploaded!</h3>
              <p className="text-sm text-slate-500">
                Your receipt has been submitted for review. Your manager will verify it shortly.
              </p>
            </div>
          ) : (
            <>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  dragOver
                    ? 'border-teal-500 bg-teal-50'
                    : file
                    ? 'border-emerald-300 bg-emerald-50'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  className="hidden"
                />

                {preview ? (
                  <div className="space-y-3">
                    <img
                      src={preview}
                      alt="Receipt preview"
                      className="max-h-48 mx-auto rounded-lg shadow-md"
                    />
                    <p className="text-sm font-medium text-emerald-700">{file?.name}</p>
                    <p className="text-xs text-slate-500">Click to change file</p>
                  </div>
                ) : file ? (
                  <div className="space-y-3">
                    <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center mx-auto">
                      <FileText className="w-8 h-8 text-slate-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-700">{file.name}</p>
                    <p className="text-xs text-slate-500">Click to change file</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center mx-auto">
                      <Upload className="w-8 h-8 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        Drop your receipt here or click to browse
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        JPG, PNG, WebP or PDF up to 5MB
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any additional notes about this receipt..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none"
                  rows={2}
                />
              </div>

              <div className="mt-6 flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!file || uploading}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Submit Receipt
                    </>
                  )}
                </button>
              </div>

              <div className="mt-4 p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-500">
                  <span className="font-medium text-slate-600">Note:</span> Upload your purchase receipt to complete the reimbursement process. Once verified by your approver, the process will be marked as complete.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
