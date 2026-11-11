export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  effective: "Effective",
  superseded: "Superseded",
  obsolete: "Obsolete",
  under_review: "Under review",
};

export const STATUS_OPTIONS = Object.keys(STATUS_LABELS);

export const EXTRACTION_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  success: "Success",
  empty: "Empty",
  failed: "Failed",
  ocr_required: "OCR required",
};
