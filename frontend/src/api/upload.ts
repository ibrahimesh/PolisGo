import { ApiError, parseProblem } from './errors';
import { API_BASE_URL } from './http';
import { tokenStore } from './tokenStore';
import type { ClaimDocumentResponse, Guid } from './types';

// fetch() can't report upload progress, so documents go through XHR. Errors
// come back as the same ApiError (ProblemDetails, traceId) as every request.
export function uploadClaimDocument(
  claimId: Guid,
  file: File,
  { onProgress, signal }: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<ClaimDocumentResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/api/claims/${claimId}/documents`);
    xhr.setRequestHeader('Accept', 'application/json');
    const session = tokenStore.get();
    if (session) xhr.setRequestHeader('Authorization', `Bearer ${session.token}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onerror = () => reject(new ApiError('network', 0));
    xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));
    xhr.onload = () => {
      const response = new Response(xhr.responseText || null, {
        status: xhr.status,
        headers: { 'content-type': xhr.getResponseHeader('content-type') ?? '' },
      });
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        void response.json().then((body: ClaimDocumentResponse) => resolve(body), reject);
        return;
      }
      void parseProblem(response).then((problem) =>
        reject(new ApiError('http', xhr.status, problem)),
      );
    };

    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    const form = new FormData();
    form.append('file', file, file.name);
    xhr.send(form);
  });
}
