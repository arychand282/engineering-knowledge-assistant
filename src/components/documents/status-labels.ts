export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  effective: "Efektif",
  superseded: "Digantikan",
  obsolete: "Usang",
  under_review: "Ditinjau",
};

export const STATUS_OPTIONS = Object.keys(STATUS_LABELS);

export const EXTRACTION_STATUS_LABELS: Record<string, string> = {
  pending: "Menunggu",
  success: "Berhasil",
  empty: "Kosong",
  failed: "Gagal",
  ocr_required: "Perlu OCR",
};
