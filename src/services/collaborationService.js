const CollaborationRequest = require('../models/CollaborationRequest');
const {
  uploadCollaborationSupportingDocument,
  streamCollaborationSupportingDocument,
} = require('./s3StorageService');

function parseCollaborationRequestId(rawId) {
  const parsed = Number.parseInt(String(rawId || ''), 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

async function submitCollaborationRequest(payload, file) {
  await CollaborationRequest.ensureCollaborationRequestTable();

  const {
    payload: normalizedPayload,
    errors,
  } = CollaborationRequest.normalizeCollaborationPayload(payload || {}, { file: file || null });

  if (errors.length > 0) {
    return {
      status: 400,
      body: { error: errors.join('. ') },
    };
  }

  const hasFile = !!(file && Buffer.isBuffer(file.buffer) && file.buffer.length > 0);

  const request = await CollaborationRequest.createCollaborationRequest(normalizedPayload);

  if (hasFile && request && request.id) {
    try {
      const uploadResult = await uploadCollaborationSupportingDocument({
        buffer: file.buffer,
        mimeType: file.mimetype,
        originalName: file.originalname,
        collaborationRequestId: String(request.id),
      });

      await CollaborationRequest.updateCollaborationRequestDocumentStorage(request.id, {
        supporting_document_name: file.originalname,
        supporting_document_mime: file.mimetype,
        supporting_document_size: file.size,
        supporting_document_path: uploadResult.s3Path,
      });

      request.supporting_document_name = file.originalname || request.supporting_document_name;
      request.supporting_document_mime = file.mimetype || request.supporting_document_mime;
      request.supporting_document_size = Number.isFinite(Number(file.size))
        ? Number(file.size)
        : request.supporting_document_size;
      request.has_supporting_document = true;
    } catch (err) {
      await CollaborationRequest.deleteCollaborationRequest(request.id).catch(() => {});
      return {
        status: 502,
        body: { error: 'Failed to upload supporting document to storage' },
      };
    }
  }

  return {
    status: 201,
    body: {
      message: 'Collaboration proposal submitted successfully. It is now pending for admin review.',
      id: request.id,
      status: 'pending',
    },
  };
}

async function listCollaborationRequestsByStatus(status) {
  await CollaborationRequest.ensureCollaborationRequestTable();

  const requests = await CollaborationRequest.getCollaborationRequestsByStatus(status);

  return {
    status: 200,
    body: { collaborationRequests: requests },
  };
}

async function approveCollaborationRequest(rawId) {
  const id = parseCollaborationRequestId(rawId);

  if (!id) {
    return { status: 400, body: { error: 'Invalid collaboration request id.' } };
  }

  const result = await CollaborationRequest.approveCollaborationRequestById(id);

  if (result.outcome === 'not_found') {
    return { status: 404, body: { error: 'Collaboration request not found.' } };
  }

  if (result.outcome === 'already_active') {
    return {
      status: 409,
      body: {
        error: 'Collaboration request is already active.',
        collaborationRequest: result.request || null,
      },
    };
  }

  return {
    status: 200,
    body: {
      message: 'Collaboration request approved successfully',
      collaborationRequest: result.request || null,
    },
  };
}

async function rejectCollaborationRequest(rawId) {
  const id = parseCollaborationRequestId(rawId);

  if (!id) {
    return { status: 400, body: { error: 'Invalid collaboration request id.' } };
  }

  const result = await CollaborationRequest.rejectCollaborationRequestById(id);

  if (result.outcome === 'not_found') {
    return { status: 404, body: { error: 'Collaboration request not found.' } };
  }

  if (result.outcome === 'already_rejected') {
    return {
      status: 200,
      body: {
        message: 'Collaboration request is already rejected.',
        collaborationRequest: result.request || null,
      },
    };
  }

  return {
    status: 200,
    body: {
      message: 'Collaboration request marked as rejected.',
      collaborationRequest: result.request || null,
    },
  };
}

async function fetchCollaborationRequestDocument(rawId) {
  await CollaborationRequest.ensureCollaborationRequestTable();

  const id = parseCollaborationRequestId(rawId);

  if (!id) {
    return {
      status: 400,
      body: { error: 'Invalid collaboration request id.' },
      document: null,
    };
  }

  const document = await CollaborationRequest.getCollaborationRequestDocumentById(id);

  if (!document) {
    return {
      status: 404,
      body: { error: 'Collaboration request not found.' },
      document: null,
    };
  }

  if (!document.supporting_document_path) {
    return {
      status: 404,
      body: { error: 'No supporting document uploaded for this collaboration request.' },
      document: null,
    };
  }

  try {
    const streamed = await streamCollaborationSupportingDocument({
      s3Path: document.supporting_document_path,
    });

    return {
      status: 200,
      body: { message: 'Collaboration supporting document fetched successfully' },
      document: {
        ...document,
        document_buffer: streamed.buffer,
        supporting_document_mime: document.supporting_document_mime || streamed.contentType,
        supporting_document_size: document.supporting_document_size
          || (Number.isFinite(streamed.contentLength) ? Number(streamed.contentLength) : streamed.buffer.length),
      },
    };
  } catch (err) {
    console.warn(
      `Collaboration document S3 fetch failed for id=${id}, path=${document.supporting_document_path}: ${err.message || err}`,
    );
    return {
      status: 502,
      body: { error: 'Failed to fetch supporting document from storage' },
      document: null,
    };
  }
}

module.exports = {
  submitCollaborationRequest,
  listCollaborationRequestsByStatus,
  approveCollaborationRequest,
  rejectCollaborationRequest,
  fetchCollaborationRequestDocument,
};
