import { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download, AlertCircle, Loader2 } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface FileViewerProps {
  fileUrl: string;
  fileType: string;
  fileName: string;
}

export default function FileViewer({ fileUrl, fileType, fileName }: FileViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setPdfError(null);
    setImageError(false);
    setPageNumber(1);
    setScale(1.0);
  }, [fileUrl]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setLoading(false);
    setPdfError(null);
  }

  function onDocumentLoadError(error: Error) {
    console.error('PDF load error:', error);
    setPdfError('Unable to load PDF. The file may be corrupted or inaccessible.');
    setLoading(false);
  }

  const goToPrevPage = () => setPageNumber(prev => Math.max(prev - 1, 1));
  const goToNextPage = () => setPageNumber(prev => Math.min(prev + 1, numPages));
  const zoomIn = () => setScale(prev => Math.min(prev + 0.2, 2.5));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));

  if (fileType?.startsWith('image/')) {
    return (
      <div className="flex flex-col items-center">
        {imageError ? (
          <div className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-slate-600 mb-3">Unable to load image</p>
            <a
              href={fileUrl}
              download={fileName}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download Image
            </a>
          </div>
        ) : (
          <>
            <img
              src={fileUrl}
              alt={fileName}
              className="max-w-full max-h-[500px] object-contain"
              onLoad={() => setLoading(false)}
              onError={() => {
                setImageError(true);
                setLoading(false);
              }}
            />
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
                <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  if (fileType === 'application/pdf') {
    return (
      <div className="flex flex-col">
        {pdfError ? (
          <div className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-slate-600 mb-3">{pdfError}</p>
            <a
              href={fileUrl}
              download={fileName}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </a>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-3 py-2 bg-slate-100 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <button
                  onClick={goToPrevPage}
                  disabled={pageNumber <= 1}
                  className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-slate-600 min-w-[80px] text-center">
                  Page {pageNumber} of {numPages || '...'}
                </span>
                <button
                  onClick={goToNextPage}
                  disabled={pageNumber >= numPages}
                  className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={zoomOut}
                  disabled={scale <= 0.5}
                  className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs text-slate-600 min-w-[50px] text-center">
                  {Math.round(scale * 100)}%
                </span>
                <button
                  onClick={zoomIn}
                  disabled={scale >= 2.5}
                  className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-slate-300 mx-1" />
                <a
                  href={fileUrl}
                  download={fileName}
                  className="p-1.5 rounded hover:bg-slate-200 transition-colors"
                  title="Download PDF"
                >
                  <Download className="w-4 h-4" />
                </a>
              </div>
            </div>
            <div className="overflow-auto max-h-[450px] flex justify-center bg-slate-200 p-4">
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-100 z-10">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
                    <p className="text-sm text-slate-500">Loading PDF...</p>
                  </div>
                </div>
              )}
              <Document
                file={fileUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={null}
              >
                <Page
                  pageNumber={pageNumber}
                  scale={scale}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                  className="shadow-lg"
                />
              </Document>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="p-8 text-center">
      <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-3" />
      <p className="text-sm text-slate-600 mb-1">{fileName}</p>
      <p className="text-xs text-slate-400 mb-4">Preview not available for this file type</p>
      <a
        href={fileUrl}
        download={fileName}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
      >
        <Download className="w-4 h-4" />
        Download File
      </a>
    </div>
  );
}
