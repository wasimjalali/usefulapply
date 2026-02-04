'use client';

import { useEffect, useState } from 'react';

/**
 * StorageCleaner - Temporary component to clear old localStorage data
 * Remove this component after the first successful run with the new implementation
 */
export function StorageCleaner() {
  const [cleaned, setCleaned] = useState(false);

  useEffect(() => {
    // Only run once
    const cleanupKey = 'job-copilot-cleanup-v2';
    if (localStorage.getItem(cleanupKey)) {
      return;
    }

    // Clear old storage that might contain large base64 PDFs
    const oldStorage = localStorage.getItem('job-copilot-storage');
    if (oldStorage) {
      try {
        const data = JSON.parse(oldStorage);
        // Check if it has old PDF data that needs cleaning
        if (data.state?.originalPDF?.base64 || 
            data.state?.modifiedPDF?.base64 || 
            data.state?.originalPdfBuffer ||
            data.state?.editedPdfBase64) {
          console.log('[StorageCleaner] Clearing old PDF data from localStorage...');
          
          // Remove the problematic fields but keep other data
          if (data.state) {
            delete data.state.originalPDF;
            delete data.state.modifiedPDF;
            delete data.state.originalPdfBuffer;
            delete data.state.editedPdfBase64;
            delete data.state.pdfEdits;
            
            // Save cleaned data back
            localStorage.setItem('job-copilot-storage', JSON.stringify(data));
            console.log('[StorageCleaner] Old PDF data cleared successfully');
          }
        }
      } catch (e) {
        // If parsing fails, just remove the whole thing
        console.log('[StorageCleaner] Clearing corrupted storage...');
        localStorage.removeItem('job-copilot-storage');
      }
    }

    // Mark as cleaned so we don't run again
    localStorage.setItem(cleanupKey, 'true');
    setCleaned(true);
  }, []);

  // This component renders nothing
  return null;
}
