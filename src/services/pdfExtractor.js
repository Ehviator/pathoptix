import * as pdfjsLib from 'pdfjs-dist/build/pdf';

// Point the worker to the local hosted minified worker file for offline PWA operations
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

/**
 * Extracts raw text page-by-page from a PDF file's ArrayBuffer.
 * 
 * @param {ArrayBuffer} arrayBuffer 
 * @returns {Promise<string>} Plain text content
 */
export async function extractTextFromPdf(arrayBuffer) {
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  let text = '';
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items;
    
    if (!items || items.length === 0) continue;

    // Map to simple objects with x, y, and height coordinates
    // transform is [scaleX, skewY, skewX, scaleY, translateX, translateY]
    // translateY is transform[5], translateX is transform[4]
    const positionedItems = items.map(item => ({
      str: item.str || '',
      x: item.transform ? item.transform[4] : 0,
      y: item.transform ? item.transform[5] : 0
    }));

    // Sort descending by Y (top to bottom), then ascending by X (left to right)
    positionedItems.sort((a, b) => {
      // If Y coordinates are close (less than 3px), treat them as being on the same line
      if (Math.abs(a.y - b.y) < 3) {
        return a.x - b.x;
      }
      return b.y - a.y;
    });

    let pageText = '';
    if (positionedItems.length > 0) {
      let currentY = positionedItems[0].y;
      
      for (const item of positionedItems) {
        // If Y coordinate has changed significantly, start a new line
        if (Math.abs(item.y - currentY) >= 3) {
          pageText += '\n';
          currentY = item.y;
        } else if (pageText !== '' && !pageText.endsWith('\n') && !pageText.endsWith(' ')) {
          // Add a space between items on the same line if not already spaced
          pageText += ' ';
        }
        pageText += item.str;
      }
    }
    
    text += pageText + '\n';
  }
  
  return text;
}
