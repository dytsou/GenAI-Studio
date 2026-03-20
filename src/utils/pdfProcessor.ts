import * as pdfjsLib from 'pdfjs-dist';
import type { Attachment } from '../stores/useChatStore';

// Use an unpkg worker for pdfjs to avoid complex local worker setup
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export async function processPdfToImages(file: File): Promise<Attachment[]> {
  const arrayBuffer = await file.arrayBuffer();
  
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const attachments: Attachment[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 }); // Good enough for ML vision APIs
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) throw new Error('Failed to get canvas context');

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
      canvasContext: context,
      viewport: viewport,
      canvas: canvas
    };

    await page.render(renderContext).promise;
    
    // Compress heavily to ensure we don't blow up localStorage immediately
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8); 
    
    attachments.push({
      type: 'pdf',
      dataUrl,
      name: `${file.name} - Page ${i}`
    });
  }

  return attachments;
}
